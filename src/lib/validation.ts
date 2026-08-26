/**
 * 半荘の入力バリデーション。
 *
 * 仕様: `Guidebook/src/content/docs/spec/features.mdx` の「バリデーション」表。
 * DB にも HTTP にも依存しない純粋関数として書き、フロント（入力体験のため）と
 * Hono API（データ整合性のため）の両方から呼ぶ。
 */

import type { LeagueRule } from "./scoring";
import type { GameInput } from "./types";

/**
 * memberId → teamId。フロントは GET /api/leagues/:id のレスポンスから、
 * API は `SELECT member_id, team_id FROM league_members WHERE league_id = ?1` の
 * 1クエリから組む（メンバーごとに引かない）。
 *
 * league_id でスコープ済みのものを渡すこと。スコープしていない名簿を渡すと
 * 別リーグのメンバーが所属チェックを通ってしまう。
 */
export type Roster = Map<number, number>;

export type ValidationErrorCode =
  /** 4人ぶんでない */
  | "RESULT_COUNT"
  /** 同じメンバーが複数回 */
  | "DUPLICATE_MEMBER"
  /** そのリーグに所属していないメンバーがいる */
  | "NOT_IN_LEAGUE"
  /** 各チーム2人ずつになっていない */
  | "TEAM_BALANCE"
  /** 素点合計が startPoint x 4 でない */
  | "RAW_SCORE_TOTAL"
  /** 素点が100の倍数でない */
  | "RAW_SCORE_UNIT"
  /** played_on が YYYY-MM-DD の実在日付でない */
  | "INVALID_DATE";

export type ValidationError = {
  /** 機械可読なコード。UI はこれでメッセージを差し替えられる */
  code: ValidationErrorCode;
  /** どの入力項目の問題か。UI のハイライト先 */
  field: "playedOn" | "results";
  /**
   * 問題のあるメンバー。項目全体の問題（合計・件数など）なら空配列。
   * 名前は持たない（UI 側が memberId から解決する）。
   */
  memberIds: number[];
  /** そのまま画面に出せる日本語 */
  message: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const isLeapYear = (year: number): boolean =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/**
 * `YYYY-MM-DD` の実在日付か。
 *
 * `migrations/0001_init.sql` の `games.played_on` の CHECK と**同じ判定**になること。
 * 食い違うと「フロントで通ったのに DB で落ちる」（またはその逆）が起きる。
 *
 * `Date` はあえて使わない。実測したところ素朴な `new Date(v)` は SQL と食い違う:
 *   '2026-02-30' → 3/2 に繰り上がって valid 扱い
 *   '2025-02-29' → 3/1 に繰り上がって valid 扱い
 *   '2026-8-6' / '2026/08/26' / '2026-08-26 ' → レガシーパーサが受理（しかもローカル時刻）
 *   Date.UTC(0, 0, 1) は年0を1900年に読み替えるので '0000-01-01' も扱えない
 * 文字列の形と暦の計算だけで判定すればタイムゾーンにも依存しない。
 */
export function isValidPlayedOn(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));

  if (month < 1 || month > 12) return false;
  const limit = month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
  return day >= 1 && day <= limit;
}

/**
 * 半荘の入力を検証し、**見つかったエラーを全部**返す（最初の1件で打ち切らない）。
 * 問題がなければ空配列。
 *
 * 返る順序は features.mdx のバリデーション表の順（件数 → 重複 → 所属 → 2-2 →
 * 合計 → 単位 → 日付）で固定する。
 *
 * ★原因帰属の設計★
 * 「2-2 固定」は、件数が4人で・重複がなく・4人とも名簿から引けたときだけ判定する。
 * たとえば未所属のメンバーを teamId 不明のまま数えると 2-2 が崩れ、
 * 「各チーム2人ずつにしてください」という**本当の原因を隠すエラー**が出る。
 * 入力係は 2-2 にしているつもりなので詰まってしまう。
 * 同様に、重複があるとチーム構成自体が定義できない（A,A,B,C は 2-2 に見える）。
 * 抑制するのは 2-2 の判定だけで、件数・重複・所属のエラーはそれぞれ独立に返す。
 *
 * 「素点合計」も4人ぶんそろっていないと意味を持たないので、件数が違うときは見ない。
 */
