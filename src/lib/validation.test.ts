import { describe, expect, it } from "vite-plus/test";
import type { LeagueRule } from "./scoring";
import type { GameInput } from "./types";
import {
  isValidPlayedOn,
  validateGameInput,
  type Roster,
  type ValidationErrorCode,
} from "./validation";

const RULE: LeagueRule = {
  startPoint: 25000,
  returnPoint: 30000,
  uma: [30, 10, -10, -30],
};

/** チームA = 1..5（team 1）/ チームB = 6..10（team 2）。db/seed.sql と同じ構成 */
const ROSTER: Roster = new Map([
  [1, 1],
  [2, 1],
  [3, 1],
  [4, 1],
  [5, 1],
  [6, 2],
  [7, 2],
  [8, 2],
  [9, 2],
  [10, 2],
]);

/** 素点合計がちょうど 25000 x 4 になる 2-2 の正常入力 */
const validInput = (): GameInput => ({
  playedOn: "2026-08-26",
  memo: null,
  results: [
    { memberId: 1, rawScore: 42300 },
    { memberId: 6, rawScore: 28100 },
    { memberId: 2, rawScore: 18400 },
    { memberId: 7, rawScore: 11200 },
  ],
});

const codesOf = (errors: { code: ValidationErrorCode }[]): ValidationErrorCode[] =>
  errors.map((e) => e.code);

const find = (errors: ReturnType<typeof validateGameInput>, code: ValidationErrorCode) =>
  errors.find((e) => e.code === code);

describe("validateGameInput / 正常系", () => {
  it("正しい入力ならエラーなし", () => {
    expect(validateGameInput(validInput(), RULE, ROSTER)).toEqual([]);
  });

  it("入力を破壊しない（純粋関数）", () => {
    const input = validInput();
    const snapshot = structuredClone(input);
    validateGameInput(input, RULE, ROSTER);
    expect(input).toEqual(snapshot);
  });

  it("箱下（負の素点）は弾かない", () => {
    const input: GameInput = {
      playedOn: "2026-08-26",
      memo: null,
      results: [
        { memberId: 1, rawScore: 60000 },
        { memberId: 6, rawScore: 40000 },
        { memberId: 2, rawScore: 10000 },
        { memberId: 7, rawScore: -10000 },
      ],
    };
    expect(validateGameInput(input, RULE, ROSTER)).toEqual([]);
  });
});

describe("validateGameInput / 1. 件数", () => {
  it.each([
    ["0件", []],
    ["3件", [1, 6, 2]],
    ["5件", [1, 6, 2, 7, 3]],
  ])("%s なら RESULT_COUNT", (_label, memberIds) => {
    const input: GameInput = {
      playedOn: "2026-08-26",
      memo: null,
      results: (memberIds as number[]).map((memberId) => ({ memberId, rawScore: 25000 })),
    };
    expect(codesOf(validateGameInput(input, RULE, ROSTER))).toContain("RESULT_COUNT");
  });

  it("件数が違うときは 2-2 と素点合計を判定しない（4人前提の検査のため）", () => {
    const input: GameInput = {
      playedOn: "2026-08-26",
      memo: null,
      results: [
        { memberId: 1, rawScore: 25000 },
        { memberId: 2, rawScore: 25000 },
        { memberId: 3, rawScore: 25000 },
      ],
    };
    const codes = codesOf(validateGameInput(input, RULE, ROSTER));
    expect(codes).toEqual(["RESULT_COUNT"]);
    expect(codes).not.toContain("TEAM_BALANCE");
    expect(codes).not.toContain("RAW_SCORE_TOTAL");
  });
});

