/**
 * チームの色のテスト。
 *
 * **`normalizeTeamColor` が唯一の防波堤**なので、通してはいけない形を
 * 1つずつ固定する。React の `style={{ backgroundColor: x }}` は文字列を
 * ほぼ素通しするので、ここが緩むとそのまま CSS に流れる。
 */

import { describe, expect, it } from "vite-plus/test";
import {
  BADGE_TEXT_COLOR,
  badgeBackground,
  contrastRatio,
  lineColor,
  MIN_LINE_CONTRAST,
  normalizeTeamColor,
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

describe("badgeBackground（名前の背景）", () => {
  it("色相を保ったまま薄くする", () => {
    expect(badgeBackground("#c62828")).toBe("#f7dede");
    expect(badgeBackground("#1565c0")).toBe("#dceaf9");
  });

  it("もともと明るい色も、暗い色も、同じ明るさに揃う", () => {
    // 明度を固定しているので、黄色でも黒でも背景としての明るさは近くなる
    expect(contrastRatio(badgeBackground("#ffff00"), "#000000")).toBeGreaterThan(15);
    expect(contrastRatio(badgeBackground("#000000"), "#000000")).toBeGreaterThan(15);
  });

  it("読めない色はそのまま返す（画面側で色を敷かない判断をする）", () => {
    expect(badgeBackground("red")).toBe("red");
  });

  /**
   * ★ この下限があるから「この色は読みにくい」という警告を置いていない。
   * 明度の固定を外したら、ここが落ちて気づける。
   */
  it("どんな色でも、背景に黒文字が WCAG AA（4.5:1）以上で乗る", () => {
    const hex = (n: number) => n.toString(16).padStart(2, "0");
    let 最小 = Infinity;
    let 最悪 = "";
    for (let r = 0; r <= 255; r += 5) {
      for (let g = 0; g <= 255; g += 5) {
        for (let b = 0; b <= 255; b += 5) {
          const c = `#${hex(r)}${hex(g)}${hex(b)}`;
          const ratio = contrastRatio(badgeBackground(c), BADGE_TEXT_COLOR);
          if (ratio < 最小) {
            最小 = ratio;
            最悪 = c;
          }
        }
      }
    }
    expect(最小, `最悪は ${最悪} の ${最小.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  it("文字色は黒に固定（背景の明度を固定したので選ぶ余地が無い）", () => {
    expect(BADGE_TEXT_COLOR).toBe("#000000");
  });
});

describe("lineColor（グラフの線）", () => {
  it("すでに濃い色はそのまま使う", () => {
    expect(lineColor("#c62828")).toBe("#c62828");
    expect(lineColor("#1565c0")).toBe("#1565c0");
    expect(lineColor("#000000")).toBe("#000000");
  });

  it("白地で見えない色は、色相を保ったまま暗くする", () => {
    expect(lineColor("#ffff00")).toBe("#9a9a00");
    expect(lineColor("#84cc16")).toBe("#6aa412");
    expect(lineColor("#0ea5e9")).toBe("#0d9ee0");
  });

  it("白は色相が無いのでグレーになる", () => {
    expect(lineColor("#ffffff")).toBe("#949494");
  });

  it("大文字で渡しても保存形式（小文字）で返す", () => {
    expect(lineColor("#C62828")).toBe("#c62828");
  });

  it("読めない色はそのまま返す", () => {
    expect(lineColor("rgb(255,0,0)")).toBe("rgb(255,0,0)");
  });

  it("何度通しても結果が変わらない（暗くした色を再度通しても同じ）", () => {
    for (const c of ["#ffff00", "#84cc16", "#0ea5e9", "#c62828"]) {
      expect(lineColor(lineColor(c)), c).toBe(lineColor(c));
    }
  });

  /** ★ この下限があるから「線として見えません」の警告を消せた */
  it("どんな色でも、線は白地で 3:1 以上になる", () => {
    const hex = (n: number) => n.toString(16).padStart(2, "0");
    let 最小 = Infinity;
    let 最悪 = "";
    for (let r = 0; r <= 255; r += 5) {
      for (let g = 0; g <= 255; g += 5) {
        for (let b = 0; b <= 255; b += 5) {
          const c = `#${hex(r)}${hex(g)}${hex(b)}`;
          const ratio = contrastRatio(lineColor(c), "#ffffff");
          if (ratio < 最小) {
            最小 = ratio;
            最悪 = c;
          }
        }
      }
    }
    expect(最小, `最悪は ${最悪} の ${最小.toFixed(3)}:1`).toBeGreaterThanOrEqual(
      MIN_LINE_CONTRAST,
    );
  });

  it("閾値は WCAG の非テキストコントラスト（3:1）", () => {
    expect(MIN_LINE_CONTRAST).toBe(3);
  });

  /**
   * 白と黒はどちらも色相を持たないので、線にすると同じグレーになる。
   * 2チームが白と黒を選ぶと線が見分けられない。**縮退として許容**している
   * （山本さんに説明済み）。名前の背景も同じ理由で同じ色になる。
   */
  it("白と黒は同じ色に縮退する", () => {
    expect(lineColor("#ffffff")).toBe(lineColor("#fefefe"));
    expect(badgeBackground("#ffffff")).toBe(badgeBackground("#000000"));
  });
});
