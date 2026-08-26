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
| T0 | プロジェクト基盤（git init / Vite+ / React+TS / Tailwind / wrangler.jsonc / 骨格） | – | **DONE** |
| T2 | `src/lib/scoring.ts` 純粋関数 + Vitest（**最重要・正確さ勝負**）※T1より前倒し | T0 | **DONE** |
| T1 | D1スキーマ: `migrations/0001_init.sql` + `db/seed.sql` + ローカル適用確認 | T0 | **DONE** |
| T3 | `src/lib/types.ts` + `src/lib/validation.ts`（件数/重複/所属/2-2/合計/100倍数/日付/memo） | T1,T2 | **追補中** |
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

## T4 の Blocker 条件（確定分）

T4（Hono API）のレビューで、以下が守られていなければ **Blocker**。

| # | 条件 | 根拠 |
|---|---|---|
| 1 | `last_insert_rowid()` を使っていない（`(SELECT MAX(id) FROM games)` を使う） | D-9。**FKでも防げず既存の別半荘に混入する**ことを実測 |
| 2 | リーグ所属チェックがある（`league_members` を `league_id` で絞って引く） | D-13。**DBでは検証不可能**、APIが唯一の防衛線 |
| 3 | `PATCH` の `league_id` を DB の `games` 行から読んでいる | D-14。ボディを信じると所属チェックが無意味化 |
| 4 | `pt` / `rank` を DB に書いていない | 決定#14 |
| 5 | `DELETE` エンドポイントを作っていない / 物理削除していない | 決定#9 |
| 6 | 運営系テーブル（`leagues` `teams` `members` `league_members`）への書き込みAPIを作っていない | 決定#11 |
| 7 | 素点合計チェックが `start_point × 4`（`100000` のハードコードなし） | D-6 |

## レビューの原則

### 原則1: 「実行を要する緩和」は修正ではない
穴を見つけて緩和策を作った時点で満足しない。その緩和策が **「誰かが実行しないと効かない」種類か**を見る。

- 確認クエリ・チェックリスト・ドキュメントの注意書き → **緩和**（実行されなければ発動しない）
- DB制約・型・テスト・CI → **修正**（実行しなくても効く、あるいは自動で走る）

D-15（複合FK）で dev が確認クエリを緩和策として提示し、マネージャーが制約に格上げした経緯から。
`leagues` の `CHECK` 4本を入れた理由とまったく同じ論理。

### 原則2: 深刻度と「修正コストの時間依存」を分けて書く
「今なら安い / 後だと高い」は深刻度とは別軸。特に **SQLite のスキーマ制約は `0001` が本番適用される前が最後のチャンス**で、それを過ぎると再構築コースになる。
reb が D-15 を [Nit] としつつ「T11 の前が最後のチャンス」と添えたことが、格上げ判断の決め手になった。

### 原則3: 修正が「正常な操作まで塞いでいないか」も確認する
制約を足したときは、弾くべきものが弾かれることだけでなく、**通るべきものが通ること**も実測する。
dev が D-15 で「同リーグ内のチーム移動は通る」「3つ目のチームを足せる」を追加検証した例。

## レビュー観点（reb 共通）

- Guidebook 仕様との**逐条照合**（勝手な機能追加・仕様の取りこぼしを検出）
- 型安全性（`any` 禁止 / D1の戻り値の型付け）
- 境界値・異常系（同点・端数・負の素点・欠損データ）
- セキュリティ（パスコードの扱い、SQLインジェクション、秘密のフロント漏洩）
- 過剰実装（YAGNI）の指摘

## 進捗ログ

