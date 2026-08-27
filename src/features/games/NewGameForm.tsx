/**
 * 半荘の新規登録フォーム。**ページとシートの両方**から使う。
 *
 * - ページ: `/leagues/:leagueId/games/new`（ブックマーク・共有された URL・
 *   戦績の「半荘を登録する」リンクが指している）
 * - シート: 下バーの「登録」から、いまの画面の上に開く
 *
 * 保存に成功したら**半荘一覧へ移す**。ここは両方で同じにする。
 * 留まると「保存できたか分からない」でもう一度押され、同じ半荘が2件入る
 * （`api.ts` は完了後の再送を防げない）。シートを閉じるだけだと、
 * 元の画面（例: ルール）には何の変化も無いので、その理由がそのまま残る。
 */

import { useCallback, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { PasscodeDialog } from "@/components/PasscodeDialog";
import { createGame } from "@/lib/api";
import { describeFailure, useLeague } from "@/lib/league-context";
import type { GameInput } from "@/lib/types";
import { useWriteAction } from "@/lib/use-write-action";
import { GameForm } from "./GameForm";
import { emptyValue, type GameFormValue } from "./game-form-value";

export function NewGameForm() {
  const { league, reload } = useLeague();
  const { leagueId } = useParams();
  const navigate = useNavigate();
  const [value, setValue] = useState<GameFormValue>(emptyValue);

  const action = useCallback(
    (input: GameInput, passcode: string) => createGame(league.id, input, passcode),
    [league.id],
  );
  const onSuccess = useCallback(() => {
    reload();
    // replace で移すと、シートを開いたときに積んだ履歴が置き換わる。
    // シートの開閉は location.state から導いているので、これだけで閉じる
    // （閉じる処理を別に呼ぶと navigate(-1) と競合する）。
    void navigate(`/leagues/${leagueId}/games`, { replace: true });
  }, [navigate, leagueId, reload]);

  const write = useWriteAction(action, onSuccess);

  return (
    <>
      <GameForm
        value={value}
        onChange={setValue}
        onSubmit={write.run}
        submitLabel="保存"
        pending={write.pending}
        serverErrors={write.failure?.kind === "validation" ? write.failure.errors : undefined}
        extraMessage={
          write.failure !== null && write.failure.kind !== "validation"
            ? describeFailure(write.failure)
            : null
        }
      />
      {/*
        パスコードダイアログ。シートの中から開くので、**シートより上に来ること**を
        実測で確認している（ダイアログ z-50 / シート z-50 で、あとから開いた方が上）。
      */}
      <PasscodeDialog
        open={write.passcodeOpen}
        onOpenChange={write.setPasscodeOpen}
        onSaved={write.onPasscodeSaved}
        message={write.passcodeMessage}
      />
    </>
  );
}
