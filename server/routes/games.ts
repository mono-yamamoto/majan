import { Hono, type Context } from "hono";
import { toLeagueRule } from "../../src/lib/types";
import type { GameInput, LeagueRow } from "../../src/lib/types";
import { validateGameInput, type Roster } from "../../src/lib/validation";
import { requirePasscode } from "../auth";
import type { Bindings } from "../index";
import { parseId } from "./leagues";

// ---------------------------------------------------------------------------
// 1段目: 形の検査（parse）
//
// validateGameInput() は型どおりの GameInput が来る前提で書かれており、
// results が配列でなければ .length で例外になる。HTTP から来る JSON は
// 信用できないので、業務ルールの検査より**先に**形を止める（D-18）。
// validateGameInput 側を防御的にはしない（この段を飛ばしてよいという
// 誤ったシグナルになるため）。
// ---------------------------------------------------------------------------

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** JSON から来た値を GameInput の形に落とす。leagueId は含めない（D-14） */
function parseGameInput(body: unknown): Parsed<GameInput> {
  if (!isRecord(body)) return { ok: false, error: "body must be an object" };

  if (typeof body.playedOn !== "string") {
    return { ok: false, error: "playedOn must be a string" };
  }

  // memo は未指定を null と同じに扱う
  const rawMemo = body.memo ?? null;
  if (rawMemo !== null && typeof rawMemo !== "string") {
    return { ok: false, error: "memo must be a string or null" };
  }

  if (!Array.isArray(body.results)) {
    return { ok: false, error: "results must be an array" };
  }

  const results: GameInput["results"] = [];
  for (const [i, item] of body.results.entries()) {
    if (!isRecord(item)) return { ok: false, error: `results[${i}] must be an object` };
    const { memberId, rawScore } = item;
    if (typeof memberId !== "number" || !Number.isSafeInteger(memberId)) {
      return { ok: false, error: `results[${i}].memberId must be an integer` };
    }
    // Number.isFinite だけだと 1e19 のような int64 に収まらない値や非整数を通してしまう。
    // ここを緩くするとこの先の型がすべて嘘になるので、安全整数を要求する。
    if (typeof rawScore !== "number" || !Number.isSafeInteger(rawScore)) {
      return { ok: false, error: `results[${i}].rawScore must be a safe integer` };
    }
    results.push({ memberId, rawScore });
  }

  return { ok: true, value: { playedOn: body.playedOn, memo: rawMemo, results } };
}

/** POST は新規作成なので leagueId を受け取る（存在しなければ 404 で明示的に弾く） */
function parseLeagueId(body: unknown): Parsed<number> {
  if (!isRecord(body)) return { ok: false, error: "body must be an object" };
  const { leagueId } = body;
  if (typeof leagueId !== "number" || !Number.isSafeInteger(leagueId) || leagueId <= 0) {
    return { ok: false, error: "leagueId must be a positive integer" };
  }
  return { ok: true, value: leagueId };
}

/** ボディの上限。memo 500文字は validation で見るが、c.req.json() はその前に全体をパースする */
const MAX_BODY_BYTES = 16 * 1024;

type Body = { ok: true; value: unknown } | { ok: false; status: 400 | 413; error: string };

