/**
 * チームの色を選ぶ欄。**選んだ瞬間に見え方を出す。**
 *
 * 「保存してから戦績を見に行ったら文字が読めなかった」を作らないために、
 * ここで**実際に敷いたときと同じ組み合わせ**（背景＝選んだ色、文字色＝自動）を
 * 見せる。文字色は明るさから決まるので、選ぶ側が意識しなくてよい。
 *
 * **背景としての読みにくさは警告しない。** 文字色を明るさから自動で選ぶ限り、
 * どんな背景でもコントラストは 4.58:1 を下回らないため（→ `CONTRAST_FLOOR`）、
 * 書いても絶対に出ない。出ない警告があると「警告が出ていないから安全」という
 * 誤解の余地を残す。
 *
 * **一方、線としては警告する。** 同じ色が累計pt推移のグラフの線にも使われるが、
 * 線は 2px の細さでほぼ白の上に引かれるので、**明るい色は消える**（#ffff00 は
 * 背景としては 19.6:1 なのに、線としては 1.07:1 で見えない）。**選ぶ場所で
 * 両方の見え方を出す**ことで、「保存してから戦績を見たら線が無かった」を防ぐ。
 * ただし**選べなくはしない**。どの色を使うかは運営（山本さん）の判断。
 */

import { Button } from "@/components/ui/button";
import { isVisibleAsLine, lineContrast, MIN_LINE_CONTRAST } from "@/lib/chart-palette";
import { contrastRatio, normalizeTeamColor, readableTextColor } from "@/lib/team-color";

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
  const text = color === null ? undefined : readableTextColor(color);
  const ratio = color === null ? null : contrastRatio(color, readableTextColor(color));

  return (
    <div className="mt-2">
      <span className="text-muted-foreground text-sm">色（#{teamId}）</span>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="color"
          value={shown}
          onChange={(e) => onChange(normalizeTeamColor(e.target.value))}
          className="border-input h-8 w-12 shrink-0 rounded-lg border bg-transparent"
          aria-label={`${name || `#${teamId}`} の色`}
        />
        {/* 実際に敷いたときと同じ組み合わせを出す。未設定なら「敷かない」見た目 */}
        <span
          className="min-w-0 truncate rounded-md border px-2 py-1 text-sm"
          style={
            color === null ? undefined : { backgroundColor: color, color: text, borderColor: color }
          }
        >
          {name || `#${teamId}`}
        </span>
        {/* グラフの線としての見え方。背景と線で必要な条件が違うので両方見せる。
            下地は実際のグラフと同じ白にする（テーマの背景トークンには乗せない） */}
        <svg
          width="56"
          height="24"
          viewBox="0 0 56 24"
          aria-hidden="true"
          className="border-input shrink-0 rounded border bg-white"
        >
          {color === null ? null : (
            <polyline points="4,18 18,8 32,14 52,4" fill="none" stroke={color} strokeWidth="2" />
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
        <>
          <p className="text-muted-foreground mt-1 text-xs">
            文字色は明るさから自動で決まります（この色でのコントラスト比 {ratio?.toFixed(1)}:1）。
            <strong>どの色を選んでも読める組み合わせになります。</strong>
          </p>
          {isVisibleAsLine(color) ? null : (
            // 選べなくはしない。線としては見えない、という事実だけ伝える
            <p className="text-destructive mt-1 text-xs">
              <strong>この色は累計pt推移のグラフの線としては見えません</strong>
              （白に対して {lineContrast(color).toFixed(2)}:1。既定の色は{" "}
              {MIN_LINE_CONTRAST.toFixed(2)}:1 以上）。名前の背景としては読めます。
            </p>
          )}
        </>
      )}
    </div>
  );
}
