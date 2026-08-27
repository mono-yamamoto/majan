import { Hono } from "hono";
import { games } from "./routes/games";
import { leagues } from "./routes/leagues";
import { media } from "./routes/media";
import { roster } from "./routes/roster";

export type Bindings = {
  DB: D1Database; // wrangler.jsonc の d1_databases で注入される
  MEDIA: R2Bucket; // wrangler.jsonc の r2_buckets で注入される（動画の置き場）
  WRITE_PASSCODE: string; // wrangler secret put WRITE_PASSCODE で登録
};

const app = new Hono<{ Bindings: Bindings }>();

// 疎通確認用
app.get("/api/health", (c) => c.json({ ok: true }));

app.route("/", leagues);
app.route("/", games);
app.route("/", roster);
app.route("/", media);

export default app;
