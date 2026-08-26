# コンポーネント早見表（auto パッケージ）

Temp.tsx (`packages/auto/src/pages/Temp.tsx`) が実物カタログ。下記は Figma ノード名 → 採用コンポーネントの対応表。

## 一覧

| Figmaノード名 | 採用コンポーネント | import元 | 備考 |
|---|---|---|---|
| `page-header` | Default.tsx layout 経由 | metadata `pageHeader` | title/lead/pageId |
| `anchor-nav-link`, `side-nav` | SideNavToc（自動） | layoutが自動描画 | Section+Heading level1 で自動登録 |
| `stepper-contents` | StepperContents | `~/components` | src は ImageKey。**share/mypage系は必ず `tight` prop 付与**（密度制御・SPタイムライン構造化） |
| `annotation-text` / `※`注記 | NoteList | `@ui` | **share/mypage配下の注記は `<NoteList tag='small'>本文</NoteList>`** 固定。`<small>※...</small>` 直書き禁止。デフォルトprefix=`※`、indexes付き番号が必要な時は複数子要素で |
| `accordion-box` | Accordion | `@ui` | title=string, children=本文 |
| `basic-division` | BasicDivision | `~/components` | 子は `<Image>` + `<div>` |
| `callouts` | Callouts | `~/components` | variant='warn'/'positive'/'push' |
| `box`（薄い青背景） | BoxFill + `isBrand` | `@ui` | `#e6edf5` 背景 |
| `button-mypage` | MyPageLink | `@ui` | 390×64想定 |
| `utiity-links` (list) | UtilityLink + items | `~/components` | icon='question'/'chevron'。**同種リンクが連続2件以上なら単体を並べずに `items` で1つのlist にまとめる**（Temp.tsx `#toc-heading-22` 参照） |
| `utiity-links` (単体) | UtilityLink + href | `~/components` | iconPosition='end'/'start'。**単発のみ** |
| `section-link` / ボタン | SectionLink | `~/components` | size='large'/'medium'/'small' |
| `heading-level1` | Heading (level自動) | `~/components` | Section level 1 = h2 |
| `heading-level2` | Heading (Section nest) | `~/components` | Section level 2 = h3 |
| `hr` | `<hr />` | native | layoutに入ってれば自動 |
| `bullet-list` / `ul` | BulletList | `~/components` | check / ordered プロパティ |
| `pictogram-list` | PictogramList | `~/components` | icon系 |
| `factual-illust` | FactualIllust | `~/components` | 補償対象/対象外 variant |
| `box-outline-icon-grid` | BoxOutlineIconGrid | `~/components` | columns指定可能 |
| `related-links` | metadata `relatedLinks` | Default.tsx | shoulder付き |

## 強調の扱い
Figmaで `W6 (Bold)` になっている span は原則 `<em>` or `<strong>`。
- `<strong>` がセマンティック的に正しい
- `<em>` を太字として扱うには CSS で `font-style: normal; font-weight: bold` 上書きが必要（グローバル影響あり、ユーザー合意必須）

## 再現困難なパターン
- **Figma独自の画像 + テキスト並列レイアウト**で既存コンポーネント該当なし → `BasicDivision` で代替
- **Accordion内に複雑な図解** → テキストのみに簡略化、画像は外出し
- **ボタン幅を細かく指定** → UIコンポーネント側の recipe 変更が必要（別タスク推奨）

## Heading階層のルール
```tsx
// Top-level Sectionなし = level 0 (h1相当、ただしpage-headerがh1持つためSection必須)
<Section>           // level 1 → h2 / SideNavToc登録
  <Heading>A</Heading>
  <Section>         // level 2 → h3
    <Heading>B</Heading>
  </Section>
</Section>
```

## コンポーネントの className 受け入れ可否
多くは **className を受け取らない**。スタイル調整はラッパーSectionに `id` を付けて外部CSSからスコープ。

```tsx
<Section id='mypage-login-box'>
  <BoxFill isBrand>...</BoxFill>
</Section>
```
```css
#mypage-login-box .box-fill { ... }
```
