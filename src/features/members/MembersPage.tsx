/**
 * メンバー一覧。**チームの振り分けを確認するための画面**で、成績は出さない
 * （それは戦績と個人成績にある）。
 *
 * 取得は既存の `GET /api/leagues/:id` だけで足りる。新しい取得は増やさない。
 *
 * 名簿に無いのに半荘に出ている人（`unassigned`）も出す。戦績が警告を出している
 * 状態と、この画面が食い違わないようにする。
 */

import { useMemo } from "react";
import { Link, useParams } from "react-router";
import { TeamBadge } from "@/components/TeamBadge";
import { useLeague } from "@/lib/league-context";
import { useNewGameSheet } from "@/lib/new-game-sheet";
import { computeStats } from "@/lib/stats";
import { useAutoRefresh } from "@/lib/use-auto-refresh";

export function MembersPage() {
  const { league, members, teams, games, roster, reload } = useLeague();
  // 見るだけの画面なので自動更新する。登録シートが開いている間は止める
  useAutoRefresh(reload, useNewGameSheet().open);
  const { leagueId } = useParams();

  const rule = useMemo(
    () => ({ startPoint: league.startPoint, returnPoint: league.returnPoint, uma: league.uma }),
    [league],
  );
  const stats = useMemo(() => computeStats(games, roster, rule), [games, roster, rule]);

  const nameOf = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);

  // チームごとに固める。teams の順（id 順）に並べる
  const byTeam = useMemo(
    () =>
      teams.map((team) => ({
        team,
        members: members.filter((m) => roster.get(m.id) === team.id),
      })),
    [teams, members, roster],
  );

  // 名簿に無いのに半荘に出ている人。ここに出るのは異常な状態
  const unassigned = stats.unassigned.memberIds;

  return (
    <section>
      <h2 className="text-xl font-bold">メンバー</h2>
      <p className="text-muted-foreground mt-2 text-sm">
        チームの振り分けです。成績は戦績と個人成績を見てください。
      </p>

      {byTeam.map(({ team, members: rows }) => (
        <div key={team.id}>
          <h3 className="mt-6 flex items-baseline gap-2 font-bold">
            <TeamBadge color={team.color}>{team.name}</TeamBadge>
            <span className="text-muted-foreground text-sm font-normal">{rows.length}人</span>
          </h3>
          {rows.length === 0 ? (
            <p className="text-muted-foreground mt-2 text-sm">まだ誰もいません。</p>
          ) : (
            <ul className="mt-2">
              {rows.map((m) => (
                <li key={m.id} className="border-border border-b">
                  <Link
                    to={`/leagues/${leagueId}/members/${m.id}`}
                    className="flex items-baseline justify-between gap-2 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate">{m.name}</span>
                    <span className="text-muted-foreground shrink-0 text-xs">#{m.id}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      {/* 戦績が警告している状態と食い違わせない */}
      {unassigned.length > 0 && (
        <div className="border-destructive mt-6 rounded-lg border p-3">
          <h3 className="text-destructive font-bold">名簿にない人</h3>
          <p className="mt-1 text-sm">
            半荘に出ているのに、このリーグの名簿にいません。
            <strong>チーム合計に入っていません。</strong>運営に連絡してください。
          </p>
          <ul className="mt-2">
            {unassigned.map((id) => (
              <li key={id} className="border-border border-b py-2 text-sm">
                <Link to={`/leagues/${leagueId}/members/${id}`} className="underline">
                  {nameOf.get(id) ?? `#${id}`}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-muted-foreground mt-6 text-xs">
        チーム分けと色の変更は運営メニューから行います。
      </p>
    </section>
  );
}
