/**
 * グラフの線の色のテスト。
 *
 * 守りたいのは3つ:
 *   - **チームモード以外にチームの色が漏れない**（同じチームの5人が同じ色になる）
 *   - **色が未設定のチームはパレットに落ちる**（片方だけ設定した状態が普通に起きる）
 *   - **「線として見えにくい」の閾値が、既定パレットから外れていない**
 */

import { describe, expect, it } from "vite-plus/test";
import {
  CHART_PALETTE,
  MIN_LINE_CONTRAST,
  isVisibleAsLine,
  lineContrast,
  seriesColors,
} from "./chart-palette";

describe("seriesColors", () => {
  it("色を渡さなければパレットの順に使う", () => {
    expect(seriesColors(3)).toEqual([CHART_PALETTE[0], CHART_PALETTE[1], CHART_PALETTE[2]]);
  });

  it("パレットより系列が多ければ先頭に戻る", () => {
    const colors = seriesColors(CHART_PALETTE.length + 2);
    expect(colors[CHART_PALETTE.length]).toBe(CHART_PALETTE[0]);
    expect(colors[CHART_PALETTE.length + 1]).toBe(CHART_PALETTE[1]);
  });

  it("チームの色があればそれを使う", () => {
    expect(seriesColors(2, ["#c62828", "#1565c0"])).toEqual(["#c62828", "#1565c0"]);
  });

  it("★ 片方だけ色を設定した状態でも破綻しない（null はパレットに落ちる）", () => {
    expect(seriesColors(2, ["#c62828", null])).toEqual(["#c62828", CHART_PALETTE[1]]);
    expect(seriesColors(2, [null, "#1565c0"])).toEqual([CHART_PALETTE[0], "#1565c0"]);
  });

  it("両方とも未設定なら今までと同じ見た目になる", () => {
    expect(seriesColors(2, [null, null])).toEqual(seriesColors(2));
  });

  it("色の配列が系列より短くてもパレットで埋まる", () => {
    expect(seriesColors(3, ["#c62828"])).toEqual(["#c62828", CHART_PALETTE[1], CHART_PALETTE[2]]);
  });

  it("系列が0なら空", () => {
    expect(seriesColors(0)).toEqual([]);
    expect(seriesColors(0, ["#c62828"])).toEqual([]);
  });
});

describe("線としての見やすさ", () => {
  /**
   * ★ 背景として良い色が、線として良いとは限らない。
   * #ffff00 は黒文字を乗せれば 19.6:1 だが、白の上に 2px の線として引くと見えない。
   * 実際に画面で見て確かめた値（→ chart-palette.ts のコメント）。
   */
  it("明るい色は線として見えない", () => {
    expect(lineContrast("#ffff00")).toBeLessThan(1.2);
    expect(lineContrast("#f5f5dc")).toBeLessThan(1.2);
    expect(isVisibleAsLine("#ffff00")).toBe(false);
    expect(isVisibleAsLine("#f5f5dc")).toBe(false);
  });

  it("実際に見えた色は通る", () => {
    for (const color of ["#84cc16", "#f59e0b", "#0ea5e9", "#c62828", "#1565c0"]) {
      expect(isVisibleAsLine(color), color).toBe(true);
    }
  });

  it("★ 閾値は既定パレットの最小そのもの。パレット全色が「見える」側に入る", () => {
    for (const color of CHART_PALETTE) {
      expect(isVisibleAsLine(color), color).toBe(true);
    }
    expect(MIN_LINE_CONTRAST).toBeCloseTo(Math.min(...CHART_PALETTE.map(lineContrast)), 10);
  });

  it("閾値は 1.9〜2.1 の範囲にある（パレットを入れ替えたら気づけるように）", () => {
    expect(MIN_LINE_CONTRAST).toBeGreaterThan(1.9);
    expect(MIN_LINE_CONTRAST).toBeLessThan(2.1);
  });

  it("白そのものは線として使えない", () => {
    expect(lineContrast("#ffffff")).toBeCloseTo(1, 5);
    expect(isVisibleAsLine("#ffffff")).toBe(false);
  });

  it("黒は最もよく見える", () => {
    expect(lineContrast("#000000")).toBeCloseTo(21, 1);
    expect(isVisibleAsLine("#000000")).toBe(true);
  });
});
