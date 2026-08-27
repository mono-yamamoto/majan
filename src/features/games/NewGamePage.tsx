/**
 * 半荘登録のページ。`/leagues/:leagueId/games/new`。
 *
 * 下バーの「登録」はシートを開くようになったが、このルートは残してある。
 * ブックマーク・共有された URL・戦績の「半荘を登録する」リンクが指しているので、
 * 消すとそれらが全部切れる。中身はシートと同じ NewGameForm。
 */

import { NewGameForm } from "./NewGameForm";

export function NewGamePage() {
  return (
    <section>
      <h2 className="text-xl font-bold">半荘登録</h2>
      <div className="mt-4">
        <NewGameForm />
      </div>
    </section>
  );
}
