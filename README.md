# majan

10人（5人×2チーム）で回す麻雀リーグ戦の、戦績管理アプリ。

半荘ごとに4人ぶんの素点だけを記録して、順位・ウマ・オカを含む pt と個人／チームの
累計はすべて計算で出す。DB には素点しか置かない。

**本番:** https://majan.y-yamamoto-ced.workers.dev

閲覧は誰でもできる。登録・編集・削除だけが共通パスコードで保護されている。

## できること

- 半荘の登録・編集・削除（論理削除）
- **予約**（対戦相手だけ決めて素点は後から入れる）
- リーグ戦績（個人・チームの累計 pt、累計 pt 推移グラフ）
- 個人の成績ページ（順位分布・平均順位・トップ率など）
- 対局ルールの掲示

作らないもの: ログイン画面 / **書き込みできる管理UI** / 局単位の記録 / チップ。
メンバー・チーム・リーグ設定の登録は運営が SQL で直接行う。
運営用ページ（`/leagues/1/admin`）はあるが、**流す SQL を組み立てて見せるだけ**で実行しない。

## 構成

| レイヤー | 使っているもの                                                                         |
| -------- | -------------------------------------------------------------------------------------- |
| フロント | Vite+（`vp`）/ React / TypeScript / Tailwind / shadcn(Base UI) / Recharts              |
| API      | Hono on Cloudflare Workers（`server/`）                                                |
| DB       | Cloudflare D1（マネージド SQLite）。`migrations/` を `wrangler d1 migrations` で適用   |
| 配信     | Workers Static Assets（`dist/` を同じ Worker から配信し、`/api/*` だけ Worker が処理） |
| ツール   | bun / Vitest / Oxlint / Oxfmt（すべて Vite+ 同梱）                                     |

```
src/lib/        scoring.ts（pt・順位）/ stats.ts（集計）/ validation.ts（検証）/ api.ts
src/features/   games / standings / members / rules
server/         index.ts / auth.ts / routes/
migrations/     0001_init.sql
db/             seed.sql（リーグとチーム）/ roster.sql（名簿と所属）
scripts/        verify-api.sh（実HTTPでのAPI検証）/ check-strict.sh / api-coverage.md
Guidebook/      仕様書（Astro Starlight）
docs/tasks.md   実装の判断ログ
```

## 開発

```bash
bun install
```

初回は D1 のローカル DB を作る。**これを先にやらないと、起動しても「テーブルが無い」で止まる。**

```bash
bunx wrangler d1 migrations apply majan --local
bunx wrangler d1 execute majan --local --file=./db/seed.sql
bunx wrangler d1 execute majan --local --file=./db/roster.sql
cp .dev.vars.example .dev.vars   # WRITE_PASSCODE を書く（本物は書かない）
```

**`bun run dev` は `/api` を `localhost:8787` にプロキシする**（`vite.config.ts`）ので、
API を使う画面を触るなら **2つ動かす**。

```bash
bun run dev:worker   # ターミナル1: Worker + ローカル D1（8787 で待つ）
bun run dev          # ターミナル2: Vite の dev server（HMR が効く）
```

1つで済ませたいときは、build 済みのものを Worker から配信する。HMR は効かないが、
本番に一番近い。

```bash
bun run preview      # vp build && wrangler dev
```

## テストと検証

```bash
bash scripts/check-strict.sh   # 整形・lint・型。警告があっても失敗する
bun run test                   # ユニットテスト
bun run build
bash scripts/verify-api.sh     # wrangler dev を立てて実 HTTP で API を叩く
```

`scripts/verify-api.sh` はローカル D1 を専用の `--persist-to` に作って使い、本番には
一切触れない。`PORT=8799 bash scripts/verify-api.sh` でポートを変えられる。

CI（`.github/workflows/ci.yml`）は push と PR でこの4つを順に走らせる。

**どの API 経路を検証しているかは `scripts/api-coverage.md` にある。**
機能を足すときは、先にその表へ行か列を足してから `verify-api.sh` を書く。

## デプロイ

自動デプロイは入れていない。手元から実行する。

```bash
bun run deploy   # vp build && wrangler deploy
```

DB のマイグレーションは別で、`wrangler d1 migrations apply majan --remote`。

## ★ メンバーの実名をリポジトリに入れないこと

`db/seed.sql` と `db/roster.sql` は**プレースホルダ名のテンプレート**。
実名は `.local.sql` の方に書く。どちらも `.gitignore` 済み。

```bash
cp db/seed.sql   db/seed.local.sql     # リーグ名・チーム名（1回だけ流す）
cp db/roster.sql db/roster.local.sql   # 実名とチーム分け（何度でも流せる）
```

`db/seed.sql` は二重投入すると `UNIQUE constraint failed` で落ちる（リーグを2つ作る
事故を防ぐため）。`db/roster.sql` は逆に何度でも流せる（開幕前にチーム分けが決まるまで
直せるように）。**理由は各ファイルの冒頭コメントにある。**

`db/roster.sql` を**開幕後に流さないこと**。チーム合計 pt は現在の所属メンバーの総和
なので、所属を変えると過去の pt も新しいチームに移る。

パスコードもリポジトリに書かない。本番は `wrangler secret put WRITE_PASSCODE`、
ローカルは `.dev.vars`（gitignore 済み）で渡す。フロントは利用者が入力した値を
`localStorage` に持つだけで、ビルドには含めない。

## 仕様書

```bash
cd Guidebook && bun install && bun run dev   # → http://localhost:4321
```

判断の経緯と決定事項は `docs/tasks.md`。`docs/spec.md` は旧版で**廃止済み**。
