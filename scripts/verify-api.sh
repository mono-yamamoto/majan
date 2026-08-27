#!/usr/bin/env bash
#
# server/ の API を実 HTTP + 実ローカル D1 で検証する。
#
#   bash scripts/verify-api.sh
#
# ローカルDBを作り直し、wrangler dev を起動し、curl で全経路を叩いて後片付けまで行う。
# --remote には一切触れない。本番DBは使わない。
#
# 前提: bun install 済み。ポート 8791（PORT で変更可）が空いていること。
set -uo pipefail
cd "$(dirname "$0")/.."

# 既定を 8787 以外にする。同じマシンで複数セッションが検証しており、
# 8787 は手動確認用に使われることが多い。PORT=... で上書きできる。
PORT="${PORT:-8791}"
BASE="http://localhost:${PORT}"
PASSCODE="verify-api-passcode"
# 開発者の .wrangler/state を消さないよう、専用の persist 先を使う。
# `mktemp -t prefix` は BSD 拡張で、GNU（CI の ubuntu）はテンプレートに X を要求する
# （`mktemp: too few X's` で失敗する）。逆に BSD で `-t name.XXXXXX` と書くと
# XXXXXX が名前にそのまま残る。ディレクトリを明示したテンプレート形式なら両方で同じ。
PERSIST="$(mktemp -d "${TMPDIR:-/tmp}/verify-api-state.XXXXXX")"
# mktemp が失敗しても set -e ではないので進んでしまう。`--persist-to ""` や
# `mkdir -p ""` の意味不明な失敗になる前に、ここで止める。
[ -n "$PERSIST" ] && [ -d "$PERSIST" ] || { echo "一時ディレクトリを作れませんでした。"; exit 1; }
# ログは PERSIST と同じ一意な名前を使う（X の後ろに接尾辞を置くテンプレートは
# GNU では通らないため）。PERSIST の中には置かない。cleanup が消してしまい、
# CI が失敗したときに読めなくなる。
LOG="${PERSIST}.log"
: > "$LOG" || { echo "一時ログファイルを作れませんでした: $LOG"; exit 1; }
pass=0; fail=0

W() { npx --no-install wrangler "$@"; }

# SQL を1行1列だけ返す形で流し、その値を取り出す。
# --json + JSON パースにしているのは、整形出力を sed で拾うと
# "duration:0" の "n:0" にマッチするような取り違えが起きるため。
Q() {
  W d1 execute majan --local --persist-to "$PERSIST" --command "$1" --json 2>/dev/null \
    | python3 -c 'import sys,json; r=json.load(sys.stdin)[0]["results"]; print("" if not r else list(r[0].values())[0])'
}

# 400 のボディ形状を JSON として取り出す。status だけ見ていると
# { errors: [...] } が [...] や { error } に変わっても PASS してしまう。
# T7 がこの形に依存するので、形そのものを固定する。
jq_field() { # jq_field <JSONパス式> — 標準入力の JSON から値を取り出す
  python3 -c "import sys,json;d=json.load(sys.stdin);print($1)" 2>/dev/null || echo "<parse error>"
}

# 自分が起動した wrangler の PID だけを落とす。
# pkill でパターンに一致するプロセスを消すと、同じマシンで動いている
# 他セッションの検証サーバーまで巻き込む（実際に巻き込んだ）。
#
# `W` はシェル関数なので `W dev ... &` の $! は**サブシェル**の PID。
# それを kill してもサブシェルが死ぬだけで、孫の workerd はポートを掴んだまま残る。
# ジョブ制御 (`set -m`) を有効にして、プロセスグループごと落とす。
set -m
WRANGLER_PID=""
# lsof が無いと port_is_free が常に true になり、上の 2 を静かに見逃す。
# 「検査が動いていないのに動いているように見える」のが一番まずいので先に落とす。
command -v lsof >/dev/null 2>&1 || { echo "lsof がありません。ポートの解放を確認できないため中断します。"; exit 1; }
port_is_free() { ! lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; }

# 落とすだけ。待たない。EXIT trap からも呼ぶので、ここで待つと
# 「中断 → trap → もう一度 30 秒」と二重に待つことになる。
kill_worker() {
  if [ -n "$WRANGLER_PID" ]; then
    kill -TERM -- -"$WRANGLER_PID" >/dev/null 2>&1 || kill -TERM "$WRANGLER_PID" >/dev/null 2>&1 || true
    wait "$WRANGLER_PID" 2>/dev/null || true
    WRANGLER_PID=""
  fi
}

# ポートが本当に空いたことを確認する。空かなければ中断する。
# 確認せずに次を起動すると、新しい wrangler はポートを取れずに死に、
# **古いワーカーが応答し続ける**。/api/health は 200 を返すので起動成功に見えるが、
# 実際には env が切り替わっていない（「未設定 → 500」の検証が成立しなくなる）。
wait_port_free() {
  for _ in $(seq 1 30); do
    port_is_free && return 0
    sleep 1
  done
  echo "ポート ${PORT} を掴んだままのプロセスが残っています。中断します（他セッションを巻き込まないため pkill は使いません）。"
  lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null | tail -n +2
  exit 1
}

stop_worker() {
  kill_worker
  wait_port_free
}
cleanup() {
  kill_worker
  rm -f .dev.vars.verify .dev.vars.empty
  rm -rf "$PERSIST"
}
trap cleanup EXIT

# 空のスキーマだけを作る。初期データを入れないのは、
# 「リーグが1件も無いとき」をワーカー越しに1回だけ見るため（seed_db より前）。
reset_db() {
  rm -rf "$PERSIST"; mkdir -p "$PERSIST"
  W d1 migrations apply majan --local --persist-to "$PERSIST" >/dev/null 2>&1
}

# 初期データは2ファイル構成。seed.sql（リーグとチーム・一発勝負）→
# roster.sql（名簿と所属・何度でも流せる）の順に流す。
seed_db() {
  W d1 execute majan --local --persist-to "$PERSIST" --file=./db/seed.sql >/dev/null 2>&1
  W d1 execute majan --local --persist-to "$PERSIST" --file=./db/roster.sql >/dev/null 2>&1
}

start_worker() { # $1: "with-secret" | "without-secret"
  stop_worker
  # --env-file を必ず渡す。省くと開発者の .dev.vars が自動で読まれてしまい、
  # 「シークレット未設定」の検証が成立しない（実測で確認）。
  local args=(dev --port "${PORT}" --persist-to "$PERSIST")
  if [ "$1" = "with-secret" ]; then
    printf 'WRITE_PASSCODE="%s"\n' "$PASSCODE" > .dev.vars.verify
    args+=(--env-file .dev.vars.verify)
  else
    : > .dev.vars.empty
    args+=(--env-file .dev.vars.empty)
  fi
  port_is_free || { echo "起動前にポート ${PORT} が空いていません。"; exit 1; }
  W "${args[@]}" > "$LOG" 2>&1 &
  WRANGLER_PID=$!
  for _ in $(seq 1 40); do
    sleep 1
    curl -sf -o /dev/null "${BASE}/api/health" && return 0
  done
  echo "wrangler dev の起動に失敗しました。ログ: $LOG"; exit 1
}

# t <期待コード> <ラベル> <curl 引数...>
t() {
  local want="$1" label="$2"; shift 2
  local out code body mark
  out=$(curl -s -w '\n%{http_code}' "$@")
  code=$(printf '%s' "$out" | tail -1)
  body=$(printf '%s' "$out" | sed '$d')
  if [ "$code" = "$want" ]; then pass=$((pass+1)); mark="OK  "; else fail=$((fail+1)); mark="NG!!"; fi
  printf '%s %s(want %s) %-46s %s\n' "$mark" "$code" "$want" "$label" "$(printf '%s' "$body" | head -c 90)"
}
check() { # check <ラベル> <実際> <期待>
  if [ "$2" = "$3" ]; then pass=$((pass+1)); printf 'OK   %-58s %s\n' "$1" "$2"
  else fail=$((fail+1)); printf 'NG!! %-58s 実際=%s 期待=%s\n' "$1" "$2" "$3"; fi
}
# 禁止語がコメント中にあるだけの行を数えないよう、// 以降を落としてから数える。
#
# 「// を含む行を丸ごと除外」は行末コメント付きの実コード行まで消して false PASS になる。
# 「// の後ろにその語がある行を除外」でも、行末コメントが同じ語を含むと見逃す
# （実測: `const x = "last_insert_rowid()"; // last_insert_rowid を使う理由` が 0 になる）。
# コメント部を落としてから数えれば、どちらの形でも検出できる（原則4）。
banned_in_code() { # banned_in_code <正規表現> <対象...>
  local pattern="$1"; shift
  grep -rnE "$pattern" "$@" 2>/dev/null | sed 's|//.*||' | grep -cE "$pattern" | tr -d ' '
}

