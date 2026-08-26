---
name: create-auto-component
description: |
  autoパッケージのコンポーネント開発ワークフロー（新規作成・UIオーバーライド・auto既存修正に対応）。
  ヒアリング → Figmaデザイン取得 → TSX実装 → CSS実装 → ブラウザ確認 → レビューの流れで進める。
---

このスキルは、autoパッケージのコンポーネント開発ワークフローを提供する。
**新規コンポーネントの作成**、**UIコンポーネントのオーバーライド**、**auto既存コンポーネントの修正**に対応する。

> **2026-08 以降の構成**: auto の共通コンポーネント/CSS/JS は `packages/ui-v3`（新デザインシステム。ui v1 とは独立）に置かれ、
> ページからは汎用コンポーネントを `'ui-v3'` から直接 import し、auto 固有（Image / Picture / Meta と画像・site-data 注入済みラッパー）だけ `~/components` から import する。
> - 汎用コンポーネント（TSX / CSS）は `packages/ui-v3/src/components/` / `packages/ui-v3/src/style/components/`
> - auto 固有（Header / Footer / Top / Meta、画像・site-data を注入するラッパー）は `packages/auto/src/components/`
> - 「UIオーバーライド」= v1 由来の基本レシピ（accordion / badge / table 等）の調整は `packages/ui-v3/src/style/components/<name>.css` 末尾の「新デザイン（v3）向けの調整」ブロックに追記
> 詳細は `packages/ui-v3/README.md`。以下の手順中のパスはこの構成で読み替える。
発動したら、まずヒアリングで必要な情報を収集し、その後フローに沿って開発を進める。

## 作業タイプの基本方針

| | 新規作成 | UIオーバーライド | auto既存修正 |
|---|---------|---------|---------|
| TSX | `packages/ui-v3/src/components/` に新規作成（auto 固有なら `packages/auto/src/components/`） | 基本レシピの TSX（`packages/ui-v3/src/components/`）は原則変更しない。必要に応じてページ側で使い方を調整 | `packages/ui-v3/src/components/`（または auto 固有は `packages/auto/src/components/`）の既存TSXを直接修正 |
| CSS | `packages/ui-v3/src/style/components/` に新規作成 | `packages/ui-v3/src/style/components/<name>.css` 末尾の「新デザイン（v3）向けの調整」ブロックに追記 | `packages/ui-v3/src/style/components/` の既存CSSを直接修正 |
| 原則 | 新デザインのコンポーネントを ui-v3 に新規実装 | 基本レシピ本体は触らず、CSSカスタムプロパティの上書きだけで対応 | 既存コンポーネントのTSX・CSSを直接修正 |

# Phase 1: ヒアリング

`AskUserQuestion` ツールで以下の情報を収集する。

**重要: 分岐に依存しない質問は `AskUserQuestion` の `questions` 配列にまとめて入れること（最大4つ）。**
分岐の結果が確定してから、次のバッチを送る。
ユーザーが先に複数の情報をまとめて提供してくれた場合は、
既に回答済みの項目はスキップして次の未回答項目だけを聞く。

## ヒアリングフロー

### Call 1: 作業タイプの確認

Q1だけを単独で聞く（分岐の起点になるため）。

**Q1. 作業タイプ**

3つの選択肢を提示する:

- **「新規作成」**: auto固有の新規コンポーネントを作る → Call 2a へ
- **「UIオーバーライド」**: ui-v3 の基本レシピ（v1 由来）をCSS上書きで調整する → Call 2b へ
- **「auto既存修正」**: `packages/ui-v3/src/components/`（auto 固有は `packages/auto/src/components/`）にある既存コンポーネントを修正する → Call 2c へ

### Call 2a: 新規作成の場合（最大4問をバッチ）

以下をまとめて1回の `AskUserQuestion` で聞く:

1. **Q2a. コンポーネント名**: PascalCaseでコンポーネント名を聞く（例: `PageHeader`, `Callouts`）
2. **Q3. Figma URL（PC）**: PCデザインのFigma URLを聞く
3. **Q4. Figma URL（SP）**: SPデザインのFigma URLを聞く。「PCと同じ」を選択肢に含める
4. **Q5. 参考コンポーネント**: 既存の似たコンポーネントがあるか聞く。「特になし」も選択肢に含める

