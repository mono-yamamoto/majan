import type { Context } from "hono";
import type { Bindings } from "./index";

/** ボディの上限。title 60文字は validation で見るが、c.req.json() はその前に全体をパースする */
const MAX_BODY_BYTES = 16 * 1024;

type Body = { ok: true; value: unknown } | { ok: false; status: 400 | 413; error: string };

export async function readJson(c: Context<{ Bindings: Bindings }>): Promise<Body> {
  const declared = Number(c.req.header("Content-Length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: "request body too large" };
  }
  try {
    return { ok: true, value: await c.req.json() };
  } catch {
    return { ok: false, status: 400, error: "invalid json" };
  }
}
