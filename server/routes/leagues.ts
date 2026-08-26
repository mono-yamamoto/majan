import { Hono } from "hono";
import { toLeagueRule } from "../../src/lib/types";
import type { GameResultRow, GameRow, LeagueRow, MemberRow, TeamRow } from "../../src/lib/types";
import type { Bindings } from "../index";

/** URL の :id を正の整数として読む。整数でなければ null */
export function parseId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export const leagues = new Hono<{ Bindings: Bindings }>();

/**
 * リーグの一覧。トップのリーグ選択で使う。
 *
 * 返すのは id と name だけ。設定値やメンバーは選択後に /api/leagues/:id で取る。
 * 論理削除の概念が無いテーブルなので全件返す。
 */
leagues.get("/api/leagues", async (c) => {
  const { results } = await c.env.DB.prepare(
    // 新しいシーズンほど上。古い順だと現行シーズンが一番下に来る
    "SELECT id, name FROM leagues ORDER BY id DESC",
  ).all<{
    id: number;
    name: string;
  }>();
  return c.json({ leagues: results });
});

/**
 * リーグ設定・チーム・メンバー・全半荘の素点を1回で返す（決定#14）。
 * pt・順位・集計はすべてフロントで計算するので、ここでは素点しか返さない。
 * 論理削除済みの半荘は除外する。
 */
leagues.get("/api/leagues/:id", async (c) => {
  const leagueId = parseId(c.req.param("id"));
  if (leagueId === null) return c.json({ error: "not found" }, 404);

  const db = c.env.DB;
  const [leagueRes, teamRes, memberRes, gameRes, resultRes] = await db.batch<
    LeagueRow | TeamRow | (MemberRow & { team_id: number }) | GameRow | GameResultRow
  >([
    db.prepare("SELECT * FROM leagues WHERE id = ?1").bind(leagueId),
    db
      .prepare("SELECT id, league_id, name FROM teams WHERE league_id = ?1 ORDER BY id")
      .bind(leagueId),
    db
      .prepare(
        `SELECT m.id, m.name, lm.team_id
           FROM league_members lm
           JOIN members m ON m.id = lm.member_id
          WHERE lm.league_id = ?1
          ORDER BY m.id`,
      )
      .bind(leagueId),
    db
      .prepare(
        `SELECT * FROM games
          WHERE league_id = ?1 AND deleted_at IS NULL
          ORDER BY played_on, id`,
      )
      .bind(leagueId),
    db
      .prepare(
        `SELECT gr.game_id, gr.member_id, gr.raw_score
           FROM game_results gr
           JOIN games g ON g.id = gr.game_id
          WHERE g.league_id = ?1 AND g.deleted_at IS NULL
          ORDER BY gr.game_id, gr.member_id`,
      )
      .bind(leagueId),
  ]);

  const league = (leagueRes.results as LeagueRow[])[0];
  if (league === undefined) return c.json({ error: "not found" }, 404);

  const resultsByGame = new Map<number, { memberId: number; rawScore: number }[]>();
  for (const r of resultRes.results as GameResultRow[]) {
    const list = resultsByGame.get(r.game_id) ?? [];
    list.push({ memberId: r.member_id, rawScore: r.raw_score });
    resultsByGame.set(r.game_id, list);
  }

  return c.json({
    league: {
      id: league.id,
      name: league.name,
      ...toLeagueRule(league),
      createdAt: league.created_at,
    },
    teams: (teamRes.results as TeamRow[]).map((t) => ({ id: t.id, name: t.name })),
    members: (memberRes.results as (MemberRow & { team_id: number })[]).map((m) => ({
      id: m.id,
      name: m.name,
      teamId: m.team_id,
    })),
    games: (gameRes.results as GameRow[]).map((g) => ({
      id: g.id,
      playedOn: g.played_on,
      memo: g.memo,
      createdAt: g.created_at,
      results: resultsByGame.get(g.id) ?? [],
    })),
  });
});