- 2026-08-26 タスク表作成。Vite+ は `vite-plus@0.3.0` / CLI `vp` として実在を確認（**導入はローカル devDependency で完結。公式インストーラ不要**。T0実績）
- 2026-08-26 T0 を dev に発注 / reb にブリーフィング
- 2026-08-26 **T0 完了（dev）** → コミット `6609ca0`。マネージャー一次確認済み
  - `Guidebook/` `docs/` `.claude/` 配下は T0 コミットに1件も含まれず（非破壊を確認）
  - `wrangler.jsonc` は仕様どおり。`src/lib/*.ts` 4本はプレースホルダを維持（スコープ違反なし）
  - Vite+ は `bun add -D vite-plus` のみで完結。**公式インストーラは不要だった**
  - dev 自己申告8件（a〜h）はすべて承認。判断の線引き = 「作らないもの」は**製品機能**の掟であり、開発体験のツール設定（`server.proxy` 等）は対象外
  - **マネージャー指摘1件: `.gitignore` に `.dev.vars` が無い**（`wrangler dev` の正規シークレットファイル。T4で平文コミット事故になる）→ dev に修正依頼済み
- 2026-08-26 **タスク順序を変更: T1 → T2 を前倒し**
  - 理由: (1) T1 の `--remote` 適用は実 `database_id` 必須で山本さんの `d1 create` 待ちにブロックされている (2) T2 は依存が T0 のみで外部ブロッカーゼロ (3) T2 が最もバグりやすく価値が高い（同点折半・端数のゼロサム）
- 2026-08-26 reb の仕様書指摘を反映（マネージャー対応）
  - `scoring.mdx` 全員同点テスト観点の式が pt=0.0 と矛盾していたのを修正
  - 素点合計の固定値 `100,000` を **`start_point × 4`** 表記に統一（features / overview / usage / scoring の計5箇所）
  - `scoring.ts` 実装イメージの `okaDeci` に `Math.round` を追加（返し点−持ち点が25の倍数でない設定でも deci-pt 整数前提を維持）
  - **未定義だった修正・削除APIの契約を確定**し `features.mdx#apiの形` として明文化（下記「決定事項」参照）
  - 全8ページの表示を `astro dev` で200確認済み

- 2026-08-26 **T0 レビュー完了（reb）** → Blocker 0 / Major 0 / Minor 2 / Nit 2 で**マージ可**。T0 **DONE**
  - reb がマネージャーの一次判断を2点訂正: (1) `.gitignore` は T0 でなく初期コミット `1914977` 由来 (2) `.dev.vars` 欠落の深刻度は Blocker でなく **Minor**（未存在で実害ゼロ、T4着手前に入れば十分）。**reb の calibration が正しい**
  - reb 独自の指摘 [Minor]: `vite-plus` が `^0.3.0` なのに `vite` エイリアス／`overrides.vite` は `0.3.0` 固定で range 不揃い → T2 で exact 固定に揃える
  - `overrides` + direct alias の二重指定は**妥当**と裏取り済み（役割が違うので両方必要）
- 2026-08-26 **T2 を dev に発注**（scoring.ts + Vitest）
- 2026-08-26 **D1 本番DB 作成完了**（山本さん操作）
  - `database_id` = `1852711d-a80b-469e-a8df-0c71e90dab0f` / **`running_in_region: APAC`**（D-7 達成）/ `num_tables: 0`
  - Cloudflare アカウント: `y.yamamoto@monosus.co.jp` / Account ID `cedbae4a43f7534c4272f5f30f5ecc5c`（**会社アカウント**。→ 未決事項参照）
  - `wrangler` の対話プロンプトが `wrangler.jsonc` に **binding `majan` の重複エントリを追記 + 全体をタブ再整形 + 末尾改行削除**を行ったため、マネージャーが `git checkout` で復元し `database_id` の2行だけを差し替えた。**binding は `DB` が正**（`env.DB` で参照する仕様）
  - → **T1 のブロック解除**
- 2026-08-26 **T2 完了**（コミット `5fa508b` + 修正 `012a435`）。reb 再確認で**指摘なし**
  - `scoreGame` に事前条件 `RangeError`（件数チェック）を追加。業務バリデーション（T3）とは別物という線引きを確立
  - 網羅テストの不変条件を強化。**旧 sweep は「ウマ逆順」「rank誤り」「全員pt=0」を1件も検出できていなかった**ことを dev が before/after の mutation check で実証
  - `Math.round(uma×10)` は「ゼロサムを直す」のではなく「**壊れ方を構造依存から定数に変える**」修正だったと dev が自己申告 → 検証して正しいと確認、条件2の厳密形を `scoring.mdx` に明記
