import { Hono } from "hono";

export type Bindings = {
  DB: D1Database; // wrangler.jsonc の d1_databases で注入される
  WRITE_PASSCODE: string; // wrangler secret put WRITE_PASSCODE で登録
};

const app = new Hono<{ Bindings: Bindings }>();

// 疎通確認用。T4 で /api/leagues・/api/games を生やす。
app.get("/api/health", (c) => c.json({ ok: true }));

export default app;
