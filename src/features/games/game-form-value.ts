/**
 * 半荘フォームの値と、GameInput への変換。
 *
 * コンポーネントと同じファイルに置くと Fast Refresh の境界を汚すので分けている。
 */

import { todayLocal } from "@/lib/today";
import type { GameInput } from "@/lib/types";

export type GameFormRow = {
  memberId: number;
  /** 入力欄の文字列。符号は持たない（negative で表す） */
  rawScore: string;
  /**
   * 箱下かどうか。符号を文字列から分けているのは、入力欄を
   * inputMode="numeric"（テンキー）にするため。テンキーでは「−」が打てない端末が多い。
   */
  negative: boolean;
};

export type GameFormValue = {
  playedOn: string;
  memo: string;
  /** 4人ぶん。未選択は memberId = 0、未入力は rawScore = "" */
  rows: GameFormRow[];
};

export const emptyValue = (): GameFormValue => ({
  playedOn: todayLocal(),
  memo: "",
  rows: [0, 0, 0, 0].map((memberId) => ({ memberId, rawScore: "", negative: false })),
});

export const valueFromGame = (game: {
  playedOn: string;
  memo: string | null;
  results: { memberId: number; rawScore: number }[];
}): GameFormValue => ({
  playedOn: game.playedOn,
  memo: game.memo ?? "",
  // 一覧は順位順に出るので、編集画面も素点降順に揃える。
  // GET は member_id 順で返すため、そのまま並べると開いた瞬間に順番が変わって見える
  rows: [...game.results]
    .sort((a, b) => b.rawScore - a.rawScore || a.memberId - b.memberId)
    .map((r) => ({
      memberId: r.memberId,
      rawScore: String(Math.abs(r.rawScore)),
      negative: r.rawScore < 0,
    })),
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
      rawScore:
        row.rawScore.trim() === "" ? Number.NaN : (row.negative ? -1 : 1) * Number(row.rawScore),
    })),
  };
}

/**
 * 行を更新する。**メンバーを変えたとき／素点を空にしたときは符号をリセットする。**
 *
 * 符号を入力欄と別に持っているので、リセットしないと前の行の「−」が残る。
 * 別のメンバーに打ち直して正の数を入れたのに負数として扱われ、
 * 他の行で合計が合ってしまうと**符号違いのまま保存できてしまう**。
 * プレビューには出るが、メンバーを変えた直後に符号が残っているとは思わない。
 *
 * ± ボタン自体（patch.negative が明示されている場合）は当然そのまま通す。
 */
export function updateRow(row: GameFormRow, patch: Partial<GameFormRow>): GameFormRow {
  const next = { ...row, ...patch };
  if (patch.negative !== undefined) return next;

  const memberChanged = patch.memberId !== undefined && patch.memberId !== row.memberId;
  const cleared = next.rawScore.trim() === "";
  if (memberChanged || cleared) next.negative = false;
  return next;
}