- 2026-08-26 **未決事項**: 本プロジェクトの Cloudflare / GitHub を**会社アカウント配下に置くか**。`db/seed.sql` にメンバー10人の実名が入るため、個人アカウントへの分離を推奨として提示済み（山本さん判断待ち）

- 2026-08-26 **T1 完了**（`02c5eac` + `fc5b4a4` + 追補 `e840525`）。reb の再確認とも指摘なし
  - 複合FK（D-15）を追加。dev・reb・マネージャーの3者が独立に異常系を実測し全一致
  - reb が親キー側の経路（`teams.league_id` 自体を別リーグへ UPDATE）も止まることを追加確認
  - 原則3の適用で「正常運用を塞いでいないか」を計8ケース検証（同リーグ内のチーム移動 / チーム名変更 / 翌シーズンの手順 / 所属の付け替え / 所属者ゼロのチーム削除 など）→ 塞がれて困るケースなし
  - 追加インデックスは `sqlite_autoindex_teams_1` 1本のみ

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

### D-11: `db/seed.local.sql` は**山本さん本人が作る**
実名を書いた `db/seed.local.sql` は、`cp db/seed.sql db/seed.local.sql` して**山本さん自身が編集する**。
理由: D-10 で「実名を git 履歴に残さない」と決めた以上、**実名がエージェントの会話ログを経由するのも避ける**のが一貫している。
`db/seed.sql` の冒頭コメントに手順を書いてあるので、それに従えば運営が単独で完結できる。

### D-12: `games.played_on` に実在日付の `CHECK` を追加（**2026-08-26 改訂: `date()` を使わない算術版に差し替え**）

```sql
CHECK (
  played_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  AND CAST(substr(played_on, 6, 2) AS INTEGER) BETWEEN 1 AND 12
  AND CAST(substr(played_on, 9, 2) AS INTEGER) BETWEEN 1 AND
      CASE CAST(substr(played_on, 6, 2) AS INTEGER)
        WHEN 2 THEN CASE WHEN CAST(substr(played_on, 1, 4) AS INTEGER) % 4 = 0
                          AND (CAST(substr(played_on, 1, 4) AS INTEGER) % 100 <> 0
                               OR CAST(substr(played_on, 1, 4) AS INTEGER) % 400 = 0)
                     THEN 29 ELSE 28 END
        WHEN 4 THEN 30 WHEN 6 THEN 30 WHEN 9 THEN 30 WHEN 11 THEN 30
        ELSE 31 END
)
```

**旧版（`date(played_on) = played_on` を使う3条件版）はマネージャーの指示ミス。** reb が3系統（CLI 3.51 / `wrangler d1 --local` / Python 3.32.3）で照合して発見。

| 入力 | 3.51 の `date()` | **3.32.3 の `date()`** |
|---|---|---|
| `'2026-02-30'` | `'2026-03-02'` に正規化 → 弾ける | **そのまま** → **通ってしまう** |
| `'2025-02-29'` | `'2025-03-01'` → 弾ける | **そのまま** → **通ってしまう** |
| `'2026-04-31'` | `'2026-05-01'` → 弾ける | **そのまま** → **通ってしまう** |

**D1 は `sqlite_version()` の呼び出しを許可しない**（`not authorized to use function` を reb が実測）ので、本番のバージョンを直接確認する手段が無い。

reb は「式が複雑になる割に得るものが小さい」として T11 での一度きりの確認手順を提案したが、**マネージャーがコストを実測して書き直しを選択**:
- 実測コストは **SQL 3行 → 12行**。使うのは `substr` / `CAST` / `BETWEEN` / `CASE` という最古の機能のみ
- reb 自身が「これは原則1でいう**緩和**」と認めていた。**原則1をそのまま適用**
- 副産物: `validation.ts` と**同じ閏年ルール（4/100/400）を SQL 側にも明示的に書く**ことになり、両者の一致が**偶然ではなく設計**になる

