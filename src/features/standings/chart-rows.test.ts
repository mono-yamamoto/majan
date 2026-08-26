import { describe, expect, it } from "vite-plus/test";
import { toRows, type ChartAxis, type ChartSeries } from "./chart-rows";

const series = (id: number, points: [number, number][]): ChartSeries => ({
  id,
  name: `s${id}`,
  points: points.map(([x, totalPt]) => ({ x, totalPt })),
});

/** 採点した半荘が n 件ある想定の x 軸 */
const axis = (n: number): ChartAxis =>
  Array.from({ length: n }, (_, i) => ({ x: i + 1, label: `2026-09-0${i + 1}` }));

describe("toRows / 累計の持ち越し", () => {
  /**
   * ★存在しない値を描かない★
   * 累計 pt は出ていない間は変化しないので、不在区間は水平が正しい。
   * null のまま connectNulls で跨ぐと、出ていない区間を斜めに上がる線になる。
   */
  it("出場していない半荘は直前の累計を持ち越す（水平になる）", () => {
    const rows = toRows(
      [
        series(1, [
          [1, 10],
          [3, 25],
        ]),
      ],
      axis(3),
    );
    expect(rows.map((r) => r.s1)).toEqual([10, 10, 25]);
  });

  it("初出場より前は null のまま（まだ累計が存在しない）", () => {
    const rows = toRows([series(1, [[1, 10]]), series(2, [[3, -5]])], axis(3));
    expect(rows.map((r) => r.s2)).toEqual([null, null, -5]);
    expect(rows.map((r) => r.s1)).toEqual([10, 10, 10]);
  });

  /**
   * ★1半荘だけの人にも線が引ける★
   * 点が1つだけだと dot={false} では何も描かれず、凡例に名前があるのに
   * 線が無い状態になっていた（序盤のリーグはほぼ全員がこれに該当する）。
   */
  it("出場が1半荘だけでも、以降の行に値が入る", () => {
    const rows = toRows(
      [
        series(1, [[1, 62.3]]),
        series(2, [
          [1, 8.1],
          [2, 20],
        ]),
      ],
      axis(2),
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.s1)).toEqual([62.3, 62.3]);
  });

  /**
   * ★軸は系列と独立★
   * 系列の点の和集合から軸を作ると、その半荘に誰も出ていない場合に軸が欠ける。
   * 呼び出し側（採点した全半荘）から渡す。
   */
  it("x 軸は渡されたものをそのまま使う（系列が点を持たない x も残る）", () => {
    const rows = toRows([series(1, [[1, 10]])], axis(3));
    expect(rows.map((r) => r.x)).toEqual([1, 2, 3]);
  });

  it("ラベルは x に対応する日付を使う", () => {
    const rows = toRows(
      [
        series(1, [
          [1, 10],
          [2, 20],
        ]),
      ],
      axis(2),
    );
    expect(rows.map((r) => r.label)).toEqual(["2026-09-01", "2026-09-02"]);
  });

  it("系列が空でも落ちない", () => {
    expect(toRows([], axis(0))).toEqual([]);
    expect(toRows([series(1, [])], axis(2)).map((r) => r.s1)).toEqual([null, null]);
  });
});
