/**
 * D1 の各テーブル行に対応する手書き型（決定#15: 型生成ツールは使わない）。
 *
 * 正典は `migrations/0001_init.sql`。カラム名・型・NULL 許容をそこに合わせる。
 * 行の型はカラム名そのまま（snake_case）、アプリ内で扱う型は camelCase に分ける。
 */

import type { LeagueRule } from "./scoring";

// ---------------------------------------------------------------------------
// テーブル行
// ---------------------------------------------------------------------------

export type LeagueRow = {
  id: number;
  name: string;
  start_point: number;
  return_point: number;
  uma_1st: number;
  uma_2nd: number;
  uma_3rd: number;
  uma_4th: number;
  /** ISO8601 UTC */
  created_at: string;
};

export type MemberRow = {
  id: number;
  name: string;
};

export type TeamRow = {
  id: number;
  league_id: number;
  name: string;
};

export type LeagueMemberRow = {
  league_id: number;
  member_id: number;
  team_id: number;
};

export type GameRow = {
  id: number;
  league_id: number;
  /** YYYY-MM-DD */
  played_on: string;
  memo: string | null;
  /** ISO8601 UTC */
  created_at: string;
  /** 論理削除。未削除なら NULL */
  deleted_at: string | null;
};

export type GameResultRow = {
  id: number;
  game_id: number;
  member_id: number;
  /**
   * 素点。100 の倍数、負数可（箱下）。
   * 予約（次の対局を先に登録した状態）では NULL。4行そろって NULL か、
   * 4行そろって NOT NULL のどちらかで、混在は API が弾く。
   */
  raw_score: number | null;
};

// ---------------------------------------------------------------------------
// アプリ内で扱う型
// ---------------------------------------------------------------------------

/**
 * 半荘の登録・修正で受け取る入力。
 *
 * `leagueId` を**あえて含めていない**。PATCH は全置換（D-2）だが、リーグは
 * 保存済みの `games` 行から読むべきもので、リクエスト由来の値を使うと
 * 所属チェックが自己申告になって意味を失う。リーグを型から外しておくと
 * バリデーション層に混入しない。
 */
export type GameInput = {
  /** YYYY-MM-DD */
  playedOn: string;
  memo: string | null;
  /** 素点は全部入れる（確定）か全部 null（予約）かのどちらか。混在は弾かれる */
  results: { memberId: number; rawScore: number | null }[];
};

/**
 * `leagues` の行を `scoreGame` / `validateGameInput` が使う形に直す。
 *
 * ウマは順位順の配列にするので、手で書くと並び順を取り違えても型では気づけない
 * （逆順に入れても Σuma = 0 のままなのでゼロサム検査も素通りする）。
 * 変換を1か所に閉じ込めて、フロントと API で同じものを使う。
 */
export function toLeagueRule(row: LeagueRow): LeagueRule {
  return {
    startPoint: row.start_point,
    returnPoint: row.return_point,
    uma: [row.uma_1st, row.uma_2nd, row.uma_3rd, row.uma_4th],
  };
}