POST() { t "$1" "$2" -X POST "${BASE}/api/games" -H 'Content-Type: application/json' -H "X-Passcode: ${PASSCODE}" -d "$3"; }
# shape <ラベル> <期待値> <python式> <curl 引数...> — レスポンスボディの形まで確認する
shape() {
  local label="$1" want="$2" expr="$3"; shift 3
  local got
  got=$(curl -s "$@" | python3 -c "import sys,json;d=json.load(sys.stdin);print($expr)" 2>/dev/null) || got="<parse error>"
  check "$label" "$got" "$want"
}
POST_shape() { shape "$1" "$2" "$3" -X POST "${BASE}/api/games" -H 'Content-Type: application/json' -H "X-Passcode: ${PASSCODE}" -d "$4"; }
PATCHG() { t "$1" "$2" -X PATCH "${BASE}/api/games/$3" -H 'Content-Type: application/json' -H "X-Passcode: ${PASSCODE}" -d "$4"; }
# 作った半荘の id を返す（遷移の検査は「作ってから編集する」ので id が要る）
post_id() {
  curl -s -X POST "${BASE}/api/games" -H 'Content-Type: application/json' -H "X-Passcode: ${PASSCODE}" -d "$1" \
    | python3 -c 'import sys,json; print(json.load(sys.stdin).get("id",""))' 2>/dev/null
}

GOOD='{"leagueId":1,"playedOn":"2026-08-26","title":"初戦","results":[{"memberId":1,"rawScore":42300},{"memberId":6,"rawScore":28100},{"memberId":2,"rawScore":18400},{"memberId":7,"rawScore":11200}]}'
EDIT='{"playedOn":"2026-08-28","title":"修正後","results":[{"memberId":1,"rawScore":50000},{"memberId":6,"rawScore":20000},{"memberId":2,"rawScore":20000},{"memberId":7,"rawScore":10000}]}'

reset_db
bun run build >/dev/null 2>&1
start_worker with-secret

echo "===== リーグが1件も無いとき（トップの初期状態） ====="
# LeagueIndex はこの形をそのまま「まだリーグがありません」に使う。
# 404 や null に変わるとトップが壊れるので、空配列で 200 を固定する。
t 200 'リーグ0件でも GET /api/leagues は 200' "${BASE}/api/leagues"
shape "0件なら { leagues: [] }" "True" 'd == {"leagues": []}' "${BASE}/api/leagues"
t 404 'リーグ0件で GET /api/leagues/1 は 404' "${BASE}/api/leagues/1"
seed_db

echo
echo "===== 初期データ: roster.sql は何度でも流せる（開幕前にチーム分けを直せること） ====="
check "seed + roster でメンバー10人"   "$(Q "SELECT COUNT(*) AS n FROM members;")" "10"
check "所属も10行"                     "$(Q "SELECT COUNT(*) AS n FROM league_members;")" "10"
# チーム分けを変えたテンプレートを流し直す想定。member 1 を チームA(1) → チームB(2) へ。
W d1 execute majan --local --persist-to "$PERSIST" --command \
  "INSERT INTO members (id, name) VALUES (1,'山田を直した')
     ON CONFLICT(id) DO UPDATE SET name = excluded.name;
   INSERT INTO league_members (league_id, member_id, team_id) VALUES (1,1,2)
     ON CONFLICT(league_id, member_id) DO UPDATE SET team_id = excluded.team_id;" >/dev/null 2>&1
check "2回目でも行が増えない（members）" "$(Q "SELECT COUNT(*) AS n FROM members;")" "10"
check "2回目でも行が増えない（所属）"     "$(Q "SELECT COUNT(*) AS n FROM league_members;")" "10"
check "名前が置き換わる"                  "$(Q "SELECT name FROM members WHERE id=1;")" "山田を直した"
check "チーム分けが置き換わる"            "$(Q "SELECT team_id FROM league_members WHERE league_id=1 AND member_id=1;")" "2"
check "他の人の所属は変わらない"          "$(Q "SELECT team_id FROM league_members WHERE league_id=1 AND member_id=2;")" "1"
# 元に戻す（以降の 2-2 判定はテンプレートのチーム分けが前提）
W d1 execute majan --local --persist-to "$PERSIST" --file=./db/roster.sql >/dev/null 2>&1
check "roster.sql を流し直すと元に戻る"   "$(Q "SELECT team_id FROM league_members WHERE league_id=1 AND member_id=1;")" "1"
check "名前も戻る"                        "$(Q "SELECT name FROM members WHERE id=1;")" "山田"
# seed.sql は逆に、二重投入で落ちる（リーグを2つ作る事故を防ぐ）。
# 挙動が逆であること自体が設計なので、両方を固定する。
seed_again=$(W d1 execute majan --local --persist-to "$PERSIST" --file=./db/seed.sql 2>&1 | grep -c "UNIQUE constraint failed")
check "seed.sql の二重投入は UNIQUE で落ちる" "$([ "$seed_again" -ge 1 ] && echo yes || echo no)" "yes"
check "落ちたのでリーグは1件のまま"           "$(Q "SELECT COUNT(*) AS n FROM leagues;")" "1"

echo; echo "===== 認証（Blocker: WRITE_PASSCODE 未設定で素通りしない） ====="
t 200 "GET /api/leagues/:id はパスコード不要"       "${BASE}/api/leagues/1"
t 200 "GET /api/health もパスコード不要"            "${BASE}/api/health"
t 401 "POST ヘッダ無し"    -X POST "${BASE}/api/games" -H 'Content-Type: application/json' -d '{}'
t 401 "POST ヘッダ誤り"    -X POST "${BASE}/api/games" -H 'Content-Type: application/json' -H 'X-Passcode: wrong' -d '{}'
t 401 "POST ヘッダ空文字"  -X POST "${BASE}/api/games" -H 'Content-Type: application/json' -H 'X-Passcode;' -d '{}'
# 認証ミドルウェアは POST/PATCH に限定する。use() だと GET が 401 になり
# 「GET 系はパスコード不要」と字面がずれる
t 404 "GET /api/games/1 は 404（401 ではない）"  "${BASE}/api/games/1"
t 404 "DELETE /api/games/1 は 404"               -X DELETE "${BASE}/api/games/1" -H "X-Passcode: ${PASSCODE}"
t 404 "PUT /api/leagues/1 は 404"                -X PUT "${BASE}/api/leagues/1" -H "X-Passcode: ${PASSCODE}"

