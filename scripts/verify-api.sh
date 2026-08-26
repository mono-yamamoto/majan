#!/usr/bin/env bash
#
# server/ の API を実 HTTP + 実ローカル D1 で検証する。
#
#   bash scripts/verify-api.sh
#
# ローカルDBを作り直し、wrangler dev を起動し、curl で全経路を叩いて後片付けまで行う。
# --remote には一切触れない。本番DBは使わない。
#
# 前提: bun install 済み。ポート 8787 が空いていること。
set -uo pipefail
cd "$(dirname "$0")/.."

# 既定を 8787 以外にする。同じマシンで複数セッションが検証しており、
# 8787 は手動確認用に使われることが多い。PORT=... で上書きできる。
PORT="${PORT:-8791}"
BASE="http://localhost:${PORT}"
PASSCODE="verify-api-passcode"
LOG="$(mktemp -t verify-api).log"
# 開発者の .wrangler/state を消さないよう、専用の persist 先を使う
PERSIST="$(mktemp -d -t verify-api-state)"
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
# 落とし方には2つの罠がある（両方とも実測で踏んだ）。
#   1. `W` はシェル関数なので `W dev ... &` の $! は**サブシェル**の PID。
#      それを kill してもサブシェルが死ぬだけで、孫の workerd はポートを掴んだまま残る。
#      → ジョブ制御 (`set -m`) を有効にしてプロセスグループごと落とす。
#   2. 落ちたことを確認せずに次を起動すると、新しい wrangler はポートを取れずに死に、
#      **古いワーカーが応答し続ける**。/api/health が 200 を返すので起動成功に見えるが、
#      実際には env が切り替わっていない（「未設定 → 500」の検証が成立しなくなる）。
#      → ポートが空くまで待ち、空かなければ落ちる。
set -m
WRANGLER_PID=""
# lsof が無いと port_is_free が常に true になり、上の 2 を静かに見逃す。
# 「検査が動いていないのに動いているように見える」のが一番まずいので先に落とす。
command -v lsof >/dev/null 2>&1 || { echo "lsof がありません。ポートの解放を確認できないため中断します。"; exit 1; }
port_is_free() { ! lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; }
stop_worker() {
  if [ -n "$WRANGLER_PID" ]; then
    kill -TERM -- -"$WRANGLER_PID" >/dev/null 2>&1 || kill -TERM "$WRANGLER_PID" >/dev/null 2>&1 || true
    wait "$WRANGLER_PID" 2>/dev/null || true
    WRANGLER_PID=""
  fi
  for _ in $(seq 1 30); do
    port_is_free && return 0
    sleep 1
  done
  echo "ポート ${PORT} を掴んだままのプロセスが残っています。中断します（他セッションを巻き込まないため pkill は使いません）。"
  lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null | tail -n +2
  exit 1
}
cleanup() {
  stop_worker
  rm -f .dev.vars.verify .dev.vars.empty
  rm -rf "$PERSIST"
}
trap cleanup EXIT

