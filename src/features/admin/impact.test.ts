import { describe, expect, it } from "vite-plus/test";
import { membersByImpact, type ImpactGame } from "./impact";

const RULE = { startPoint: 25000, returnPoint: 30000, uma: [30, 10, -10, -30] as const };
const rule = { ...RULE, uma: [...RULE.uma] as [number, number, number, number] };

const scoredGame = (ids: number[]): ImpactGame => ({
  results: ids.map((memberId) => ({ memberId, rawScore: 25000 })),
});
const reservedGame = (ids: number[]): ImpactGame => ({
  results: ids.map((memberId) => ({ memberId, rawScore: null })),
});

describe("membersByImpact", () => {
  it("半荘が無ければどちらも空", () => {
    const { scored, other } = membersByImpact([], rule);
    expect([...scored]).toEqual([]);
    expect([...other]).toEqual([]);
  });

  it("結果の出た半荘に出ている人は scored", () => {
    const { scored, other } = membersByImpact([scoredGame([1, 2, 3, 4])], rule);
    expect([...scored].sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
    expect([...other]).toEqual([]);
  });

  it("★ 予定にだけ入っている人は other（pt が無いので pt の話をしてはいけない）", () => {
    const { scored, other } = membersByImpact([reservedGame([5, 6, 7, 8])], rule);
    expect([...scored]).toEqual([]);
    expect([...other].sort((a, b) => a - b)).toEqual([5, 6, 7, 8]);
  });

  it("★ 両方に出ている人は scored 側だけ（確認の文が二重に出ない）", () => {
    const { scored, other } = membersByImpact(
      [scoredGame([1, 2, 3, 4]), reservedGame([1, 5, 6, 7])],
      rule,
    );
    expect(scored.has(1)).toBe(true);
    expect(other.has(1)).toBe(false);
    expect([...other].sort((a, b) => a - b)).toEqual([5, 6, 7]);
  });

  it("素点が一部だけの壊れた半荘は other（pt が付いていない）", () => {
    const broken: ImpactGame = {
      results: [
        { memberId: 1, rawScore: 25000 },
        { memberId: 2, rawScore: null },
        { memberId: 3, rawScore: null },
        { memberId: 4, rawScore: null },
      ],
    };
    const { scored, other } = membersByImpact([broken], rule);
    expect([...scored]).toEqual([]);
    expect([...other].sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });

  it("人数が足りない半荘も other（isScorable が false）", () => {
    const { scored, other } = membersByImpact([scoredGame([1, 2, 3])], rule);
    expect([...scored]).toEqual([]);
    expect([...other].sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it("どの半荘にも出ていない人は、どちらにも入らない", () => {
    const { scored, other } = membersByImpact([scoredGame([1, 2, 3, 4])], rule);
    expect(scored.has(9)).toBe(false);
    expect(other.has(9)).toBe(false);
  });
});