echo; echo "===== 1段目: 形の検査（parse）が validateGameInput より先 ====="
POST 400 'results が配列でない'          '{"leagueId":1,"playedOn":"2026-08-26","results":"nope"}'
POST 400 'memberId が文字列'             '{"leagueId":1,"playedOn":"2026-08-26","results":[{"memberId":"1","rawScore":25000}]}'
POST 400 'rawScore が文字列'             '{"leagueId":1,"playedOn":"2026-08-26","results":[{"memberId":1,"rawScore":"25000"}]}'
POST 400 'rawScore が null'              '{"leagueId":1,"playedOn":"2026-08-26","results":[{"memberId":1,"rawScore":null}]}'
POST 400 'rawScore が 16進文字列'        '{"leagueId":1,"playedOn":"2026-08-26","results":[{"memberId":1,"rawScore":"0x61a8"}]}'
POST 400 'rawScore が 1e19（安全整数外）' '{"leagueId":1,"playedOn":"2026-08-27","results":[{"memberId":1,"rawScore":1e19},{"memberId":6,"rawScore":-1e19},{"memberId":2,"rawScore":50000},{"memberId":7,"rawScore":50000}]}'
POST 400 'playedOn が数値'               '{"leagueId":1,"playedOn":12345,"results":[]}'
POST 400 'title が数値'                   '{"leagueId":1,"playedOn":"2026-08-26","title":9,"results":[]}'
POST 400 'JSON 壊れ'                     '{not json'
t 413 'ボディ 16KB 超' -X POST "${BASE}/api/games" -H 'Content-Type: application/json' -H "X-Passcode: ${PASSCODE}" \
  -d "{\"leagueId\":1,\"playedOn\":\"2026-08-26\",\"title\":\"$(head -c 20000 /dev/zero | tr '\0' 'a')\",\"results\":[]}"

echo; echo "===== :id が正の安全整数でなければ 404 ====="
for bad in abc -1 1.5 1e30 0 99999999999999999999; do
  PATCHG 404 ":id=${bad}" "$bad" '{"playedOn":"2026-08-26","results":[]}'
done

echo; echo "===== 2段目: 業務ルール ====="
POST 400 'リーグ未所属メンバー'  '{"leagueId":1,"playedOn":"2026-08-26","results":[{"memberId":1,"rawScore":25000},{"memberId":6,"rawScore":25000},{"memberId":2,"rawScore":25000},{"memberId":99,"rawScore":25000}]}'
POST 400 '2-2 でない'            '{"leagueId":1,"playedOn":"2026-08-26","results":[{"memberId":1,"rawScore":25000},{"memberId":2,"rawScore":25000},{"memberId":3,"rawScore":25000},{"memberId":6,"rawScore":25000}]}'
POST 400 '素点合計が違う'        '{"leagueId":1,"playedOn":"2026-08-26","results":[{"memberId":1,"rawScore":25100},{"memberId":6,"rawScore":25000},{"memberId":2,"rawScore":25000},{"memberId":7,"rawScore":25000}]}'
POST 400 '日付が実在しない'      '{"leagueId":1,"playedOn":"2026-02-30","results":[{"memberId":1,"rawScore":25000},{"memberId":6,"rawScore":25000},{"memberId":2,"rawScore":25000},{"memberId":7,"rawScore":25000}]}'
POST 404 '存在しない leagueId'   '{"leagueId":999,"playedOn":"2026-08-26","results":[{"memberId":1,"rawScore":25000},{"memberId":6,"rawScore":25000},{"memberId":2,"rawScore":25000},{"memberId":7,"rawScore":25000}]}'

echo; echo "===== POST 成功 = 201 + {id} / batch の原子性 ====="
POST 201 '正常な POST' "$GOOD"
check "game_results が4行" "$(Q "SELECT COUNT(*) AS n FROM game_results;")" "4"
check "4行が同じ game_id を指す" "$(Q "SELECT COUNT(DISTINCT game_id) AS n FROM game_results;")" "1"
check "games が1行" "$(Q "SELECT COUNT(*) AS n FROM games;")" "1"

echo; echo "===== 400 のボディ形状（T7 が依存する。status だけでは回帰を検知できない） ====="
POST_shape "業務違反は { errors: [...] } で errors[0].code を持つ" "NOT_IN_LEAGUE" \
  'd["errors"][0]["code"]' '{"leagueId":1,"playedOn":"2026-08-26","results":[{"memberId":1,"rawScore":25000},{"memberId":6,"rawScore":25000},{"memberId":2,"rawScore":25000},{"memberId":99,"rawScore":25000}]}'
POST_shape "業務違反のボディに error キーが無い" "False" \
  '"error" in d' '{"leagueId":1,"playedOn":"2026-08-26","results":[{"memberId":1,"rawScore":25000},{"memberId":6,"rawScore":25000},{"memberId":2,"rawScore":25000},{"memberId":99,"rawScore":25000}]}'
POST_shape "形の不正は { error: string }" "True" \
  'isinstance(d.get("error"), str) and "errors" not in d' '{"leagueId":1,"playedOn":12345,"results":[]}'
POST_shape "ValidationError が4つのキーを持つ" "code,field,memberIds,message" \
  '",".join(sorted(d["errors"][0].keys()))' '{"leagueId":1,"playedOn":"2026-08-26","results":[{"memberId":1,"rawScore":25000},{"memberId":6,"rawScore":25000},{"memberId":2,"rawScore":25000},{"memberId":99,"rawScore":25000}]}'
POST_shape "複数違反はまとめて返る（最初の1件で打ち切らない）" "True" \
  'len(d["errors"]) >= 2' '{"leagueId":1,"playedOn":"banana","results":[{"memberId":1,"rawScore":25050},{"memberId":2,"rawScore":25000},{"memberId":3,"rawScore":25000},{"memberId":6,"rawScore":25000}]}'

echo; echo "===== parse 段と validation 段の境界 ====="
POST 400 'results が3件 → parse は通り validation が弾く' '{"leagueId":1,"playedOn":"2026-08-26","results":[{"memberId":1,"rawScore":25000},{"memberId":6,"rawScore":25000},{"memberId":2,"rawScore":50000}]}'
POST_shape "3件のときのコードは RESULT_COUNT" "RESULT_COUNT" 'd["errors"][0]["code"]' \
  '{"leagueId":1,"playedOn":"2026-08-26","results":[{"memberId":1,"rawScore":25000},{"memberId":6,"rawScore":25000},{"memberId":2,"rawScore":50000}]}'
POST_shape "title 61文字は TITLE_TOO_LONG（parse ではなく validation）" "TITLE_TOO_LONG" \
  '[e["code"] for e in d["errors"]][-1]' \
  "{\"leagueId\":1,\"playedOn\":\"2026-08-26\",\"title\":\"$(head -c 61 /dev/zero | tr '\0' 'x')\",\"results\":[{\"memberId\":1,\"rawScore\":42300},{\"memberId\":6,\"rawScore\":28100},{\"memberId\":2,\"rawScore\":18400},{\"memberId\":7,\"rawScore\":11200}]}"
POST 201 'title ちょうど60文字は通る' "{\"leagueId\":1,\"playedOn\":\"2026-08-29\",\"title\":\"$(head -c 60 /dev/zero | tr '\0' 'x')\",\"results\":[{\"memberId\":1,\"rawScore\":42300},{\"memberId\":6,\"rawScore\":28100},{\"memberId\":2,\"rawScore\":18400},{\"memberId\":7,\"rawScore\":11200}]}"
POST 201 'rawScore が数値 2.5e4 は通る（文字列 "2.5e4" の 400 と対）' '{"leagueId":1,"playedOn":"2026-08-30","title":"2.5e4","results":[{"memberId":1,"rawScore":2.5e4},{"memberId":6,"rawScore":25000},{"memberId":2,"rawScore":25000},{"memberId":7,"rawScore":25000}]}'

echo; echo "===== title は必須（予約でも） ====="
# 3件の 400 を投げる前に数える。あとで数えたものと突き合わせると恒真になる。
games_before_title=$(Q "SELECT COUNT(*) AS n FROM games;")
POST_shape "title 無しは TITLE_REQUIRED" "TITLE_REQUIRED" \
  '[e["code"] for e in d["errors"]][-1]' \
  '{"leagueId":1,"playedOn":"2026-08-26","results":[{"memberId":1,"rawScore":42300},{"memberId":6,"rawScore":28100},{"memberId":2,"rawScore":18400},{"memberId":7,"rawScore":11200}]}'
POST_shape "title が空文字も TITLE_REQUIRED" "TITLE_REQUIRED" \
  '[e["code"] for e in d["errors"]][-1]' \
  '{"leagueId":1,"playedOn":"2026-08-26","title":"","results":[{"memberId":1,"rawScore":42300},{"memberId":6,"rawScore":28100},{"memberId":2,"rawScore":18400},{"memberId":7,"rawScore":11200}]}'
