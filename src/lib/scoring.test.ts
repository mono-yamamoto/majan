import { describe, expect, it } from "vite-plus/test";
import { scoreGame, type LeagueRule, type Result, type Scored } from "./scoring";

/** デフォルト設定（ウマ 10-30 / オカ 20）。Σuma = 0 */
const DEFAULT_RULE: LeagueRule = {
  startPoint: 25000,
  returnPoint: 30000,
  uma: [30, 10, -10, -30],
};

/** ウマ 5-10 / オカなし（返し点 = 持ち点）。Σuma = 0 */
const NO_OKA_RULE: LeagueRule = {
  startPoint: 25000,
  returnPoint: 25000,
  uma: [10, 5, -5, -10],
};

/** 返し点 27,500。オカ 10pt が3人・4人同点で割り切れない設定。Σuma = 0 */
const ODD_RETURN_RULE: LeagueRule = {
  startPoint: 25000,
  returnPoint: 27500,
  uma: [30, 10, -10, -30],
};

/** ウマ合計が 0 でない壊れた設定。Σuma = +10（ゼロサムが成立しないことの確認用） */
const BROKEN_UMA_RULE: LeagueRule = {
  startPoint: 25000,
  returnPoint: 30000,
  uma: [30, 10, -10, -20],
};

/** 素点を memberId 1..n に割り当てて Result[] にする */
const hand = (...rawScores: number[]): Result[] =>
  rawScores.map((rawScore, i) => ({ memberId: i + 1, rawScore }));

/**
 * pt は 0.1 刻みの number なので、浮動小数のまま比較しない。
 * toBeCloseTo は本物のズレを見逃すため、deci-pt 整数に戻して厳密比較する。
 */
const deciOf = (pt: number): number => Math.round(pt * 10);

const totalDeci = (scored: Scored[]): number => scored.reduce((sum, s) => sum + deciOf(s.pt), 0);

/** 期待値と突き合わせやすい形（pt は deci-pt 整数）に落とす */
const shape = (scored: Scored[]) =>
  scored.map((s) => ({ memberId: s.memberId, rank: s.rank, ptDeci: deciOf(s.pt) }));

describe("scoreGame / 仕様書の計算例", () => {
  it("例1: 同点なし", () => {
    expect(shape(scoreGame(hand(42300, 28100, 18400, 11200), DEFAULT_RULE))).toEqual([
      { memberId: 1, rank: 1, ptDeci: 623 }, // +62.3
      { memberId: 2, rank: 2, ptDeci: 81 }, //   +8.1
      { memberId: 3, rank: 3, ptDeci: -216 }, // -21.6
      { memberId: 4, rank: 4, ptDeci: -488 }, // -48.8
    ]);
  });

  it("例2: トップ同点（ウマもオカも2等分・端数なし）", () => {
    expect(shape(scoreGame(hand(35000, 35000, 20000, 10000), DEFAULT_RULE))).toEqual([
      { memberId: 1, rank: 1, ptDeci: 350 },
      { memberId: 2, rank: 1, ptDeci: 350 },
      { memberId: 3, rank: 3, ptDeci: -200 },
      { memberId: 4, rank: 4, ptDeci: -500 },
    ]);
  });

  it("例3: 2位が3人同点（オカが乗らないグループの折半）", () => {
    expect(shape(scoreGame(hand(40000, 20000, 20000, 20000), DEFAULT_RULE))).toEqual([
      { memberId: 1, rank: 1, ptDeci: 600 },
      { memberId: 2, rank: 2, ptDeci: -200 },
      { memberId: 3, rank: 2, ptDeci: -200 },
      { memberId: 4, rank: 2, ptDeci: -200 },
    ]);
  });

  it("例4: 3人がトップ同点（オカ20の3等分で端数が出る）", () => {
    const scored = scoreGame(hand(30000, 30000, 30000, 10000), DEFAULT_RULE);
    // 余りの 0.1pt は memberId 昇順で先頭から配る
    expect(shape(scored)).toEqual([
      { memberId: 1, rank: 1, ptDeci: 167 }, // +16.7
      { memberId: 2, rank: 1, ptDeci: 167 }, // +16.7
      { memberId: 3, rank: 1, ptDeci: 166 }, // +16.6
      { memberId: 4, rank: 4, ptDeci: -500 }, // -50.0
    ]);
    // 各自を独立に丸めると 6.7 x 3 = 20.1 になりゼロサムが壊れる。厳密に 0 であること
    expect(totalDeci(scored)).toBe(0);
  });

  it("4人全員が同点（25,000 x 4）なら全員 0.0pt", () => {
    expect(shape(scoreGame(hand(25000, 25000, 25000, 25000), DEFAULT_RULE))).toEqual([
      { memberId: 1, rank: 1, ptDeci: 0 },
      { memberId: 2, rank: 1, ptDeci: 0 },
      { memberId: 3, rank: 1, ptDeci: 0 },
      { memberId: 4, rank: 1, ptDeci: 0 },
    ]);
  });

  it("負の素点（箱下）を含んでも計算できる", () => {
    const scored = scoreGame(hand(60000, 40000, 10000, -10000), DEFAULT_RULE);
    expect(shape(scored)).toEqual([
      { memberId: 1, rank: 1, ptDeci: 800 }, // +80.0
      { memberId: 2, rank: 2, ptDeci: 200 }, // +20.0
      { memberId: 3, rank: 3, ptDeci: -300 }, // -30.0
      { memberId: 4, rank: 4, ptDeci: -700 }, // -70.0
    ]);
    expect(totalDeci(scored)).toBe(0);
  });
});

