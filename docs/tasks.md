# 麻雀リーグ戦アプリ タスク管理

管理: 本セッション（マネージャー） / 実装: `dev` / レビュー: `reb`
進め方: **1タスクずつ直列**（dev実装 → reb レビュー → マネージャーが反映判断 → 次タスク）

- 仕様の正典: `Guidebook/src/content/docs/spec/*.mdx`（`bun run dev` で閲覧可）
- `docs/spec.md` は **Supabase時代の旧版で陳腐化済み**。参照禁止（T12で処分）
- アプリルート: `/Users/m126/study/majan/`

## ステータス凡例
`TODO` / `DEV中` / `REVIEW中` / `修正待ち` / `DONE`

## タスク一覧

| ID | タスク | 依存 | 状態 |
|---|---|---|---|
| T0 | プロジェクト基盤（git init / Vite+ / React+TS / Tailwind / wrangler.jsonc / 骨格） | – | TODO |
| T1 | D1スキーマ: `migrations/0001_init.sql` + `db/seed.sql` + ローカル適用確認 | T0 | TODO |
| T2 | `src/lib/scoring.ts` 純粋関数 + Vitest（**最重要・正確さ勝負**） | T0 | TODO |
| T3 | `src/lib/types.ts` + `src/lib/validation.ts`（2-2固定 / 合計 / 100倍数 / 重複） | T2 | TODO |
| T4 | Hono API `server/`（GET league / POST・PATCH games / auth / batch） | T1,T3 | TODO |
| T5 | `src/lib/stats.ts` 個人成績・チーム集計 + Vitest | T2 | TODO |
| T6 | フロント基盤（ルーティング / `api.ts` / パスコードダイアログ / shadcn/ui） | T4 | TODO |
| T7 | 画面: 半荘一覧・半荘登録・編集/論理削除 | T6 | TODO |
| T8 | 画面: リーグ戦績（チーム合計・ランキング・Recharts推移） | T6,T5 | TODO |
| T9 | 画面: 個人成績 + ルールページ（`content/rules.md`） | T8 | TODO |
| T10 | 仕上げ: スマホUI確認 / `vp check` / GitHub Actions CI | T9 | TODO |
| T11 | 本番デプロイ（wrangler login・d1 create・secret put は**山本さん操作**） | T10 | TODO |
| T12 | Guidebook更新（Vite+導入手順の追記 / 旧 `docs/spec.md` 処分 / 実装との差分反映） | T11 | TODO |

## 全タスク共通の掟

1. **仕様書に無いものを作らない**。Guidebook「作らないもの」節を守る（ログイン画面・管理UI・DELETE API・局単位記録・チップ）
2. **素点合計チェックは `start_point × 4`**。`100000` をハードコードしない（リーグ設定依存）
3. **pt/順位をDBに保存しない**。素点のみ保存、計算は都度
4. バリデーションは**フロントとAPIの両方**で通す。ロジックは `src/lib/` に置いて共有
5. `WRITE_PASSCODE` は**ビルドに埋め込まない**（`VITE_` 接頭辞禁止）
6. 削除は論理削除のみ。`DELETE` エンドポイントを作らない
7. コミットは意味のある単位で。1タスク=1ブランチ推奨

## レビュー観点（reb 共通）

- Guidebook 仕様との**逐条照合**（勝手な機能追加・仕様の取りこぼしを検出）
- 型安全性（`any` 禁止 / D1の戻り値の型付け）
- 境界値・異常系（同点・端数・負の素点・欠損データ）
- セキュリティ（パスコードの扱い、SQLインジェクション、秘密のフロント漏洩）
- 過剰実装（YAGNI）の指摘

## 進捗ログ

- 2026-08-26 タスク表作成。Vite+ は `vite-plus@0.3.0` / CLI `vp` として実在を確認（導入は `curl -fsSL https://vite.plus | bash`）
- 2026-08-26 T0 を dev に発注 / reb にブリーフィング
- 2026-08-26 reb の仕様書指摘を反映（マネージャー対応）
  - `scoring.mdx` 全員同点テスト観点の式が pt=0.0 と矛盾していたのを修正
  - 素点合計の固定値 `100,000` を **`start_point × 4`** 表記に統一（features / overview / usage / scoring の計5箇所）
  - `scoring.ts` 実装イメージの `okaDeci` に `Math.round` を追加（返し点−持ち点が25の倍数でない設定でも deci-pt 整数前提を維持）
  - **未定義だった修正・削除APIの契約を確定**し `features.mdx#apiの形` として明文化（下記「決定事項」参照）
  - 全8ページの表示を `astro dev` で200確認済み

## マネージャー決定事項（仕様書に反映済み）

### D-1: 書き込みAPIは3本だけ
`POST /api/games` / `PATCH /api/games/:id` / `PATCH /api/games/:id/deleted`

### D-2: `PATCH /api/games/:id` は全置換（部分更新を作らない）
`playedOn` / `memo` / `results`(4人) を丸ごと差し替える。
理由: (a) 登録時のバリデーションをそのまま再利用できる (b) メンバー差し替え時に `UNIQUE(game_id, member_id)` と衝突せず「常に4行」を保てる。
DB操作は `batch()` 内で **該当 `game_id` の `game_results` を全削除 → 4行 INSERT**。

### D-3: 削除済み半荘の編集は 404
`deleted_at IS NOT NULL` の `game` への `PATCH` は 404。戻すのは運営の `wrangler d1 execute`。

### D-4: 論理削除は片道。`deleted: false` は 400
アプリに復活UIを作らない（確認ダイアログの意味が薄れるため）。復旧は運営のSQLのみ（決定#9・#11と整合）。

### D-5: `okaDeci` は `Math.round` を噛ませる
返し点−持ち点が25の倍数でない設定でも deci-pt の整数前提を壊さない。

### D-6: 素点合計チェックは `start_point × 4`
`100000` の定数埋め込みは **レビューで Blocker 扱い**。
