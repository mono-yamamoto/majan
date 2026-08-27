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
import { toRows, type ChartAxis, type ChartSeries } from "./chart-rows";

/**
 * 個人モードは名簿の10人に加えて名簿外のメンバーが混じりうるので、
 * 10色だと先頭と末尾が同色になる。12色用意して1リーグ分は重ならないようにする。
 */
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
  "#0891b2",
  "#a16207",
];

export default function CumulativeChart({
  series,
  axis,
}: {
  series: ChartSeries[];
  axis: ChartAxis;
}) {
  const rows = toRows(series, axis);

  /**
   * x（半荘の通し番号）→ その半荘の日付とタイトル。
   *
   * XAxis の dataKey を label（日付）にしていたため、**同じ日の半荘が
   * カテゴリ軸で1つに畳まれ、2件目以降のツールチップが出せなかった**
   * （09-01 に3半荘あっても、どこをなぞっても1件目の値しか出ない）。
   * x は一意なので、こちらをキーにして、表示だけ引き直す。
   */
  const at = new Map(axis.map((a) => [a.x, a]));

  /**
   * 目盛りの日付。**同じ日が続いたら2つ目以降は空**にする。
   * x をキーにしたことで同じ日の半荘が畳まれなくなり、その代わりに
   * 「09-01 09-01 09-01」と同じラベルが並ぶようになったため。
   * どの点がどの日かは最初の1つで分かるし、正確な半荘はツールチップで見る。
   */
  const tickOf = (x: number) => {
    const a = at.get(x);
    if (a === undefined) return String(x);
    const prev = at.get(x - 1);
    return prev !== undefined && prev.label === a.label ? "" : a.label.slice(5);
  };

  /** ツールチップの見出し。日付だけだと同じ日の半荘を見分けられない */
  const headingOf = (x: number) => {
    const a = at.get(x);
    if (a === undefined) return String(x);
    const date = a.label.slice(5);
    const title = a.title?.trim() ?? "";
    // 長いタイトルはツールチップが 390px からはみ出すので詰める
    const short = title.length > 14 ? `${title.slice(0, 14)}…` : title;
    return short === "" ? date : `${date} ${short}`;
  };

  return (
    <div className="mt-4">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          {/* キーは x（半荘の通し番号）。label（日付）にすると同じ日が畳まれる。
              目盛りの表示は 390px 幅に合わせて月日だけにする */}
          <XAxis
            dataKey="x"
            type="number"
            domain={["dataMin", "dataMax"]}
            ticks={axis.map((a) => a.x)}
            tickFormatter={(v: number) => tickOf(v)}
            tick={{ fontSize: 10 }}
            minTickGap={16}
          />
          <YAxis tick={{ fontSize: 10 }} width={44} />
          <ReferenceLine y={0} className="stroke-border" />
          <Tooltip
            formatter={(value) =>
              typeof value === "number" ? `${value > 0 ? "+" : ""}${value.toFixed(1)}pt` : value
            }
            labelFormatter={(v: unknown) => (typeof v === "number" ? headingOf(v) : "")}
            contentStyle={{ fontSize: 12 }}
          />
          {series.map((s, i) => (
            <Line
              key={s.id}
              // 累計 pt は半荘と半荘の間に値を持たない。monotone の曲線は
              // 存在しない値を描いてしまうので linear にする
              type="linear"
              dataKey={`s${s.id}`}
              name={s.name}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              // 出場が1半荘だけでも点が見えるようにする（持ち越しで線は引けるが、
              // 1半荘目だけの人は線の長さが0になるため）
              dot={{ r: 2 }}
              activeDot={{ r: 4 }}
              // 線を描き足すアニメーション。T8 では isAnimationActive={false} で
              // 切っていたが、理由が残っていなかったので実測して入れ直した。
              //   - hover / ツールチップでは**再生されない**（実測）。再生されるのは
              //     初回表示とチーム⇔個人の切り替え＝データが変わったときだけ
              //   - 既定の 1500ms は長すぎる。切り替えて見比べる操作を待たせない 400ms
              //   - dot は最初から全部出て、線が後から繋いでいく形になる。
              //     dot は「1半荘だけの人の点が見える」ために必要なので消せない
              animationDuration={400}
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
