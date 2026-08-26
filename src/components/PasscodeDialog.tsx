/**
 * 書き込みパスコードの入力ダイアログ。
 *
 * 導線は2つ。
 * - 書き込み操作の直前に未設定なら出す（初回の導線）
 * - ヘッダの「パスコード」からいつでも変更・消去できる（運用でパスコードを変えたとき、
 *   共有端末や端末譲渡のときに必要。直前ダイアログだけだと 401 を踏むまで
 *   入れ直せない）
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { clearPasscode, loadPasscode, savePasscode } from "@/lib/passcode";

export function PasscodeDialog({
  open,
  onOpenChange,
  onSaved,
  message,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 保存後に呼ばれる。書き込み直前に開いた場合はここで続きを実行する */
  onSaved?: (passcode: string) => void;
  /** 401 のあとなど、開いた理由を伝えたいとき */
  message?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* open のときだけマウントすることで、保存済みの値を初期値として読める
            （エフェクトで setState し直す必要がない） */}
        {open ? (
          <PasscodeForm onOpenChange={onOpenChange} onSaved={onSaved} message={message} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PasscodeForm({
  onOpenChange,
  onSaved,
  message,
}: {
  onOpenChange: (open: boolean) => void;
  onSaved?: (passcode: string) => void;
  message?: string;
}) {
  const [value, setValue] = useState(() => loadPasscode() ?? "");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const passcode = value.trim();
    if (passcode.length === 0) return;
    savePasscode(passcode);
    onOpenChange(false);
    onSaved?.(passcode);
  };

  return (
    <form onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>書き込みパスコード</DialogTitle>
        <DialogDescription>
          {message ?? "半荘の登録・修正にはパスコードが必要です。運営に確認してください。"}
        </DialogDescription>
      </DialogHeader>

      <Input
        // パスコードなので伏せ字にし、ブラウザの自動補完も切る
        type="password"
        autoComplete="off"
        className="mt-4"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="パスコード"
        aria-label="書き込みパスコード"
      />

      <DialogFooter className="mt-4">
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            clearPasscode();
            setValue("");
          }}
        >
          保存済みを消す
        </Button>
        <Button type="submit" disabled={value.trim().length === 0}>
          保存
        </Button>
      </DialogFooter>
    </form>
  );
}
