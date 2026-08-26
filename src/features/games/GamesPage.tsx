import { useMemo } from "react";
import { Link, useParams } from "react-router";
import { useLeague } from "@/lib/league-context";
import { scoreGame } from "@/lib/scoring";

export function GamesPage() {
  const { games, members, league } = useLeague();
  const { leagueId } = useParams();
  const base = `/leagues/${leagueId}`;

  const nameOf = (id: number) => members.find((m) => m.id === id)?.name ?? `#${id}`;
  const rule = useMemo(
    () => ({ startPoint: league.startPoint, returnPoint: league.returnPoint, uma: league.uma }),
    [league],
  );

  // 新しい半荘ほど上（入力直後の確認と、直近の修正が主な用途）
  const ordered = useMemo(
    () =>
      [...games].sort((a, b) =>
        a.playedOn === b.playedOn ? b.id - a.id : a.playedOn < b.playedOn ? 1 : -1,
      ),
    [games],
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

      {ordered.length === 0 ? (
        <p className="text-muted-foreground mt-6 text-sm">
          まだ半荘がありません。「登録」から追加できます。
        </p>
      ) : (
        <ul className="mt-4 space-y-4">
          {ordered.map((game) => {
            // scoreGame は4件でないと RangeError を投げる（事前条件・T2）。
            // games / game_results は運営が SQL で直接触れるので（決定#11）、
            // 4件でない半荘は作れてしまう。ここで分岐しないと**一覧全体が落ちて**
            // 閲覧者10人全員の画面が消える。壊れた行だけ出して他は通常どおり見せる。
            if (game.results.length !== 4) {
              return (
                <li key={game.id} className="border-destructive rounded-lg border p-3">
                  <div className="flex items-baseline justify-between">
                    <span className="font-medium">{game.playedOn}</span>
                    <span className="text-muted-foreground text-xs">#{game.id}</span>
                  </div>
                  <p className="text-destructive mt-2 text-sm">
                    データ不整合（4人ぶんそろっていません: {game.results.length}人）。
                    運営に連絡してください。
                  </p>
                </li>
              );
            }
            const scored = scoreGame(game.results, rule);
            return (
              <li key={game.id} className="border-border rounded-lg border p-3">
                <div className="flex items-baseline justify-between">
                  <span className="font-medium">{game.playedOn}</span>
                  <Link to={`${base}/games/${game.id}/edit`} className="text-sm underline">
                    編集
                  </Link>
                </div>
                {game.memo === null ? null : (
                  <p className="text-muted-foreground mt-1 text-sm">{game.memo}</p>
                )}
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
      )}
    </section>
  );
}