describe("scoreGame / 設定追従", () => {
  it("ウマ 5-10・オカなしにすると結果が変わる（100000 などの定数に依存していない）", () => {
    const raw = hand(42300, 28100, 18400, 11200);

    expect(shape(scoreGame(raw, NO_OKA_RULE))).toEqual([
      { memberId: 1, rank: 1, ptDeci: 273 }, // +27.3（オカが乗らない）
      { memberId: 2, rank: 2, ptDeci: 81 },
      { memberId: 3, rank: 3, ptDeci: -116 },
      { memberId: 4, rank: 4, ptDeci: -238 },
    ]);

    // デフォルト設定とは別の結果になっていること
    expect(shape(scoreGame(raw, NO_OKA_RULE))).not.toEqual(shape(scoreGame(raw, DEFAULT_RULE)));
  });

  it("返し点 27,500（オカ 10pt）でも 3人同点の端数を吸収してゼロサムを保つ", () => {
    const scored = scoreGame(hand(30000, 30000, 30000, 10000), ODD_RETURN_RULE);
    expect(totalDeci(scored)).toBe(0);
    // オカ 100deci + ウマ 300deci = 400deci を3等分 → 134/133/133
    expect(shape(scored).map((s) => s.ptDeci)).toEqual([159, 158, 158, -475]);
  });
});

describe("scoreGame / 決定性", () => {
  const raw = hand(30000, 30000, 30000, 10000);

  it("同じ入力なら常に同じ結果を返す", () => {
    expect(shape(scoreGame(raw, DEFAULT_RULE))).toEqual(shape(scoreGame(raw, DEFAULT_RULE)));
  });

  it("入力の並び順を変えても結果は変わらない（0.1pt の寄せ先が memberId 昇順で安定）", () => {
    const expected = shape(scoreGame(raw, DEFAULT_RULE));
    const permutations = [
      [3, 1, 0, 2],
      [2, 3, 1, 0],
      [1, 0, 3, 2],
      [3, 2, 1, 0],
    ];
    for (const order of permutations) {
      const shuffled = order.map((i) => raw[i]);
      expect(shape(scoreGame(shuffled, DEFAULT_RULE))).toEqual(expected);
    }
  });

  it("入力配列を破壊しない（純粋関数）", () => {
    const input = hand(30000, 30000, 30000, 10000);
    const snapshot = structuredClone(input);
    scoreGame(input, DEFAULT_RULE);
    expect(input).toEqual(snapshot);
  });
});

/**
 * Σraw = startPoint x 4 を満たす素点の組み合わせを総当たりで生成する。
 * step / min / max はすべて 100 の倍数なので、生成される素点も 100 の倍数になる。
 */
function* zeroSumHands(
  startPoint: number,
  step: number,
  min: number,
  max: number,
): Generator<number[]> {
  const total = startPoint * 4;
  for (let a = min; a <= max; a += step) {
    for (let b = min; b <= max; b += step) {
      for (let c = min; c <= max; c += step) {
        const d = total - a - b - c;
        if (d < min || d > max) continue;
        yield [a, b, c, d];
      }
    }
  }
}

const SWEEP = { step: 1000, min: -20000, max: 80000 } as const;

