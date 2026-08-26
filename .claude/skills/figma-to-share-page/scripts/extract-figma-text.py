#!/usr/bin/env python3
"""
Figma get_design_context の tool-result JSON から可視テキストだけ抽出する。

Usage:
    python3 extract-figma-text.py <tool-result.json> [> output.txt]

入力は `[{type: "text", text: "..."}, ...]` 形式の JSON。
text フィールド内のReact+Tailwindコードから、
  - `const imgXxx = "..."` 行を除外
  - `>...<` の間にある可視テキストを抽出
して標準出力に重複なしで出す。
"""
import json
import re
import sys


def extract_texts(tool_result_path: str) -> list[str]:
    with open(tool_result_path) as f:
        data = json.load(f)

    all_texts: list[str] = []
    seen: set[str] = set()

    for item in data:
        if item.get('type') != 'text':
            continue
        text = item.get('text', '')

        # const img... 行を除外
        lines = [l for l in text.split('\n') if not l.strip().startswith('const img')]
        cleaned = '\n'.join(lines)

        # >...< の中身を抽出（2〜500文字、{}含まず）
        matches = re.findall(r'>([^<>{}]{2,500})<', cleaned)
        for m in matches:
            m = m.strip()
            if not m or m in seen:
                continue
            seen.add(m)
            all_texts.append(m)

    return all_texts


def main() -> int:
    if len(sys.argv) < 2:
        print('Usage: extract-figma-text.py <tool-result.json>', file=sys.stderr)
        return 1

    texts = extract_texts(sys.argv[1])
    for t in texts:
        print(t)
    return 0


if __name__ == '__main__':
    sys.exit(main())
