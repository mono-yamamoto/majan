/**
 * 名前をチームの色で示す。**色が未設定（null）なら何も敷かない。**
 *
 * 色は運営が後から設定するもので、**設定する前に画面が壊れてはいけない**。
 * 未設定のときはそのまま名前を出す（枠も背景も付けない）ので、
 * 「色が無い＝見た目が変わらない」だけになる。
 *
 * 文字色は背景の明るさから自動で決める（`readableTextColor`）。
 * 濃い色を選んでも黒文字のままにならない。
 */

import { readableTextColor } from "@/lib/team-color";

export function TeamBadge({
  color,
  children,
  className = "",
}: {
  color: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  if (color === null) return <span className={className}>{children}</span>;
  return (
    <span
      // 名前そのものに敷く。行全体に敷くと、ランキングのように行が並ぶ画面で
      // 画面の大半が色になって、pt などの数字が読みにくくなる（実測して決めた）
      className={`rounded px-1.5 py-0.5 ${className}`}
      style={{ backgroundColor: color, color: readableTextColor(color) }}
    >
      {children}
    </span>
  );
}
