---
name: css-component
description: |
  CSSコンポーネントを作成・修正する際のCSS規約ガイド。
  CSS変数の命名・配置ルール、レイヤー管理、セレクタ設計の指針を提供する。
---

このスキルは、本プロジェクトのCSS規約に基づいてコンポーネントのCSSを記述する際のガイドラインを提供する。

# CSS レイヤー管理

- コンポーネントCSSは `@layer recipes` に配置
- importで `layer(recipes)` を指定する場合、ファイル内で `@layer recipes` を**重ねない**（二重ネストになりサブレイヤー化する）

```css
/* index.css */
@import url("my-component.css") layer(recipes);

/* my-component.css — @layer で囲まない */
.my-component {
  /* ... */
}
```

# CSS変数の設計

## 命名規則

```
--_[親セレクタ名]-[子セレクタ名]-[プロパティ名]
```

- ローカル変数（そのセレクタ内でのみ使用）: `--_` プレフィックス
- グローバル変数（複数セレクタで使用）: `_` なし

### 判定基準: 「複数セレクタ」のカウント方法

以下はすべて**別セレクタ**としてカウントする:

- 子セレクタ（`> span`, `> hgroup` 等）
- 疑似要素（`&::before`, `&::after`）
- バリアント / 属性セレクタ（`&[data-icon="question"]` 等）

**2つ以上のセレクタで参照される変数 → グローバル（`_`なし）**

```css
.my-component {
  /* グローバル: ::after と ::before の2セレクタで参照 → _なし */
  --my-component-icon: var(--icon-chevron);
  --my-component-icon-size: 20px;

  /* グローバル: nav, hgroup等の複数セレクタで参照 → _なし */
  --my-component-max-inline-size: 1280px;

  /* ローカル: .my-component自身でのみ参照 → --_ */
  --_my-component-gap: var(--spacing-8);

  &::after {
    inline-size: var(--my-component-icon-size);  /* 参照1 */
    mask-image: var(--my-component-icon);         /* 参照1 */
  }

  &[data-icon-position="start"]::before {
    inline-size: var(--my-component-icon-size);  /* 参照2 → グローバル確定 */
    mask-image: var(--my-component-icon);         /* 参照2 → グローバル確定 */
  }

  &[data-variant="alt"] {
    --my-component-icon: var(--icon-alt);         /* 参照3（上書き） */
  }
}
```

## 変数の配置

変数は**使うセレクタで定義**する。メディアクエリも同居させる。

```css
.my-component {
  /* ルート自身が使う変数はルートに定義 */
  --_my-component-gap: var(--spacing-8);

  @media (40.1rem < width) {
    --_my-component-gap: var(--spacing-10);
  }

  gap: var(--_my-component-gap);

  > .child {
    /* childが使う変数はchildに定義 */
    --_my-component-child-font-size: var(--font-size-16);

    @media (40.1rem < width) {
      --_my-component-child-font-size: var(--font-size-20);
    }

    font-size: var(--_my-component-child-font-size);
  }
}
```

## 変数化する理由

外部CSSからこのコンポーネントのスタイルを変更したいとき、変数の値を上書きするだけで調整できる。セレクタの再定義や詳細度を気にする必要がなくなる。

## 変数化の対象

- デザイントークンを参照する値は全て変数化する
- リセット値（`0`, `none`）は変数化不要

## line-height は必ずデザイントークンを使う

`line-height` は**ハードコード禁止**。必ずトークン変数から選択する:

| トークン | 値 |
|---------|-----|
| `--line-height-one` | 1 |
| `--line-height-sm` | 1.25 |
| `--line-height-md` | 1.5 |
| `--line-height-lg` | 1.75 |

Figmaの値が中間値（例: 1.3）の場合は、最も近いトークンを選択する。

# セレクタ設計

- ルート要素にはkebab-caseのclassName（例: `.page-header`）
- 子要素には基本的にクラス名をつけない。タグセレクタで指定
- 複数タグをまとめる場合は`:where()`でグルーピング
- 既存コンポーネントがクラスを持つ場合は`:has()`等でクラス名を活用する

```css
.my-component {
  /* 子要素: タグセレクタ */
  > hgroup { }
  > :where(h1, h2) { }
  > p { }

  /* 既存コンポーネントのクラスを活用 */
  > nav:has(> .breadcrumb) { }
}
```

# レイアウト・プロパティ

- **gridを優先**: flexよりgridを使う（direction不要で簡潔）
- **論理プロパティ**: `width` → `inline-size`、`height` → `block-size`、`margin-left/right` → `margin-inline`
- **ブレークポイント**: `@media (40.1rem < width)` のrange記法
- **ネスト構文**: CSSネスティングを使用（BEM不使用）

# デザイントークン

値は必ずトークン変数を使用する:

| カテゴリ | 変数パターン |
|---------|-------------|
| フォントサイズ | `--font-size-*`, `--heading-level-*` |
| フォントウェイト | `--font-weight-bold` 等 |
| 行間 | `--line-height-sm`, `--line-height-md` 等 |
| 色 | `--semantic-text-*`, `--semantic-fill-*` |
| スペーシング | `--spacing-*`(rem), `--spacing-*-px`(px) |
| 角丸 | `--radius-*` |
| 線 | `--border-width-*`, `--semantic-stroke-*` |

# 参考ファイル

- 変数の配置パターン: `packages/ui/src/assets/ui-system/tabbed-split-view.css`
- トークン定義: `packages/ui/src/assets/ui-system/tokens.css`
