/**
 * 手牌の表記を開くところのテスト。
 *
 * **一番効くのは「全24手が14枚になる」**。マネージャーが手で検算した
 * 「4面子1雀頭に分解できる」を、こちら側でも枚数として固定する。
 * 牌を1枚落とす／足す取り違えは、これで止まる。
 */

import { describe, expect, it } from "vite-plus/test";
import { parseHand, tileFace } from "./tiles";
import { YAKU_SECTIONS, YAKUMAN } from "./yaku-table";

const 手牌のある役 = [...YAKU_SECTIONS.flatMap((s) => s.items), ...YAKUMAN].filter(
  (y): y is typeof y & { hand: string } => typeof y.hand === "string",
);

describe("parseHand", () => {
  it("同じ数字の並びをそのまま枚数に開く", () => {
    expect(parseHand("223344m")).toHaveLength(6);
    expect(parseHand("223344m").map((t) => t.rank)).toEqual([2, 2, 3, 3, 4, 4]);
  });

  it("字牌7種を開く", () => {
    const tiles = parseHand("1234567z");
    expect(tiles).toHaveLength(7);
    expect(tiles.every((t) => t.suit === "z")).toBe(true);
    expect(tiles.map((t) => tileFace(t).label)).toEqual(["東", "南", "西", "北", "白", "發", "中"]);
  });

  it("空白で区切ったグループをつなげる", () => {
    expect(parseHand("234m 345p 678p 234s 55s")).toHaveLength(14);
  });

  it("読めない表記は投げる", () => {
    expect(() => parseHand("0m")).toThrow();
    expect(() => parseHand("10p")).toThrow();
    expect(() => parseHand("8z")).toThrow();
    expect(() => parseHand("234")).toThrow();
    expect(() => parseHand("234x")).toThrow();
    expect(() => parseHand("m234")).toThrow();
  });
});

describe("役に付けた手牌", () => {
  it("24手ある", () => {
    expect(手牌のある役).toHaveLength(24);
  });

  it("どれも14枚になる", () => {
    for (const y of 手牌のある役) {
      expect(parseHand(y.hand), `${y.name}: ${y.hand}`).toHaveLength(14);
    }
  });

  it("同じ牌が5枚以上にならない（麻雀は各4枚まで）", () => {
    for (const y of 手牌のある役) {
      const 数 = new Map<string, number>();
      for (const t of parseHand(y.hand)) {
        const key = `${t.rank}${t.suit}`;
        数.set(key, (数.get(key) ?? 0) + 1);
      }
      for (const [key, n] of 数) {
        expect(n, `${y.name}: ${key} が ${n} 枚`).toBeLessThanOrEqual(4);
      }
    }
  });
});

describe("tileFace", () => {
  it("萬子・筒子・索子は上下2段、字牌は1文字", () => {
    expect(tileFace({ suit: "m", rank: 2 })).toMatchObject({
      top: "二",
      bottom: "萬",
      label: "二萬",
    });
    expect(tileFace({ suit: "p", rank: 2 })).toMatchObject({
      top: "②",
      bottom: "筒",
      label: "二筒",
    });
    expect(tileFace({ suit: "s", rank: 2 })).toMatchObject({
      top: "２",
      bottom: "索",
      label: "二索",
    });
    expect(tileFace({ suit: "z", rank: 1 })).toMatchObject({
      top: "東",
      bottom: null,
      label: "東",
    });
  });

  it("色を変えるのは中と發、白は枠だけ", () => {
    expect(tileFace({ suit: "z", rank: 7 }).tone).toBe("red"); // 中
    expect(tileFace({ suit: "z", rank: 6 }).tone).toBe("green"); // 發
    expect(tileFace({ suit: "z", rank: 5 }).tone).toBe("blank"); // 白
    expect(tileFace({ suit: "z", rank: 1 }).tone).toBe("plain"); // 東
    expect(tileFace({ suit: "m", rank: 5 }).tone).toBe("plain");
  });
});
