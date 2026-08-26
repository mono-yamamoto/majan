import { useState } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useParams } from "react-router";
import { LeagueIndex } from "@/components/LeagueIndex";
import { PasscodeDialog } from "@/components/PasscodeDialog";
import { Button } from "@/components/ui/button";
import { EditGamePage } from "@/features/games/EditGamePage";
import { GamesPage } from "@/features/games/GamesPage";
import { NewGamePage } from "@/features/games/NewGamePage";
import { MemberPage } from "@/features/members/MemberPage";
import { RulesPage } from "@/features/rules/RulesPage";
import { StandingsPage } from "@/features/standings/StandingsPage";
import { LeagueProvider } from "@/components/LeagueProvider";
import { useLeague } from "@/lib/league-context";

function Header() {
  const { league } = useLeague();
  const { leagueId } = useParams();
  const base = `/leagues/${leagueId}`;
  const [passcodeOpen, setPasscodeOpen] = useState(false);

  return (
    <header className="border-border border-b">
      <div className="mx-auto flex max-w-screen-sm items-center justify-between gap-2 px-4 py-3">
        <Link to={base} className="font-bold">
          {league.name}
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPasscodeOpen(true)}
          aria-label="書き込みパスコードの設定"
        >
          パスコード
        </Button>
      </div>
      <nav className="mx-auto flex max-w-screen-sm gap-4 overflow-x-auto px-4 pb-2 text-sm">
        <Link to={base}>戦績</Link>
        <Link to={`${base}/games`}>半荘一覧</Link>
        <Link to={`${base}/games/new`}>登録</Link>
        <Link to={`${base}/rules`}>ルール</Link>
      </nav>
      <PasscodeDialog open={passcodeOpen} onOpenChange={setPasscodeOpen} />
    </header>
  );
}

/** :leagueId を読んでデータを1回だけ取得し、配下の画面に配る */
function LeagueLayout({ children }: { children: React.ReactNode }) {
  const { leagueId } = useParams();
  const id = Number(leagueId);
  if (!Number.isSafeInteger(id) || id <= 0) return <Navigate to="/" replace />;

  return (
    <LeagueProvider leagueId={id}>
      <Header />
      <main className="mx-auto max-w-screen-sm p-4">{children}</main>
    </LeagueProvider>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LeagueIndex />} />
        <Route
          path="/leagues/:leagueId"
          element={
            <LeagueLayout>
              <StandingsPage />
            </LeagueLayout>
          }
        />
        <Route
          path="/leagues/:leagueId/games"
          element={
            <LeagueLayout>
              <GamesPage />
            </LeagueLayout>
          }
        />
        <Route
          path="/leagues/:leagueId/games/new"
          element={
            <LeagueLayout>
              <NewGamePage />
            </LeagueLayout>
          }
        />
        <Route
          path="/leagues/:leagueId/games/:gameId/edit"
          element={
            <LeagueLayout>
              <EditGamePage />
            </LeagueLayout>
          }
        />
        <Route
          path="/leagues/:leagueId/members/:memberId"
          element={
            <LeagueLayout>
              <MemberPage />
            </LeagueLayout>
          }
        />
        <Route
          path="/leagues/:leagueId/rules"
          element={
            <LeagueLayout>
              <RulesPage />
            </LeagueLayout>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

function NotFound() {
  return (
    <main className="mx-auto max-w-screen-sm p-6">
      <h1 className="text-xl font-bold">ページが見つかりません</h1>
      <Link to="/" className="mt-4 inline-block text-sm underline">
        トップへ
      </Link>
    </main>
  );
}
