import { lazy, Suspense, useMemo } from "react";
import { Link, useParams } from "react-router";
import { buildAxis, buildGameOrder, toSeries } from "@/features/standings/chart-rows";
import { useLeague } from "@/lib/league-context";
import { computeStats } from "@/lib/stats";

/** 戦績と同じチャンク。個人成績を開いても新しく落とすものは増えない（D-26） */
const CumulativeChart = lazy(() => import("@/features/standings/CumulativeChart"));

const fmtPt = (pt: number) => `${pt > 0 ? "+" : ""}${pt.toFixed(1)}`;
/** 未定義の指標は「–」。NaN や ±Infinity は画面に出さない（D-23） */
const fmtOrDash = (v: number | null, digits = 1) =>
  v === null || !Number.isFinite(v) ? "–" : v.toFixed(digits);
const fmtRate = (v: number | null) =>
  v === null || !Number.isFinite(v) ? "–" : `${(v * 100).toFixed(1)}%`;
const fmtScore = (v: number | null) =>
  v === null || !Number.isFinite(v) ? "–" : v.toLocaleString();

export function MemberPage() {
  const { league, members, teams, games, roster } = useLeague();
  const { leagueId, memberId } = useParams();

  const rule = useMemo(
    () => ({ startPoint: league.startPoint, returnPoint: league.returnPoint, uma: league.uma }),
    [league],
  );
  const stats = useMemo(() => computeStats(games, roster, rule), [games, roster, rule]);

  // URL 直打ちで存在しないメンバーを開く経路がある
  const id = memberId !== undefined && /^\d+$/.test(memberId) ? Number(memberId) : Number.NaN;
  const member = members.find((m) => m.id === id);
  const me = stats.members.find((m) => m.memberId === id);

  const gameOrder = useMemo(
    () => buildGameOrder(games, stats.scoredGameIds),
    [games, stats.scoredGameIds],
  );
  const axis = useMemo(() => buildAxis(gameOrder), [gameOrder]);

  if (member === undefined || me === undefined) {
    return (
      <section>
        <h2 className="text-xl font-bold">メンバーが見つかりません</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          URL が古いか、このリーグに所属していない可能性があります。
        </p>
        <Link to={`/leagues/${leagueId}`} className="mt-4 inline-block text-sm underline">
          リーグ戦績へ
        </Link>
      </section>
    );
  }

  const teamName = teams.find((t) => t.id === roster.get(member.id))?.name;
  const rows: [string, string][] = [
    ["半荘数", `${me.gameCount}`],
    ["合計pt", `${fmtPt(me.totalPt)}pt`],
    ["平均pt", me.averagePt === null ? "–" : `${fmtPt(me.averagePt)}pt`],
    ["平均順位", fmtOrDash(me.averageRank, 2)],
    ["トップ率", fmtRate(me.topRate)],
    ["ラス率", fmtRate(me.lastRate)],
    ["最高素点", fmtScore(me.maxRawScore)],
    ["最低素点", fmtScore(me.minRawScore)],
  ];

  const series =
    me.gameCount === 0 ? [] : [toSeries(member.id, member.name, me.cumulative, gameOrder)];

  return (
    <section>
      <div className="flex items-baseline gap-2">
        <h2 className="text-xl font-bold">{member.name}</h2>
        {teamName === undefined ? null : (
          <span className="text-muted-foreground text-sm">{teamName}</span>
        )}
      </div>

      {me.gameCount === 0 ? (
        <p className="text-muted-foreground mt-4 text-sm">
          まだ半荘に出場していません。出場すると成績が表示されます。
        </p>
      ) : null}

      <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <h3 className="mt-6 font-bold">着順</h3>
      <ul className="mt-2 space-y-1 text-sm">
        {me.rankCounts.map((count, i) => (
          <li key={i} className="flex justify-between tabular-nums">
            <span>{i + 1}着</span>
            <span>
              {count}回
              <span className="text-muted-foreground ml-2">{fmtRate(me.rankRates[i])}</span>
            </span>
          </li>
        ))}
      </ul>

      {me.gameCount === 0 ? null : (
        <>
          <h3 className="mt-6 font-bold">累計pt推移</h3>
          <Suspense
            fallback={<p className="text-muted-foreground mt-4 text-sm">グラフを読み込み中…</p>}
          >
            <CumulativeChart series={series} axis={axis} />
          </Suspense>
        </>
      )}

      <Link to={`/leagues/${leagueId}`} className="mt-6 inline-block text-sm underline">
        リーグ戦績へ
      </Link>
    </section>
  );
}
