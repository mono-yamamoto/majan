import { useCallback, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { PasscodeDialog } from "@/components/PasscodeDialog";
import { createGame } from "@/lib/api";
import { describeFailure, useLeague } from "@/lib/league-context";
import type { GameInput } from "@/lib/types";
import { useWriteAction } from "@/lib/use-write-action";
import { GameForm } from "./GameForm";
import { emptyValue, type GameFormValue } from "./game-form-value";

export function NewGamePage() {
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
    // 成功したら即遷移する。留まると「保存できたか分からない」で
    // もう一度押され、同じ半荘が2件入る（api.ts は完了後の再送を防げない）
    void navigate(`/leagues/${leagueId}/games`, { replace: true });
  }, [navigate, leagueId, reload]);

  const write = useWriteAction(action, onSuccess);

  return (
    <section>
      <h2 className="text-xl font-bold">半荘登録</h2>
      <div className="mt-4">
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
      </div>
      <PasscodeDialog
        open={write.passcodeOpen}
        onOpenChange={write.setPasscodeOpen}
        onSaved={write.onPasscodeSaved}
        message={write.passcodeMessage}
      />
    </section>
  );
}
