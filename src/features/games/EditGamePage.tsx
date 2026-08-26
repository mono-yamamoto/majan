import { useCallback, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { PasscodeDialog } from "@/components/PasscodeDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteGame, updateGame } from "@/lib/api";
import { isScorable } from "@/lib/stats";
import { describeFailure, useLeague } from "@/lib/league-context";
import type { GameInput } from "@/lib/types";
import { useWriteAction } from "@/lib/use-write-action";
import { GameForm } from "./GameForm";
import { valueFromGame, type GameFormValue } from "./game-form-value";

export function EditGamePage() {
  const { games, league, reload } = useLeague();
  const { leagueId, gameId } = useParams();
  const navigate = useNavigate();

  // URL 直打ちで削除済み・存在しない半荘を開く経路がある。
  // GET は削除済みを除外して返すので、ここに無ければ「見つからない」。
  const id = gameId !== undefined && /^\d+$/.test(gameId) ? Number(gameId) : Number.NaN;
  const game = games.find((g) => g.id === id);

  const [value, setValue] = useState<GameFormValue | null>(
    game === undefined ? null : valueFromGame(game),
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  // 確定 → 予約に戻す操作は入力済みの素点を失う。削除と同じく確認を挟む。
  // 「予約 → 確定」は不可逆ではないが、「確定 → 予約」は入力した素点が消えて
  // 復元は入力し直しになる。削除に確認があってこちらに無いのは説明できない。
  const [revertInput, setRevertInput] = useState<GameInput | null>(null);

  const listPath = `/leagues/${leagueId}/games`;

  const updateAction = useCallback(
    (input: GameInput, passcode: string) => updateGame(id, input, passcode),
    [id],
  );
  const deleteAction = useCallback((_: null, passcode: string) => deleteGame(id, passcode), [id]);
  const backToList = useCallback(() => {
    reload();
    void navigate(listPath, { replace: true });
  }, [navigate, listPath, reload]);

  const write = useWriteAction(updateAction, backToList);
  const remove = useWriteAction(deleteAction, backToList);

  const rule = { startPoint: league.startPoint, returnPoint: league.returnPoint, uma: league.uma };
  /** 読み込み時に確定していた半荘を、予約（素点が全部空）に戻そうとしているか */
  const isRevertingToReservation = (input: GameInput) =>
    game !== undefined && isScorable(game, rule) && input.results.every((r) => r.rawScore === null);

  if (game === undefined || value === null) {
    return (
      <section>
        <h2 className="text-xl font-bold">半荘が見つかりません</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          削除された可能性があります。復元は運営に連絡してください。
        </p>
        <Link to={listPath} className="mt-4 inline-block text-sm underline">
          半荘一覧へ
        </Link>
      </section>
    );
  }

  const active = write.pending || remove.pending;

  return (
    <section>
      <h2 className="text-xl font-bold">半荘を編集</h2>
      <div className="mt-4">
        <GameForm
          value={value}
          onChange={setValue}
          onSubmit={(input) => {
            if (isRevertingToReservation(input)) {
              setRevertInput(input);
              return;
            }
            write.run(input);
          }}
          submitLabel="更新"
          pending={active}
          serverErrors={write.failure?.kind === "validation" ? write.failure.errors : undefined}
          extraMessage={
            write.failure !== null && write.failure.kind !== "validation"
              ? describeFailure(write.failure)
              : remove.failure !== null
                ? describeFailure(remove.failure)
                : null
          }
        />
      </div>

      <Button
        type="button"
        variant="destructive"
        className="mt-4 w-full"
        disabled={active}
        onClick={() => setConfirmOpen(true)}
      >
        この半荘を削除
      </Button>

      <Dialog open={revertInput !== null} onOpenChange={(open) => !open && setRevertInput(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>入力済みの素点を消しますか</DialogTitle>
            <DialogDescription>
              この半荘を「予定」に戻します。入力済みの素点は消え、pt・順位も戦績から外れます。
              戻すには素点を入力し直す必要があります。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button type="button" variant="ghost" onClick={() => setRevertInput(null)}>
              やめる
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={active}
              onClick={() => {
                const input = revertInput;
                setRevertInput(null);
                if (input !== null) write.run(input);
              }}
            >
              予定に戻す
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>この半荘を削除しますか</DialogTitle>
            <DialogDescription>
              {game.playedOn}{" "}
              の半荘を削除します。アプリからは元に戻せません（復元は運営のSQL操作）。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button type="button" variant="ghost" onClick={() => setConfirmOpen(false)}>
              やめる
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={active}
              onClick={() => {
                setConfirmOpen(false);
                remove.run(null);
              }}
            >
              削除する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PasscodeDialog
        open={write.passcodeOpen}
        onOpenChange={write.setPasscodeOpen}
        onSaved={write.onPasscodeSaved}
        message={write.passcodeMessage}
      />
      <PasscodeDialog
        open={remove.passcodeOpen}
        onOpenChange={remove.setPasscodeOpen}
        onSaved={remove.onPasscodeSaved}
        message={remove.passcodeMessage}
      />
    </section>
  );
}
