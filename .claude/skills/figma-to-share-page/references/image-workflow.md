# 画像追加ワークフロー

Image コンポーネントは `imageData.json` 登録画像のみ受け付ける（`ImageKey`型制約）。未登録の画像は `<img>` 直書きも可能だがAVIF/DPR最適化が効かないため非推奨。

## 保存場所の決まりごと（重要）

| scope | 保存先 |
|---|---|
| `share/mypage/*` | `packages/auto/src/assets/images/share/mypage/` のみ（auto固有） |
| `illustration/*` | `packages/<pkg>/src/assets/images/illustration/` |
| その他 | `packages/<pkg>/src/assets/images/<scope>/` |

> ⚠️ `share/mypage` の画像は **auto パッケージの上記ディレクトリにのみ** 保存する。fire/petには配置しない。

## ユーザーが画像ファイルを渡してきた時

### 1. 保存場所の確認
- ユーザーが `packages/<pkg>/src/assets/images/<scope>/...` に保存していることが多い
- **画像の場所は移動しない**（ユーザー指示がない限り）

### 2. 名前をkebab-case英語に変換
日本語名や `Slot.png` `Slot-1.png` といった仮名を、他のillustrationと同じ命名規則に合わせる。

例：
- `Slot.png` → `pc-and-smartphone.png`（内容に即した名前）
- `運転者範囲変更.png` → `driver-scope-temporary-change.png`
- `カスタマーセンターまでお電話.png` → `customer-center-call.png`

命名参考: `packages/auto/src/assets/images/illustration/` の既存命名（kebab-case、内容を具体的に表現）

### 3. `bun media:generate-lists` 実行
```bash
cd /Users/m126/works/SS/sonysonpo-design-system-and-website
bun media:generate-lists
```
- プロジェクトルートで実行
- `imageData.json` が自動更新される
- 画像のバリエーション（avif/webp, DPR 1x/2x）も同時生成

### 4. 登録確認
```bash
grep "<new-name>" packages/<pkg>/imageData.json
```
エントリが `{ "path": "assets/images/.../xxx.png" }` 形式で追加されていればOK。

### 5. TSXから使用
```tsx
import { Image } from '~/components';

<Image src='/assets/images/share/mypage/pc-and-smartphone' alt='' />
```
パスは拡張子を付けない。型エラーが出たら `imageData.json` のキー確認。

## ユーザーが画像を用意していない場合
- `imageData.json` にある既存illustrationから近いものを探す
- 完全一致しない場合は「画像不足」として完了報告で明示
- 勝手に類似画像で置き換えるが、必ずユーザーに報告

## よくあるハマり
- 日本語ファイル名のまま `bun media:generate-lists` した → 登録はされるがパス参照しにくい。先にrenameする
- `public/assets/...` に置く → こちらは静的公開のみでImageコンポーネント対象外
- ユーザーが画像を渡してきたのに `bun media:generate-lists` を忘れる → ビルドで型エラー