### Call 2b: UIオーバーライドの場合（最大3問をバッチ）

以下をまとめて1回の `AskUserQuestion` で聞く:

1. **Q2b. 対象コンポーネント**: `packages/ui-v3/src/components/` の中身を `ls` で取得し、既存コンポーネントをoptionsとして動的に表示する（最大4つ + Otherで対応）
2. **Q3. Figma URL（PC）**: PCデザインのFigma URLを聞く
3. **Q4. Figma URL（SP）**: SPデザインのFigma URLを聞く。「PCと同じ」を選択肢に含める

※ Q5（参考コンポーネント）はUIオーバーライドの場合スキップ（対象コンポーネント自体が参考になるため）

### Call 2c: auto既存修正の場合（最大2問をバッチ）

以下をまとめて1回の `AskUserQuestion` で聞く:

1. **Q2c. 対象コンポーネント**: `packages/ui-v3/src/components/`（+ auto 固有は `packages/auto/src/components/`）の中身を `ls` で取得し、既存コンポーネントをoptionsとして動的に表示する（最大4つ + Otherで対応）
2. **Q3c. 変更の種類**: 以下の選択肢を提示する
   - **スタイル修正**: デザイン変更への追従、見た目の調整（Figma確認が必要）
   - **ロジック修正・機能追加**: TSXの構造変更、props追加、機能拡張
   - **バグ修正**: 既存の不具合を修正
   - **複合（スタイル+ロジック）**: スタイルとロジック両方の変更（Figma確認が必要）

→ **変更の種類による分岐**:
- **「スタイル修正」or「複合」の場合** → Call 3c-style へ（Figma URLを聞く）
- **「ロジック修正・機能追加」or「バグ修正」の場合** → Call 3c-logic へ（変更内容の詳細を聞く）

### Call 3c-style: スタイル変更がある場合（最大2問をバッチ）

以下をまとめて1回の `AskUserQuestion` で聞く:

1. **Figma URL（PC）**: PCデザインのFigma URLを聞く
2. **Figma URL（SP）**: SPデザインのFigma URLを聞く。「PCと同じ」を選択肢に含める

### Call 3c-logic: ロジック変更・バグ修正の場合（1問）

1. **変更内容の詳細**: 具体的に何をどう変更したいか、再現手順（バグの場合）をフリーテキストで聞く

### Call 4: 追加情報（任意・全タイプ共通）

以下は任意項目。まとめて「追加で伝えたいことある？」と1回で聞く。

- **バリアント**: data属性で切り替えるバリアントがあるか（例: `data-variant="warn"`)
- **アイコン使用**: 新規アイコンSVGの追加が必要か
- **テスト要否**: ユニットテストを書くか
- **配置ページ**: どのページで使うか（URLパス）
- **備考・確認事項**: 他に伝えておきたいことや、実装上の注意点・制約があれば

ヒアリングが完了したら、収集した情報をまとめて確認を取る。

# Phase 2: Figmaデザイン取得

**※ auto既存修正で「ロジック修正・機能追加」または「バグ修正」を選択した場合、このPhaseはスキップする。**

`/figma-playwright-workflow` のStep 1に従う。

1. PC用・SP用それぞれの `fileKey` と `nodeId` をURLから抽出
2. `mcp__figma__get_design_context` でデザインスペック+スクリーンショットを取得
3. PC/SP両方のデザインを取得し、レスポンシブ対応の差分を把握する

取得したデザインスペックの値（色・サイズ・余白・フォント等）を、プロジェクトのデザイントークンにマッピングする。

# Phase 3: TSX実装

## 新規作成の場合

### ファイル構成

```
packages/ui-v3/src/components/ComponentName/index.tsx   # + packages/ui-v3/src/components/index.ts と packages/auto/src/components/index.ts に export を追加
```

### 実装ルール

- ルート要素にkebab-caseの `className` を付与（例: `my-component`）
- 不要なdivネストを避け、セマンティックなHTMLを使う
- バリアントは `data-*` 属性で表現する
- React hooksは使わない（静的HTML生成のため）
- 型定義は同ファイル内に書く

