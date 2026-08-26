/**
 * 書き込み操作の状態機械を1箇所にまとめる。
 *
 * 登録・編集・削除の3画面が同じ手順を踏むので、各画面で書くと3箇所に散る:
 *   1. パスコード未設定なら入力させる
 *   2. 実行中はボタンを無効化する（二重送信の防止。api.ts の in-flight 束ねは
 *      「同時に飛んだ同一リクエスト」しか防げず、完了後の再送は防げない）
 *   3. 401 なら保存済みのパスコードを消して、入れ直してもらってから再実行する
 *      （消さないと古い値で再送してまた 401 になるループ）
 *   4. 500（server misconfigured）ではパスコードを消さない。入力係が入れた値は
 *      正しいかもしれず、復旧後にもう一度入力させることになる
 *   5. 成功したら呼び出し側へ渡す（画面はそこで遷移する）
 */

import { useCallback, useState } from "react";
import type { ApiFailure, ApiResult } from "./api";
import { clearPasscode, loadPasscode } from "./passcode";

export type WriteAction<A> = {
  /**
   * 実行する。パスコードが無ければダイアログが開き、保存後に自動で続きが走る。
   * 送る内容は引数で渡す（state 経由にすると run が1つ前の値を掴む）。
   */
  run: (arg: A) => void;
  /** 実行中。ボタンの disabled に使う */
  pending: boolean;
  /** 直近の失敗。業務ルール違反はここから errors を取り出す */
  failure: ApiFailure | null;
  /** パスコードダイアログを開くか */
  passcodeOpen: boolean;
  setPasscodeOpen: (open: boolean) => void;
  /** ダイアログに出す理由（401 のあとなど） */
  passcodeMessage: string | undefined;
  /** ダイアログの保存後に呼ぶ。保留していた実行を再開する */
  onPasscodeSaved: (passcode: string) => void;
};

export function useWriteAction<A, T>(
  action: (arg: A, passcode: string) => Promise<ApiResult<T>>,
  onSuccess: (data: T) => void,
): WriteAction<A> {
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [passcodeOpen, setPasscodeOpen] = useState(false);
  const [passcodeMessage, setPasscodeMessage] = useState<string | undefined>(undefined);
  // パスコード入力のあいだ保留しておく引数
  const [pendingArg, setPendingArg] = useState<A | null>(null);

  const execute = useCallback(
    async (arg: A, passcode: string) => {
      setPending(true);
      setFailure(null);
      const result = await action(arg, passcode);

      if (result.ok) {
        // pending は戻さない。成功したら画面が遷移するので、その間に
        // もう一度押せてしまうと二重登録になる
        onSuccess(result.data);
        return;
      }

      setPending(false);
      if (result.kind === "unauthorized") {
        clearPasscode();
        setPasscodeMessage("パスコードが違います。もう一度入力してください。");
        setPasscodeOpen(true);
        return;
      }
      setFailure(result);
    },
    [action, onSuccess],
  );

  const run = useCallback(
    (arg: A) => {
      if (pending) return;
      const passcode = loadPasscode();
      if (passcode === null) {
        setPendingArg(arg);
        setPasscodeMessage(undefined);
        setPasscodeOpen(true);
        return;
      }
      setPendingArg(arg);
      void execute(arg, passcode);
    },
    [pending, execute],
  );

  const onPasscodeSaved = useCallback(
    (passcode: string) => {
      if (pendingArg === null) return;
      void execute(pendingArg, passcode);
    },
    [execute, pendingArg],
  );

  return {
    run,
    pending,
    failure,
    passcodeOpen,
    setPasscodeOpen,
    passcodeMessage,
    onPasscodeSaved,
  };
}
