# Component Catalog

このスキル同梱のコンポーネントと Starlight 標準コンポーネントの使い方リファレンス。

## 同梱コンポーネント

### `<DiffTable>` + `<DiffRow>`

差分付きファイルテーブル。slot ベースなので各セルに自由に MDX を書ける。

#### Props

`<DiffTable>`:

| Prop | 型 | 既定 | 説明 |
|---|---|---|---|
| `statusLabel` | string | `'種別'` | 1 列目ヘッダー |
| `pathLabel` | string | `'パス'` | 2 列目ヘッダー |
| `noteLabel` | string | `'役割'` | 3 列目ヘッダー |

`<DiffRow>`:

| Prop | 型 | 説明 |
|---|---|---|
| `status` | `'add' \| 'mod' \| 'del' \| 'keep'` | 必須。色付きタグになる |
| `path` | string? | 2 列目に `<code>` ラップで表示 |

3 列目（note）は `<slot />` なので `<code>` / `<strong>` / リンクを自由に書ける。

#### 使い方

```mdx
import DiffTable from '../../components/DiffTable.astro';
import DiffRow from '../../components/DiffRow.astro';

<DiffTable>
  <DiffRow status="add" path="src/lib/foo.ts">factory 関数の追加</DiffRow>
  <DiffRow status="mod" path="src/app/page.tsx">右カラムを切り出し</DiffRow>
  <DiffRow status="del" path="src/legacy/old.ts">不要</DiffRow>
</DiffTable>
```

### `<StatusTag>`

タグ単体。文中に埋める。

| Prop | 型 | 既定 | 説明 |
|---|---|---|---|
| `status` | `'add' \| 'mod' \| 'del' \| 'keep'` | – | 必須 |
| `label` | string? | status ごとの和訳 | テキスト上書き |

```mdx
<StatusTag status="add" /> 新規
<StatusTag status="add" label="NEW" /> ラベル指定
```

## Starlight 標準で使うやつ

### `<FileTree>` from `@astrojs/starlight/components`

ネストされた markdown リストをツリーに変換。

```mdx
import { FileTree } from '@astrojs/starlight/components';

<FileTree>
- src/
  - app/
    - page.tsx
  - features/
</FileTree>
```

### `<Card>` / `<CardGrid>`

ランディング / 索引向け。`hero` テンプレ (`template: splash`) との相性が良い。

```mdx
import { Card, CardGrid } from '@astrojs/starlight/components';

<CardGrid>
  <Card title="A" icon="document">説明</Card>
  <Card title="B" icon="star">説明</Card>
</CardGrid>
```

### `<Tabs>` / `<TabItem>`

実装案の比較やシェル切替に使える。

```mdx
import { Tabs, TabItem } from '@astrojs/starlight/components';

<Tabs>
  <TabItem label="npm">`npm install foo`</TabItem>
  <TabItem label="pnpm">`pnpm add foo`</TabItem>
</Tabs>
```

### `<Aside>`

`note` / `tip` / `caution` / `danger` で色付きコールアウト。

```mdx
import { Aside } from '@astrojs/starlight/components';

<Aside type="caution">production では伏字にする</Aside>
```

### `<Steps>`

順序付きリストを「ステップ番号付きカード」化。

```mdx
import { Steps } from '@astrojs/starlight/components';

<Steps>
1. 最初にやること
2. 次にやること
3. 最後の確認
</Steps>
```

### Expressive Code（標準）

` ```ts title="..." {3-5} ` 等の言語属性。詳細は [examples/code-diff.mdx](../template/src/content/docs/examples/code-diff.mdx)。

| 構文 | 効果 |
|---|---|
| `` ```ts title="path.ts" `` | タイトルバーにファイル名 |
| `` ```ts {3-5,8} `` | 行ハイライト |
| `` ```ts ins={3-4} `` | 行を「追加」扱いで強調 |
| `` ```ts del={6} `` | 行を「削除」扱いで強調 |
| `// [!code ++]` 行末 | 行単位の追加マーカー |
| `// [!code --]` 行末 | 行単位の削除マーカー |
| `// [!code highlight]` 行末 | 行ハイライト |
