# Icon System

アイコンSVGの管理とCSS変数の自動生成に関するスキル。

## SVGアイコンの配置

各プロダクトパッケージの `src/assets/images/icons/` ディレクトリに配置する。

```
packages/auto/src/assets/images/icons/
packages/fire/src/assets/images/icons/
packages/pet/src/assets/images/icons/
```

### 命名規則
- プレフィックス: `ico_` または `icon-`
- ケバブケース: `ico_circle-check.svg`, `icon-alert.svg`

## CSS変数の自動生成

SVGを配置後、以下のコマンドでCSS変数が自動生成される。

```bash
bun media:generate-lists
```

生成先: `packages/*/src/assets/icon/icons.css`

生成例:
```css
@layer tokens {
  :root {
    --ico-pen: url(/src/assets/images/icons/ico_pen.svg);
    --icon-alert: url(/src/assets/images/icons/icon-alert.svg);
  }
}
```

## CSSでの使用方法

アイコンは `mask-image` パターンで使用し、色は `background-color` で制御する。

```css
.icon::before {
  content: "";
  display: block;
  inline-size: 24px;
  block-size: 24px;
  mask-image: var(--ico-pen);
  mask-size: contain;
  mask-repeat: no-repeat;
  background-color: currentColor;
}
```

### ポイント
- `mask-image` で形状を定義し、`background-color` で色を制御する
- `currentColor` を使うと親要素の `color` に追従する
- `flex-shrink: 0` でアイコンの縮小を防ぐ

## 新規アイコン追加の手順

1. SVGファイルを `packages/*/src/assets/images/icons/` に配置
2. `bun media:generate-lists` を実行
3. `packages/*/src/assets/icon/icons.css` に変数が追加されたことを確認
4. CSSで `mask-image: var(--icon-name)` として使用