検証: **1,289パターン**（年18種 × 月10種 × 日7種 + 全角数字・アラビア数字・タブ・前後改行・`20260826`・`+2026-08-26` 等の異形式29種）で
`3.51 と TS の不一致 0 / 3.32.3 と TS の不一致 0 / 3.51 と 3.32.3 の差 0`。

### D-18: 形の検査（parse）と業務ルールの検査は2段に分ける ★T4
`validateGameInput()` は**型どおりの `GameInput` を前提**にしている（`results` が配列でなければ `.length` で例外、`playedOn` が非文字列なら正規表現が `"undefined"` を評価）。
APIは JSON ボディという信用できない入力を受け取るので、**形の検査を先に置く**。

| 段 | 何を見るか | 失敗時 |
|---|---|---|
| 1. 形（parse） | `results` は配列か / 各項目の `memberId` `rawScore` が数値か / `playedOn` は文字列か / `memo` は文字列か null か | `400`（`{ error }`） |
| 2. 業務ルール | `validateGameInput()` | `400`（`ValidationError[]`） |

フロントはフォームの型が保証されているので1段目は不要。**APIだけが2段必要**。

### D-19: `memo` は500文字以内
理由はセキュリティではなく設計上のもの。**`GET /api/leagues/:id` が全半荘を1回で返す設計なので、1件の肥大が全員の取得を重くする**。
`ValidationErrorCode` に `MEMO_TOO_LONG` を追加。DB側には制約を置かない（可変長の妥当な上限は業務判断であり、後から変えたくなる可能性が高いため）。

### D-14: `PATCH /api/games/:id` の `league_id` はリクエストから受け取らない ★T4 Blocker
dev が発見（マネージャーも reb も見落としていた）。ボディの `leagueId` を信じると**所属チェックが自己申告になって無意味化**する。
「リーグ2のメンバー4人 + `leagueId: 2`」を送れば整合してしまい、**リーグ1の半荘がリーグ2にすり替わる**。

| 送られてきたもの | 扱い |
|---|---|
| `leagueId` なし / DB と一致 | 正常（DB の値を使う） |
| **DB と不一致** | **`400`**。黙って無視は不可（「送ったのに効かない」が見えなくなる） |

- **`roster` を引く `league_id` も DB 由来の値**を使う（ボディの値で引いたら経路が変わっただけで同じ穴）
- `POST /api/games` は `leagueId` を受け取ってよいが、**存在しない `league_id` は `404`** で明示的に弾く（FK で落ちるに任せない）

### D-15: `league_members.team_id` は複合外部キーで「同じリーグのチーム」を強制する
dev と reb が独立に発見。単独の `REFERENCES teams(id)` だと**別リーグのチームを指せてしまい、2-2判定が静かに狂う**。
```sql
-- teams
UNIQUE (league_id, id)
-- league_members（単独の REFERENCES teams(id) は削除）
FOREIGN KEY (league_id, team_id) REFERENCES teams(league_id, id)
```
両者は「割に合わない/Nit」と判断したが、**`d1 info` で `num_tables: 0`（本番未適用）を確認済み**のため実作業は2行編集 + ローカル再適用のみ。マネージャー判断で格上げ。
列順が `(league_id, team_id) → (league_id, id)` で揃っていること（逆順だと型は通るが意味が壊れる）。

### D-16: `validation.ts` は Roster を引数で受け取る純粋関数にする
```ts
type Roster = Map<number, number>;   // memberId → teamId
export function validateGameInput(input, rule, roster): ValidationError[];
```
DB にも HTTP にも依存させない（`scoreGame` と同じ設計思想）。フロントは取得済みデータから、API は **`WHERE league_id = ?1` の1クエリ**で組む（メンバーごとに4回引かない）。

### D-17: リーグを外れたメンバーの過去半荘は編集不能でよい
所属チェックで落ちる。**運営が `wrangler d1 execute` で直す**（決定#11と一貫）。
PATCH で所属チェックを緩める方向では直さない（D-13 の穴を編集経路から開け直すため）。
T7 の編集画面に「このメンバーは現在リーグに所属していません」と表示する。