describe("validateGameInput / 2 と 4 は独立に必要", () => {
  /**
   * ★重複チェックを 2-2 で代用できないことの証明★
   * A(team1), A(team1), B(team2), C(team2) は team1:2 / team2:2 で 2-2 を通過し、
   * 件数も4件なので、重複チェックが独立してあって初めて弾ける。
   */
  it("重複していても 2-2 が成立してしまうケースを DUPLICATE_MEMBER で弾く", () => {
    const input: GameInput = {
      playedOn: "2026-08-26",
      memo: null,
      results: [
        { memberId: 1, rawScore: 30000 }, // team 1
        { memberId: 1, rawScore: 30000 }, // team 1（重複）
        { memberId: 6, rawScore: 20000 }, // team 2
        { memberId: 7, rawScore: 20000 }, // team 2
      ],
    };
    const errors = validateGameInput(input, RULE, ROSTER);
    expect(codesOf(errors)).toContain("DUPLICATE_MEMBER");
    expect(find(errors, "DUPLICATE_MEMBER")?.memberIds).toEqual([1]);
    // チーム数だけ見れば 2-2 なので、TEAM_BALANCE では捕まらない
    expect(codesOf(errors)).not.toContain("TEAM_BALANCE");
  });

  /** 逆方向: 2-2 判定を重複チェックで代用することもできない */
  it("重複がなくても 2-2 でなければ TEAM_BALANCE で弾く", () => {
    const input: GameInput = {
      playedOn: "2026-08-26",
      memo: null,
      results: [
        { memberId: 1, rawScore: 30000 }, // team 1
        { memberId: 2, rawScore: 30000 }, // team 1
        { memberId: 3, rawScore: 20000 }, // team 1
        { memberId: 6, rawScore: 20000 }, // team 2
      ],
    };
    const errors = validateGameInput(input, RULE, ROSTER);
    expect(codesOf(errors)).toContain("TEAM_BALANCE");
    expect(codesOf(errors)).not.toContain("DUPLICATE_MEMBER");
  });

  it("4人が同じチームでも弾く", () => {
    const input: GameInput = {
      playedOn: "2026-08-26",
      memo: null,
      results: [1, 2, 3, 4].map((memberId) => ({ memberId, rawScore: 25000 })),
    };
    expect(codesOf(validateGameInput(input, RULE, ROSTER))).toContain("TEAM_BALANCE");
  });

  it("3チームにまたがる場合も弾く（2チーム x 2人ちょうどでない）", () => {
    const roster: Roster = new Map([...ROSTER, [11, 3]]);
    const input: GameInput = {
      playedOn: "2026-08-26",
      memo: null,
      results: [
        { memberId: 1, rawScore: 25000 }, // team 1
        { memberId: 2, rawScore: 25000 }, // team 1
        { memberId: 6, rawScore: 25000 }, // team 2
        { memberId: 11, rawScore: 25000 }, // team 3
      ],
    };
    expect(codesOf(validateGameInput(input, RULE, roster))).toContain("TEAM_BALANCE");
  });
});

describe("validateGameInput / 3. リーグ所属と、エラーの原因帰属", () => {
  it("名簿から引けないメンバーは NOT_IN_LEAGUE で、誰かを特定できる", () => {
    const input: GameInput = {
      playedOn: "2026-08-26",
      memo: null,
      results: [
        { memberId: 1, rawScore: 25000 },
        { memberId: 2, rawScore: 25000 },
        { memberId: 6, rawScore: 25000 },
        { memberId: 99, rawScore: 25000 }, // 未所属
      ],
    };
    const errors = validateGameInput(input, RULE, ROSTER);
    expect(codesOf(errors)).toContain("NOT_IN_LEAGUE");
    expect(find(errors, "NOT_IN_LEAGUE")?.memberIds).toEqual([99]);
  });

  /**
   * ★原因帰属★
   * 未所属メンバーを teamId 不明のまま数えると team1:2 / team2:1 / undefined:1 となり
   * 2-2 が崩れて「各チーム2人ずつにしてください」が出る。本当の原因が隠れるので、
   * 所属が確認できない人がいるときは 2-2 を判定しない。
   */
  it("未所属メンバーがいるとき TEAM_BALANCE を出さない（本当の原因を隠さない）", () => {
    const input: GameInput = {
      playedOn: "2026-08-26",
      memo: null,
      results: [
        { memberId: 1, rawScore: 25000 }, // team 1
        { memberId: 2, rawScore: 25000 }, // team 1
        { memberId: 6, rawScore: 25000 }, // team 2
        { memberId: 99, rawScore: 25000 }, // 未所属
      ],
    };
    const codes = codesOf(validateGameInput(input, RULE, ROSTER));
    expect(codes).toContain("NOT_IN_LEAGUE");
    expect(codes).not.toContain("TEAM_BALANCE");
  });

  it("別リーグの名簿を渡せば当然弾かれる（roster は league_id でスコープ済みのものを渡す）", () => {
    const otherLeagueRoster: Roster = new Map([
      [21, 5],
      [22, 5],
      [23, 6],
      [24, 6],
    ]);
    const errors = validateGameInput(validInput(), RULE, otherLeagueRoster);
    expect(find(errors, "NOT_IN_LEAGUE")?.memberIds).toEqual([1, 6, 2, 7]);
  });
});

