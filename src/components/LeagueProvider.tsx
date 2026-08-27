/**
 * リーグのデータを1回だけ取得して全画面で共有する。
 *
 * `GET /api/leagues/:id` がリーグ設定・チーム・メンバー・全半荘を1回で返すので
 * （決定#14）、画面ごとに取り直さない。集計はすべてこのデータからフロントで行う。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
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
      setState((prev) => {
        if (result.ok) {
          // ★ 中身が同じなら状態を差し替えない。
          //   自動更新で30秒ごとに新しいオブジェクトを入れると、参照が変わるだけで
          //   全画面が再描画され、**グラフの線が毎回描き直される**（T19 でアニメーションを
          //   入れたため）。スクロール位置も飛びうる。
          //   レスポンスは 2KB 程度なので、比較のコストは無視できる。
          if (
            prev.status === "ready" &&
            JSON.stringify(prev.response) === JSON.stringify(result.data)
          ) {
            return prev;
          }
          return { status: "ready", response: result.data };
        }
        // ★ 取得に失敗しても、既に出ているデータは消さない。
        //   電波が切れただけかもしれないので、黙って次の回に賭ける。
        //   初回の失敗だけはエラー画面を出す（出すものが無いため）。
        return prev.status === "ready" ? prev : { status: "error", failure: result };
      });
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
    // リーグに論理削除は無いので、games 向けの「削除済みの可能性があります」を
    // そのまま出すと誤解を招く。古いブックマークで前シーズンの id を開く経路が
    // 現実にあるので、トップ（リーグ一覧）へ戻れるようにする。
    const message =
      state.failure.kind === "notFound"
        ? "このリーグは見つかりませんでした。URL が古い可能性があります"
        : describeFailure(state.failure);

    return (
      <div className="mx-auto max-w-screen-sm p-6">
        <p className="text-destructive text-sm">{message}</p>
        <div className="mt-4 flex gap-4 text-sm">
          <Link to="/" className="underline">
            リーグ一覧へ
          </Link>
          {state.failure.kind === "notFound" ? null : (
            <button type="button" className="underline" onClick={reload}>
              再読み込み
            </button>
          )}
        </div>
      </div>
    );
  }
  return <LeagueContext value={value}>{children}</LeagueContext>;
}
