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
  /** 予約（素点未入力）では rawScore が null */
  results: { memberId: number; rawScore: number | null }[];
}): GameFormValue => ({
  playedOn: game.playedOn,
  memo: game.memo ?? "",
  // 一覧は順位順に出るので、編集画面も素点降順に揃える。
  // GET は member_id 順で返すため、そのまま並べると開いた瞬間に順番が変わって見える
  rows: [...game.results]
    // 予約（素点が null）は並べ替えようがないので memberId 順のまま
    .sort((a, b) => (b.rawScore ?? 0) - (a.rawScore ?? 0) || a.memberId - b.memberId)
    .map((r) => ({
      memberId: r.memberId,
      rawScore: r.rawScore === null ? "" : String(Math.abs(r.rawScore)),
      negative: r.rawScore !== null && r.rawScore < 0,
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
      // 空欄は null（予約）として渡す。全部空なら予約、全部数値なら確定、
      // 混在は validateGameInput が MIXED_SCORES で弾く
      rawScore: row.rawScore.trim() === "" ? null : (row.negative ? -1 : 1) * Number(row.rawScore),
    })),
  };
}

/** 4人そろっていて素点が1つも入っていない = 予約として登録できる状態 */
export function isReservationInput(value: GameFormValue): boolean {
  return (
    value.rows.length === 4 &&
    value.rows.every((row) => row.memberId > 0 && row.rawScore.trim() === "")
  );
}

/** 素点が一部だけ入っている = 予約でも確定でもない */
export function hasPartialScores(value: GameFormValue): boolean {
  const filled = value.rows.filter((row) => row.rawScore.trim() !== "").length;
  return filled > 0 && filled < value.rows.length;
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