describe("validateGameInput / 5. 素点合計・6. 素点の単位", () => {
  it("合計が startPoint x 4 でなければ RAW_SCORE_TOTAL", () => {
    const input = validInput();
    input.results[0].rawScore = 42400; // 合計 +100
    const errors = validateGameInput(input, RULE, ROSTER);
    expect(codesOf(errors)).toContain("RAW_SCORE_TOTAL");
    expect(find(errors, "RAW_SCORE_TOTAL")?.message).toContain("100000");
  });

  /** 100000 を定数で埋め込まないこと（D-6）。設定が変われば期待値も変わる */
  it("持ち点が違うリーグでは合計の期待値も変わる", () => {
    const rule: LeagueRule = { startPoint: 30000, returnPoint: 30000, uma: [10, 5, -5, -10] };
    // 合計 100000 は 25000x4 の値。30000x4 = 120000 なので弾かれる
    const errors = validateGameInput(validInput(), rule, ROSTER);
    expect(codesOf(errors)).toContain("RAW_SCORE_TOTAL");
    expect(find(errors, "RAW_SCORE_TOTAL")?.message).toContain("120000");

    // 合計を 120000 にすれば通る
    const ok = validInput();
    ok.results = [
      { memberId: 1, rawScore: 50000 },
      { memberId: 6, rawScore: 30000 },
      { memberId: 2, rawScore: 25000 },
      { memberId: 7, rawScore: 15000 },
    ];
    expect(validateGameInput(ok, rule, ROSTER)).toEqual([]);
  });

  it("100の倍数でない素点は RAW_SCORE_UNIT で、誰かを特定できる", () => {
    const input = validInput();
    input.results[0].rawScore = 42350;
    input.results[1].rawScore = 28050;
    const errors = validateGameInput(input, RULE, ROSTER);
    expect(find(errors, "RAW_SCORE_UNIT")?.memberIds).toEqual([1, 6]);
  });

  it("負の素点でも 100 の倍数判定は正しい（SQLite の % と同じくゼロ方向丸め）", () => {
    const base = (score: number): GameInput => ({
      playedOn: "2026-08-26",
      memo: null,
      results: [
        { memberId: 1, rawScore: 100000 - 25000 - 25000 - score },
        { memberId: 6, rawScore: 25000 },
        { memberId: 2, rawScore: 25000 },
        { memberId: 7, rawScore: score },
      ],
    });
    expect(codesOf(validateGameInput(base(-1500), RULE, ROSTER))).not.toContain("RAW_SCORE_UNIT");
    expect(codesOf(validateGameInput(base(-150), RULE, ROSTER))).toContain("RAW_SCORE_UNIT");
    expect(codesOf(validateGameInput(base(-50), RULE, ROSTER))).toContain("RAW_SCORE_UNIT");
  });
});

/**
 * ★期待値は `migrations/0001_init.sql` の `games.played_on` の CHECK が正★
 *
 * 実装して動かした結果を期待値にしていない。SQLite 3.51 に
 *   CHECK (played_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
 *          AND date(played_on) IS NOT NULL AND date(played_on) = played_on)
 * を張ったテーブルへ実際に INSERT して得た結果を、そのまま下表に写している。
 * マネージャー・reb・dev の3者が独立に検証した入力の和集合。
 *
 * '0000-01-01' と '9999-12-31' が PASS なのは実在日付だから（年の範囲制限は仕様に無い）。
 */
