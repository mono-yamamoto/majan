/**
 * R2 に置いた動画を配る。**読み取りだけ**。パスコードは要らない
 * （このアプリの GET は誰でも見られる、という既存の方針に合わせる）。
 *
 * ## なぜ `/api/media/...` なのか
 * `wrangler.jsonc` の `run_worker_first` が `["/api/*"]` なので、`/media/*` に
 * すると静的アセット側に取られて 404 になる。`run_worker_first` に足す手も
 * あるが、**ワーカーが先に見る経路を1本に保つ**方を選んだ。増やすと、
 * 「この URL はアセットとワーカーのどちらが勝つのか」を足すたびに考えることになる。
 *
 * ## Range 対応が本題
 * 素通しで返すと、動画のシークができない（バーを動かしても飛べない）、
 * iOS Safari が再生しないことがある、毎回頭から 58MB 流れる、の3つが起きる。
 * **`Range` を R2 の `get(key, { range })` に渡して 206 で返す**のが必須。
 */

import { Hono } from "hono";
import type { Bindings } from "../index";

export const media = new Hono<{ Bindings: Bindings }>();

/**
 * 配ってよいキー。バケットの中身を任意のキーで読ませない。
 * 今は動画1本だけだが、あとで別のものを置いたときに黙って公開されるのを防ぐ。
 */
const ALLOWED_KEYS = new Set(["haipai.mp4"]);

/**
 * 差し替えたときに古いものが出続けないよう、**キー名を変える運用**にする。
 * 動画は年に数回も差し替わらないので、キャッシュは長めに取る方が得
 * （雀荘の電波で 58MB を毎回落とし直させない）。
 */
const CACHE_CONTROL = "public, max-age=86400";

/** `bytes=a-b` の解釈結果 */
export type RangeSpec =
  /** Range ヘッダが無い、または解釈しない形（複数レンジなど）。全体を 200 で返す */
  | { kind: "whole" }
  /** 実体の外を指している。416 を返す */
  | { kind: "unsatisfiable" }
  | { kind: "partial"; offset: number; length: number };

/**
 * `Range` ヘッダを解釈する。
 *
 * 解釈できない形（複数レンジ `bytes=0-9,20-29` や単位違い）は **200 で全体**を返す。
 * RFC 7233 が「理解できない Range は無視してよい」としているのに合わせる。
 * 一方、**形は正しいが実体の外**を指しているものは 416 にする（黙って全体を返すと、
 * クライアントが「その範囲が返ってきた」と誤解する）。
 */
export function parseRange(header: string | undefined, size: number): RangeSpec {
  if (header === undefined) return { kind: "whole" };
  const matched = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (matched === null) return { kind: "whole" };
  const [, rawStart, rawEnd] = matched;
  if (rawStart === "" && rawEnd === "") return { kind: "whole" };

  if (rawStart === "") {
    // bytes=-N … 末尾 N バイト
    const wanted = Number(rawEnd);
    if (wanted === 0) return { kind: "unsatisfiable" };
    const length = Math.min(wanted, size);
    return { kind: "partial", offset: size - length, length };
  }

  const offset = Number(rawStart);
  if (offset >= size) return { kind: "unsatisfiable" };
  const end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  if (end < offset) return { kind: "unsatisfiable" };
  return { kind: "partial", offset, length: end - offset + 1 };
}

media.get("/api/media/:key", async (c) => {
  const key = c.req.param("key");
  if (!ALLOWED_KEYS.has(key)) return c.json({ error: "not found" }, 404);

  // サイズを知らないと Range を解釈できない（末尾指定・末尾の丸めがある）ので、
  // まずメタデータだけ取る
  const head = await c.env.MEDIA.head(key);
  if (head === null) return c.json({ error: "not found" }, 404);

  const size = head.size;
  const spec = parseRange(c.req.header("range"), size);

  if (spec.kind === "unsatisfiable") {
    return c.body(null, 416, {
      "Content-Range": `bytes */${size}`,
      "Accept-Ranges": "bytes",
    });
  }

  const object = await c.env.MEDIA.get(key, {
    range: spec.kind === "partial" ? { offset: spec.offset, length: spec.length } : undefined,
    // If-None-Match / If-Modified-Since に応える。2回目以降が軽くなる
    onlyIf: c.req.raw.headers,
  });
  if (object === null) return c.json({ error: "not found" }, 404);

  const headers: Record<string, string> = {
    "Accept-Ranges": "bytes",
    "Cache-Control": CACHE_CONTROL,
    "Content-Type": object.httpMetadata?.contentType ?? "video/mp4",
    ETag: object.httpEtag,
  };

  // onlyIf が一致したときは本文の無い R2Object が返る。304 で返す
  if (!("body" in object) || object.body === null) {
    return c.body(null, 304, headers);
  }

  if (spec.kind === "partial") {
    const end = spec.offset + spec.length - 1;
    return c.body(object.body, 206, {
      ...headers,
      "Content-Range": `bytes ${spec.offset}-${end}/${size}`,
      "Content-Length": String(spec.length),
    });
  }

  return c.body(object.body, 200, { ...headers, "Content-Length": String(size) });
});
