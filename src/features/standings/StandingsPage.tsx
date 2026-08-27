import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { TeamBadge } from "@/components/TeamBadge";
import { useLeague } from "@/lib/league-context";
import { useNewGameSheet } from "@/lib/new-game-sheet";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { computeStats, rankMembers } from "@/lib/stats";
import { buildAxis, buildGameOrder, toSeries } from "./chart-rows";

/**
 * Recharts は gzip で約 105 kB あるので、この画面を開いたときにだけ読み込む（D-26）。
 * 半荘登録（T7）は雀荘など電波の悪い場所で行われうるので、
 * グラフを見ない画面にこのコストを払わせない。
 */
const CumulativeChart = lazy(() => import("./CumulativeChart"));

const fmtPt = (pt: number) => `${pt > 0 ? "+" : ""}${pt.toFixed(1)}`;

/** 順位番号 → メダル。同点なら同じ順位番号なので、同点1位が2人なら🥇が2つ出る */
const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

export function StandingsPage() {
  const { league, members, teams, games, roster, reload } = useLeague();
  // 見るだけの画面なので自動更新する（入力中のフォームが無い）。
  // ただし登録シートが開いている間は止める（上に書き込む UI が載るため）
  useAutoRefresh(reload, useNewGameSheet().open);
  const { leagueId } = useParams();
  const [mode, setMode] = useState<"team" | "member">("team");

  const rule = useMemo(
    () => ({ startPoint: league.startPoint, returnPoint: league.returnPoint, uma: league.uma }),
    [league],
  );
  const stats = useMemo(() => computeStats(games, roster, rule), [games, roster, rule]);
  const ranked = useMemo(() => rankMembers(stats.members), [stats.members]);

  /** 同点は同じ順位番号（6,6,6,9）。deci 整数で比べる（float の 1e-14 差で分けない） */
  const displayRank = useMemo(() => {
    const out: number[] = [];
    ranked.forEach((m, i) => {
      const prev = ranked[i - 1];
      const same =
        prev !== undefined &&
        prev.gameCount > 0 &&
        m.gameCount > 0 &&
        Math.round(prev.totalPt * 10) === Math.round(m.totalPt * 10);
      out.push(same ? (out[i - 1] as number) : i + 1);
    });
    return out;
  }, [ranked]);

  const nameOf = useCallback(
    (id: number) => members.find((m) => m.id === id)?.name ?? `#${id}`,
    [members],
  );
  const teamNameOf = useCallback(
    (id: number) => teams.find((t) => t.id === id)?.name ?? `#${id}`,
    [teams],
  );
  /** チームの色。未設定・知らない id は null（＝ハイライトしない） */
  const colorOf = useCallback(
    (id: number) => teams.find((t) => t.id === id)?.color ?? null,
    [teams],
  );

  /**
   * 半荘の通し番号を x 軸にする（日付だけだと同じ日の複数半荘が重なる）。
   * どの半荘を採点したかは computeStats が scoredGameIds で返すので、
   * ここで条件を書き直さない（書き直すと状態が増えたときに食い違う）。
   */
  const gameOrder = useMemo(
    () => buildGameOrder(games, stats.scoredGameIds),
    [games, stats.scoredGameIds],
  );

  const series = useMemo(
    () =>
      mode === "team"
        ? stats.teams.map((t) => toSeries(t.teamId, teamNameOf(t.teamId), t.cumulative, gameOrder))
        : ranked
            .filter((m) => m.gameCount > 0)
            .map((m) => toSeries(m.memberId, nameOf(m.memberId), m.cumulative, gameOrder)),
    [mode, stats.teams, ranked, gameOrder, teamNameOf, nameOf],
  );

  const playedCount = stats.scoredGameIds.length;
  const axis = useMemo(() => buildAxis(gameOrder), [gameOrder]);

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
          <p className="text-muted-foreground text-sm">
            {games.length === 0
              ? "まだ半荘がありません。"
              : stats.reservedGameIds.length === games.length
                ? "まだ結果のある半荘がありません（予定のみ）。"
                : "集計できる半荘がありません。"}
          </p>
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
                  <TeamBadge color={colorOf(t.teamId)} className="font-medium">
                    {teamNameOf(t.teamId)}
                  </TeamBadge>
                  <span className="tabular-nums">
                    {fmtPt(t.totalPt)}pt
                    <span className="text-muted-foreground ml-2 text-xs">{t.gameCount}半荘</span>
                  </span>
                </li>
              ))}
          </ul>

          <h3 className="mt-6 font-bold">個人ランキング</h3>
          {/* 同点は同じ順位番号にする（6,6,6,9 の形）。
              このアプリは同点をウマ折半・占める順位で扱う思想なので、
              ランキングだけ入力順で番号が分かれるのは一貫しない。
              rankMembers が同値を memberId で安定させているので、表示側で数えられる */}
          <ol className="mt-2 space-y-1">
            {ranked.map((m, i) => (
              <li
                key={m.memberId}
                className="border-border flex items-baseline gap-2 border-b py-2 text-sm"
              >
                <span className="text-muted-foreground w-5 tabular-nums">
                  {m.gameCount === 0 ? "–" : displayRank[i]}
                </span>
                {/* メダルは順位番号（displayRank）で決める。配列の添字だと
                    同点1位が2人いたとき2人目が銀になる。
                    未出場（順位が「–」）には付けない。
                    幅を固定しているのは、4位以下でも名前の左端を揃えるため。
                    順位番号は左の span に出ているので、絵文字は装飾（aria-hidden） */}
                <span className="w-4 shrink-0 text-center text-xs" aria-hidden="true">
                  {m.gameCount === 0 ? "" : (MEDALS[displayRank[i] as number] ?? "")}
                </span>
                {/* 色は**名前だけ**に敷く。行全体に敷くと、10行並んだときに
                    画面の大半が色になって pt の数字が読みにくくなる（実測して決めた） */}
                <Link to={`/leagues/${leagueId}/members/${m.memberId}`} className="flex-1 min-w-0">
                  <TeamBadge color={colorOf(roster.get(m.memberId) ?? -1)} className="underline">
                    {nameOf(m.memberId)}
                  </TeamBadge>
                </Link>
                <span className="shrink-0 tabular-nums">{fmtPt(m.totalPt)}pt</span>
                <span className="text-muted-foreground w-12 shrink-0 text-right text-xs whitespace-nowrap tabular-nums">
                  {m.gameCount}半荘
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
            <CumulativeChart series={series} axis={axis} />
          </Suspense>
        </>
      )}
    </section>
  );
}
