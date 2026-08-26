import { describe, expect, it } from "vite-plus/test";
import { toGameInput, updateRow, valueFromGame, type GameFormRow } from "./game-form-value";

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

  it("未入力は NaN のまま渡す（validateGameInput が理由つきで弾く）", () => {
    const input = toGameInput({
      playedOn: "2026-08-26",
      memo: "",
      rows: [row({ rawScore: "" })],
    });
    expect(Number.isNaN(input.results[0].rawScore)).toBe(true);
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
