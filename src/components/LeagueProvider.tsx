/**
 * リーグのデータを1回だけ取得して全画面で共有する。
 *
 * `GET /api/leagues/:id` がリーグ設定・チーム・メンバー・全半荘を1回で返すので
 * （決定#14）、画面ごとに取り直さない。集計はすべてこのデータからフロントで行う。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchLeague, type ApiFailure, type LeagueResponse } from "@/lib/api";
import { LeagueContext, describeFailure, type LeagueData } from "@/lib/league-context";
import type { Roster } from "@/lib/validation";

type State =
  | { status: "loading" }
  | { status: "error"; failure: ApiFailure }
  | { status: "ready"; response: LeagueResponse };

export function LeagueProvider({
  leagueId,
  children,
}: {
  leagueId: number;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetchLeague(leagueId).then((result) => {
      if (cancelled) return;
      setState(
        result.ok
          ? { status: "ready", response: result.data }
          : { status: "error", failure: result },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [leagueId, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const value = useMemo<LeagueData | null>(() => {
    if (state.status !== "ready") return null;
    const roster: Roster = new Map(state.response.members.map((m) => [m.id, m.teamId]));
    return { ...state.response, roster, reload };
  }, [state, reload]);

  if (state.status === "loading") {
    return <p className="text-muted-foreground p-6 text-sm">読み込み中…</p>;
  }
  if (state.status === "error") {
    return (
      <div className="p-6">
        <p className="text-destructive text-sm">{describeFailure(state.failure)}</p>
        <button type="button" className="mt-4 text-sm underline" onClick={reload}>
          再読み込み
        </button>
      </div>
    );
  }
  return <LeagueContext value={value}>{children}</LeagueContext>;
}