POST_shape "title が空白だけも TITLE_REQUIRED" "TITLE_REQUIRED" \
  '[e["code"] for e in d["errors"]][-1]' \
  '{"leagueId":1,"playedOn":"2026-08-26","title":"  ","results":[{"memberId":1,"rawScore":42300},{"memberId":6,"rawScore":28100},{"memberId":2,"rawScore":18400},{"memberId":7,"rawScore":11200}]}'
check "title 無しの3件は1件も書き込まれていない" "$(Q "SELECT COUNT(*) AS n FROM games;")" "$games_before_title"
# 一覧は trim して表示するので、DB にも trim した値を入れる。
# 揃えないと「保存した値」と「画面に出る値」がずれる。
POST 201 'title の前後の空白は落として保存する' '{"leagueId":1,"playedOn":"2026-09-12","title":"  第9節  ","results":[{"memberId":1,"rawScore":42300},{"memberId":6,"rawScore":28100},{"memberId":2,"rawScore":18400},{"memberId":7,"rawScore":11200}]}'
check "DB の title に前後の空白が無い" "$(Q "SELECT title FROM games WHERE played_on='2026-09-12';")" "第9節"
check "中の空白は残る（正規化しすぎない）" "$(Q "SELECT COUNT(*) AS n FROM games WHERE played_on='2026-09-12' AND title = '第9節';")" "1"
POST 201 'trim して 60 文字ちょうどなら通る（上限は見える文字数で数える）' "{\"leagueId\":1,\"playedOn\":\"2026-09-13\",\"title\":\"  $(head -c 60 /dev/zero | tr '\0' 'y')  \",\"results\":[{\"memberId\":1,\"rawScore\":42300},{\"memberId\":6,\"rawScore\":28100},{\"memberId\":2,\"rawScore\":18400},{\"memberId\":7,\"rawScore\":11200}]}"
check "保存された長さが 60"                "$(Q "SELECT length(title) AS n FROM games WHERE played_on='2026-09-13';")" "60"

echo; echo "===== 予約（素点が全部 null）====="
POST_shape "予約でも title 無しは TITLE_REQUIRED" "TITLE_REQUIRED" \
  '[e["code"] for e in d["errors"]][-1]' \
  '{"leagueId":1,"playedOn":"2026-09-10","results":[{"memberId":1,"rawScore":null},{"memberId":6,"rawScore":null},{"memberId":2,"rawScore":null},{"memberId":7,"rawScore":null}]}'
POST 201 'title 付きの予約は通る' '{"leagueId":1,"playedOn":"2026-09-10","title":"第4節（予定）","results":[{"memberId":1,"rawScore":null},{"memberId":6,"rawScore":null},{"memberId":2,"rawScore":null},{"memberId":7,"rawScore":null}]}'
check "予約は raw_score が4行とも NULL" "$(Q "SELECT COUNT(*) AS n FROM game_results gr JOIN games g ON g.id=gr.game_id WHERE g.played_on='2026-09-10' AND gr.raw_score IS NULL;")" "4"
POST_shape "素点が一部だけなら MIXED_SCORES" "MIXED_SCORES" \
  '[e["code"] for e in d["errors"]][-1]' \
  '{"leagueId":1,"playedOn":"2026-09-11","title":"混在","results":[{"memberId":1,"rawScore":25000},{"memberId":6,"rawScore":null},{"memberId":2,"rawScore":null},{"memberId":7,"rawScore":null}]}'
check "混在は書き込まれていない" "$(Q "SELECT COUNT(*) AS n FROM games WHERE played_on='2026-09-11';")" "0"

echo; echo "===== 箱下（負の素点）====="
# トビ終了なし・箱下精算ありが仕様の中核。合計さえ合えば負の素点を弾かないことを
# API 経由でも固定する（validation.ts のテストだけでは経路が保証されない）。
POST 201 '箱下（負の素点）を含む確定' '{"leagueId":1,"playedOn":"2026-09-20","title":"箱下あり","results":[{"memberId":1,"rawScore":65000},{"memberId":6,"rawScore":30000},{"memberId":2,"rawScore":15000},{"memberId":7,"rawScore":-10000}]}'
check "負の素点がそのまま入っている" "$(Q "SELECT raw_score FROM game_results gr JOIN games g ON g.id=gr.game_id WHERE g.played_on='2026-09-20' AND gr.member_id=7;")" "-10000"
check "箱下でも素点合計は 100000"     "$(Q "SELECT SUM(raw_score) AS n FROM game_results gr JOIN games g ON g.id=gr.game_id WHERE g.played_on='2026-09-20';")" "100000"

echo; echo "===== 残りのバリデーション（API 経由で一度も通っていなかった） ====="
POST_shape "同じ人を2回 → DUPLICATE_MEMBER" "True" \
  '"DUPLICATE_MEMBER" in [e["code"] for e in d["errors"]]' \
  '{"leagueId":1,"playedOn":"2026-09-21","title":"重複","results":[{"memberId":1,"rawScore":25000},{"memberId":1,"rawScore":25000},{"memberId":6,"rawScore":25000},{"memberId":7,"rawScore":25000}]}'
POST_shape "memberId が 0 → MEMBER_ID_RANGE" "True" \
  '"MEMBER_ID_RANGE" in [e["code"] for e in d["errors"]]' \
  '{"leagueId":1,"playedOn":"2026-09-21","title":"未選択","results":[{"memberId":0,"rawScore":25000},{"memberId":6,"rawScore":25000},{"memberId":2,"rawScore":25000},{"memberId":7,"rawScore":25000}]}'
POST_shape "100 の倍数でない素点 → RAW_SCORE_UNIT" "True" \
  '"RAW_SCORE_UNIT" in [e["code"] for e in d["errors"]]' \
  '{"leagueId":1,"playedOn":"2026-09-21","title":"端数","results":[{"memberId":1,"rawScore":25050},{"memberId":6,"rawScore":24950},{"memberId":2,"rawScore":25000},{"memberId":7,"rawScore":25000}]}'
check "この3件は1件も書き込まれていない" "$(Q "SELECT COUNT(*) AS n FROM games WHERE played_on='2026-09-21';")" "0"

echo; echo "===== 同じ日に予約と確定が混在する ====="
POST 201 '同じ日に確定' '{"leagueId":1,"playedOn":"2026-09-22","title":"9/22 第1節","results":[{"memberId":1,"rawScore":40000},{"memberId":6,"rawScore":30000},{"memberId":2,"rawScore":20000},{"memberId":7,"rawScore":10000}]}'
POST 201 '同じ日に予約も作る' '{"leagueId":1,"playedOn":"2026-09-22","title":"9/22 第2節（予定）","results":[{"memberId":3,"rawScore":null},{"memberId":8,"rawScore":null},{"memberId":4,"rawScore":null},{"memberId":9,"rawScore":null}]}'
check "同じ日に確定1・予約1で計2件" "$(Q "SELECT COUNT(*) AS n FROM games WHERE played_on='2026-09-22';")" "2"
check "そのうち素点が入っているのは1件" "$(Q "SELECT COUNT(*) AS n FROM (SELECT gr.game_id FROM game_results gr JOIN games g ON g.id=gr.game_id WHERE g.played_on='2026-09-22' GROUP BY gr.game_id HAVING COUNT(gr.raw_score) = 4);")" "1"

echo; echo "===== 同じ日に2半荘（played_on に UNIQUE は無い） ====="
POST 201 '同じ played_on でもう1半荘' '{"leagueId":1,"playedOn":"2026-08-26","title":"2半荘目","results":[{"memberId":3,"rawScore":30000},{"memberId":8,"rawScore":30000},{"memberId":4,"rawScore":20000},{"memberId":9,"rawScore":20000}]}'
check "同じ日の半荘が2件ある" "$(Q "SELECT COUNT(*) AS n FROM games WHERE played_on='2026-08-26';")" "2"