describe("scoreGame / ゼロサムの網羅検証", () => {
  /**
   * pt合計(deci) = (Σraw − 4·returnPoint)/100 + Σuma·10 + round((returnPoint−startPoint)·4/100)
   * Σraw = 4·startPoint を代入すると Σuma·10 が残る。
   * つまりゼロサムの成立条件は次の3つ:
   *   1. Σraw = startPoint x 4
   *   2. Σuma = 0
   *   3. rawScore / startPoint / returnPoint がすべて 100 の倍数
   */
  const zeroSumRules: [string, LeagueRule][] = [
    ["デフォルト（ウマ10-30・オカ20）", DEFAULT_RULE],
    ["ウマ5-10・オカなし（返し点25,000）", NO_OKA_RULE],
    ["返し点27,500（オカが端数寄り）", ODD_RETURN_RULE],
  ];

  for (const [name, rule] of zeroSumRules) {
    it(`Σuma = 0 の設定なら全ケースで pt 合計が厳密に 0: ${name}`, () => {
      expect(rule.uma.reduce((sum, u) => sum + u, 0)).toBe(0);

      let checked = 0;
      const violations: { rawScores: number[]; totalDeci: number }[] = [];

      for (const rawScores of zeroSumHands(rule.startPoint, SWEEP.step, SWEEP.min, SWEEP.max)) {
        checked++;
        const total = totalDeci(scoreGame(hand(...rawScores), rule));
        if (total !== 0 && violations.length < 5) {
          violations.push({ rawScores, totalDeci: total });
        }
      }

      expect(violations).toEqual([]);
      expect(checked).toBe(650_491);
    }, 30_000);
  }

  it("網羅ケースが同点・3人同点・箱下をちゃんと含んでいる", () => {
    let ties = 0;
    let tripleTies = 0;
    let allTies = 0;
    let negatives = 0;

    for (const rawScores of zeroSumHands(
      DEFAULT_RULE.startPoint,
      SWEEP.step,
      SWEEP.min,
      SWEEP.max,
    )) {
      const counts = new Map<number, number>();
      for (const s of rawScores) counts.set(s, (counts.get(s) ?? 0) + 1);
      const maxSame = Math.max(...counts.values());
      if (maxSame >= 2) ties++;
      if (maxSame >= 3) tripleTies++;
      if (maxSame === 4) allTies++;
      if (rawScores.some((s) => s < 0)) negatives++;
    }

    expect(ties).toBeGreaterThan(0);
    expect(tripleTies).toBeGreaterThan(0);
    expect(allTies).toBe(1); // 25,000 x 4 の1通りだけ
    expect(negatives).toBeGreaterThan(0);
  }, 30_000);
});

describe("scoreGame / ゼロサムが成立しない条件", () => {
  /**
   * ★これは「壊れているのが正しい」テスト★
   *
   * ウマ合計が 0 でない設定では pt 合計は 0 にならず、必ず Σuma x 10 (deci) だけずれる。
   * これは scoreGame のバグではなく、リーグ設定が不正なだけ。
   * 将来これを見て「合計が0にならないバグだ」と scoreGame 側を直しにいくのを防ぐためのガード。
   * 正しい対処は leagues テーブルの CHECK 制約 (uma_1st + ... + uma_4th = 0) で
   * 不正な設定自体を入れさせないこと（T1）。
   */
  it("Σuma ≠ 0 の設定ではゼロサムが壊れ、ずれ幅は Σuma x 10 deci になる", () => {
    const umaSum = BROKEN_UMA_RULE.uma.reduce((sum, u) => sum + u, 0);
    expect(umaSum).toBe(10); // 30 + 10 - 10 - 20

    const scored = scoreGame(hand(42300, 28100, 18400, 11200), BROKEN_UMA_RULE);
    expect(totalDeci(scored)).not.toBe(0);
    expect(totalDeci(scored)).toBe(umaSum * 10); // +10.0pt ぶん膨らむ
  });

  it("Σuma ≠ 0 なら素点の組み合わせによらず全ケースで壊れる", () => {
    let checked = 0;
    let violations = 0;

    for (const rawScores of zeroSumHands(
      BROKEN_UMA_RULE.startPoint,
      SWEEP.step,
      SWEEP.min,
      SWEEP.max,
    )) {
      checked++;
      if (totalDeci(scoreGame(hand(...rawScores), BROKEN_UMA_RULE)) !== 0) violations++;
    }

    expect(checked).toBe(650_491);
    expect(violations).toBe(checked); // 例外なく全滅する
  }, 30_000);
});