### D-13: `member_id` の「リーグ所属」は DB では検証できない
外部キーは `members(id)` の存在しか見ず、`league_members` にそのリーグで載っているかは検査しない（実測確認済み）。
**API のバリデーションが唯一の防衛線**。2-2固定チェックで `league_members` を引くついでに「4人とも引けたか」を見る設計にする（T3）。
→ T4 で所属チェックが無ければ **Blocker**。

### D-10: `db/seed.sql` は**プレースホルダ名のみ**をコミット。実名は gitignore する
`Guidebook` の例と同じダミー名（山田・佐藤…）で `db/seed.sql` をコミットし、**実際のメンバー10人の実名は `db/seed.local.sql`（gitignore 対象）に書く**。
理由: リポジトリと Cloudflare が会社アカウント配下にあるため（未決事項）、身内10人の実名を git 履歴に永久に残さない。
`db/seed.sql` は「形を示すテンプレート」、`db/seed.local.sql` は「実際に流すもの」という役割分担にする。
`.gitignore` に `db/seed.local.sql` を追加すること。

### D-8: T1 のスキーマ・seed はローカル SQLite 3.51 でドライラン検証済み
マネージャーが実機検証した結果（T1/T4 のレビュー基準として使う）:
- `leagues` の `CHECK` 4本（Σuma=0 / start%100 / return%100 / return≥start）は **INSERT でも UPDATE でも効く**
- `raw_score % 100 = 0` は**負の素点でも正しい**（SQLite の `%` はゼロ方向丸め。`-1500`→通す、`-150`/`-50`→弾く）
- 外部キー違反（存在しない league/member/game）は全パターン弾かれる
- **【訂正】STRICT の「型が強制される」の正確な意味**（dev の指摘で判明）。当初「TEXT混入を弾く」と記録したが一般化が広すぎた。実際に検証したのは `'abc'` で、それは弾かれる。正しくは:
  - `'25000'` `' 25000'` `'1e3'` → **通る**（それぞれ integer 25000 / 25000 / 1000 に無損失変換される）
  - `'abc'`（TEXTのまま）/ `'25000.5'`（REALになる）→ 弾く
  - **`CHECK` は変換後の値に効く**ので「TEXT で入れて制約をすり抜ける」抜け道は存在しない（`'25050'` は `start_point % 100 = 0` で弾かれる）
  - → 実害なし。`data-model.mdx` の STRICT の記述も修正不要
- `seed.sql` の**再実行は `UNIQUE constraint failed: leagues.id` で落ちる**＝二重投入で壊れない安全側
- `(SELECT MAX(id) FROM games)` パターンは4行すべて同じ `game_id` を指す（count=4 / sum=100000 で確認）
- **`last_insert_rowid()` は外部キーでも防げない**（下記）

### D-9: `last_insert_rowid()` の危険性を実証（T4 のレビュー基準）
FK を D1 相当（常時ON）にして実測したところ、`last_insert_rowid()` 使用時は
1人目 → `game_id=22`（正）/ 2人目 → `game_id=3` / 3人目 → `game_id=4` と**既存の別半荘に混入**し、
`games` に id 3・4 が存在するため **FOREIGN KEY 制約が通ってしまいエラーが出ない**。
半荘数が少ないうちは `game_results.id` が `games.id` の範囲に届かず**たまたま動く**ため、運用が進んでから静かに壊れ始める。
→ T4 で `last_insert_rowid()` が使われていたら **Blocker**。`data-model.mdx` に実証データつきで明記済み。

### D-7: D1 のプライマリロケーションは `apac` を明示指定
`wrangler d1 create majan --location apac`。メンバー全員が日本在住のため。
**プライマリロケーションは作成後に変更できない**（export→新DB作成→import→`database_id` 差し替えのやり直しになる）。
`d1 create` を叩くその一回が決定タイミング。→ `tech-stack.mdx` に追記済み。
