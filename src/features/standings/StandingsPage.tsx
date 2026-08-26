import { lazy, Suspense, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { useLeague } from "@/lib/league-context";
import { computeStats, rankMembers, type CumulativePoint } from "@/lib/stats";
import type { ChartSeries } from "./CumulativeChart";

/**
 * Recharts は gzip で約 105 kB あるので、この画面を開いたときにだけ読み込む（D-26）。
 * 半荘登録（T7）は雀荘など電波の悪い場所で行われうるので、
 * グラフを見ない画面にこのコストを払わせない。
 */
const CumulativeChart = lazy(() => import("./CumulativeChart"));

const fmtPt = (pt: number) => `${pt > 0 ? "+" : ""}${pt.toFixed(1)}`;
/** 未定義の指標は「–」。NaN や ±Infinity は画面に出さない（D-23） */
const fmtOrDash = (v: number | null, digits = 1) =>
  v === null || !Number.isFinite(v) ? "–" : v.toFixed(digits);

export function StandingsPage() {
  const { league, members, teams, games, roster } = useLeague();
  const { leagueId } = useParams();
  const [mode, setMode] = useState<"team" | "member">("team");

  const rule = useMemo(
    () => ({ startPoint: league.startPoint, returnPoint: league.returnPoint, uma: league.uma }),
    [league],
  );
  const stats = useMemo(() => computeStats(games, roster, rule), [games, roster, rule]);
  const ranked = useMemo(() => rankMembers(stats.members), [stats.members]);

  const nameOf = (id: number) => members.find((m) => m.id === id)?.name ?? `#${id}`;
  const teamNameOf = (id: number) => teams.find((t) => t.id === id)?.name ?? `#${id}`;

  /** 半荘の通し番号を x 軸にする。日付だけだと同じ日の複数半荘が重なる */
  const gameOrder = useMemo(() => {
    const ordered = [...games]
      .filter((g) => g.results.length === 4)
      .sort((a, b) => (a.playedOn === b.playedOn ? a.id - b.id : a.playedOn < b.playedOn ? -1 : 1));
    return new Map(ordered.map((g, i) => [g.id, { x: i + 1, label: g.playedOn }]));
  }, [games]);

  const toSeries = (id: number, name: string, cumulative: CumulativePoint[]): ChartSeries => ({
    id,
    name,
    points: cumulative.flatMap((c) => {
      const at = gameOrder.get(c.gameId);
      return at === undefined ? [] : [{ x: at.x, label: at.label, totalPt: c.totalPt }];
    }),
  });

  const series = useMemo(
    () =>
      mode === "team"
        ? stats.teams.map((t) => toSeries(t.teamId, teamNameOf(t.teamId), t.cumulative))
        : ranked
            .filter((m) => m.gameCount > 0)
            .map((m) => toSeries(m.memberId, nameOf(m.memberId), m.cumulative)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, stats.teams, ranked, gameOrder],
  );

  const playedCount = games.filter((g) => g.results.length === 4).length;

  return (
    <section>
      <h2 className="text-xl font-bold">リーグ戦績</h2>

      {/* 除外したものは黙って落とさない（D-23） */}
      {stats.broken.length > 0 ? (
        <p className="border-destructive text-destructive mt-4 rounded-lg border p-3 text-sm">
          データ不整合の半荘が {stats.broken.length} 件あり、集計から除いています（#
          {stats.broken.join(", #")}）。運営に連絡してください。
        </p>
      ) : null}
      {stats.unassigned.memberIds.length > 0 ? (
        <p className="border-destructive text-destructive mt-4 rounded-lg border p-3 text-sm">
          リーグ名簿に無いメンバーが半荘に含まれています（
          {stats.unassigned.memberIds.map(nameOf).join("・")}）。
          そのぶんはチーム合計に入っていません。運営に連絡してください。
        </p>
      ) : null}

      {playedCount === 0 ? (
        <div className="mt-6">
          <p className="text-muted-foreground text-sm">まだ半荘がありません。</p>
          <Link
            to={`/leagues/${leagueId}/games/new`}
            className="mt-3 inline-block text-sm underline"
          >
            半荘を登録する
          </Link>
        </div>
      ) : (
        <>
          <h3 className="mt-6 font-bold">チーム合計</h3>
          <ul className="mt-2 space-y-2">
            {[...stats.teams]
              .sort((a, b) => Math.round(b.totalPt * 10) - Math.round(a.totalPt * 10))
              .map((t) => (
                <li
                  key={t.teamId}
                  className="border-border flex justify-between rounded-lg border p-3"
                >
                  <span className="font-medium">{teamNameOf(t.teamId)}</span>
                  <span className="tabular-nums">
                    {fmtPt(t.totalPt)}pt
                    <span className="text-muted-foreground ml-2 text-xs">{t.gameCount}半荘</span>
                  </span>
                </li>
              ))}
          </ul>

          <h3 className="mt-6 font-bold">個人ランキング</h3>
          <ol className="mt-2 space-y-1">
            {ranked.map((m, i) => (
              <li
                key={m.memberId}
                className="border-border flex items-baseline gap-2 border-b py-2 text-sm"
              >
                <span className="text-muted-foreground w-5 tabular-nums">
                  {m.gameCount === 0 ? "–" : i + 1}
                </span>
                <Link
                  to={`/leagues/${leagueId}/members/${m.memberId}`}
                  className="flex-1 underline"
                >
                  {nameOf(m.memberId)}
                </Link>
                <span className="shrink-0 tabular-nums">{fmtPt(m.totalPt)}pt</span>
                {/* 390px 幅だと折り返して2行になるので、区切りを詰めて改行を禁止する */}
                <span className="text-muted-foreground w-[5.5rem] shrink-0 text-right text-xs whitespace-nowrap tabular-nums">
                  {m.gameCount}半荘 {fmtOrDash(m.averageRank, 2)}位
                </span>
              </li>
            ))}
          </ol>

          <div className="mt-6 flex items-center justify-between">
            <h3 className="font-bold">累計pt推移</h3>
            <div className="flex gap-1 text-sm">
              {(["team", "member"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  className={`rounded-lg px-3 py-1 ${
                    mode === m ? "bg-primary text-primary-foreground" : "border-input border"
                  }`}
                >
                  {m === "team" ? "チーム" : "個人"}
                </button>
              ))}
            </div>
          </div>
          <Suspense
            fallback={<p className="text-muted-foreground mt-4 text-sm">グラフを読み込み中…</p>}
          >
            <CumulativeChart series={series} />
          </Suspense>
        </>
      )}
    </section>
  );
}
