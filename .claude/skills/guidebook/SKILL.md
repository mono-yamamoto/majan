---
name: guidebook
description: |-
    実装の解説 / 設計メモ / 図解を Astro + Starlight ベースの doc サイトとして
    `Guidebook/` 配下に作成・追記する。Mermaid 図 / 差分テーブル / FileTree /
    code diff highlight をすぐ使えるテンプレ込み。
---

# Guidebook Skill

実装後の振り返り資料や設計ドキュメントを、生 HTML ではなく **Astro + Starlight** で書くためのスキル。
`template/` 配下の scaffold を `Guidebook/` に展開して使う。

## When to use

- ユーザーが「ガイドブック作って／更新して／〇〇の解説まとめて」と言った時
- 実装直後に振り返りメモを残したい時
- リファクタや設計判断を図解付きで残したい時

## Scaffold 展開（初回のみ）

`Guidebook/` 直下に Astro+Starlight プロジェクトを置く。既存ファイルがあれば `_legacy_html/` に退避。

```bash
# 1. 既存 HTML / md を退避
if [ -f Guidebook/index.html ] || [ -f Guidebook/refactor-memo.html ]; then
  mkdir -p Guidebook/_legacy_html
  mv Guidebook/index.html Guidebook/_legacy_html/ 2>/dev/null || true
  mv Guidebook/refactor-memo.html Guidebook/_legacy_html/ 2>/dev/null || true
  mv Guidebook/taisaku.md Guidebook/_legacy_html/ 2>/dev/null || true
fi

# 2. template を Guidebook/ に展開（dotfile も含めて）
cp -R .claude/skills/guidebook/template/. Guidebook/

# 3. 依存をインストール
cd Guidebook && npm install
```

> **注意**: skill 本体 (`.claude/skills/guidebook/`) と `Guidebook/` の両方が
> `.git/info/exclude` で local-only にされていることを前提に運用する。
> コミット対象にする場合は、`Guidebook/dist/` と `Guidebook/node_modules/` を `.gitignore` に追加してから。

## ページ追加

`Guidebook/src/content/docs/` 配下に `.mdx` を作るだけ。frontmatter 必須:

```mdx
---
title: ページタイトル
description: 1 行サマリー
---

import DiffTable from '../../components/DiffTable.astro';
import DiffRow from '../../components/DiffRow.astro';

## 章タイトル
本文...
```

サイドバーは `astro.config.mjs` の `sidebar` で制御。`examples/` ディレクトリは `autogenerate` で自動列挙される。
別カテゴリを作るなら同じ要領で `autogenerate: { directory: '<dir>' }` を足す。

## 使えるコンポーネント

- `<DiffTable>` + `<DiffRow status path>` — 追加/変更/削除/据置 タグ付き 3 列テーブル
- `<StatusTag status label?>` — タグ単体
- ` ```mermaid ` code block — flowchart / sequence / class / state / ER 等を SVG 描画
- `<FileTree>` — Starlight 標準、ネストリストをディレクトリ表現に
- `<Card>` / `<CardGrid>` — Starlight 標準、目次的なリンクカード
- ` ```ts title="..." {3-5} ` — Expressive Code（行範囲、ファイル名、`// [!code ++]` diff マーカー）

詳細とサンプルは [docs/component-catalog.md](./docs/component-catalog.md)。

## Workflow（ページを追加する時）

1. ページの目的とアウトラインを 3 行で書き出す
2. `Guidebook/src/content/docs/<dir>/<slug>.mdx` を作成
3. 必要なら `astro.config.mjs` の sidebar に追記
4. `cd Guidebook && npm run dev` でローカルプレビュー（http://localhost:4321）
5. 図は本文より先に作る（mermaid → 文章の順）と整合を取りやすい

## 採用版

- Astro 6.x
- @astrojs/starlight 0.39.x
- astro-mermaid 2.x（個人 maintainer、bus factor=1 のリスクあり。放棄されたら mermaid を直 import する自前 Mermaid.astro に巻き取れる）
- mermaid 11.x

## Review モード（コメント受け取り）

ユーザーが「ガイドブック見て」「ドキュメント review して」と言ったら、dev server を立ち上げてブラウザ経由でコメントを受け取れる。

仕組み:

