/**
 * 名前をチームの色で示す。**色が未設定（null）なら何も敷かない。**
 *
 * 色は運営が後から設定するもので、**設定する前に画面が壊れてはいけない**。
 * 未設定のときはそのまま名前を出す（枠も背景も付けない）。
 *
 * ★ 敷くのは**選ばれた色そのものではなく、そこから作った薄い色**（T32）。
 * 同じ色をグラフの線にも使うが、線は濃い方がよく、背景は薄い方がよい。
 * 1色では両立しないので、用途ごとに濃さを作る（→ `badgeBackground`）。
 * 背景の明度を固定してあるので、**文字は常に黒**でよい。
 */

import { badgeBackground, BADGE_TEXT_COLOR } from "@/lib/team-color";

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
      style={{ backgroundColor: badgeBackground(color), color: BADGE_TEXT_COLOR }}
    >
      {children}
    </span>
  );
}
