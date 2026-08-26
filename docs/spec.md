# 麻雀リーグ戦アプリ 要件・設計メモ（廃止）

このファイルは **2026-08-18 時点の旧版**で、**内容が現在の実装と一致しません**
（Supabase → SQLite → Cloudflare D1 の変遷前に書かれたもの）。

参照しないでください。リンク切れを避けるためにファイルだけ残しています。

現在の仕様は Guidebook を参照してください。

```bash
cd Guidebook && bun install && bun run dev
# → http://localhost:4321
```

| ページ | パス |
|---|---|
| 概要と決めたこと | `/spec/overview/` |
| 機能と画面 | `/spec/features/` |
| ポイント計算 | `/spec/scoring/` |
| データモデル | `/spec/data-model/` |
| 技術スタック | `/spec/tech-stack/` |
| 使い方（運用） | `/spec/usage/` |
| 対局ルール | `/spec/rules/` |

実装の判断ログは `docs/tasks.md` にあります。
