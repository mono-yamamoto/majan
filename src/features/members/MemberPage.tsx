import { lazy, Suspense, useMemo } from "react";
import { Link, useParams } from "react-router";
import { buildAxis, buildGameOrder, toSeries } from "@/features/standings/chart-rows";
import { useLeague } from "@/lib/league-context";
import { useNewGameSheet } from "@/lib/new-game-sheet";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
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
  const { league, members, teams, games, roster, reload } = useLeague();
  // 見るだけの画面なので自動更新する（入力中のフォームが無い）。
  // ただし登録シートが開いている間は止める（上に書き込む UI が載るため）
  useAutoRefresh(reload, useNewGameSheet().open);
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

  // 毎レンダー新しい配列を作らない。線を描くアニメーションを入れたので、
  // 配列の同一性が変わると再生される。いまこの画面は state を持たないので
  // 実害は無いが、あとで state を足したときに「関係ない操作で線が描き直される」
  // ことになる。StandingsPage 側は既に useMemo してあるので、そちらに揃える。
  //
  // 「見つかりません」の早期 return より前に置く。後ろだとフックが条件付きで
  // 呼ばれることになり、呼び出し順が揃わない。
  const series = useMemo(
    () =>
      me === undefined || me.gameCount === 0
        ? []
        : [toSeries(me.memberId, member?.name ?? `#${id}`, me.cumulative, gameOrder)],
    [me, member, id, gameOrder],
  );
  const memberName = member?.name ?? `#${id}`;

  // 名簿から外れたメンバーでも、半荘に出ていれば成績は存在する（unassigned・D-23）。
  // 戦績のランキングは「#99」として表示しリンクも張っているので、
  // ここで「見つかりません」と言うと、成績があるのに無いと嘘をつくことになる。
  // 「見つからない」のは stats にも居ないときだけ。
  if (me === undefined) {
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

  const teamName =
    member === undefined ? undefined : teams.find((t) => t.id === roster.get(member.id))?.name;
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

  /** 出場した半荘の日付（1半荘だけのときに文言へ出す） */
  const onlyGameDate =
    me.cumulative.length === 1 ? (gameOrder.get(me.cumulative[0].gameId)?.label ?? "") : "";

  return (
    <section>
      <div className="flex items-baseline gap-2">
        <h2 className="text-xl font-bold">{memberName}</h2>
        {teamName === undefined ? null : (
          <span className="text-muted-foreground text-sm">{teamName}</span>
        )}
      </div>

      {member === undefined ? (
        <p className="border-border text-muted-foreground mt-4 rounded-lg border p-3 text-sm">
          このメンバーは現在リーグ名簿にありません。過去の半荘の成績だけを表示しています
          （チーム合計には入っていません）。
        </p>
      ) : null}

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

      {/* 推移は2点以上あって初めて意味を持つ。1半荘だと長さ0の線しか描けず、
          正しいが情報量ゼロの図に画面を使うことになる（しかも空白が大きいので
          壊れているように見える）。図の代わりに事実を1行で書く */}
      {me.gameCount === 0 ? null : me.gameCount === 1 ? (
        <>
          <h3 className="mt-6 font-bold">累計pt推移</h3>
          <p className="text-muted-foreground mt-2 text-sm">
            出場 1 半荘{onlyGameDate === "" ? "" : `（${onlyGameDate}）`}。 2
            半荘目から推移が表示されます。
          </p>
        </>
      ) : (
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
