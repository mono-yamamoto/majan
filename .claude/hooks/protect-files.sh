#!/bin/bash
# PreToolUse hook: .env / lockファイルの編集をブロック

read -r JSON_INPUT

FILE_PATH=$(echo "$JSON_INPUT" | jq -r '.tool_input.file_path // empty')

[ -z "$FILE_PATH" ] && exit 0

case "$FILE_PATH" in
  *.env|*.env.*)
    echo "BLOCK: .envファイルは直接編集禁止です。手動で編集してください。" >&2
    exit 2
    ;;
  */bun.lock|*/bun.lockb|*/package-lock.json|*/yarn.lock)
    echo "BLOCK: lockファイルは直接編集禁止です。パッケージマネージャー経由で更新してください。" >&2
    exit 2
    ;;
esac

exit 0