export function validateGameInput(
  input: GameInput,
  rule: LeagueRule,
  roster: Roster,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const results = input.results;

  // scoreGame と同じ根拠（ウマの要素数）で人数を決め、両者がずれないようにする
  const playersPerGame = rule.uma.length;

  // 1. 件数
  const hasExactCount = results.length === playersPerGame;
  if (!hasExactCount) {
    errors.push({
      code: "RESULT_COUNT",
      field: "results",
      memberIds: [],
      message: `${playersPerGame}人ぶんの結果を入力してください（現在 ${results.length}人）`,
    });
  }

  // 2. メンバー重複なし
  const seen = new Set<number>();
  const duplicated = new Set<number>();
  for (const r of results) {
    if (seen.has(r.memberId)) duplicated.add(r.memberId);
    seen.add(r.memberId);
  }
  const hasDuplicate = duplicated.size > 0;
  if (hasDuplicate) {
    errors.push({
      code: "DUPLICATE_MEMBER",
      field: "results",
      memberIds: [...duplicated],
      message: "同じメンバーが複数回選ばれています",
    });
  }

  // 3. リーグ所属
  const notInLeague = results.filter((r) => !roster.has(r.memberId)).map((r) => r.memberId);
  const hasUnknownMember = notInLeague.length > 0;
  if (hasUnknownMember) {
    errors.push({
      code: "NOT_IN_LEAGUE",
      field: "results",
      memberIds: [...new Set(notInLeague)],
      message: "このリーグに所属していないメンバーが含まれています",
    });
  }

  // 4. 2-2固定（件数・重複・所属がそろって初めて意味を持つ）
  if (hasExactCount && !hasDuplicate && !hasUnknownMember) {
    const perTeam = new Map<number, number>();
    for (const r of results) {
      const teamId = roster.get(r.memberId) as number;
      perTeam.set(teamId, (perTeam.get(teamId) ?? 0) + 1);
    }
    const balanced = perTeam.size === 2 && [...perTeam.values()].every((n) => n === 2);
    if (!balanced) {
      errors.push({
        code: "TEAM_BALANCE",
        field: "results",
        memberIds: results.map((r) => r.memberId),
        message: "各チームからちょうど2人ずつ選んでください",
      });
    }
  }

  // 5. 素点合計（4人ぶんそろっていないと意味がない）
  if (hasExactCount) {
    const expected = rule.startPoint * playersPerGame;
    const actual = results.reduce((sum, r) => sum + r.rawScore, 0);
    if (actual !== expected) {
      errors.push({
        code: "RAW_SCORE_TOTAL",
        field: "results",
        memberIds: [],
        message: `素点の合計が ${expected} になっていません（現在 ${actual}）`,
      });
    }
  }

  // 6. 素点の単位（7. 箱下は負数を弾かないことで満たす）
  const badUnit = results
    .filter((r) => !Number.isFinite(r.rawScore) || r.rawScore % 100 !== 0)
    .map((r) => r.memberId);
  if (badUnit.length > 0) {
    errors.push({
      code: "RAW_SCORE_UNIT",
      field: "results",
      memberIds: [...new Set(badUnit)],
      message: "素点は100点単位で入力してください",
    });
  }

  // 8. 日付
  if (!isValidPlayedOn(input.playedOn)) {
    errors.push({
      code: "INVALID_DATE",
      field: "playedOn",
      memberIds: [],
      message: "日付は YYYY-MM-DD 形式の実在する日付で入力してください",
    });
  }

  return errors;
}
