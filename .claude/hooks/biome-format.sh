#!/bin/bash
# PostToolUse hook: Edit/Write後にBiomeで自動フォーマット
# 対象: .ts, .tsx, .js, .jsx, .json, .css ファイルのみ

read -r JSON_INPUT

FILE_PATH=$(echo "$JSON_INPUT" | jq -r '.tool_input.file_path // empty')

# ファイルパスが取れなければ終了
[ -z "$FILE_PATH" ] && exit 0

# 対象拡張子のみフォーマット
case "$FILE_PATH" in
  *.ts|*.tsx|*.js|*.jsx|*.json|*.css)
    bunx biome check --config-path ./lint-tools/ --write "$FILE_PATH" 2>/dev/null
    ;;
esac

exit 0
