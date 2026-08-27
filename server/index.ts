import { Hono } from "hono";
import { games } from "./routes/games";
import { leagues } from "./routes/leagues";
import { roster } from "./routes/roster";

export type Bindings = {
  DB: D1Database; // wrangler.jsonc の d1_databases で注入される
  WRITE_PASSCODE: string; // wrangler secret put WRITE_PASSCODE で登録
};

const app = new Hono<{ Bindings: Bindings }>();

// 疎通確認用
app.get("/api/health", (c) => c.json({ ok: true }));

app.route("/", leagues);
app.route("/", games);
app.route("/", roster);

export default app;
