/**
 * 登録シートが開いているか。
 *
 * 見るだけの画面（戦績・半荘一覧・個人成績・ルール）は、これが true の間
 * **自動更新を止める**。シートはそれらの画面の上に開くので、止めないと
 * 下でポーリングが回り続け、裏で誰かが登録した瞬間に再描画が走って
 * 入力中のものを巻き込みうる。
 *
 * 「書き込む画面では自動更新しない」（T21・T22 の線）を、
 * **画面の上に重なる書き込み UI にもそのまま適用する**ためのもの。
 */

import { createContext, use } from "react";

export type NewGameSheet = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

export const NewGameSheetContext = createContext<NewGameSheet>({
  open: false,
  setOpen: () => {},
});

export function useNewGameSheet(): NewGameSheet {
  return use(NewGameSheetContext);
}
