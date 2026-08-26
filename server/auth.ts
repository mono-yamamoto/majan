import type { MiddlewareHandler } from "hono";
import type { Bindings } from "./index";

/**
 * 書き込みAPIの共通パスコード検証。
 *
 * シークレット未設定のまま公開されると、`X-Passcode` ヘッダの無いリクエストが
 * `undefined !== undefined` で偽になり**素通り**してしまう。
 * 設定漏れは静かに通さず 500 で止める（→ 報告済みの仕様の穴）。
 */
export const requirePasscode: MiddlewareHandler<{ Bindings: Bindings }> = async (c, next) => {
  const expected = c.env.WRITE_PASSCODE;
  if (typeof expected !== "string" || expected.length === 0) {
    return c.json({ error: "server misconfigured: WRITE_PASSCODE is not set" }, 500);
  }

  const given = c.req.header("X-Passcode");
  if (typeof given !== "string" || given.length === 0 || given !== expected) {
    return c.json({ error: "invalid passcode" }, 401);
  }

  await next();
};