### 参考パターン

```tsx
// 最小構成の例（Callouts）
type ComponentProps = {
  variant?: 'push' | 'warn';
  heading: React.ReactNode;
  tag?: keyof Pick<JSX.IntrinsicElements, 'h2' | 'h3'>;
  children: React.ReactNode;
};

const Component = ({ variant = 'push', heading, tag = 'h2', children }: ComponentProps) => {
  const Tag = tag;
  return (
    <aside className='component-name' data-variant={variant}>
      <Tag>{heading}</Tag>
      {children}
    </aside>
  );
};

export default Component;
```

## UIオーバーライドの場合

- **基本レシピの TSX ファイルは原則修正しない**（必要なら ui-v3 側で props 追加として扱う）
- TSXの変更が不要な場合がほとんど（CSSカスタムプロパティの上書きだけで済む）
- テスト用にページ側でコンポーネントの使用例を追加してブラウザ確認する

## auto既存修正の場合

- `packages/ui-v3/src/components/ComponentName/index.tsx`（auto 固有は `packages/auto/src/components/`）を直接修正する
- 修正前に既存のコードを読み、現在の構造・props・型定義を把握する
- 変更の種類に応じたアプローチ:
  - **スタイル修正**: TSXの変更は最小限。主にCSSで対応
  - **ロジック修正・機能追加**: props追加、構造変更など。既存のpropsとの後方互換性に注意
  - **バグ修正**: 原因箇所を特定してピンポイントで修正。関連する他の使用箇所も確認
  - **複合**: TSX・CSS両方を段階的に修正。まずTSXの構造を整えてからCSS調整
- 修正後、そのコンポーネントを使用しているページを `Grep` で検索し、影響範囲を確認する

# Phase 4: CSS実装

## 新規作成の場合

### ファイル構成

```
packages/ui-v3/src/style/components/component-name.css
```

### CSSインポートの追加

`packages/ui-v3/src/style/index.css` の「構造コンポーネント（recipes レイヤー）」ブロックに以下を追加:

```css
@import url("./components/component-name.css") layer(recipes);
```

## UIオーバーライドの場合（同ファイル末尾の調整ブロック）

**基本レシピ本体（`packages/ui-v3/src/style/components/<name>.css`）の v1 由来部分は直接いじらず、同ファイル末尾の `@layer recipes { … }`「新デザイン（v3）向けの調整」ブロックに追記する。**

### なぜ同ファイル末尾か

- v1 由来のベースと v3 調整が同じファイル・同じレイヤー（recipes）にあり、後ろに書いた調整が効く
- 後続の他コンポ CSS（例: `.utility-link-list { margin: 0 }`）と詳細度が同じだと読み込み順で負けるので、必要なら詳細度を1段上げる

### ファイル構成

```
packages/ui-v3/src/style/components/component-name.css   # 末尾の調整ブロック
```

ファイル名はデザインシステム側のコンポーネント名（kebab-case）に合わせる。

### CSSインポートの追加

（同ファイル内なので import の追加は不要）

### 上書きの実装パターン

CSSカスタムプロパティ（`--ui-*` 変数）を上書きするのが基本パターン。
既存のCSS構造は活かしつつ、値だけを差し替える。

```css
/* 例: テーブルの角丸をauto用に大きくする */
table {
  --ui-table-outer-radius: var(--radius-lg);
}
```

### 既存の上書き変数の探し方

1. 対象コンポーネントのCSS（`packages/ui-v3/src/style/components/<name>.css`）を読む
2. `--ui-*` で始まるCSS変数を確認する
3. その変数をoverrideファイルで再定義する

## auto既存修正の場合

- `packages/ui-v3/src/style/components/component-name.css` を直接修正する
- 修正前に既存のCSSを読み、現在の変数定義・構造を把握する
- 変更の種類に応じたアプローチ:
  - **スタイル修正**: 既存のCSS変数の値を変更、または新しいスタイルルールを追加
  - **ロジック修正・機能追加**: 新しいバリアントの追加（`[data-variant="..."]`）、新しい子要素のスタイル定義
  - **バグ修正**: 問題のあるスタイルルールを特定して修正
