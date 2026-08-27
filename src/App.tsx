import { useState } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useParams } from "react-router";
import { LeagueIndex } from "@/components/LeagueIndex";
import { PasscodeDialog } from "@/components/PasscodeDialog";
import { Button } from "@/components/ui/button";
import { EditGamePage } from "@/features/games/EditGamePage";
import { GamesPage } from "@/features/games/GamesPage";
import { NewGamePage } from "@/features/games/NewGamePage";
import { MemberPage } from "@/features/members/MemberPage";
import { AdminPage } from "@/features/admin/AdminPage";
import { RulesPage } from "@/features/rules/RulesPage";
import { StandingsPage } from "@/features/standings/StandingsPage";
import { LeagueProvider } from "@/components/LeagueProvider";
import { useLeague } from "@/lib/league-context";

function Header() {
  const { league } = useLeague();
  const [passcodeOpen, setPasscodeOpen] = useState(false);

  return (
    <header className="border-border border-b">
      <div className="mx-auto flex max-w-screen-sm items-center justify-between gap-2 px-4 py-3">
        {/* リーグ名は「/」へ向ける。リーグが1つなら即リダイレクトで戻ってくるので
            体験は変わらず、2つ以上になったときに切り替え導線になる。
            ここが base（そのリーグの戦績）を指していると、増えた後に
            URL を手で消すしか切り替える手段が無くなる */}
        <Link to="/" className="font-bold">
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
      <PasscodeDialog open={passcodeOpen} onOpenChange={setPasscodeOpen} />
    </header>
  );
}

/** 下端のバーの高さ。main の padding-bottom と合わせるので1か所で持つ */
const NAV_HEIGHT = "3.5rem";

/**
 * 下バーのリンク。いまいるページを **下線・太字・濃い色** の3つで示す。
 *
 * 文字色と太さだけでは弱い、という差し戻しを受けて下線を足した。
 * 3つとも変えるのは、色だけに頼らない（色覚に依存させない）ため。
 *
 * 非アクティブにも同じ太さの**透明な**下線を引く。付け外しすると
 * リンクの高さが 2px 変わって、切り替えのたびに3項目が上下する。
 *
 * どこがアクティブかは NavLink の前方一致に任せず、呼び出し側が渡す。
 * 「/members/:id では戦績を光らせる」のような規則は前方一致で書けないので、
 * 見た目と `aria-current` の両方を同じ1つの判定から出す（食い違わせない）。
 */
function NavItem({
  to,
  active,
  children,
}: {
  to: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={`shrink-0 border-b-2 ${
        active
          ? "border-foreground text-foreground font-medium"
          : "border-transparent text-muted-foreground"
      }`}
    >
      {children}
    </Link>
  );
}

/**
 * 画面下部に固定するナビ。スマホでは上端より親指が届きやすい。
 *
 * - 下スクロールで隠さない。常に出ている方が単純で、10人が時々使うアプリで
 *   画面を数十 px 広げる価値より、いつでも押せることの方が大きい。
 * - 「登録」だけ性質が違う（他は閲覧、登録は書き込み）ので、同列に並べず
 *   右端のボタンにする。右端は下バーの中でいちばん親指が届く位置でもある。
 * - `pb-[env(safe-area-inset-bottom)]` で iPhone のホームインジケータを避ける。
 *   高さではなく padding に入れているので、バーの背景は画面の下端まで伸びる。
 * - `100vh` / `h-screen` は使わない（iOS Safari でアドレスバーの分ずれる）。
 */
