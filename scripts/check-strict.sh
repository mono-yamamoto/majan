#!/usr/bin/env bash
#
# vp check を「警告も失敗」として実行する。
#
#   bash scripts/check-strict.sh
#
# vp check は lint 警告があっても exit 0 を返す（実測）。警告を放置すると
# 溜まってから消す作業が要るので、0 のうちから 0 を維持する。
set -uo pipefail
cd "$(dirname "$0")/.."

out=$(./node_modules/.bin/vp check 2>&1)
status=$?
printf '%s\n' "$out"

# 色コードを外してから判定する（"warn:" は色で囲まれている）
plain=$(printf '%s' "$out" | sed $'s/\033\\[[0-9;]*m//g')

if [ "$status" -ne 0 ]; then
  exit "$status"
fi

# 「warn:」の行、または集計行の警告件数が1以上なら落とす。
# 2つ見るのは、片方の出力形式が変わってももう片方で気づけるようにするため。
if printf '%s\n' "$plain" | grep -qE '^warn:|and [1-9][0-9]* warnings?'; then
  echo
  echo "check-strict: 警告があります。警告0を維持してください（vp check 自体は exit 0 を返します）"
  exit 1
fi
