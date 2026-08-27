/**
 * チームの色を選ぶ欄。**選んだ瞬間に見え方を出す。**
 *
 * 「保存してから戦績を見に行ったら文字が読めなかった」を作らないために、
 * ここで**実際に敷いたときと同じ組み合わせ**（背景＝選んだ色、文字色＝自動）を
 * 見せる。文字色は明るさから決まるので、選ぶ側が意識しなくてよい。
 *
 * **「この色は読みにくい」という警告は置いていない。** 文字色を明るさから
 * 自動で選ぶ限り、どんな背景でもコントラストは 4.58:1 を下回らないため
 * （→ `CONTRAST_FLOOR`）、書いても絶対に出ない。出ない警告があると
 * 「警告が出ていないから安全」という誤解の余地を残す。
 * どの色を使うかは運営（山本さん）の判断で、こちらが奪うものでもない。
 */

import { Button } from "@/components/ui/button";
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
          文字色は明るさから自動で決まります（この色でのコントラスト比 {ratio?.toFixed(1)}:1）。
          <strong>どの色を選んでも読める組み合わせになります。</strong>
        </p>
      )}
    </div>
  );
}
