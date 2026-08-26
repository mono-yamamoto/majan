/**
 * トップ（リーグ選択）。
 *
 * リーグが1つならそのまま戦績へ送る。増えたときだけ選ばせる。
 * 一覧を取らずに既定のIDへ送る作りだと、翌シーズンに leagues へ2行目を入れても
 * アプリからは見えず、全員のブックマークが前シーズンを指したままになる。
 */

import { useEffect, useState } from "react";
import { Navigate, Link } from "react-router";
import { fetchLeagues, type ApiFailure, type LeagueSummary } from "@/lib/api";
import { describeFailure } from "@/lib/league-context";

type State =
  | { status: "loading" }
  | { status: "error"; failure: ApiFailure }
  | { status: "ready"; leagues: LeagueSummary[] };

export function LeagueIndex() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetchLeagues().then((result) => {
      if (cancelled) return;
      setState(
        result.ok
          ? { status: "ready", leagues: result.data.leagues }
          : { status: "error", failure: result },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  if (state.status === "loading") {
    return <p className="text-muted-foreground p-6 text-sm">読み込み中…</p>;
  }

  if (state.status === "error") {
    return (
      <div className="mx-auto max-w-screen-sm p-6">
        <p className="text-destructive text-sm">{describeFailure(state.failure)}</p>
        <button
          type="button"
          className="mt-4 text-sm underline"
          onClick={() => setNonce((n) => n + 1)}
        >
          再読み込み
        </button>
      </div>
    );
  }

  // seed 未投入（T11 の初回デプロイ直後）。エラーではなく「まだ無い」状態なので、
  // 何をすればよいかを書く。入力係も閲覧者も自力では直せない。
  if (state.leagues.length === 0) {
    return (
      <main className="mx-auto max-w-screen-sm p-6">
        <h1 className="text-xl font-bold">リーグがまだありません</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          運営がリーグを登録すると、ここに表示されます。
        </p>
      </main>
    );
  }

  // 1つならそのまま戦績へ
  if (state.leagues.length === 1) {
    return <Navigate to={`/leagues/${state.leagues[0].id}`} replace />;
  }

  return (
    <main className="mx-auto max-w-screen-sm p-6">
      <h1 className="text-xl font-bold">リーグを選ぶ</h1>
      <ul className="mt-4 space-y-2">
        {state.leagues.map((league) => (
          <li key={league.id}>
            <Link to={`/leagues/${league.id}`} className="block py-2 underline">
              {league.name}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
