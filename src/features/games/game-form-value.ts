/**
 * 半荘フォームの値と、GameInput への変換。
 *
 * コンポーネントと同じファイルに置くと Fast Refresh の境界を汚すので分けている。
 */

import { todayLocal } from "@/lib/today";
import type { GameInput } from "@/lib/types";

export type GameFormValue = {
  playedOn: string;
  memo: string;
  /** 4人ぶん。未選択は memberId = 0、未入力は rawScore = "" */
  rows: { memberId: number; rawScore: string }[];
};

export const emptyValue = (): GameFormValue => ({
  playedOn: todayLocal(),
  memo: "",
  rows: [0, 0, 0, 0].map((memberId) => ({ memberId, rawScore: "" })),
});

export const valueFromGame = (game: {
  playedOn: string;
  memo: string | null;
  results: { memberId: number; rawScore: number }[];
}): GameFormValue => ({
  playedOn: game.playedOn,
  memo: game.memo ?? "",
  rows: game.results.map((r) => ({ memberId: r.memberId, rawScore: String(r.rawScore) })),
});

/**
 * 入力欄の文字列を GameInput に直す。
 * 未入力や数値でないものは NaN のまま渡す（validateGameInput が
 * RAW_SCORE_RANGE / RAW_SCORE_UNIT として理由つきで弾く）。
 */
export function toGameInput(value: GameFormValue): GameInput {
  return {
    playedOn: value.playedOn,
    memo: value.memo.trim() === "" ? null : value.memo,
    results: value.rows.map((row) => ({
      memberId: row.memberId,
      rawScore: row.rawScore.trim() === "" ? Number.NaN : Number(row.rawScore),
    })),
  };
}