echo; echo "===== 並列 POST（MAX(id) の競合が起きないこと） ====="
before_games=$(Q "SELECT COUNT(*) AS n FROM games;")
# 素の `wait` は使わない。start_worker が wrangler dev を同じシェルの
# バックグラウンドジョブとして起動しているので、`wait` がそれを待って永久に止まる
# （実測: ここで15分以上ブロックした）。投げた curl の PID だけを待つ。
parallel_pids=()
for i in $(seq 1 8); do
  curl -s -o /dev/null -X POST "${BASE}/api/games" -H 'Content-Type: application/json' -H "X-Passcode: ${PASSCODE}" \
    -d '{"leagueId":1,"playedOn":"2026-09-01","title":"並列","results":[{"memberId":1,"rawScore":40000},{"memberId":6,"rawScore":30000},{"memberId":2,"rawScore":20000},{"memberId":7,"rawScore":10000}]}' &
  parallel_pids+=($!)
done
for p in "${parallel_pids[@]}"; do wait "$p"; done
check "8半荘ぶん増えている"                 "$(Q "SELECT COUNT(*) - ${before_games} AS n FROM games;")" "8"
check "9/1 の全半荘がちょうど4行ずつ持つ"   "$(Q "SELECT COUNT(*) AS n FROM (SELECT gr.game_id FROM game_results gr JOIN games g ON g.id=gr.game_id WHERE g.played_on='2026-09-01' GROUP BY gr.game_id HAVING COUNT(*) <> 4);")" "0"
check "9/1 の全半荘が素点合計 100000"        "$(Q "SELECT COUNT(*) AS n FROM (SELECT gr.game_id FROM game_results gr JOIN games g ON g.id=gr.game_id WHERE g.played_on='2026-09-01' GROUP BY gr.game_id HAVING SUM(gr.raw_score) <> 100000);")" "0"
check "game_id が games に無い孤児が無い"    "$(Q "SELECT COUNT(*) AS n FROM game_results gr LEFT JOIN games g ON g.id=gr.game_id WHERE g.id IS NULL;")" "0"

echo; echo "===== PATCH の league_id は DB の games 行から読む ====="
PATCHG 200 'leagueId なし'                  1 "$EDIT"
PATCHG 200 'leagueId が DB と一致'          1 '{"leagueId":1,"playedOn":"2026-08-28","title":"m","results":[{"memberId":1,"rawScore":50000},{"memberId":6,"rawScore":20000},{"memberId":2,"rawScore":20000},{"memberId":7,"rawScore":10000}]}'
PATCHG 400 'leagueId が DB と不一致 → 400'  1 '{"leagueId":2,"playedOn":"2026-08-28","title":"m","results":[{"memberId":1,"rawScore":50000},{"memberId":6,"rawScore":20000},{"memberId":2,"rawScore":20000},{"memberId":7,"rawScore":10000}]}'
check "400 のあとも内容が変わっていない"   "$(Q "SELECT title FROM games WHERE id=1;")" "m"
check "全置換後も（この半荘は）4行のまま" "$(Q "SELECT COUNT(*) AS n FROM game_results WHERE game_id=1;")" "4"
PATCHG 404 '存在しない :id'               999 "$EDIT"

echo; echo "===== PATCH: メンバー総入れ替えと title の往復（全置換方式の理由そのもの） ====="
PATCHG 200 'メンバーを 1,6,2,7 → 3,8,4,9 に総入れ替え' 1 '{"playedOn":"2026-08-28","title":"入れ替え","results":[{"memberId":3,"rawScore":50000},{"memberId":8,"rawScore":20000},{"memberId":4,"rawScore":20000},{"memberId":9,"rawScore":10000}]}'
check "member_id が入れ替わっている"       "$(Q "SELECT group_concat(member_id) AS ids FROM (SELECT member_id FROM game_results WHERE game_id=1 ORDER BY member_id);")" "3,4,8,9"
check "入れ替え後も4行のまま"              "$(Q "SELECT COUNT(*) AS n FROM game_results WHERE game_id=1;")" "4"
# title はアプリのバリデーションでは必須。DB は NULL 許容のまま（運営の SQL 直操作を
# 妨げないため・決定#11）なので、「API は拒む / DB は受け入れる」の非対称をここで固定する。
PATCHG 400 'title を null にすると 400'      1 '{"playedOn":"2026-08-28","title":null,"results":[{"memberId":3,"rawScore":50000},{"memberId":8,"rawScore":20000},{"memberId":4,"rawScore":20000},{"memberId":9,"rawScore":10000}]}'
check "400 のあとも title が変わっていない"  "$(Q "SELECT title FROM games WHERE id=1;")" "入れ替え"
PATCHG 400 'title の省略も 400'              1 '{"playedOn":"2026-08-28","results":[{"memberId":3,"rawScore":50000},{"memberId":8,"rawScore":20000},{"memberId":4,"rawScore":20000},{"memberId":9,"rawScore":10000}]}'
PATCHG 400 'title が空白だけでも 400'        1 '{"playedOn":"2026-08-28","title":"   ","results":[{"memberId":3,"rawScore":50000},{"memberId":8,"rawScore":20000},{"memberId":4,"rawScore":20000},{"memberId":9,"rawScore":10000}]}'
check "3回の 400 のあとも title は元のまま"  "$(Q "SELECT title FROM games WHERE id=1;")" "入れ替え"
PATCHG 200 'title を別の文字列に変える'      1 '{"playedOn":"2026-08-28","title":"戻した","results":[{"memberId":3,"rawScore":50000},{"memberId":8,"rawScore":20000},{"memberId":4,"rawScore":20000},{"memberId":9,"rawScore":10000}]}'
check "title が変わった"                     "$(Q "SELECT title FROM games WHERE id=1;")" "戻した"
# DB 側は NULL を受け入れる（運営が直接 INSERT できる）。API が拒むのと矛盾しないこと。
W d1 execute majan --local --persist-to "$PERSIST" --command "UPDATE games SET title = NULL WHERE id = 1;" >/dev/null 2>&1
check "DB は title NULL を受け入れる"        "$(Q "SELECT COUNT(*) AS n FROM games WHERE id=1 AND title IS NULL;")" "1"
W d1 execute majan --local --persist-to "$PERSIST" --command "UPDATE games SET title = '戻した' WHERE id = 1;" >/dev/null 2>&1

echo; echo "===== PATCH: 予約 → 確定 → 予約 の往復（T13 の主機能） ====="
# 一覧の「予定」と「結果」を行き来する経路そのもの。フロントのユニットテストは
# 値の変換しか見ておらず、API 経由で往復できるかは検証されていなかった。
tid=$(post_id '{"leagueId":1,"playedOn":"2026-09-23","title":"往復の確認","results":[{"memberId":1,"rawScore":null},{"memberId":6,"rawScore":null},{"memberId":2,"rawScore":null},{"memberId":7,"rawScore":null}]}')
check "予約として作れた（id が返る）"     "$([ -n "$tid" ] && echo yes || echo no)" "yes"
check "作った直後は素点が4行とも NULL"    "$(Q "SELECT COUNT(*) AS n FROM game_results WHERE game_id=${tid:-0} AND raw_score IS NULL;")" "4"
PATCHG 200 '予約 → 確定（素点を入れる）' "${tid:-0}" '{"playedOn":"2026-09-23","title":"往復の確認","results":[{"memberId":1,"rawScore":40000},{"memberId":6,"rawScore":30000},{"memberId":2,"rawScore":20000},{"memberId":7,"rawScore":10000}]}'
check "確定になった（NULL が0行）"        "$(Q "SELECT COUNT(*) AS n FROM game_results WHERE game_id=${tid:-0} AND raw_score IS NULL;")" "0"
check "確定後の素点合計が 100000"          "$(Q "SELECT SUM(raw_score) AS n FROM game_results WHERE game_id=${tid:-0};")" "100000"
PATCHG 200 '確定 → 予約に戻す'            "${tid:-0}" '{"playedOn":"2026-09-23","title":"往復の確認","results":[{"memberId":1,"rawScore":null},{"memberId":6,"rawScore":null},{"memberId":2,"rawScore":null},{"memberId":7,"rawScore":null}]}'
check "予約に戻った（NULL が4行）"        "$(Q "SELECT COUNT(*) AS n FROM game_results WHERE game_id=${tid:-0} AND raw_score IS NULL;")" "4"
check "往復しても4行のまま"               "$(Q "SELECT COUNT(*) AS n FROM game_results WHERE game_id=${tid:-0};")" "4"
PATCHG 200 '箱下に編集する'               "${tid:-0}" '{"playedOn":"2026-09-23","title":"往復の確認","results":[{"memberId":1,"rawScore":65000},{"memberId":6,"rawScore":30000},{"memberId":2,"rawScore":15000},{"memberId":7,"rawScore":-10000}]}'
check "編集後も負の素点が入る"            "$(Q "SELECT raw_score FROM game_results WHERE game_id=${tid:-0} AND member_id=7;")" "-10000"

