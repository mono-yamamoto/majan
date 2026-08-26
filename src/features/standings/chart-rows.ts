/**
 * グラフに渡す行データの組み立て。
 *
 * コンポーネントと同じファイルに置くと Fast Refresh の境界を汚すので分けている。
 */

export type ChartSeries = {
  id: number;
  name: string;
  /** 出場した半荘だけ。x は半荘の通し番号（1始まり） */
  points: { x: number; totalPt: number }[];
};

/**
 * x 軸。**採点した全半荘**を渡す。
 * 系列が持つ点の和集合から作ると、その半荘に誰も出ていない（＝系列が点を持たない）
 * ときに軸が欠ける。軸は系列と独立に決まるものなので呼び出し側から渡す。
 */
export type ChartAxis = { x: number; label: string }[];

/**
 * 系列ごとに出場した半荘だけを持つので、x 軸（半荘の通し番号）で突き合わせて
 * 1つの表に組み直す。
 *
 * 出場していない半荘は**直前の累計を持ち越す**（carry-forward）。累計 pt は
 * 出ていない間は変化しないので、水平が正しい形。null のまま connectNulls で
 * 跨ぐと**出ていない区間を斜めに上がる線**になり、存在しない値を描いてしまう。
 * 初出場より前は null のままにする（まだ累計が存在しないため）。
 *
 * 持ち越しにすると、出場が1半荘だけの人にも**線が引ける**。点1つだけだと
 * dot={false} では何も描かれず、凡例に名前があるのに線が無い状態になっていた
 * （序盤のリーグはほぼ全員がこれに該当する）。
 */
export function toRows(
  series: ChartSeries[],
  axis: ChartAxis,
): Record<string, number | string | null>[] {
  const carried = new Map<number, number | null>(series.map((s) => [s.id, null]));

  return axis.map(({ x, label }) => {
    const row: Record<string, number | string | null> = { x, label };
    for (const s of series) {
      const point = s.points.find((p) => p.x === x);
      if (point !== undefined) carried.set(s.id, point.totalPt);
      row[`s${s.id}`] = carried.get(s.id) ?? null;
    }
    return row;
  });
}

/**
 * 半荘の通し番号（x）と日付ラベルの対応。
 *
 * 日付をそのまま x にすると同じ日の複数半荘が重なるので、採点した半荘の
 * 並び順を x にする。どの半荘を採点したかは computeStats の scoredGameIds が
 * 持っているので、画面側で条件を書き直さない。
 */
export function buildGameOrder(
  games: { id: number; playedOn: string }[],
  scoredGameIds: number[],
): Map<number, { x: number; label: string }> {
  const dateOf = new Map(games.map((g) => [g.id, g.playedOn]));
  return new Map(scoredGameIds.map((id, i) => [id, { x: i + 1, label: dateOf.get(id) ?? "" }]));
}

/** x 軸。採点した全半荘を並べる（系列が点を持たない半荘でも欠けない） */
export function buildAxis(gameOrder: Map<number, { x: number; label: string }>): ChartAxis {
  return [...gameOrder.values()].sort((a, b) => a.x - b.x);
}

/**
 * 累計pt推移を系列に直す。戦績（チーム・個人）と個人成績で同じものを使う。
 * 画面ごとに書くと、判定や並びが少しずつ食い違う。
 */
export function toSeries(
  id: number,
  name: string,
  cumulative: { gameId: number; totalPt: number }[],
  gameOrder: Map<number, { x: number; label: string }>,
): ChartSeries {
  return {
    id,
    name,
    points: cumulative.flatMap((c) => {
      const at = gameOrder.get(c.gameId);
      return at === undefined ? [] : [{ x: at.x, totalPt: c.totalPt }];
    }),
  };
}
