import { describe, expect, it } from "vite-plus/test";
import {
  hasPartialScores,
  isReservationInput,
  toGameInput,
  updateRow,
  valueFromGame,
  type GameFormRow,
} from "./game-form-value";

const row = (patch: Partial<GameFormRow> = {}): GameFormRow => ({
  memberId: 1,
  rawScore: "10000",
  negative: false,
  ...patch,
});

describe("updateRow / 符号の持ち越しを防ぐ", () => {
  /**
   * ★誤ったデータが保存される経路★
   * 符号を入力欄と別に持っているので、リセットしないと前の行の「−」が残る。
   * 別のメンバーに打ち直して正の数を入れたのに負数として扱われ、
   * 他の行で合計が合ってしまうと符号違いのまま保存できてしまう。
   */
  it("メンバーを変えたら符号をリセットする", () => {
    const before = row({ negative: true });
    expect(updateRow(before, { memberId: 7 })).toEqual({
      memberId: 7,
      rawScore: "10000",
      negative: false,
    });
  });

  it("同じメンバーを選び直しただけならリセットしない", () => {
    const before = row({ memberId: 1, negative: true });
    expect(updateRow(before, { memberId: 1 }).negative).toBe(true);
  });

  it("素点を空にしたら符号をリセットする", () => {
    expect(updateRow(row({ negative: true }), { rawScore: "" }).negative).toBe(false);
    expect(updateRow(row({ negative: true }), { rawScore: "   " }).negative).toBe(false);
  });

  it("± ボタン（negative を明示）はそのまま通す", () => {
    expect(updateRow(row(), { negative: true }).negative).toBe(true);
    // 空欄で ± を押してから数字を打つ流れも保たれる
    const empty = updateRow(row({ rawScore: "" }), { negative: true });
    expect(empty.negative).toBe(true);
    expect(updateRow(empty, { rawScore: "500" }).negative).toBe(true);
  });

  it("素点だけ打ち直す分にはリセットしない", () => {
    expect(updateRow(row({ negative: true }), { rawScore: "20000" }).negative).toBe(true);
  });
});

describe("toGameInput / 符号の扱い", () => {
  it("negative が付いた行は負数になる", () => {
    const input = toGameInput({
      playedOn: "2026-08-26",
      memo: "",
      rows: [
        row({ memberId: 1, rawScore: "60000" }),
        row({ memberId: 6, rawScore: "30000" }),
        row({ memberId: 2, rawScore: "20000" }),
        row({ memberId: 7, rawScore: "10000", negative: true }),
      ],
    });
    expect(input.results.map((r) => r.rawScore)).toEqual([60000, 30000, 20000, -10000]);
    expect(input.memo).toBeNull();
  });

  it("空欄は null（予約）として渡す", () => {
    const input = toGameInput({
      playedOn: "2026-08-26",
      memo: "",
      rows: [row({ rawScore: "" })],
    });
    expect(input.results[0].rawScore).toBeNull();
  });

  it("数字でない文字列は NaN のまま渡す（validateGameInput が理由つきで弾く）", () => {
    const input = toGameInput({
      playedOn: "2026-08-26",
      memo: "",
      rows: [row({ rawScore: "abc" })],
    });
    expect(Number.isNaN(input.results[0].rawScore as number)).toBe(true);
  });
});

