/**
 * 累計pt推移の線の色。
 *
 * ## 背景として良い色が、線として良いとは限らない
 *
 * T30 で「文字色を明るさから選べば、どんな背景でも 4.58:1 以上になる」ことを
 * 確かめたが、**あれは背景として使う話**。線は 2px の細さで**ほぼ白の背景**に
 * 引かれるので、明るい色は消える。実測（390px の実画面で目視）:
 *
 *   #ffff00  白に対して 1.07:1  → ほとんど見えない（背景としては黒文字で 19.6:1）
 *   #f5f5dc  1.11:1             → 見えない
 *   #84cc16  1.98:1             → はっきり見える（既定パレットの最小）
 *   #f59e0b  2.15:1             → はっきり見える
 *   #0ea5e9  2.77:1             → はっきり見える
 *
 * だから**線の見やすさは別の物差しで測る**。閾値は
 * 「**既定パレットのどの色よりも見えにくいか**」に置く（→ `MIN_LINE_CONTRAST`）。
 * 手で決めた数字ではなく、実際に使っている色から出しているので、
 * パレットを入れ替えれば閾値も一緒に動く。
 */

import { contrastRatio } from "./team-color";

/**
 * 個人モードは名簿の10人に加えて名簿外のメンバーが混じりうるので、
 * 10色だと先頭と末尾が同色になる。12色用意して1リーグ分は重ならないようにする。
 */
export const CHART_PALETTE = [
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
] as const;

/** グラフの下地。ページの背景と同じ（Recharts は塗らないので透過して body が見える） */
const CHART_BACKGROUND = "#ffffff";

/** 線としての見やすさ。白に対するコントラスト比 */
export function lineContrast(color: string): number {
  return contrastRatio(color, CHART_BACKGROUND);
}

/**
 * 「見えにくい」と言う閾値。**既定パレットの最小**。
 *
 * これを下回る色は、いま使っているどの色よりも見えにくいということ。
 * 実測では 1.98:1（`#84cc16`）ははっきり見えて、1.1 前後は見えなかった。
 */
export const MIN_LINE_CONTRAST = Math.min(...CHART_PALETTE.map(lineContrast));

/** 線として使ったときに見えるか */
export function isVisibleAsLine(color: string): boolean {
  return lineContrast(color) >= MIN_LINE_CONTRAST;
}

/**
 * 系列の色を決める。
 *
 * `teamColors` は**チームモードのときだけ**渡す。個人モードに渡してはいけない
 * （メンバーは色を持たないので、チームから引くと同じチームの5人が全部同じ色になる）。
 * 未設定（null）のチームはパレットに落ちる。**片方だけ色を付けた状態**は
 * 普通に起きるので、そこで破綻させない。
 */
export function seriesColors(count: number, teamColors?: (string | null)[]): string[] {
  return Array.from({ length: count }, (_, i) => {
    const own = teamColors?.[i];
    return own ?? CHART_PALETTE[i % CHART_PALETTE.length];
  });
}
