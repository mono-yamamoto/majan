import { describe, expect, it } from "vite-plus/test";
import {
  buildAxis,
  buildGameOrder,
  tickLabel,
  toRows,
  toSeries,
  tooltipHeading,
  TOOLTIP_TITLE_MAX,
  type ChartAxis,
  type ChartSeries,
} from "./chart-rows";

const series = (id: number, points: [number, number][]): ChartSeries => ({
  id,
  name: `s${id}`,
  points: points.map(([x, totalPt]) => ({ x, totalPt })),
});

/** 採点した半荘が n 件ある想定の x 軸 */
const axis = (n: number): ChartAxis =>
  Array.from({ length: n }, (_, i) => ({ x: i + 1, label: `2026-09-0${i + 1}`, title: null }));

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

/**
 * 同じ日に複数の半荘があるケース。
 *
 * ★ **このブロックは「同じ日が畳まれる」バグを守っていない。**
 *   バグは `chart-rows.ts` ではなく `CumulativeChart.tsx` の
 *   `XAxis dataKey` にあった。x は元から一意だったので、
 *   `dataKey="label"` に戻してもここは全部通る（変異で確認済み）。
 *
 *   ここが固定しているのは「**x が一意であること**」で、それ自体には意味がある
 *   （x が重複するようになったら Recharts はまた畳む）。ただし
 *   **`dataKey` そのものを守るテストは無い**。描画のテストが要るため。
 *   軸を触るときは、同じ日に2件以上ある状態を実際に開いて確かめること。
 */
describe("buildGameOrder / 同じ日に複数の半荘", () => {
  const games = [
    { id: 10, playedOn: "2026-09-01", title: "朝の部" },
    { id: 11, playedOn: "2026-09-01", title: "昼の部" },
    { id: 12, playedOn: "2026-09-01", title: null },
    { id: 13, playedOn: "2026-09-02", title: "翌日" },
  ];

  it("★ 同じ日でも x は別々になる（畳まれない）", () => {
    const order = buildGameOrder(games, [10, 11, 12, 13]);
    expect([...order.values()].map((v) => v.x)).toEqual([1, 2, 3, 4]);
  });

  it("★ 同じ日の3件が、軸の上で別々の点になる", () => {
    const axis = buildAxis(buildGameOrder(games, [10, 11, 12, 13]));
    expect(axis).toHaveLength(4);
    expect(axis.filter((a) => a.label === "2026-09-01")).toHaveLength(3);
    // x が一意（ここが重複すると Recharts が畳む）
    expect(new Set(axis.map((a) => a.x)).size).toBe(4);
  });

  it("title を持ち回る（ツールチップの見出しに使う）", () => {
    const axis = buildAxis(buildGameOrder(games, [10, 11, 12, 13]));
    expect(axis.map((a) => a.title)).toEqual(["朝の部", "昼の部", null, "翌日"]);
  });

  it("採点していない半荘は軸に出ない", () => {
    const axis = buildAxis(buildGameOrder(games, [10, 13]));
    expect(axis.map((a) => [a.x, a.label, a.title])).toEqual([
      [1, "2026-09-01", "朝の部"],
      [2, "2026-09-02", "翌日"],
    ]);
  });

  it("games に無い id は空のラベルになる（落ちない）", () => {
    const axis = buildAxis(buildGameOrder(games, [99]));
    expect(axis).toEqual([{ x: 1, label: "", title: null }]);
  });

  it("★ 同じ日の2件目以降でも、系列の点が別々に対応する", () => {
    const order = buildGameOrder(games, [10, 11, 12, 13]);
    const s = toSeries(
      1,
      "山田",
      [
        { gameId: 10, totalPt: 10 },
        { gameId: 11, totalPt: 20 },
        { gameId: 12, totalPt: 30 },
      ],
      order,
    );
    expect(s.points).toEqual([
      { x: 1, totalPt: 10 },
      { x: 2, totalPt: 20 },
      { x: 3, totalPt: 30 },
    ]);
  });
});