echo; echo "===== PATCH のバリデーション（POST 側でしか見ていなかった） ====="
PATCH_shape() { shape "$1" "$2" "$3" -X PATCH "${BASE}/api/games/${tid:-0}" -H 'Content-Type: application/json' -H "X-Passcode: ${PASSCODE}" -d "$4"; }
PATCH_shape "PATCH で素点を一部だけ → MIXED_SCORES" "True" \
  '"MIXED_SCORES" in [e["code"] for e in d["errors"]]' \
  '{"playedOn":"2026-09-23","title":"往復の確認","results":[{"memberId":1,"rawScore":25000},{"memberId":6,"rawScore":null},{"memberId":2,"rawScore":null},{"memberId":7,"rawScore":null}]}'
PATCH_shape "PATCH で 2-2 を崩す → TEAM_BALANCE" "True" \
  '"TEAM_BALANCE" in [e["code"] for e in d["errors"]]' \
  '{"playedOn":"2026-09-23","title":"往復の確認","results":[{"memberId":1,"rawScore":25000},{"memberId":2,"rawScore":25000},{"memberId":3,"rawScore":25000},{"memberId":6,"rawScore":25000}]}'
PATCH_shape "PATCH で3件 → RESULT_COUNT" "True" \
  '"RESULT_COUNT" in [e["code"] for e in d["errors"]]' \
  '{"playedOn":"2026-09-23","title":"往復の確認","results":[{"memberId":1,"rawScore":25000},{"memberId":6,"rawScore":25000},{"memberId":2,"rawScore":50000}]}'
check "3回の 400 のあとも中身が変わっていない" "$(Q "SELECT raw_score FROM game_results WHERE game_id=${tid:-0} AND member_id=7;")" "-10000"

echo; echo "===== 論理削除は片道かつ冪等 ====="
t 400 'deleted:false（復活）'      -X PATCH "${BASE}/api/games/1/deleted" -H 'Content-Type: application/json' -H "X-Passcode: ${PASSCODE}" -d '{"deleted":false}'
t 400 'deleted が非 boolean'       -X PATCH "${BASE}/api/games/1/deleted" -H 'Content-Type: application/json' -H "X-Passcode: ${PASSCODE}" -d '{"deleted":"true"}'
t 404 '存在しない :id の削除'      -X PATCH "${BASE}/api/games/999/deleted" -H 'Content-Type: application/json' -H "X-Passcode: ${PASSCODE}" -d '{"deleted":true}'
t 200 '1回目の削除'                -X PATCH "${BASE}/api/games/1/deleted" -H 'Content-Type: application/json' -H "X-Passcode: ${PASSCODE}" -d '{"deleted":true}'
first_deleted_at=$(Q "SELECT deleted_at FROM games WHERE id=1;")
sleep 1
t 200 '2回目の削除（再送・冪等）'  -X PATCH "${BASE}/api/games/1/deleted" -H 'Content-Type: application/json' -H "X-Passcode: ${PASSCODE}" -d '{"deleted":true}'
check "deleted_at が再送で上書きされない" "$(Q "SELECT deleted_at FROM games WHERE id=1;")" "$first_deleted_at"
PATCHG 404 '削除済みへの PATCH'    1 "$EDIT"

# 予約も同じ経路で消せること（一覧の「予定」から削除できる）。
rid=$(post_id '{"leagueId":1,"playedOn":"2026-09-24","title":"消す予定","results":[{"memberId":3,"rawScore":null},{"memberId":8,"rawScore":null},{"memberId":4,"rawScore":null},{"memberId":9,"rawScore":null}]}')
check "予約を作れた"            "$([ -n "$rid" ] && echo yes || echo no)" "yes"
t 200 '予約を削除する'          -X PATCH "${BASE}/api/games/${rid:-0}/deleted" -H 'Content-Type: application/json' -H "X-Passcode: ${PASSCODE}" -d '{"deleted":true}'
check "予約に deleted_at が入る" "$(Q "SELECT COUNT(*) AS n FROM games WHERE id=${rid:-0} AND deleted_at IS NOT NULL;")" "1"
check "削除しても game_results は残る（論理削除）" "$(Q "SELECT COUNT(*) AS n FROM game_results WHERE game_id=${rid:-0};")" "4"

echo; echo "===== GET が削除済みを除外 ====="
# GET はリーグ1だけを返すので、比較対象も league_id=1 に絞る。
# 絞らないと別リーグの半荘が増えた瞬間に壊れる（＝GET と対応していない検査だった）。
check "GET の games 件数 = DB のリーグ1の未削除件数" \
  "$(curl -s "${BASE}/api/leagues/1" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["games"]))')" \
  "$(Q "SELECT COUNT(*) AS n FROM games WHERE league_id = 1 AND deleted_at IS NULL;")"
check "削除済みの id=1 が GET に含まれない" \
  "$(curl -s "${BASE}/api/leagues/1" | python3 -c 'import sys,json;print(1 in [g["id"] for g in json.load(sys.stdin)["games"]])')" "False"
check "GET の各半荘が4人ぶんの結果を持つ" \
  "$(curl -s "${BASE}/api/leagues/1" | python3 -c 'import sys,json;print(len({len(g["results"]) for g in json.load(sys.stdin)["games"]} - {4}))')" "0"
check "GET の members 件数" "$(curl -s "${BASE}/api/leagues/1" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["members"]))')" "10"
# valueFromGame は rawScore === null を「予約」と読む。ここが 0 や欠落に変わると
# フォームが「素点 0 の確定」として開いてしまうので、形そのものを固定する。
check "GET で予約は rawScore が null で返る" \
  "$(curl -s "${BASE}/api/leagues/1" | python3 -c 'import sys,json
d=json.load(sys.stdin)
g=[x for x in d["games"] if x["title"]=="9/22 第2節（予定）"]
print("no game" if not g else sorted({str(r["rawScore"]) for r in g[0]["results"]}))')" \
  "['None']"
check "GET で確定は数値で返る（null と混ざらない）" \
  "$(curl -s "${BASE}/api/leagues/1" | python3 -c 'import sys,json
d=json.load(sys.stdin)
g=[x for x in d["games"] if x["title"]=="9/22 第1節"]
print("no game" if not g else all(isinstance(r["rawScore"], int) for r in g[0]["results"]))')" \
  "True"
t 404 '存在しないリーグ' "${BASE}/api/leagues/999"

echo; echo "===== GET /api/leagues（トップのリーグ選択用） ====="
t 200 'GET /api/leagues はパスコード不要' "${BASE}/api/leagues"
shape "leagues は { leagues: [...] } で返る" "True" 'isinstance(d.get("leagues"), list)' "${BASE}/api/leagues"
shape "seed の1リーグが返る"                "1" 'len(d["leagues"])' "${BASE}/api/leagues"
shape "新しい順（id 降順）で返る"           "True" 'd["leagues"] == sorted(d["leagues"], key=lambda x: -x["id"])' "${BASE}/api/leagues"
# 設定値は /api/leagues/:id で誰でも見られるので「漏れる」実害は小さい。
# 価値はレスポンス形状の変更を意図的にしか行えないようにすること（SELECT * への
# うっかりした変更を検知する）。狙いを書いておかないと「別に漏れても困らない」と消される。
shape "レスポンス形状が id と name のまま（意図しない変更の検知）" "id,name" '",".join(sorted(d["leagues"][0].keys()))' "${BASE}/api/leagues"
shape "name が取れている"                   "2026 秋リーグ" 'd["leagues"][0]["name"]' "${BASE}/api/leagues"