- 新規CSSファイルの作成やimportの追加は不要（既存ファイルを修正するため）

## 共通CSS記述ルール

`/css-component` スキルに従う。特に重要なポイント:

- `@layer recipes` に配置（importで `layer(recipes)` 指定するのでファイル内では `@layer` で囲まない）
- CSS変数: `--_[component-name]-[part]-[property]` の命名
- デザイントークン変数を必ず使う
- メディアクエリ: `@media (40.1rem < width)` のrange記法
- CSSネスティング使用（BEM不使用）
- 子要素はタグセレクタや `:where()` で指定（クラス名不要）
- grid優先、論理プロパティ使用

## アイコンが必要な場合

`/icon-system` スキルに従い、SVGを配置して `bun media:generate-lists` を実行する。

# Phase 5: ブラウザ確認

`/figma-playwright-workflow` のStep 3〜4に従う。

1. devサーバー起動: `bun dev:auto`（port 5174）
2. Chrome DevTools MCPでページを開く
3. 対象コンポーネントにスクロール → スクリーンショット取得
4. Figmaデザインと比較して差分を修正
5. PC/SP両方のビューポートで確認（`resize_page` でサイズ変更）
6. 満足するまでループ

## レイアウトデバッグ

スクリーンショットでレイアウトが期待通りでない場合、
Chrome DevTools MCP の `evaluate_script` でcomputedStyleを確認すると原因特定が速い。

```js
// 例: 要素のサイズやgrid情報を取得
mcp__chrome-devtools__evaluate_script(() => {
  const el = document.querySelector('.my-component');
  const cs = getComputedStyle(el);
  return {
    display: cs.display,
    gridTemplateColumns: cs.gridTemplateColumns,
    gap: cs.gap,
    borderRadius: cs.borderRadius,
    width: cs.width,
    height: cs.height,
  };
})
```

# Phase 6: レビュー

実装完了後、`/difit` でコードレビューを依頼する。

# チェックリスト

## 新規作成の場合

- [ ] TSX: `packages/ui-v3/src/components/ComponentName/index.tsx` が作成され、ui-v3 / auto の `components/index.ts` に export が追加されている
- [ ] CSS: `packages/ui-v3/src/style/components/component-name.css` が作成されている
- [ ] CSSインポート: `index.css` に `@import` が追加されている
- [ ] デザイントークン: ハードコードされた値がない
- [ ] CSS規約: `/css-component` スキルを実行し、変数の命名（グローバル/ローカル）・配置ルールに準拠しているか確認
- [ ] レスポンシブ: PC/SP両対応
- [ ] アクセシビリティ: セマンティックHTML、適切なaria属性
- [ ] Figma比較: PC/SP両方でデザインと一致している

## UIオーバーライドの場合

- [ ] 基本レシピ本体の CSS を**変更していない**こと
- [ ] CSS上書き: `packages/ui-v3/src/style/components/component-name.css` 末尾の調整ブロックに追記されている
- [ ] 上書きはCSSカスタムプロパティ（`--ui-*`）の再定義で実現していること
- [ ] デザイントークン: ハードコードされた値がない
- [ ] レスポンシブ: PC/SP両対応
- [ ] Figma比較: PC/SP両方でデザインと一致している

## auto既存修正の場合

- [ ] 修正対象のTSX・CSSファイルのみ変更していること（不要な変更がないこと）
- [ ] 影響範囲: コンポーネントを使用しているページを `Grep` で確認し、意図しない影響がないこと
- [ ] 既存のpropsとの後方互換性が保たれていること（破壊的変更がある場合は使用箇所も更新）
- [ ] デザイントークン: ハードコードされた値がない
- [ ] CSS規約: `/css-component` スキルの規約に準拠していること
- [ ] レスポンシブ: PC/SP両対応（スタイル変更がある場合）
- [ ] Figma比較: スタイル変更がある場合、PC/SP両方でデザインと一致している
- [ ] バグ修正の場合: 修正前の問題が再現しないことをブラウザで確認