async function readJson(c: Context<{ Bindings: Bindings }>): Promise<Body> {
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

/**
 * リーグ設定と名簿を **DB 由来の league_id** で引く。
 * 名簿は league_id で絞った1クエリで組む（メンバーごとに引かない・D-13）。
 */
async function loadLeagueContext(
  db: D1Database,
  leagueId: number,
): Promise<{ rule: ReturnType<typeof toLeagueRule>; roster: Roster } | null> {
  const [leagueRes, rosterRes] = await db.batch([
    db.prepare("SELECT * FROM leagues WHERE id = ?1").bind(leagueId),
    db.prepare("SELECT member_id, team_id FROM league_members WHERE league_id = ?1").bind(leagueId),
  ]);

  const league = (leagueRes.results as LeagueRow[])[0];
  if (league === undefined) return null;

  const roster: Roster = new Map(
    (rosterRes.results as { member_id: number; team_id: number }[]).map((r) => [
      r.member_id,
      r.team_id,
    ]),
  );
  return { rule: toLeagueRule(league), roster };
}

/**
 * batch() を実行し、D1 のエラーを HTTP に写像する。
 * batch() 全体が1トランザクションなので、1文でも失敗すれば全体が巻き戻る。
 */
async function runBatch(
  db: D1Database,
  statements: D1PreparedStatement[],
): Promise<{ ok: true; results: D1Result[] } | { ok: false; status: 404 | 500; error: string }> {
  try {
    return { ok: true, results: await db.batch(statements) };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // TOCTOU で半荘が論理削除された場合、game_id のサブクエリが NULL を返す
    if (message.includes("NOT NULL constraint failed: game_results.game_id")) {
      return { ok: false, status: 404, error: "not found" };
    }
    console.error("[games] batch failed:", message);
    return { ok: false, status: 500, error: "database error" };
  }
}

export const games = new Hono<{ Bindings: Bindings }>();

// 書き込みは3本とも X-Passcode 必須。メソッドを限定するのは、use() だと
// GET /api/games/1 が（ルート不在の 404 ではなく）401 を返してしまい、
// 「GET 系はパスコード不要」（決定#16）と字面がずれるため。
games.on(["POST", "PATCH"], "/api/games", requirePasscode);
games.on(["POST", "PATCH"], "/api/games/*", requirePasscode);

// ---------------------------------------------------------------------------
// POST /api/games — 新規登録
// ---------------------------------------------------------------------------
games.post("/api/games", async (c) => {
  const body = await readJson(c);
  if (!body.ok) return c.json({ error: body.error }, body.status);

  const leagueId = parseLeagueId(body.value);
  if (!leagueId.ok) return c.json({ error: leagueId.error }, 400);

  const input = parseGameInput(body.value);
  if (!input.ok) return c.json({ error: input.error }, 400);

  const db = c.env.DB;
  const ctx = await loadLeagueContext(db, leagueId.value);
  if (ctx === null) return c.json({ error: "league not found" }, 404);

  const errors = validateGameInput(input.value, ctx.rule, ctx.roster);
  if (errors.length > 0) return c.json({ errors }, 400);

  // games 1行 + game_results 4行を1トランザクションで。D1 には対話的
  // トランザクションが無く、原子化の手段は batch() だけ。
  // game_id は last_insert_rowid() ではなく (SELECT MAX(id) FROM games) で参照する（D-9）。
  const statements = [
    db
      .prepare("INSERT INTO games (league_id, played_on, memo) VALUES (?1, ?2, ?3)")
      .bind(leagueId.value, input.value.playedOn, input.value.memo),
    ...input.value.results.map((r) =>
      db
        .prepare(
          `INSERT INTO game_results (game_id, member_id, raw_score)
           VALUES ((SELECT MAX(id) FROM games), ?1, ?2)`,
        )
        .bind(r.memberId, r.rawScore),
    ),
    // 末尾に置けば同一トランザクション内で採番結果を取れる
    db.prepare("SELECT MAX(id) AS id FROM games"),
  ];

  const batched = await runBatch(db, statements);
  if (!batched.ok) return c.json({ error: batched.error }, batched.status);

  const last = batched.results[batched.results.length - 1].results as { id: number }[];
  return c.json({ id: last[0].id }, 201);
});

// ---------------------------------------------------------------------------
// PATCH /api/games/:id — 全置換（D-2）
// ---------------------------------------------------------------------------
games.patch("/api/games/:id", async (c) => {
  const gameId = parseId(c.req.param("id"));
  if (gameId === null) return c.json({ error: "not found" }, 404);

  const body = await readJson(c);
  if (!body.ok) return c.json({ error: body.error }, body.status);

  const input = parseGameInput(body.value);
  if (!input.ok) return c.json({ error: input.error }, 400);

  const db = c.env.DB;
  const game = await db
    .prepare("SELECT id, league_id, deleted_at FROM games WHERE id = ?1")
    .bind(gameId)
    .first<{ id: number; league_id: number; deleted_at: string | null }>();

  // 存在しない / 論理削除済みは編集させない（D-3）
  if (game === null || game.deleted_at !== null) return c.json({ error: "not found" }, 404);

  // リーグは必ず DB の games 行から読む。ボディに来て食い違えば 400（D-14）。
  // 黙って無視すると「送ったのに効いていない」がクライアントから見えなくなる。
  const claimed = (body.value as Record<string, unknown>).leagueId;
  if (claimed !== undefined && claimed !== game.league_id) {
    return c.json({ error: "leagueId does not match the stored game" }, 400);
  }

  const ctx = await loadLeagueContext(db, game.league_id);
  if (ctx === null) return c.json({ error: "league not found" }, 404);

  const errors = validateGameInput(input.value, ctx.rule, ctx.roster);
  if (errors.length > 0) return c.json({ errors }, 400);

  // 全置換。行単位の UPDATE は UNIQUE(game_id, member_id) と衝突しうるうえ
  // 「常に4行」の保証も崩れるので、全削除 → 4行 INSERT にする。
  // game_id を直値でなくサブクエリにすることで TOCTOU を塞ぐ。
  // SELECT と batch() の隙間に論理削除が入ると、サブクエリが NULL を返して
  // NOT NULL 違反になり batch() 全体が巻き戻る。それを 404 に写像する。
  const batched = await runBatch(db, [
    db
      .prepare("UPDATE games SET played_on = ?2, memo = ?3 WHERE id = ?1 AND deleted_at IS NULL")
      .bind(gameId, input.value.playedOn, input.value.memo),
    db.prepare("DELETE FROM game_results WHERE game_id = ?1").bind(gameId),
    ...input.value.results.map((r) =>
      db
        .prepare(
          `INSERT INTO game_results (game_id, member_id, raw_score)
           VALUES ((SELECT id FROM games WHERE id = ?1 AND deleted_at IS NULL), ?2, ?3)`,
        )
        .bind(gameId, r.memberId, r.rawScore),
    ),
  ]);
  if (!batched.ok) return c.json({ error: batched.error }, batched.status);

  return c.json({ id: gameId });
});

// ---------------------------------------------------------------------------
// PATCH /api/games/:id/deleted — 論理削除（片道。DELETE は作らない）
// ---------------------------------------------------------------------------
games.patch("/api/games/:id/deleted", async (c) => {
  const gameId = parseId(c.req.param("id"));
  if (gameId === null) return c.json({ error: "not found" }, 404);

  const body = await readJson(c);
  if (!body.ok) return c.json({ error: body.error }, body.status);
  if (!isRecord(body.value) || typeof body.value.deleted !== "boolean") {
    return c.json({ error: "deleted must be a boolean" }, 400);
  }
  // 復活は受け付けない（D-4）。復旧は運営が wrangler d1 execute で行う
  if (body.value.deleted === false) {
    return c.json({ error: "restoring a deleted game is not supported" }, 400);
  }

  const db = c.env.DB;
  // 半荘そのものが存在しなければ 404。存在すれば削除済みでも 200（冪等）。
  // PATCH /api/games/:id が削除済みに 404 を返すのとあえて違えている:
  // 二重タップやオフライン再送で 404 が出ると「消えていないのか」と混乱するため。
  const game = await db
    .prepare("SELECT id FROM games WHERE id = ?1")
    .bind(gameId)
    .first<{ id: number }>();
  if (game === null) return c.json({ error: "not found" }, 404);

  // WHERE deleted_at IS NULL なので、再送しても最初の削除時刻を上書きしない
  await db
    .prepare(
      `UPDATE games SET deleted_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
        WHERE id = ?1 AND deleted_at IS NULL`,
    )
    .bind(gameId)
    .run();

  return c.json({ id: gameId, deleted: true });
});