/**
 * 目盛りとツールチップの見出し。**バグの直し方そのもの**をここで固定する。
 *
 * `CumulativeChart` から切り出したのは、切り出さないと
 * 「同じ日が2つ並ぶ」「タイトルが出る」「長いタイトルが詰まる」の
 * どれもテストできなかったため。
 */
describe("tickLabel / 同じ日の目盛りを繰り返さない", () => {
  const axis: ChartAxis = [
    { x: 1, label: "2026-09-01", title: "朝の部" },
    { x: 2, label: "2026-09-01", title: "昼の部" },
    { x: 3, label: "2026-09-01", title: null },
    { x: 4, label: "2026-09-02", title: "翌日" },
  ];

  it("★ 同じ日が続いたら2つ目以降は空", () => {
    expect(axis.map((a) => tickLabel(axis, a.x))).toEqual(["09-01", "", "", "09-02"]);
  });

  it("日付が変わったらまた出る", () => {
    const mixed: ChartAxis = [
      { x: 1, label: "2026-09-01", title: null },
      { x: 2, label: "2026-09-02", title: null },
      { x: 3, label: "2026-09-02", title: null },
      { x: 4, label: "2026-09-03", title: null },
    ];
    expect(mixed.map((a) => tickLabel(mixed, a.x))).toEqual(["09-01", "09-02", "", "09-03"]);
  });

  it("先頭は必ず出る", () => {
    expect(tickLabel(axis, 1)).toBe("09-01");
  });

  it("軸に無い x は数字のまま（落ちない）", () => {
    expect(tickLabel(axis, 99)).toBe("99");
  });

  it("1件だけの軸でも出る", () => {
    const one: ChartAxis = [{ x: 1, label: "2026-09-01", title: "唯一" }];
    expect(tickLabel(one, 1)).toBe("09-01");
  });
});

describe("tooltipHeading / 同じ日の半荘を見分ける", () => {
  const axis: ChartAxis = [
    { x: 1, label: "2026-09-01", title: "朝の部" },
    { x: 2, label: "2026-09-01", title: "昼の部" },
    { x: 3, label: "2026-09-01", title: null },
    { x: 4, label: "2026-09-02", title: "  前後に空白  " },
  ];

  it("★ 同じ日でも見出しが別々になる（これが直したかったこと）", () => {
    expect(axis.map((a) => tooltipHeading(axis, a.x))).toEqual([
      "09-01 朝の部",
      "09-01 昼の部",
      "09-01",
      "09-02 前後に空白",
    ]);
  });

  it("タイトルが無ければ日付だけ", () => {
    expect(tooltipHeading(axis, 3)).toBe("09-01");
  });

  it("空白だけのタイトルも日付だけ", () => {
    const a: ChartAxis = [{ x: 1, label: "2026-09-01", title: "   " }];
    expect(tooltipHeading(a, 1)).toBe("09-01");
  });

  it(`★ ${TOOLTIP_TITLE_MAX} 文字を超えたら詰める（390px ではみ出さない長さ）`, () => {
    const long = "あ".repeat(60);
    const a: ChartAxis = [{ x: 1, label: "2026-09-01", title: long }];
    expect(tooltipHeading(a, 1)).toBe(`09-01 ${"あ".repeat(TOOLTIP_TITLE_MAX)}…`);
  });

  it(`ちょうど ${TOOLTIP_TITLE_MAX} 文字は詰めない（境界）`, () => {
    const just = "い".repeat(TOOLTIP_TITLE_MAX);
    const a: ChartAxis = [{ x: 1, label: "2026-09-01", title: just }];
    expect(tooltipHeading(a, 1)).toBe(`09-01 ${just}`);
  });

  it("軸に無い x は数字のまま（落ちない）", () => {
    expect(tooltipHeading(axis, 99)).toBe("99");
  });
});
