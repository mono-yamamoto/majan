import { useMemo } from "react";
import { Link, useParams } from "react-router";
import { useLeague } from "@/lib/league-context";
import { scoreGame } from "@/lib/scoring";
import { isReserved, isScorable } from "@/lib/stats";

type Game = ReturnType<typeof useLeague>["games"][number];

/**
 * 半荘の見出し。タイトルが主、日付が従。
 * タイトルが空なら日付を大きく出す（タイトル欄のために空行を作らない）。
 * 運営が SQL で空文字を入れることもありうるので、trim して空なら「無い」扱いにする。
 */
function GameHeading({ game }: { game: Game }) {
  const title = game.title?.trim() ?? "";
  if (title === "") {
    return <span className="font-medium">{game.playedOn}</span>;
  }
  return (
    // 60文字の空白なし文字列でも横に溢れさせない
    <span className="min-w-0 flex-1 break-words">
      <span className="block font-medium">{title}</span>
      <span className="text-muted-foreground block text-xs">{game.playedOn}</span>
    </span>
  );
}

export function GamesPage() {
  const { games, members, league, roster } = useLeague();
  const { leagueId } = useParams();
  const base = `/leagues/${leagueId}`;

  const nameOf = (id: number) => members.find((m) => m.id === id)?.name ?? `#${id}`;
  const rule = useMemo(
    () => ({ startPoint: league.startPoint, returnPoint: league.returnPoint, uma: league.uma }),
    [league],
  );

  // 予定は日付の近い順（古い順）。これから起きることなので、次にやるものが上に来る
  const reservations = useMemo(
    () =>
      games
        .filter((g) => isReserved(g, rule))
        .sort((a, b) =>
          a.playedOn === b.playedOn ? a.id - b.id : a.playedOn < b.playedOn ? -1 : 1,
        ),
    [games, rule],
  );

  // 確定済みは新しい半荘ほど上（入力直後の確認と、直近の修正が主な用途）
  const finished = useMemo(
    () =>
      games
        .filter((g) => !isReserved(g, rule))
        .sort((a, b) =>
          a.playedOn === b.playedOn ? b.id - a.id : a.playedOn < b.playedOn ? 1 : -1,
        ),
    [games, rule],
  );

  const editLink = (game: Game) => (
    <Link to={`${base}/games/${game.id}/edit`} className="text-sm underline">
      編集
    </Link>
  );

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">半荘一覧</h2>
        <Link
          to={`${base}/games/new`}
          className="bg-primary text-primary-foreground hover:bg-primary/80 rounded-lg px-3 py-1.5 text-sm font-medium"
        >
          登録
        </Link>
      </div>

      {games.length === 0 ? (
        <p className="text-muted-foreground mt-6 text-sm">
          まだ半荘がありません。「登録」から追加できます。
        </p>
      ) : null}

      {reservations.length > 0 ? (
        <>
          <h3 className="mt-6 font-bold">予定</h3>
          <ul className="mt-2 space-y-3">
            {reservations.map((game) => (
              <li key={game.id} className="border-border bg-muted/40 rounded-lg border p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <GameHeading game={game} />
                  <span className="shrink-0">{editLink(game)}</span>
                </div>
                {/* 予約は pt・順位を持たないので、名前と日付だけ。
                    チーム順に並べると「2-2 になっている」が読める。
                    member_id 順のままだと id の並び次第で A,B,A,B にもなり、
                    予約の情報量のほぼ全部であるチーム構成が読み取れない */}
                <p className="mt-2 text-sm">
                  {[...game.results]
                    .sort(
                      (a, b) =>
                        (roster.get(a.memberId) ?? 0) - (roster.get(b.memberId) ?? 0) ||
                        a.memberId - b.memberId,
                    )
                    .map((r) => nameOf(r.memberId))
                    .join("・")}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  素点は未入力（編集して入れると確定します）
                </p>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {finished.length > 0 ? (
        <>
          {reservations.length > 0 ? <h3 className="mt-6 font-bold">結果</h3> : null}
          <ul className="mt-2 space-y-4">
            {finished.map((game) => {
              // scoreGame は4件そろって素点が全部入っているときだけ呼べる（事前条件・T2）。
              // games / game_results は運営が SQL で直接触れるので（決定#11）、
              // 条件を満たさない半荘は作れてしまう。ここで分岐しないと一覧全体が落ちる。
              if (!isScorable(game, rule)) {
                return (
                  <li key={game.id} className="border-destructive rounded-lg border p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <GameHeading game={game} />
                      <span className="text-muted-foreground shrink-0 text-xs">#{game.id}</span>
                    </div>
                    <p className="text-destructive mt-2 text-sm">
                      データ不整合（4人ぶんの素点がそろっていません）。運営に連絡してください。
                    </p>
                  </li>
                );
              }
              const scored = scoreGame(
                game.results as { memberId: number; rawScore: number }[],
                rule,
              );
              return (
                <li key={game.id} className="border-border rounded-lg border p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <GameHeading game={game} />
                    <span className="shrink-0">{editLink(game)}</span>
                  </div>
                  <ul className="mt-2 space-y-1 text-sm">
                    {scored.map((s) => (
                      <li key={s.memberId} className="flex justify-between tabular-nums">
                        <span>
                          {s.rank}位 {nameOf(s.memberId)}
                        </span>
                        <span>
                          {s.rawScore.toLocaleString()} / {s.pt > 0 ? "+" : ""}
                          {s.pt.toFixed(1)}pt
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </section>
  );
}
