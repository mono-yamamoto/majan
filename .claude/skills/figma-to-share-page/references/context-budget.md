# Figma MCP の context 予算管理

Figma MCP ツールは**ノードサイズ次第で100KB超のJSONを返す**。これをそのまま受け取ると context window が溶ける。

## 基本ルール

| ツール | 推奨用途 | 注意点 |
|---|---|---|
| `get_metadata` | 階層・ノードID把握 | 軽量、最初に呼ぶ |
| `get_screenshot` | 目視確認、画像レイアウト | 画像返す、サイズ大きいが1枚なら問題なし |
| `get_variable_defs` | トークン実値取得 | 軽量、色・spacing実値が欲しい時 |
| `get_design_context` | テキスト＋コード取得 | **100KB超え頻発、要警戒** |

## `get_design_context` の使い分け

### やっていいこと
- **末端フレーム1つに絞って取得**（例: `Frame 2088241383` のような `stepper-contents` をまとめるFrame）
- `excludeScreenshot: true` を付けてスクショ分のサイズ削減
- 既に取得済みの tool-result JSON を extract で読み直す（コンテキスト消費ゼロ）

### やっちゃダメ
- 最上位 `frame` ノード（ページ全体）でいきなり呼ぶ → ほぼ100%溢れる
- 画像アセットURLが大量に含まれるノード → `const img... = ...` の羅列でコンテキスト食う

## 100KB超えた時の復旧手順

1. tool-result は `/private/tmp/claude-.../tool-results/<id>.json` または指定ディレクトリに自動保存される
2. `scripts/extract-figma-text.py` を使う:
   ```bash
   python3 .claude/skills/figma-to-share-page/scripts/extract-figma-text.py \
     /path/to/tool-result.json > /tmp/figma-text.txt
   ```
3. 可視テキスト（`>...<` 間のテキスト）だけを抽出し、`const img...` は除外
4. `Read` で `/tmp/figma-text.txt` を読む

## metadata から狙い撃ち

`get_metadata` で構造だけ先に取って、必要なサブノードを個別に `get_design_context` するのが安全。

### 例
```
1. get_metadata(最上位ノード) → accordion-box 3つのIDを把握
2. get_design_context(accordion-box-1) → 1つ分のテキスト取得
3. get_design_context(accordion-box-2) → ...
```

小分けにすれば context 1回あたり ~10KB で済む。

## FAQ等のリスト系テキスト取得

`utiity-links` のリストは `get_design_context` で素直に取れる（1アイテムあたり数百バイト）。
6〜10項目くらいなら親Frameで一括取得可。

## 画像アセット URL

`get_design_context` のレスポンスに `const imgXxx = "https://..."` が混じる。これは**実装には不要**（ユーザーが別途画像を用意する想定）。extract script で除外する。
