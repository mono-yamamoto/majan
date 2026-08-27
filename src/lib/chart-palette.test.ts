/**
 * グラフの線の色のテスト。
 *
 * 守りたいのは3つ:
 *   - **チームモード以外にチームの色が漏れない**（同じチームの5人が同じ色になる）
 *   - **色が未設定のチームはパレットに落ちる**（片方だけ設定した状態が普通に起きる）
 *   - **「線として見えにくい」の閾値が、既定パレットから外れていない**
 */

import { describe, expect, it } from "vite-plus/test";
import { CHART_PALETTE, seriesColors } from "./chart-palette";
import { contrastRatio, lineColor, MIN_LINE_CONTRAST } from "./team-color";

describe("seriesColors", () => {
  it("色を渡さなければパレットの順に使う", () => {
    expect(seriesColors(3)).toEqual([CHART_PALETTE[0], CHART_PALETTE[1], CHART_PALETTE[2]]);
  });

  it("パレットより系列が多ければ先頭に戻る", () => {
    const colors = seriesColors(CHART_PALETTE.length + 2);
    expect(colors[CHART_PALETTE.length]).toBe(CHART_PALETTE[0]);
    expect(colors[CHART_PALETTE.length + 1]).toBe(CHART_PALETTE[1]);
  });

  it("チームの色は、線として見える濃さに直してから使う", () => {
    // 濃い色はそのまま
    expect(seriesColors(2, ["#c62828", "#1565c0"])).toEqual(["#c62828", "#1565c0"]);
    // 薄い色は暗くなる（選ばれた色をそのまま線にしない）
    expect(seriesColors(1, ["#ffff00"])).toEqual(["#9a9a00"]);
  });

  it("★ 片方だけ色を設定した状態でも破綻しない（null はパレットに落ちる）", () => {
    expect(seriesColors(2, ["#c62828", null])).toEqual(["#c62828", CHART_PALETTE[1]]);
    expect(seriesColors(2, [null, "#1565c0"])).toEqual([CHART_PALETTE[0], "#1565c0"]);
  });

  it("パレットには派生をかけない（個人モードの見た目を変えない）", () => {
    expect(seriesColors(3)).toEqual([CHART_PALETTE[0], CHART_PALETTE[1], CHART_PALETTE[2]]);
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
   * ★ チームの色は `lineColor` を通してから線にするので、**薄い色が線に来ない**。
   * だから運営メニューの「線としては見えません」警告は消した（絶対に出ないため）。
   */
  it("薄い色を渡しても、線は白地で 3:1 を満たす", () => {
    for (const color of ["#ffff00", "#f5f5dc", "#ffffff", "#84cc16"]) {
      const [line] = seriesColors(1, [color]);
      expect(contrastRatio(line, "#ffffff"), `${color} → ${line}`).toBeGreaterThanOrEqual(
        MIN_LINE_CONTRAST,
      );
    }
  });

  it("濃い色は選ばれたまま線になる", () => {
    for (const color of ["#c62828", "#1565c0", "#059669", "#000000"]) {
      expect(seriesColors(1, [color])).toEqual([lineColor(color)]);
      expect(seriesColors(1, [color])).toEqual([color]);
    }
  });

  /**
   * ★ 既定パレットには派生をかけていないので、ここは 3:1 を満たさない色を含む
   * （`#84cc16` は 1.98:1）。個人モードの線は**実測でははっきり見える**ことを
   * 画面で確認している。チーム色と基準が違うことを、事実として書いておく。
   */
  it("既定パレットは 3:1 を満たさない色を含む（個人モード用・派生させていない）", () => {
    const 比 = CHART_PALETTE.map((c) => contrastRatio(c, "#ffffff"));
    expect(Math.min(...比)).toBeLessThan(MIN_LINE_CONTRAST);
    expect(Math.min(...比)).toBeGreaterThan(1.9);
  });
});