const SQL_ORACLE: [string, boolean][] = [
  ["2026-08-26", true],
  ["2024-02-29", true], // 閏年
  ["0000-01-01", true],
  ["9999-12-31", true],
  ["2026-01-01", true],
  ["2026-12-31", true],
  ["1999-06-15", true],
  ["2025-02-29", false], // 平年の2/29
  ["2026-02-30", false],
  ["2026-13-01", false],
  ["2026-00-10", false],
  ["2026-08-00", false],
  ["banana", false],
  ["", false],
  ["2026/08/26", false],
  ["2026-8-26", false],
  [" 2026-08-26", false], // 先頭スペース
  ["2026-08-26T00:00", false],
  ["2026-13-99", false],
  ["2026-8-6", false],
  ["2026-08-26 ", false], // 末尾スペース
  ["0000-00-00", false],
  ["2026-08-26T00:00:00Z", false],
];

describe("validateGameInput / 8. 日付", () => {
  it.each(SQL_ORACLE)("SQL の CHECK と一致する: %j → %s", (value, expected) => {
    expect(isValidPlayedOn(value)).toBe(expected);
  });

  it("末尾の改行を通さない（JS の $ は Python の re と違い末尾改行の前でマッチしない）", () => {
    expect(isValidPlayedOn("2026-08-26\n")).toBe(false);
  });

  it("全角数字を通さない（GLOB '[0-9]' と同じくASCII数字のみ）", () => {
    expect(isValidPlayedOn("２０２６-０８-２６")).toBe(false);
  });

  it("閏年の判定が 100年・400年ルールまで正しい", () => {
    expect(isValidPlayedOn("1900-02-29")).toBe(false); // 100で割れて400で割れない
    expect(isValidPlayedOn("2000-02-29")).toBe(true); // 400で割れる
    expect(isValidPlayedOn("2100-02-29")).toBe(false);
    expect(isValidPlayedOn("2400-02-29")).toBe(true);
  });

  it("不正な日付は INVALID_DATE を playedOn に紐づけて返す", () => {
    const input = validInput();
    input.playedOn = "2026-02-30";
    const errors = validateGameInput(input, RULE, ROSTER);
    const err = find(errors, "INVALID_DATE");
    expect(err?.field).toBe("playedOn");
    expect(err?.memberIds).toEqual([]);
  });
});

describe("validateGameInput / エラーは全部返す", () => {
  it("複数の問題があれば最初の1件で打ち切らずすべて返す", () => {
    const input: GameInput = {
      playedOn: "banana",
      memo: null,
      results: [
        { memberId: 1, rawScore: 30050 }, // 100の倍数でない / team 1
        { memberId: 2, rawScore: 30000 }, // team 1
        { memberId: 3, rawScore: 30000 }, // team 1 → 2-2 でない
        { memberId: 6, rawScore: 30000 }, // team 2
      ],
    };
    // 合計 120050 ≠ 100000
    expect(codesOf(validateGameInput(input, RULE, ROSTER))).toEqual([
      "TEAM_BALANCE",
      "RAW_SCORE_TOTAL",
      "RAW_SCORE_UNIT",
      "INVALID_DATE",
    ]);
  });

  it("返る順序は features.mdx のバリデーション表の順で安定している", () => {
    const input: GameInput = {
      playedOn: "banana",
      memo: null,
      results: [
        { memberId: 1, rawScore: 30050 },
        { memberId: 1, rawScore: 30000 }, // 重複
        { memberId: 99, rawScore: 30000 }, // 未所属
      ], // 3件 → 件数エラー
    };
    expect(codesOf(validateGameInput(input, RULE, ROSTER))).toEqual([
      "RESULT_COUNT",
      "DUPLICATE_MEMBER",
      "NOT_IN_LEAGUE",
      "RAW_SCORE_UNIT",
      "INVALID_DATE",
    ]);
  });
});
