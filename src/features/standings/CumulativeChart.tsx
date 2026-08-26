/**
 * 累計pt推移の折れ線。
 *
 * このファイルは **React.lazy 経由でのみ読み込む**（→ StandingsPage）。
 * Recharts は gzip で約 105 kB あり（@reduxjs/toolkit / react-redux / immer /
 * victory-vendor(d3) / decimal.js-light を連れてくる）、素朴に import すると
 * アプリ全体が約2倍になる。半荘登録は雀荘など電波の悪い場所で行われうるので、
 * グラフを見ない画面にこのコストを払わせない（決定 D-26）。
 */

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type ChartSeries = {
  id: number;
  name: string;
  /** 累計pt。x は半荘の通し番号（1始まり） */
  points: { x: number; label: string; totalPt: number }[];
};

const COLORS = [
  "#0ea5e9",
  "#f43f5e",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#14b8a6",
  "#ec4899",
  "#84cc16",
  "#6366f1",
  "#f97316",
];

/**
 * 系列ごとに出場した半荘だけを持つので、x 軸（半荘の通し番号）で突き合わせて
 * 1つの表に組み直す。出場していない半荘は null にして線を飛ばす。
 */
function toRows(series: ChartSeries[]): Record<string, number | string | null>[] {
  const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort((a, b) => a - b);
  const labelOf = new Map(series.flatMap((s) => s.points.map((p) => [p.x, p.label] as const)));

  return xs.map((x) => {
    const row: Record<string, number | string | null> = { x, label: labelOf.get(x) ?? "" };
    for (const s of series) {
      row[`s${s.id}`] = s.points.find((p) => p.x === x)?.totalPt ?? null;
    }
    return row;
  });
}

export default function CumulativeChart({ series }: { series: ChartSeries[] }) {
  const rows = toRows(series);

  return (
    <div className="mt-4">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          {/* 390px 幅だと YYYY-MM-DD が詰まるので月日だけにする */}
          <XAxis
            dataKey="label"
            tickFormatter={(v: string) => (typeof v === "string" ? v.slice(5) : v)}
            tick={{ fontSize: 10 }}
            minTickGap={16}
          />
          <YAxis tick={{ fontSize: 10 }} width={44} />
          <ReferenceLine y={0} className="stroke-border" />
          <Tooltip
            formatter={(value) =>
              typeof value === "number" ? `${value > 0 ? "+" : ""}${value.toFixed(1)}pt` : value
            }
            contentStyle={{ fontSize: 12 }}
          />
          {series.map((s, i) => (
            <Line
              key={s.id}
              type="monotone"
              dataKey={`s${s.id}`}
              name={s.name}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* 凡例は Recharts の Legend を使わず自前で出す。SP 幅だと折り返しが崩れやすい */}
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {series.map((s, i) => (
          <li key={s.id} className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
              aria-hidden="true"
            />
            {s.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