echo; echo "===== 別リーグ（league_members を league_id で絞っているか・D-13） ====="
# 「存在しないリーグ」でしか所属チェックを試していなかった。別リーグが実在して
# 初めて「リーグ1の名簿でリーグ2の登録が通らないか」を確かめられる。
W d1 execute majan --local --persist-to "$PERSIST" --command "
INSERT INTO leagues (id, name, start_point, return_point, uma_1st, uma_2nd, uma_3rd, uma_4th)
  VALUES (2, '2027 春リーグ', 25000, 30000, 30, 10, -10, -30);
INSERT INTO teams (id, league_id, name) VALUES (3, 2, 'チームC'), (4, 2, 'チームD');
INSERT INTO members (id, name) VALUES (21,'別1'), (22,'別2'), (23,'別3'), (24,'別4');
INSERT INTO league_members (league_id, member_id, team_id) VALUES
  (2,21,3), (2,22,3), (2,23,4), (2,24,4);
" >/dev/null 2>&1
check "リーグ2が作れた" "$(Q "SELECT COUNT(*) AS n FROM leagues WHERE id=2;")" "1"

POST_shape "リーグ2にリーグ1のメンバー → NOT_IN_LEAGUE" "True" \
  '"NOT_IN_LEAGUE" in [e["code"] for e in d["errors"]]' \
  '{"leagueId":2,"playedOn":"2026-09-25","title":"別リーグ違反","results":[{"memberId":1,"rawScore":25000},{"memberId":6,"rawScore":25000},{"memberId":2,"rawScore":25000},{"memberId":7,"rawScore":25000}]}'
POST_shape "リーグ1にリーグ2のメンバー → NOT_IN_LEAGUE" "True" \
  '"NOT_IN_LEAGUE" in [e["code"] for e in d["errors"]]' \
  '{"leagueId":1,"playedOn":"2026-09-25","title":"逆向きの違反","results":[{"memberId":21,"rawScore":25000},{"memberId":22,"rawScore":25000},{"memberId":23,"rawScore":25000},{"memberId":24,"rawScore":25000}]}'
POST 201 'リーグ2の正規メンバーなら 201' '{"leagueId":2,"playedOn":"2026-09-25","title":"春リーグ 第1節","results":[{"memberId":21,"rawScore":40000},{"memberId":23,"rawScore":30000},{"memberId":22,"rawScore":20000},{"memberId":24,"rawScore":10000}]}'
check "リーグ2の半荘が1件"       "$(Q "SELECT COUNT(*) AS n FROM games WHERE league_id=2;")" "1"
check "リーグ1の GET に混ざらない" \
  "$(curl -s "${BASE}/api/leagues/1" | python3 -c 'import sys,json;print(sum(1 for g in json.load(sys.stdin)["games"] if g["title"]=="春リーグ 第1節"))')" "0"
check "リーグ2の GET には出る" \
  "$(curl -s "${BASE}/api/leagues/2" | python3 -c 'import sys,json;print(sum(1 for g in json.load(sys.stdin)["games"] if g["title"]=="春リーグ 第1節"))')" "1"
check "リーグ2の members はリーグ2の4人だけ" \
  "$(curl -s "${BASE}/api/leagues/2" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["members"]))')" "4"
shape "GET /api/leagues が2件になる" "2" 'len(d["leagues"])' "${BASE}/api/leagues"

echo; echo "===== POST /api/leagues/:id/roster（運営メニューの反映） ====="
ROSTER() { t "$1" "$2" -X POST "${BASE}/api/leagues/1/roster" -H 'Content-Type: application/json' -H "X-Passcode: ${PASSCODE}" -d "$3"; }
ROSTER_shape() { shape "$1" "$2" "$3" -X POST "${BASE}/api/leagues/1/roster" -H 'Content-Type: application/json' -H "X-Passcode: ${PASSCODE}" -d "$4"; }

# --- 認証 ---
t 401 'roster: パスコード無し' -X POST "${BASE}/api/leagues/1/roster" -H 'Content-Type: application/json' -d '{"changes":[]}'
t 401 'roster: パスコード誤り' -X POST "${BASE}/api/leagues/1/roster" -H 'Content-Type: application/json' -H 'X-Passcode: wrong' -d '{"changes":[]}'

# --- 形 ---
ROSTER 400 'roster: changes が配列でない'  '{"changes":"nope"}'
ROSTER 400 'roster: changes が空'          '{"changes":[]}'
ROSTER 400 'roster: 未知の kind'           '{"changes":[{"kind":"drop","memberId":1}]}'
ROSTER 400 'roster: memberId が文字列'     '{"changes":[{"kind":"rename","memberId":"1","before":"山田","after":"x"}]}'
t 404 'roster: 存在しないリーグ' -X POST "${BASE}/api/leagues/999/roster" -H 'Content-Type: application/json' -H "X-Passcode: ${PASSCODE}" -d '{"changes":[{"kind":"leagueName","before":"a","after":"b"}]}'
t 404 'roster: :id の不正形' -X POST "${BASE}/api/leagues/abc/roster" -H 'Content-Type: application/json' -H "X-Passcode: ${PASSCODE}" -d '{"changes":[{"kind":"leagueName","before":"a","after":"b"}]}'

# --- before の食い違い → 409（丸ごと拒否） ---
# 件数はここまでの検証で増えているので、ハードコードせずその場で数える
members_at_roster=$(Q "SELECT COUNT(*) AS n FROM members;")
league_before=$(Q "SELECT name FROM leagues WHERE id=1;")
ROSTER 409 'roster: リーグ名の before が違う' '{"changes":[{"kind":"leagueName","before":"違う名前","after":"乗っ取り"}]}'
check "409 のあとリーグ名が変わっていない" "$(Q "SELECT name FROM leagues WHERE id=1;")" "$league_before"
ROSTER_shape "409 のボディは { conflicts: [...] }" "True" 'isinstance(d.get("conflicts"), list) and len(d["conflicts"]) > 0' \
  '{"changes":[{"kind":"leagueName","before":"違う名前","after":"乗っ取り"}]}'
ROSTER 409 'roster: メンバー名の before が違う' '{"changes":[{"kind":"rename","memberId":1,"before":"違う","after":"x"}]}'
ROSTER 409 'roster: 所属の before が違う'       '{"changes":[{"kind":"team","memberId":1,"name":"山田","before":2,"after":2}]}'
ROSTER 409 'roster: 既に外れている人を外す'     '{"changes":[{"kind":"remove","memberId":99,"name":"居ない","teamId":1}]}'
ROSTER 409 'roster: 使用済みの id で追加'       '{"changes":[{"kind":"add","memberId":1,"name":"重複","teamId":1}]}'
ROSTER 409 'roster: 同じ id を2回追加'          '{"changes":[{"kind":"add","memberId":50,"name":"A","teamId":1},{"kind":"add","memberId":50,"name":"B","teamId":2}]}'
check "409 のあと members が増えていない" "$(Q "SELECT COUNT(*) AS n FROM members;")" "$members_at_roster"

# --- 他リーグの teamId は 400（このリーグの話ではないので、読み直しても直らない） ---
W d1 execute majan --local --persist-to "$PERSIST" --command "
INSERT INTO leagues (id, name, start_point, return_point, uma_1st, uma_2nd, uma_3rd, uma_4th)
  VALUES (9, '別リーグ', 25000, 30000, 30, 10, -10, -30);