function BottomNav() {
  const { leagueId } = useParams();
  const { pathname } = useLocation();
  const base = `/leagues/${leagueId}`;

  // どの画面でどのタブを光らせるか。「下位ページでは親のタブを光らせる」で統一する。
  //   戦績     : 個人成績も含める。/members/:id への導線は戦績のランキングだけで、
  //              ほかから入る経路が無いので「戦績の下位ページ」と言い切れる
  //   半荘一覧 : 登録・編集は一覧から入って一覧へ戻るので含める
  //   運営メニュー: どのタブの下でもないので、どれも光らない
  const isStandings = pathname === base || pathname.startsWith(`${base}/members/`);
  const isGames = pathname.startsWith(`${base}/games`);
  const isRules = pathname === `${base}/rules`;

  return (
    <nav className="border-border bg-background fixed inset-x-0 bottom-0 z-20 border-t pb-[env(safe-area-inset-bottom)]">
      {/* 3カラムの grid。中央のリンク群を**画面の中央**に置きたいので、
          左右を 1fr にすると中央列が画面の中心に来る（justify-between + mx-auto
          だと、幅が狭いときにリンク群がボタンの下へ潜り込む）。

          実測（下線を入れた後の値）:
            320px（iPhone SE）: 列 57.3 / 157.5 / 57.3、中心のずれ 0、隙間 +5.3px
            300px            : 列 47.3 / 157.5 / 47.3、中心のずれ 0、隙間 -4.7px
                               ＝「ルール」の右端 5px がボタンの下に潜る
          **320px 未満は対象外**とする（iPhone SE の 320 が想定する最小幅）。
          潜っても押せなくはならない（タップの中心はボタンの外）が、
          「ルール」の右端が欠けて見える。ページの横スクロールは出ない。

          中央列の minmax(0, auto) は、極端に狭いときに中の overflow-x-auto を
          効かせるため（auto のままだと縮めずにはみ出す） */}
      <div
        className="mx-auto grid max-w-screen-sm grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-2 px-4"
        style={{ height: NAV_HEIGHT }}
      >
        <span aria-hidden="true" />
        <div className="flex min-w-0 justify-center gap-4 overflow-x-auto text-sm">
          <NavItem to={base} active={isStandings}>
            戦績
          </NavItem>
          <NavItem to={`${base}/games`} active={isGames}>
            半荘一覧
          </NavItem>
          <NavItem to={`${base}/rules`} active={isRules}>
            ルール
          </NavItem>
        </div>
        <div className="flex justify-end">
          <Link
            to={`${base}/games/new`}
            className="bg-primary text-primary-foreground hover:bg-primary/80 shrink-0 rounded-lg px-4 py-2 text-sm font-medium"
          >
            登録
          </Link>
        </div>
      </div>
    </nav>
  );
}

/** :leagueId を読んでデータを1回だけ取得し、配下の画面に配る */
function LeagueLayout({ children }: { children: React.ReactNode }) {
  const { leagueId } = useParams();
  // Number() だと "1e2" や "0x10" を受理してしまう。API 側の parseId と同じく
  // ^\d+$ に揃えて、URL の解釈がフロントとサーバーで食い違わないようにする。
  const id = leagueId !== undefined && /^\d+$/.test(leagueId) ? Number(leagueId) : Number.NaN;
  if (!Number.isSafeInteger(id) || id <= 0) return <Navigate to="/" replace />;

  return (
    <LeagueProvider leagueId={id}>
      <Header />
      {/* 下固定のバーに隠れないよう、バーの高さ + セーフエリア + 余白ぶん空ける。
          これが足りないと、登録画面の「保存」ボタンがバーの裏に入って押せなくなる */}
      <main
        className="mx-auto max-w-screen-sm p-4"
        style={{ paddingBottom: `calc(${NAV_HEIGHT} + 1.5rem + env(safe-area-inset-bottom))` }}
      >
        {children}
      </main>
      <BottomNav />
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
        {/* 運営メニュー。ヘッダのナビには出さない（閲覧専用の10人には不要な導線）。
            URL を知っている運営だけが開く。パスコードは目隠しで、境界ではない
            （理由は AdminPage の冒頭コメント） */}
        <Route
          path="/leagues/:leagueId/admin"
          element={
            <LeagueLayout>
              <AdminPage />
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