- 各 `<h2>` `<h3>` 横に 💬 ボタン、右下に「Claude に送る」ボタンが出る
- コメントは `/api/comments` 経由で `Guidebook/.guidebook-comments.jsonl` に追記
- 「Claude に送る」を押すと `/api/notify` が `Guidebook/.guidebook-comments.signal` を touch
- Claude 側は Monitor でこの signal ファイルを watch、変化したら `.guidebook-comments.jsonl` を読みに行く

Workflow:

1. `.guidebook-comments.jsonl` と `.guidebook-comments.signal` を初期化:
   ```bash
   rm -f Guidebook/.guidebook-comments.jsonl Guidebook/.guidebook-comments.signal
   ```
2. dev server を background で起動（既に起動済みなら skip）:
   ```bash
   cd Guidebook && npm run dev   # run_in_background: true
   ```
3. signal watcher を background で起動（**one-shot**、signal が touch されたら exit する）:
   ```bash
   prev=$(stat -f %m Guidebook/.guidebook-comments.signal 2>/dev/null || echo "")
   while true; do
     cur=$(stat -f %m Guidebook/.guidebook-comments.signal 2>/dev/null || echo "")
     if [ -n "$cur" ] && [ "$cur" != "$prev" ]; then
       echo "COMMENTS_READY"
       exit 0
     fi
     sleep 1
   done
   ```
   → `run_in_background: true` で起動。signal が更新された瞬間に exit して Claude に通知が届く。
4. ユーザーにブラウザ http://localhost:4321/ でレビューしてもらう旨を伝える
5. 「Claude に送る」クリック → watcher が `COMMENTS_READY` を出して exit → Claude 通知
6. Claude は `POST /api/comments/consume` を呼ぶ:
   ```bash
   curl -s -X POST http://localhost:4321/api/comments/consume \
     -H "content-type: application/json" -d '{}'
   ```
   - 未読（`sent: true && read: false`）の records を返却し、その records を `read: true` に更新する
   - 以前のバッチで読んだものは返って来ない（再読防止）
7. 返ってきた records に対応した修正案を提示
8. もう 1 周したければ watcher を再起動して 4 に戻る

### record の lifecycle

```
作成: author=user, sent=false, read=false   （UI で「未送信」バッジ）
↓ Claude に送る
author=user, sent=true, read=false          （UI で「送信済み」バッジ、Claude 未消費）
↓ Claude が consume
author=user, sent=true, read=true           （UI 表示は同じ、Claude 消費済み）

Claude が返信を POST する場合:
author=claude, sent=true, read=true         （UI で「Claude」バッジ、青系背景）
```

UI 側は `sent` フラグと `author` で「未送信 / 送信済み / Claude」を区別、`read` は Claude 側内部用。

### Claude による返信フロー（doc 更新 + 報告コメント）

ユーザーから「ここがわからない」「ここをこう変えて」系のコメントが来た時の標準手順:

1. consume で records を取得
2. 各 record について該当する MDX を更新（追記 / 修正 / 図解追加）
3. 更新内容を Claude 名義の返信コメントとして POST:
   ```bash
   curl -s -X POST http://localhost:4321/api/comments \
     -H "content-type: application/json" \
     -d '{
       "page": "<元コメントと同じ page>",
       "section": <元コメントと同じ section or null>,
       "body": "src/content/docs/issue-05/overview.mdx の「全体アーキテクチャ」セクションに Server/Client の補足を追記しました",
       "author": "claude",
       "replyTo": "<元コメントの id>"
     }'
   ```
   - `author: 'claude'` を指定すると自動的に `sent=true, read=true` で保存される（再 consume 対象にならない）
4. UI 上では元コメント直下に Claude の青いバッジ付きコメントとして並ぶ

### コメント一覧ページ

`/comments/` で全コメントを横断一覧表示。ページ跨ぎでコメントを残した時に、どこにコメントしたか忘れたら一覧から該当ページへジャンプできる。

注意:

- `/api/comments` と `/api/notify` は `export const prerender = false` 指定。dev mode は問題なし、prod build したいなら astro adapter（`@astrojs/node` 等）が必要
- signal / jsonl は `.gitignore` 済み

## Constraints

- skill template と `Guidebook/` 配下は `.git/info/exclude` で除外済み（個人作業用）
- 試験提出物にはこの doc サイトを含めない方針
- Astro/Starlight のバージョンアップは手動。template は陳腐化に注意
