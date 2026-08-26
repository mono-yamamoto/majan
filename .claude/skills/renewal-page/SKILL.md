---
name: renewal-page
description: |
  旧autoサイトのページを新デザインシステムへ完全転記で作り替える量産パイプライン（lib/renewal-pipeline）の実行スキル。
  引数なしなら urls.txt の残り全ページ、ページキー指定（例: kashitsu/ac04/akst187）ならそのページだけを、
  凍結→門番→生成→検証（verify-text）まで一気通貫で処理する。
  「akstNNN/agdeNNN/asolNNN を作って」「旧ページをリニューアル」「量産して」「残り全部やって」などで発動。
---

このスキルは、旧autoサイトのページを新デザインシステムのページへ**完全転記**で作り替えるワークフロー。
仕組みの説明と用語は `packages/auto/lib/renewal-pipeline/README.md` にある（未読なら最初に読む）。

推奨環境: **Claude Code の最新最上位モデル＋reasoning effort: high**（生成の言い換え事故・見出しの取り違えが減る）。

大原則:

- **本文の文言は一切変えない**。変えてよいのは画像の alt だけ。守れているかは verify-text.ts が機械照合する
- コマンドはすべて `packages/auto` で実行（`bun media:generate-lists` と `bun dev:auto` だけリポジトリルート）
- ページキーは**カテゴリ込み**（`kashitsu/ac04/akst187`）。akst051/056/060/121 は別カテゴリに同番号の別ページがある

## 入力と対象の決め方

- **引数なし（または「全部」「残りやって」）**: `lib/renewal-pipeline/urls.txt` の全ページから、実装済み（`src/pages/<key>.tsx` が存在する）ものを除いた**残り全部**が対象
- **ページキー指定**: そのページだけ（複数可）
- **参考実装の指定があれば優先**: ユーザーが似ている実装済みページを示したら、レシピ記載の代表実装の代わりに（または加えて）その TSX をサブエージェントの固定5点③として渡す

## 実行体制（親=指揮官、子=実装者）

コンテキスト汚染防止のため、**1ページ＝サブエージェント1体（毎回まっさらなコンテキスト）**で処理する:

- **親（このセッション）は指揮官に徹する**: 対象リスト作成 → レシピ判定 → サブエージェントを1体ずつ起動 → 結果集計。ページの本文・スナップショットを親のコンテキストに読み込まない
- **サブエージェントは必ず直列で起動する**（`meta.ts` / `imageData.json` / `bun run build` が共有リソースのため並列禁止）
- 保留・失敗ページが出ても**バッチは止めない**。記録して次のページへ進み、最後にまとめて報告する

## 親の手順

### 1. 対象リスト作成

```bash
# urls.txt の全キー（core.ts の keyFromUrl と同じ変換）
grep -v '^#' lib/renewal-pipeline/urls.txt | sed -E 's|https://www.sonysonpo.co.jp/auto/(.+)\.html|\1|'
```

各キーについて `src/pages/<key>.tsx` の有無を確認し、**存在しないものだけ**を対象にする。

### 2. レシピ判定

| キーのパターン | レシピ |
| --- | --- |
| `kashitsu/akstqa*` | `recipes/kashitsu-qa.md` |
| `kashitsu/ac*/akst*` | `recipes/kashitsu-case.md` |
| `guide/agde*` | `recipes/guide-case.md` |
| `solution/asol*` | `recipes/solution-case.md` |

レシピ冒頭の「対象」定義と照合すること（例: guide-case は「こんな時どうなるの」系のみ。guide の別シリーズは対象外）。
**合致しない・レシピが無いページは「レシピ未整備」として保留リストへ**（勝手にレシピ無しで生成しない）。新テンプレの着手手順は README「新しいテンプレに着手するとき」。

### 3. サブエージェント起動（1ページずつ直列）

各ページについて、下の「サブエージェントへの指示テンプレ」で1体起動し、返ってきた結果（合格 / 保留+未知シグナル / 失敗+理由）を記録して次へ。

### 4. 最終報告

- **数値**: 合格N / 保留N / 失敗N、一発合格率（修正なしで関門を通った割合）
- **保留ページの内訳**: 未知シグナル一覧と dict.json への追記案（ユーザーが裁定 → 承認後に dict へ追記して該当ページだけ再実行）
- **レシピ未整備ページの一覧**（グループ別に集計）
- 目視確認URL: `bun dev:auto` → `http://localhost:5174/auto_b/<key>`（最終の見た目確認はユーザー）
- コミットはユーザー確認後（commit スキルに従う）

## サブエージェントへの指示テンプレ

サブエージェントには以下を1ページ分だけ渡す（作業ディレクトリ: `packages/auto`）:

```
lib/renewal-pipeline/README.md の仕組みに従い、旧ページ <key> を新デザインシステムへ完全転記で実装する。

読んでよいコンテキストは固定5点のみ:
1. lib/renewal-pipeline/recipes/<テンプレ>.md（組み立て手順の正典。手順の詳細はすべてこれに従う）
2. lib/renewal-pipeline/dict.json
3. 代表実装TSX（レシピ冒頭に記載）
4. docs/components/component-index.md
5. lib/renewal-pipeline/snapshot/<key>.extract.json（構造確認が必要なら .html も）

手順:
① bun lib/renewal-pipeline/crawl.ts <key> && bun lib/renewal-pipeline/extract.ts <key>
② bun lib/renewal-pipeline/coverage.ts <key>
   → 未知シグナルが出たら実装せず、シグナル名と dict.json への追記案（component/note）を返して終了（結果=保留）
③ レシピに従って実装:
   - src/pages/<key>.tsx（完全転記・metadata.article: true）
   - src/site-data/meta.ts へエントリ追記（旧 head・パンくずから転記）
   - 画像: curl -A 'Mozilla/5.0' で旧サイトから取得（1秒間隔）→ 意味ベース命名で配置
     → リポジトリルートで bun media:generate-lists
   - alt はレシピの方針で新規に書き起こす（完全転記の唯一の例外）
   - import が dict の値域と component-index に収まっているか自己検査（関門③）
④ 検証: bun run build → bun lib/renewal-pipeline/verify-text.ts <key> --verbose → bun run lint:tsc
   - 欠落が出たら: 言い換え／見出しの1文字違い／altへの逃がし込みを疑って修正し、build から再走
   - 同じ欠落が3回解消しなければ結果=失敗として理由を返す
⑤ 返却: 結果（合格/保留/失敗）、verify-text の判定数値、修正回数（一発合格か）、変更ファイル一覧
```
