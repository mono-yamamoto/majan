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

PORT="${PORT:-8787}"
BASE="http://localhost:${PORT}"
PASSCODE="verify-api-passcode"
LOG="$(mktemp -t verify-api).log"
pass=0; fail=0

W() { npx --no-install wrangler "$@"; }

# SQL を1行1列だけ返す形で流し、その値を取り出す。
# --json + JSON パースにしているのは、整形出力を sed で拾うと
# "duration:0" の "n:0" にマッチするような取り違えが起きるため。
Q() {
  W d1 execute majan --local --command "$1" --json 2>/dev/null \
    | python3 -c 'import sys,json; r=json.load(sys.stdin)[0]["results"]; print("" if not r else list(r[0].values())[0])'
}

cleanup() { pkill -f "wrangler dev --port ${PORT}" >/dev/null 2>&1 || true; rm -f .dev.vars.verify .dev.vars.empty; }
trap cleanup EXIT

reset_db() {
  rm -rf .wrangler/state/v3/d1
  W d1 migrations apply majan --local >/dev/null 2>&1
  W d1 execute majan --local --file=./db/seed.sql >/dev/null 2>&1
}

start_worker() { # $1: "with-secret" | "without-secret"
  pkill -f "wrangler dev --port ${PORT}" >/dev/null 2>&1 || true
  sleep 2
  # --env-file を必ず渡す。省くと開発者の .dev.vars が自動で読まれてしまい、
  # 「シークレット未設定」の検証が成立しない（実測で確認）。
  local args=(dev --port "${PORT}")
  if [ "$1" = "with-secret" ]; then
    printf 'WRITE_PASSCODE="%s"\n' "$PASSCODE" > .dev.vars.verify
    args+=(--env-file .dev.vars.verify)
  else
    : > .dev.vars.empty
    args+=(--env-file .dev.vars.empty)
  fi
  W "${args[@]}" > "$LOG" 2>&1 &
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
POST() { t "$1" "$2" -X POST "${BASE}/api/games" -H 'Content-Type: application/json' -H "X-Passcode: ${PASSCODE}" -d "$3"; }
PATCHG() { t "$1" "$2" -X PATCH "${BASE}/api/games/$3" -H 'Content-Type: application/json' -H "X-Passcode: ${PASSCODE}" -d "$4"; }

GOOD='{"leagueId":1,"playedOn":"2026-08-26","memo":"初戦","results":[{"memberId":1,"rawScore":42300},{"memberId":6,"rawScore":28100},{"memberId":2,"rawScore":18400},{"memberId":7,"rawScore":11200}]}'
EDIT='{"playedOn":"2026-08-28","memo":"修正後","results":[{"memberId":1,"rawScore":50000},{"memberId":6,"rawScore":20000},{"memberId":2,"rawScore":20000},{"memberId":7,"rawScore":10000}]}'

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
POST 400 'memo が数値'                   '{"leagueId":1,"playedOn":"2026-08-26","memo":9,"results":[]}'
POST 400 'JSON 壊れ'                     '{not json'
t 413 'ボディ 16KB 超' -X POST "${BASE}/api/games" -H 'Content-Type: application/json' -H "X-Passcode: ${PASSCODE}" \
  -d "{\"leagueId\":1,\"playedOn\":\"2026-08-26\",\"memo\":\"$(head -c 20000 /dev/zero | tr '\0' 'a')\",\"results\":[]}"

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

echo; echo "===== PATCH の league_id は DB の games 行から読む ====="
PATCHG 200 'leagueId なし'                  1 "$EDIT"
PATCHG 200 'leagueId が DB と一致'          1 '{"leagueId":1,"playedOn":"2026-08-28","memo":"m","results":[{"memberId":1,"rawScore":50000},{"memberId":6,"rawScore":20000},{"memberId":2,"rawScore":20000},{"memberId":7,"rawScore":10000}]}'
PATCHG 400 'leagueId が DB と不一致 → 400'  1 '{"leagueId":2,"playedOn":"2026-08-28","memo":"m","results":[{"memberId":1,"rawScore":50000},{"memberId":6,"rawScore":20000},{"memberId":2,"rawScore":20000},{"memberId":7,"rawScore":10000}]}'
check "400 のあとも内容が変わっていない"   "$(Q "SELECT memo FROM games WHERE id=1;")" "m"
check "全置換後も4行のまま" "$(Q "SELECT COUNT(*) AS n FROM game_results;")" "4"
PATCHG 404 '存在しない :id'               999 "$EDIT"

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
check "GET の games 件数" "$(curl -s "${BASE}/api/leagues/1" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["games"]))')" "0"
check "GET の members 件数" "$(curl -s "${BASE}/api/leagues/1" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["members"]))')" "10"
t 404 '存在しないリーグ' "${BASE}/api/leagues/999"

echo; echo "===== WRITE_PASSCODE 未設定でも素通りしない ====="
start_worker without-secret
t 500 '未設定 + ヘッダ無し → 500' -X POST "${BASE}/api/games" -H 'Content-Type: application/json' -d "$GOOD"
t 500 '未設定 + ヘッダ有り → 500' -X POST "${BASE}/api/games" -H 'Content-Type: application/json' -H 'X-Passcode: anything' -d "$GOOD"
t 200 '未設定でも GET は通る'      "${BASE}/api/leagues/1"
check "書き込まれていない（games は1行のまま）" "$(Q "SELECT COUNT(*) AS n FROM games;")" "1"

echo; echo "===== ビルド成果物に秘密が含まれない ====="
check "dist/ に WRITE_PASSCODE が無い" "$(grep -rl 'WRITE_PASSCODE' dist/ 2>/dev/null | wc -l | tr -d ' ')" "0"
check "dist/ にパスコード値が無い"     "$(grep -rl "${PASSCODE}" dist/ 2>/dev/null | wc -l | tr -d ' ')" "0"
check "src/ server/ に VITE_ が無い"   "$(grep -rl 'VITE_' src/ server/ 2>/dev/null | wc -l | tr -d ' ')" "0"

echo; echo "===== 静的チェック（Blocker） ====="
check "last_insert_rowid を使っていない" "$(grep -rn 'last_insert_rowid' server/ | grep -v '^\S*: *//' | grep -vc '//' | tr -d ' ')" "0"
check "DELETE エンドポイントが無い"      "$(grep -rc '\.delete(' server/ | grep -v ':0' | wc -l | tr -d ' ')" "0"
check "運営系テーブルへの書き込みが無い" "$(grep -rniE '(INSERT INTO|UPDATE|DELETE FROM) *(leagues|teams|members|league_members)' server/ | wc -l | tr -d ' ')" "0"
check "100000 のハードコードが無い"      "$(grep -rn '100000\|100_000' server/ src/lib/api.ts src/lib/scoring.ts src/lib/validation.ts src/lib/types.ts 2>/dev/null | wc -l | tr -d ' ')" "0"

echo
echo "==================================="
printf '  PASS %d / FAIL %d\n' "$pass" "$fail"
echo "==================================="
[ "$fail" -eq 0 ]