reset_db() {
  rm -rf "$PERSIST"; mkdir -p "$PERSIST"
  W d1 migrations apply majan --local --persist-to "$PERSIST" >/dev/null 2>&1
  W d1 execute majan --local --persist-to "$PERSIST" --file=./db/seed.sql >/dev/null 2>&1
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

GOOD='{"leagueId":1,"playedOn":"2026-08-26","title":"初戦","results":[{"memberId":1,"rawScore":42300},{"memberId":6,"rawScore":28100},{"memberId":2,"rawScore":18400},{"memberId":7,"rawScore":11200}]}'
EDIT='{"playedOn":"2026-08-28","title":"修正後","results":[{"memberId":1,"rawScore":50000},{"memberId":6,"rawScore":20000},{"memberId":2,"rawScore":20000},{"memberId":7,"rawScore":10000}]}'

reset_db
bun run build >/dev/null 2>&1
start_worker with-secret

echo "===== 認証（Blocker: WRITE_PASSCODE 未設定で素通りしない） ====="
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
POST 201 'rawScore が数値 2.5e4 は通る（文字列 "2.5e4" の 400 と対）' '{"leagueId":1,"playedOn":"2026-08-30","results":[{"memberId":1,"rawScore":2.5e4},{"memberId":6,"rawScore":25000},{"memberId":2,"rawScore":25000},{"memberId":7,"rawScore":25000}]}'

echo; echo "===== 同じ日に2半荘（played_on に UNIQUE は無い） ====="
POST 201 '同じ played_on でもう1半荘' '{"leagueId":1,"playedOn":"2026-08-26","results":[{"memberId":3,"rawScore":30000},{"memberId":8,"rawScore":30000},{"memberId":4,"rawScore":20000},{"memberId":9,"rawScore":20000}]}'
check "同じ日の半荘が2件ある" "$(Q "SELECT COUNT(*) AS n FROM games WHERE played_on='2026-08-26';")" "2"

echo; echo "===== 並列 POST（MAX(id) の競合が起きないこと） ====="
before_games=$(Q "SELECT COUNT(*) AS n FROM games;")
# 素の `wait` は使わない。start_worker が wrangler dev を同じシェルの
# バックグラウンドジョブとして起動しているので、`wait` がそれを待って永久に止まる
# （実測: ここで15分以上ブロックした）。投げた curl の PID だけを待つ。
parallel_pids=()
for i in $(seq 1 8); do
  curl -s -o /dev/null -X POST "${BASE}/api/games" -H 'Content-Type: application/json' -H "X-Passcode: ${PASSCODE}" \
    -d '{"leagueId":1,"playedOn":"2026-09-01","results":[{"memberId":1,"rawScore":40000},{"memberId":6,"rawScore":30000},{"memberId":2,"rawScore":20000},{"memberId":7,"rawScore":10000}]}' &
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
PATCHG 200 'title を null にする'            1 '{"playedOn":"2026-08-28","title":null,"results":[{"memberId":3,"rawScore":50000},{"memberId":8,"rawScore":20000},{"memberId":4,"rawScore":20000},{"memberId":9,"rawScore":10000}]}'
check "title が NULL になった"               "$(Q "SELECT COUNT(*) AS n FROM games WHERE id=1 AND title IS NULL;")" "1"
PATCHG 200 'title を省略しても null 扱い'    1 '{"playedOn":"2026-08-28","results":[{"memberId":3,"rawScore":50000},{"memberId":8,"rawScore":20000},{"memberId":4,"rawScore":20000},{"memberId":9,"rawScore":10000}]}'
check "省略でも NULL のまま"                "$(Q "SELECT COUNT(*) AS n FROM games WHERE id=1 AND title IS NULL;")" "1"
PATCHG 200 'title を文字列に戻す'            1 '{"playedOn":"2026-08-28","title":"戻した","results":[{"memberId":3,"rawScore":50000},{"memberId":8,"rawScore":20000},{"memberId":4,"rawScore":20000},{"memberId":9,"rawScore":10000}]}'
check "title が文字列に戻った"               "$(Q "SELECT title FROM games WHERE id=1;")" "戻した"

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

echo; echo "===== GET が削除済みを除外 ====="
check "GET の games 件数 = DB の未削除件数" \
  "$(curl -s "${BASE}/api/leagues/1" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["games"]))')" \
  "$(Q "SELECT COUNT(*) AS n FROM games WHERE deleted_at IS NULL;")"
check "削除済みの id=1 が GET に含まれない" \
  "$(curl -s "${BASE}/api/leagues/1" | python3 -c 'import sys,json;print(1 in [g["id"] for g in json.load(sys.stdin)["games"]])')" "False"
check "GET の各半荘が4人ぶんの結果を持つ" \
  "$(curl -s "${BASE}/api/leagues/1" | python3 -c 'import sys,json;print(len({len(g["results"]) for g in json.load(sys.stdin)["games"]} - {4}))')" "0"
check "GET の members 件数" "$(curl -s "${BASE}/api/leagues/1" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["members"]))')" "10"
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
check "運営系テーブルへの書き込みが無い" "$(banned_in_code '(INSERT INTO|UPDATE|DELETE FROM) *(leagues|teams|members|league_members)' server/)" "0"
check "100000 のハードコードが無い"      "$(banned_in_code '100000|100_000' server/ src/lib/api.ts src/lib/scoring.ts src/lib/validation.ts src/lib/types.ts)" "0"

echo
echo "==================================="
printf '  PASS %d / FAIL %d\n' "$pass" "$fail"
echo "==================================="
[ "$fail" -eq 0 ]
