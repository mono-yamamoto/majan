# CSS追記のスコーピングルール

原則: **CSSは書かない**。ユーザーが明示的に書いてほしいと指示した時のみ追加する。

## ファイル配置

### ページ固有（1ページだけ）
```
packages/<pkg>/public/css/pages/<section>/<page-id>/index.css
```
例: `packages/auto/public/css/pages/rsv/arsv000/index.css`

### セクション共通（複数ページ共通）
```
packages/<pkg>/public/css/pages/<section>/index.css
```
例: `packages/auto/public/css/pages/share/index.css`
（share/配下の全ページで共通利用）

## TSXからの読込

```tsx
import { Head } from 'minista';
import { siteDir } from '<relative-path>/minista.config';

<Head>
  <link rel='stylesheet' href={`${siteDir}/css/pages/share/index.css`} />
</Head>
```

## スコープの基本戦略

### 1. ページ固有スタイル → id selector
```tsx
<Section id='mypage-login-box'>
  <BoxFill isBrand>...</BoxFill>
</Section>
```
```css
#mypage-login-box .box-fill {
  display: flex;
  align-items: center;
}
```

### 2. クラス直指定は「共通化」の意図がある時のみ
`.box-fill { padding: 48px }` のようにクラス直指定すると、**そのCSSを読み込む全ページの BoxFill が影響を受ける**。
- OK: 「share配下の全mypageページでBoxFill padding 48統一」のような意図
- NG: 「このページだけboxfill padding変えたい」→ id scope に閉じる

### 3. セマンティクス改変は慎重に
```css
/* 避けるべき: em はitalic/強調のセマンティック要素 */
em { font-style: normal; font-weight: bold; }
```
`<strong>` を使う方が HTML 的に正しい。ユーザーが「em = 太字として使う」と合意している場合のみ許容。

## トークン必須
CSSを書く時は、ハードコード値ではなく CSS変数（デザイントークン）を使う。

| 用途 | トークン例 |
|---|---|
| spacing | `var(--spacing-4)` `var(--spacing-12)` |
| font-size | `var(--font-size-md)` `var(--clamp-font-size-lg)` |
| color | `var(--semantic-text-primary)` `var(--semantic-fill-brand-primary-light)` |
| border | `var(--border-width-level-1) solid var(--semantic-stroke-primary)` |
| radius | `var(--radius-container-wide-medium)` (16px) |

## よくある追記パターン

### BoxFill を中央揃いflexにする
```css
#<page-id> .box-fill {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-6);
  text-align: center;
}
```

### MyPageLink を Figma仕様幅に揃える
```css
.my-page-link {
  width: 100%;
  max-width: 390px;
}
```

### 太字のためにemを再定義（要合意）
```css
em {
  font-style: normal;
  font-weight: bold;
}
```

## 動作確認
```js
// chrome-devtools evaluate_script で computedStyle 検証
() => {
  const el = document.querySelector('#target .box-fill');
  return {
    padding: getComputedStyle(el).padding,
    display: getComputedStyle(el).display,
  };
}
```
