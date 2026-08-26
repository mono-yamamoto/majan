---
name: figma-playwright-workflow
description: |
  Figma MCPとChrome DevTools MCPを使ったコンポーネント開発ワークフロー。
  デザインの取得、ブラウザ表示確認、反復的な比較調整の手順を提供する。
  Figma仕様・デザイン分析結果に基づくコンポーネント実装時は必ずこのワークフローを通すこと。
---

このスキルは、Figmaデザインに基づくコンポーネント開発をFigma MCPとChrome DevTools MCPで効率的に進めるためのワークフローを提供する。

# 前提ツール

- **Figma MCP**: デザインのスクリーンショット取得、デザインスペック（色・サイズ・余白・フォント等）の取得
- **Chrome DevTools MCP**: ブラウザ操作・スクリーンショット・DOM/CSS検査を一気通貫で行う主要ツール
- **Playwright CLI** (`npx playwright screenshot`): Chrome DevTools MCPが使えない場合のフォールバックとして利用可能

# ワークフロー

## Step 1: Figmaデザインの取得

FigmaのURLからfileKeyとnodeIdを抽出してデザイン情報を取得する。

```
URL: figma.com/design/:fileKey/:fileName?node-id=:nodeId
nodeIdの「-」は「:」に変換する
```

### デザインスペック取得

```
mcp__figma__get_design_context(fileKey, nodeId)
```
- コード参考（React+Tailwind形式）とスクリーンショットが返る
- プロジェクトのスタック・トークンに読み替えて使う（そのままコピペしない）

### スクリーンショットのみ取得

```
mcp__figma__get_screenshot(fileKey, nodeId)
```
- 比較用のスクリーンショットが欲しい時に使う

### PC/SP両方取得

FigmaでPC・SPそれぞれのnodeIdが存在する場合は両方取得してレスポンシブ対応に備える。

## Step 2: 実装

デザインスペックを元にコンポーネントを実装する。

- デザインスペックの値はプロジェクトのデザイントークンに変換する
- CSSの書き方は `/css-component` スキルを参照

## Step 3: Chrome DevTools MCPでブラウザ確認

### devサーバー起動

```bash
bun dev:auto   # port 5174 (auto)
bun dev:fire   # port 5173 (fire)
bun dev:pet    # port 5175 (pet)
```

### ページを開く

```
mcp__chrome-devtools__navigate_page(type: "url", url: "http://localhost:5174/auto/path/to/page")
```

### 要素にスクロールしてスクリーンショット

```javascript
// 対象要素までスクロール
mcp__chrome-devtools__evaluate_script(() => {
  document.querySelector('.my-component').scrollIntoView({ block: 'center' });
})

// ビューポートのスクリーンショット（インラインで返る）
mcp__chrome-devtools__take_screenshot()

// 特定要素だけのスクリーンショット
mcp__chrome-devtools__take_screenshot({ uid: "要素のuid" })

// フルページスクリーンショット
mcp__chrome-devtools__take_screenshot({ fullPage: true })
```

### ビューポートサイズ変更（レスポンシブ確認）

```
mcp__chrome-devtools__emulate({ device: "iPhone 14" })
mcp__chrome-devtools__resize_page({ width: 375, height: 812 })   // SP
mcp__chrome-devtools__resize_page({ width: 1280, height: 900 })  // PC
```

### computed styleの検査（デバッグの要）

トークンの変数名ミスやレイアウト崩れの原因特定に非常に有効。

```javascript
mcp__chrome-devtools__evaluate_script(() => {
  const el = document.querySelector('.my-component');
  const cs = getComputedStyle(el);
  return {
    display: cs.display,
    gap: cs.gap,
    padding: cs.padding,
    borderRadius: cs.borderRadius,
    backgroundColor: cs.backgroundColor,
    gridTemplateColumns: cs.gridTemplateColumns,
    width: cs.width,
    height: cs.height,
  };
})
```

### ページ操作

```
mcp__chrome-devtools__click({ uid: "要素のuid" })
mcp__chrome-devtools__hover({ uid: "要素のuid" })
mcp__chrome-devtools__navigate_page({ type: "reload" })
```

## Step 4: Figma × ブラウザ比較ループ

1. Chrome DevTools MCPで対象要素にスクロール → スクリーンショット取得
2. Figma MCPでFigmaスクリーンショットを取得
3. 両方を目視比較して差分を特定
4. 差分が見た目から分からない場合、`evaluate_script` でcomputed styleを確認
5. CSS/HTMLを修正
6. `navigate_page(type: "reload")` でリロードして再確認
7. 1-6を繰り返す（PC/SP両方）

## Step 5: レビュー

実装完了後、difitでコードレビューを依頼する。

```bash
difit . --include-untracked
```

# 注意点

- **devサーバーのURL**: Ministaのdev環境では `.html` 拡張子なし（例: `/auto/solution/asol000`）
- **ポート競合**: 既にポートが使われている場合、別ポートで起動されることがある。起動ログを確認する
- **CSSカスケード衝突**: `container.css`（base layer）の `main > *` ルールがコンポーネントの幅を制限する場合がある。`inline-size: 100%; margin-inline: 0;` で対処
- **@layer二重ネスト**: importで`layer(recipes)`指定済みの場合、ファイル内で`@layer recipes`を重ねない
- **Figma MCPの認証**: OAuth認証が必要。初回は `/mcp` コマンドで認証フローを実行する

# 参考

- Figma MCP: `https://mcp.figma.com/mcp`
- Chrome DevTools MCP: `https://github.com/anthropics/anthropic-quickstarts/tree/main/chrome-devtools-mcp-server`
