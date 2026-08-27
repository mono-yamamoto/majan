#!/usr/bin/env bash
# 半荘のデータ（games / game_results）だけを、流し直せる INSERT 文として書き出す。
#
# ★ なぜ `wrangler d1 export` を使わないか
#   `wrangler login` の OAuth トークンでは D1 の export API が
#   「Authentication error [code: 10000]」で落ちる（d1 execute は通るのに）。
#   API トークンを作れば export も使えるが、消すのは games と game_results だけなので、
#   その2つを INSERT 文にしておけば足りる。トークンを増やさない方を選んだ。
#
# ★ 実名は入らない
#   members は書き出さない（リセットで消さないため）。game_results が持つのは member_id だけ。
#
# 使い方:  bash scripts/backup-games.sh [出力先]
set -euo pipefail

OUT="${1:-$HOME/majan-games-backup-$(date +%Y%m%d-%H%M%S).sql}"
DB=majan

run() { npx wrangler d1 execute "$DB" --remote --json --command "$1" 2>/dev/null; }
rows() { python3 -c 'import json,sys
d=json.load(sys.stdin)
for r in d[0]["results"]: print(r["s"])'; }

echo "-- majan 半荘データのバックアップ" > "$OUT"
echo "-- 作成: $(date '+%Y-%m-%d %H:%M:%S')" >> "$OUT"
echo "-- 戻すとき: npx wrangler d1 execute majan --remote --file=$(basename "$OUT")" >> "$OUT"
echo "" >> "$OUT"

# games → game_results の順（外部キーの向き）
run "SELECT 'INSERT INTO games (id,league_id,played_on,title,created_at,deleted_at) VALUES ('||id||','||league_id||','''||played_on||''','||CASE WHEN title IS NULL THEN 'NULL' ELSE ''''||replace(title,'''','''''')||'''' END||','''||created_at||''','||CASE WHEN deleted_at IS NULL THEN 'NULL' ELSE ''''||deleted_at||'''' END||');' AS s FROM games ORDER BY id;" | rows >> "$OUT"

run "SELECT 'INSERT INTO game_results (id,game_id,member_id,raw_score) VALUES ('||id||','||game_id||','||member_id||','||CASE WHEN raw_score IS NULL THEN 'NULL' ELSE CAST(raw_score AS TEXT) END||');' AS s FROM game_results ORDER BY id;" | rows >> "$OUT"

G=$(grep -c "INSERT INTO games" "$OUT" || true)
R=$(grep -c "INSERT INTO game_results" "$OUT" || true)
echo "書き出し: $OUT"
echo "  games        $G 件"
echo "  game_results $R 件"

# 件数が DB と一致するか確かめる（0件で「成功」と言わないため）
EXPECT=$(run "SELECT (SELECT COUNT(*) FROM games)||'/'||(SELECT COUNT(*) FROM game_results) AS s;" | rows)
echo "  DB 上の件数   $EXPECT"
[ "$G/$R" = "$EXPECT" ] && echo "  ★ 一致" || { echo "  ★ 食い違い。書き出しに失敗しています"; exit 1; }
