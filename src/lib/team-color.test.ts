/**
 * チームの色のテスト。
 *
 * **`normalizeTeamColor` が唯一の防波堤**なので、通してはいけない形を
 * 1つずつ固定する。React の `style={{ backgroundColor: x }}` は文字列を
 * ほぼ素通しするので、ここが緩むとそのまま CSS に流れる。
 */

import { describe, expect, it } from "vite-plus/test";
import {
  CONTRAST_FLOOR,
  contrastRatio,
  normalizeTeamColor,
  readableTextColor,
  relativeLuminance,
} from "./team-color";

describe("normalizeTeamColor", () => {
  it("#rrggbb の小文字はそのまま通る", () => {
    expect(normalizeTeamColor("#ff0000")).toBe("#ff0000");
    expect(normalizeTeamColor("#0a0b0c")).toBe("#0a0b0c");
  });

  it("大文字は小文字に直す（弾かずに直す）", () => {
    expect(normalizeTeamColor("#FF0000")).toBe("#ff0000");
    expect(normalizeTeamColor("#Ff00Aa")).toBe("#ff00aa");
  });

  it("前後の空白は落とす", () => {
    expect(normalizeTeamColor("  #ff0000  ")).toBe("#ff0000");
    expect(normalizeTeamColor("\t#ff0000\n")).toBe("#ff0000");
  });

  it("3桁は通さない（保存形式を1つに保つため、展開もしない）", () => {
    expect(normalizeTeamColor("#fff")).toBeNull();
    expect(normalizeTeamColor("#f00")).toBeNull();
  });

  it("8桁（アルファ付き）は通さない", () => {
    expect(normalizeTeamColor("#ff0000ff")).toBeNull();
  });

  it("CSS の別の書き方は通さない", () => {
    expect(normalizeTeamColor("rgb(255,0,0)")).toBeNull();
    expect(normalizeTeamColor("hsl(0,100%,50%)")).toBeNull();
    expect(normalizeTeamColor("red")).toBeNull();
    expect(normalizeTeamColor("var(--destructive)")).toBeNull();
    expect(normalizeTeamColor("transparent")).toBeNull();
  });

  it("危なそうな文字列も通さない", () => {
    expect(normalizeTeamColor("javascript:alert(1)")).toBeNull();
    expect(normalizeTeamColor("url(https://example.com/x.png)")).toBeNull();
    expect(normalizeTeamColor("#ff0000;background:url(x)")).toBeNull();
    expect(normalizeTeamColor("#ff0000 !important")).toBeNull();
  });

  it("空・空白だけ・# だけは通さない", () => {
    expect(normalizeTeamColor("")).toBeNull();
    expect(normalizeTeamColor("   ")).toBeNull();
    expect(normalizeTeamColor("#")).toBeNull();
    expect(normalizeTeamColor("ff0000")).toBeNull();
  });

  it("16進でない文字は通さない", () => {
    expect(normalizeTeamColor("#gg0000")).toBeNull();
    expect(normalizeTeamColor("#ff00zz")).toBeNull();
  });

  it("全角は通さない", () => {
    expect(normalizeTeamColor("＃ff0000")).toBeNull();
    expect(normalizeTeamColor("#ｆｆ0000")).toBeNull();
  });
});

describe("relativeLuminance", () => {
  it("白は 1、黒は 0", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
  });

  it("読めない色は 0 として扱う（例外を投げない）", () => {
    expect(relativeLuminance("red")).toBe(0);
  });

  /**
   * ★ RGB を**均等に**足すのではなく、WCAG の重み（0.2126 / 0.7152 / 0.0722）で
   * 足していることを固定する。均等にすると「純緑は暗い」と判断され、緑の背景に
   * 白文字が乗って**実際には読めない**組み合わせが出る（人の目は緑を明るく感じる）。
   * 均等な重みにする変異は、白・黒のテストでは捕まらない（どちらも同じ値になる）。
   */
  it("緑は青よりずっと明るい（人の目の感度に合わせた重み）", () => {
    expect(relativeLuminance("#00ff00")).toBeGreaterThan(relativeLuminance("#0000ff") * 5);
    expect(relativeLuminance("#ff0000")).toBeGreaterThan(relativeLuminance("#0000ff"));
    expect(relativeLuminance("#00ff00")).toBeGreaterThan(relativeLuminance("#ff0000"));
  });
});

describe("contrastRatio", () => {
  it("白と黒は 21:1", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 1);
  });

  it("同じ色どうしは 1:1", () => {
    expect(contrastRatio("#3366cc", "#3366cc")).toBeCloseTo(1, 5);
  });

  it("順番を入れ替えても同じ", () => {
    expect(contrastRatio("#ffffff", "#123456")).toBeCloseTo(contrastRatio("#123456", "#ffffff"), 5);
  });
});

describe("readableTextColor", () => {
  it("暗い背景には白、明るい背景には黒", () => {
    expect(readableTextColor("#000000")).toBe("#ffffff");
    expect(readableTextColor("#1a1a1a")).toBe("#ffffff");
    expect(readableTextColor("#ffffff")).toBe("#000000");
    expect(readableTextColor("#ffff00")).toBe("#000000");
  });

  // 純緑は「明るい」側。RGB を均等に足すと暗い側に転んで白文字になり、読めなくなる
  it("純緑には黒文字、純青には白文字", () => {
    expect(readableTextColor("#00ff00")).toBe("#000000");
    expect(readableTextColor("#0000ff")).toBe("#ffffff");
  });

  it("選んだ文字色の方が、もう一方よりコントラストが高い", () => {
    for (const bg of ["#ff0000", "#00ff00", "#0000ff", "#808080", "#3366cc", "#f5deb3"]) {
      const chosen = readableTextColor(bg);
      const other = chosen === "#ffffff" ? "#000000" : "#ffffff";
      expect(contrastRatio(bg, chosen), bg).toBeGreaterThanOrEqual(contrastRatio(bg, other));
    }
  });

  /**
   * ★ この性質があるから「この色は読みにくい」という警告を画面に置いていない。
   * `readableTextColor` の選び方を変えたら、ここが落ちて気づけるようにしておく。
   */
  it("どんな色でも、自動で選んだ文字色とのコントラストは 4.5:1 を下回らない", () => {
    const hex = (n: number) => n.toString(16).padStart(2, "0");
    let 最小 = Infinity;
    let 最悪 = "";
    // 比は輝度だけで決まるが、重みの取り違えも拾えるよう有彩色も回す（5 刻み）
    for (let r = 0; r <= 255; r += 5) {
      for (let g = 0; g <= 255; g += 5) {
        for (let b = 0; b <= 255; b += 5) {
          const bg = `#${hex(r)}${hex(g)}${hex(b)}`;
          const ratio = contrastRatio(bg, readableTextColor(bg));
          if (ratio < 最小) {
            最小 = ratio;
            最悪 = bg;
          }
        }
      }
    }
    expect(最小, `最悪は ${最悪} の ${最小.toFixed(3)}:1`).toBeGreaterThanOrEqual(CONTRAST_FLOOR);
  });

  it("その下限は WCAG AA の本文（4.5）", () => {
    expect(CONTRAST_FLOOR).toBe(4.5);
  });
});