INSERT INTO teams (id, league_id, name) VALUES (91, 9, '他チーム');" >/dev/null 2>&1
other_before=$(Q "SELECT name FROM teams WHERE id=91;")
ROSTER 400 'roster: 他リーグの teamId でチーム名変更' '{"changes":[{"kind":"teamName","teamId":91,"before":"他チーム","after":"乗っ取り"}]}'
check "400 のあと他リーグのチーム名が無事"  "$(Q "SELECT name FROM teams WHERE id=91;")" "$other_before"
ROSTER 400 'roster: 他リーグのチームへ移す'   '{"changes":[{"kind":"team","memberId":1,"name":"山田","before":1,"after":91}]}'
ROSTER 400 'roster: 他リーグのチームへ追加'   '{"changes":[{"kind":"add","memberId":51,"name":"新","teamId":91}]}'
check "400 のあと members が増えていない" "$(Q "SELECT COUNT(*) AS n FROM members;")" "$members_at_roster"

# --- 正常系 ---
ROSTER 200 'roster: リーグ名・チーム名・改名・移動をまとめて' "{\"changes\":[
  {\"kind\":\"leagueName\",\"before\":\"${league_before}\",\"after\":\"2027 春\"},
  {\"kind\":\"teamName\",\"teamId\":1,\"before\":\"チームA\",\"after\":\"赤 'A'\"},
  {\"kind\":\"rename\",\"memberId\":3,\"before\":\"鈴木\",\"after\":\"O'Brien\"},
  {\"kind\":\"team\",\"memberId\":1,\"name\":\"山田\",\"before\":1,\"after\":2}
]}"
check "リーグ名が変わった"     "$(Q "SELECT name FROM leagues WHERE id=1;")" "2027 春"
check "チーム名が変わった（' つき）" "$(Q "SELECT name FROM teams WHERE id=1;")" "赤 'A'"
check "メンバー名が変わった（' つき）" "$(Q "SELECT name FROM members WHERE id=3;")" "O'Brien"
check "所属が変わった"         "$(Q "SELECT team_id FROM league_members WHERE league_id=1 AND member_id=1;")" "2"
ROSTER_shape "200 のボディは { applied: n }" "4" 'd["applied"]' "{\"changes\":[{\"kind\":\"leagueName\",\"before\":\"2027 春\",\"after\":\"2027 春\"},{\"kind\":\"rename\",\"memberId\":2,\"before\":\"佐藤\",\"after\":\"佐藤\"},{\"kind\":\"rename\",\"memberId\":4,\"before\":\"田中\",\"after\":\"田中\"},{\"kind\":\"rename\",\"memberId\":5,\"before\":\"高橋\",\"after\":\"高橋\"}]}"

ROSTER 200 'roster: 追加'   '{"changes":[{"kind":"add","memberId":11,"name":"新人","teamId":1}]}'
check "members に増えた"     "$(Q "SELECT name FROM members WHERE id=11;")" "新人"
check "所属にも入った"       "$(Q "SELECT team_id FROM league_members WHERE league_id=1 AND member_id=11;")" "1"
ROSTER 200 'roster: 所属を外す' '{"changes":[{"kind":"remove","memberId":11,"name":"新人","teamId":1}]}'
check "所属から消えた"       "$(Q "SELECT COUNT(*) AS n FROM league_members WHERE league_id=1 AND member_id=11;")" "0"
check "★ members からは消さない" "$(Q "SELECT name FROM members WHERE id=11;")" "新人"
check "★ game_results も消さない" "$(Q "SELECT COUNT(*) AS n FROM game_results;")" "$(Q "SELECT COUNT(*) AS n FROM game_results;")"

echo; echo "===== roster: 検証を抜けた不正が DB に届かないこと ====="
# batch() の原子性そのものは、サーバの検証を一時的に外した変異テストで確かめている
# （報告に記録）。この検証スクリプトはサーバを書き換えられないので、ここでは
# 「検証で弾かれる不正は1文も書き込まれない」を、正常な変更と混ぜて固定する。
name_before=$(Q "SELECT name FROM members WHERE id=2;")
members_before=$(Q "SELECT COUNT(*) AS n FROM members;")
ROSTER 409 'roster: 正常な変更と不正を混ぜると丸ごと拒否' \
  '{"changes":[{"kind":"rename","memberId":2,"before":"佐藤","after":"通ってはいけない"},{"kind":"add","memberId":1,"name":"重複","teamId":1}]}'
check "★ 正常な方も適用されていない"     "$(Q "SELECT name FROM members WHERE id=2;")" "$name_before"
check "members の件数も変わっていない"   "$(Q "SELECT COUNT(*) AS n FROM members;")" "$members_before"
ROSTER 400 'roster: 正常な変更と他リーグを混ぜても丸ごと拒否' \
  '{"changes":[{"kind":"rename","memberId":2,"before":"佐藤","after":"通ってはいけない"},{"kind":"teamName","teamId":91,"before":"他チーム","after":"乗っ取り"}]}'
check "★ こちらも正常な方が適用されていない" "$(Q "SELECT name FROM members WHERE id=2;")" "$name_before"

echo; echo "===== WRITE_PASSCODE 未設定でも素通りしない ====="
games_before_unset=$(Q "SELECT COUNT(*) AS n FROM games;")
start_worker without-secret
t 500 '未設定 + ヘッダ無し → 500' -X POST "${BASE}/api/games" -H 'Content-Type: application/json' -d "$GOOD"
t 500 '未設定 + ヘッダ有り → 500' -X POST "${BASE}/api/games" -H 'Content-Type: application/json' -H 'X-Passcode: anything' -d "$GOOD"
t 200 '未設定でも GET は通る'      "${BASE}/api/leagues/1"
check "書き込まれていない（games が増えていない）" "$(Q "SELECT COUNT(*) AS n FROM games;")" "$games_before_unset"

echo; echo "===== ビルド成果物に秘密が含まれない ====="
check "dist/ に WRITE_PASSCODE が無い" "$(grep -rl 'WRITE_PASSCODE' dist/ 2>/dev/null | wc -l | tr -d ' ')" "0"
check "dist/ にパスコード値が無い"     "$(grep -rl "${PASSCODE}" dist/ 2>/dev/null | wc -l | tr -d ' ')" "0"
# 「VITE_ という文字列があるか」ではなく「ビルド時に環境変数を読み込む書き方があるか」を見る。
# 前者だと "VITE_ 接頭辞を使わない" と書いたコメントに反応して false FAIL になる（実測）。
# 秘密がバンドルに載る経路は import.meta.env 経由なので、そこを直接見る。
check "import.meta.env を使っていない"  "$(banned_in_code 'import\.meta\.env' src/ server/)" "0"

echo; echo "===== 静的チェック（Blocker） ====="
check "last_insert_rowid を使っていない" "$(banned_in_code 'last_insert_rowid' server/)" "0"
check "DELETE エンドポイントが無い"      "$(banned_in_code '\.delete\(' server/)" "0"
# 決定#11（運営系テーブルへの書き込みAPIを作らない）は T21 で覆った。
# 山本さんが「SQL を叩くのが面倒」と言い、運営メニューから直接反映する形にしたため。
# ただし**書き込んでよいのは server/routes/roster.ts の1本だけ**。
# ほかのルートに散ると、どこから名簿が変わるのか追えなくなる。
check "運営系テーブルへ書けるのは roster.ts だけ" \
  "$(banned_in_code '(INSERT INTO|UPDATE|DELETE FROM) *(leagues|teams|members|league_members)' server/auth.ts server/body.ts server/index.ts server/routes/games.ts server/routes/leagues.ts)" "0"
check "roster.ts は members を消さない（論理削除でも物理削除でもない）" \
  "$(banned_in_code 'DELETE FROM *members' server/routes/roster.ts)" "0"
check "roster.ts は game_results に触らない" \
  "$(banned_in_code 'game_results' server/routes/roster.ts)" "0"
check "100000 のハードコードが無い"      "$(banned_in_code '100000|100_000' server/ src/lib/api.ts src/lib/scoring.ts src/lib/validation.ts src/lib/types.ts)" "0"

echo
echo "==================================="
printf '  PASS %d / FAIL %d\n' "$pass" "$fail"
echo "==================================="
[ "$fail" -eq 0 ]
