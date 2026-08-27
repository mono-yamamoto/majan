/**
 * チームの色を選ぶ欄。**選んだ瞬間に、実際に使われる2つの見え方を出す。**
 *
 * ★ 選んだ色そのものは、もう画面のどこにも出ない（T32）。名前の背景には
 * 薄くした色が、グラフの線には濃くした色が使われる。**ここで「選んだ色の
 * ベタ塗り」を見せると、画面に無い色を見せることになる**ので出さない。
 *
 * **警告は置いていない。**
 *   - 背景は明度を固定しているので、黒文字とのコントラストは必ず 16:1 以上
 *   - 線は白地で 3:1 を満たす濃さに直してから使う
 * どちらも条件を満たせない色が無いので、書いても出ない。出ない警告があると
 * 「警告が出ていないから安全」という誤解の余地を残す（→ 下限はテストで固定）。
 */

import { Button } from "@/components/ui/button";
import { badgeBackground, BADGE_TEXT_COLOR, lineColor, normalizeTeamColor } from "@/lib/team-color";

export function TeamColorField({
  teamId,
  name,
  color,
  onChange,
}: {
  teamId: number;
  name: string;
  color: string | null;
  onChange: (color: string | null) => void;
}) {
  // <input type="color"> は空を扱えないので、未設定のときの見た目だけ既定値を入れる。
  // **その値は保存しない**（color が null のままなら「未設定」）
  const shown = color ?? "#cccccc";
  const 見出し = name || `#${teamId}`;

  return (
    <div className="mt-2">
      <span className="text-muted-foreground text-sm">色（#{teamId}）</span>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="color"
          value={shown}
          onChange={(e) => onChange(normalizeTeamColor(e.target.value))}
          className="border-input h-8 w-12 shrink-0 rounded-lg border bg-transparent"
          aria-label={`${見出し} の色`}
        />
        {/* 名前の背景としての見え方。ランキングに出るのと同じ組み合わせ */}
        <span
          className="min-w-0 truncate rounded-md px-2 py-1 text-sm"
          style={
            color === null
              ? undefined
              : { backgroundColor: badgeBackground(color), color: BADGE_TEXT_COLOR }
          }
        >
          {見出し}
        </span>
        {/* グラフの線としての見え方。下地は実際のグラフと同じ白にする
            （テーマの背景トークンに乗せると、ここだけ別物になる） */}
        <svg
          width="56"
          height="24"
          viewBox="0 0 56 24"
          aria-hidden="true"
          className="border-input shrink-0 rounded border bg-white"
        >
          {color === null ? null : (
            <polyline
              points="4,18 18,8 32,14 52,4"
              fill="none"
              stroke={lineColor(color)}
              strokeWidth="2"
            />
          )}
        </svg>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto shrink-0"
          onClick={() => onChange(null)}
          disabled={color === null}
        >
          色を消す
        </Button>
      </div>
      {color === null ? (
        <p className="text-muted-foreground mt-1 text-xs">
          未設定です。<strong>ハイライトしません</strong>（名前がそのまま出ます）。
        </p>
      ) : (
        <p className="text-muted-foreground mt-1 text-xs">
          左が<strong>名前の背景</strong>、右が<strong>グラフの線</strong>
          です。選んだ色から、用途ごとの濃さを作っています
          {lineColor(color) === normalizeTeamColor(color)
            ? "（線は選んだ色のまま）。"
            : "（線は白地で見えるように濃くしました）。"}
        </p>
      )}
    </div>
  );
}