describe("予約かどうかの判定", () => {
  const four = (scores: string[]) =>
    scores.map((rawScore, i) => row({ memberId: i + 1, rawScore }));

  it("4人そろっていて素点が全部空なら予約", () => {
    expect(
      isReservationInput({ playedOn: "2026-08-26", memo: "", rows: four(["", "", "", ""]) }),
    ).toBe(true);
  });

  it("メンバーが未選択なら予約にならない（誰が対局するかが目的なので）", () => {
    const rows = four(["", "", "", ""]);
    rows[0].memberId = 0;
    expect(isReservationInput({ playedOn: "2026-08-26", memo: "", rows })).toBe(false);
  });

  it("素点が1つでも入っていれば予約ではない", () => {
    expect(
      isReservationInput({ playedOn: "2026-08-26", memo: "", rows: four(["25000", "", "", ""]) }),
    ).toBe(false);
  });

  it("一部だけ入っている状態を検出できる", () => {
    const partial = { playedOn: "2026-08-26", memo: "", rows: four(["25000", "", "", ""]) };
    const all = { playedOn: "2026-08-26", memo: "", rows: four(["1", "2", "3", "4"]) };
    const none = { playedOn: "2026-08-26", memo: "", rows: four(["", "", "", ""]) };
    expect(hasPartialScores(partial)).toBe(true);
    expect(hasPartialScores(all)).toBe(false);
    expect(hasPartialScores(none)).toBe(false);
  });
});

describe("valueFromGame / 既存データの読み込み", () => {
  it("負の素点は絶対値 + negative に分解する", () => {
    const value = valueFromGame({
      playedOn: "2026-08-26",
      memo: null,
      results: [
        { memberId: 1, rawScore: 40000 },
        { memberId: 7, rawScore: -10000 },
        { memberId: 6, rawScore: 30000 },
        { memberId: 2, rawScore: 40000 },
      ],
    });
    const negativeRow = value.rows.find((r) => r.memberId === 7);
    expect(negativeRow).toEqual({ memberId: 7, rawScore: "10000", negative: true });
  });

  /**
   * ★DB で null と 0 を分けたのに、フォームに読み込む段で潰れる罠★
   * String(Math.abs(null)) は "0" になる。予約を開くと「全員0点」が入り、
   * そのまま保存すると合計0で弾かれるか、最悪「全員0点の確定」に化ける。
   * 0 は正当な素点なので、未入力の印には使えない。
   */
  it("予約（rawScore が null）は空文字で読み込む。0 を入れない", () => {
    const value = valueFromGame({
      playedOn: "2026-09-10",
      memo: null,
      results: [1, 6, 2, 7].map((memberId) => ({ memberId, rawScore: null })),
    });
    expect(value.rows.map((r) => r.rawScore)).toEqual(["", "", "", ""]);
    expect(value.rows.every((r) => r.negative === false)).toBe(true);
    // 読み込んだ値をそのまま戻すと、予約のまま（全員 null）
    expect(toGameInput(value).results.every((r) => r.rawScore === null)).toBe(true);
  });

  it("予約を読み込んでも memberId は保たれる（誰が対局するかが目的）", () => {
    const value = valueFromGame({
      playedOn: "2026-09-10",
      memo: null,
      results: [1, 6, 2, 7].map((memberId) => ({ memberId, rawScore: null })),
    });
    expect([...value.rows.map((r) => r.memberId)].sort((a, b) => a - b)).toEqual([1, 2, 6, 7]);
  });

  it("行を素点降順に並べる（一覧の順位順と一致させる）", () => {
    const value = valueFromGame({
      playedOn: "2026-08-26",
      memo: null,
      results: [
        { memberId: 2, rawScore: 20000 },
        { memberId: 1, rawScore: 40000 },
        { memberId: 7, rawScore: -10000 },
        { memberId: 6, rawScore: 50000 },
      ],
    });
    expect(value.rows.map((r) => r.memberId)).toEqual([6, 1, 2, 7]);
  });

  it("読み込んだ値をそのまま戻すと元の素点に一致する（往復）", () => {
    const results = [
      { memberId: 1, rawScore: 40000 },
      { memberId: 6, rawScore: 50000 },
      { memberId: 2, rawScore: 20000 },
      { memberId: 7, rawScore: -10000 },
    ];
    const value = valueFromGame({ playedOn: "2026-08-26", memo: "m", results });
    const back = toGameInput(value);
    expect([...back.results].sort((a, b) => a.memberId - b.memberId)).toEqual(
      [...results].sort((a, b) => a.memberId - b.memberId),
    );
  });
});
