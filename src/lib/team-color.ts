/**
 * チームの色。**CSS に流れ込む値**なので、名前より厳しく扱う。
 *
 * React の `style={{ backgroundColor: x }}` は文字列をほぼ素通しする。
 * ここの検証が**唯一の防波堤**なので、通す形を1つに絞る。
 *
 * 保存形式は **`#rrggbb` の小文字**に統一する。揺れたまま保存すると、
 * 運営メニューの「`before` と突き合わせて 409」が**同じ色なのに食い違って**
 * 落ちる。DB 側（migrations/0002）も CHECK で小文字だけを許している。
 */

/** 保存する形。`#` + 16進6桁の小文字ちょうど */
const COLOR_RE = /^#[0-9a-f]{6}$/;

/**
 * 受け取った色を保存形式に正規化する。通らないものは null。
 *
 * - 前後の空白は落とす（名前と同じ扱い）
 * - 大文字は小文字に直す。`#FF0000` は**弾かずに直す**（人が書く形なので）
 * - 3桁 `#fff` / 8桁 `#ff0000ff` / `rgb()` / `hsl()` / `red` / `var(--x)` /
 *   `javascript:` は通さない。3桁を展開しないのは、**保存形式を1つに保つ**ため
 *   （展開すると「入力した文字列と保存された文字列が違う」が起きて、
 *   before の突き合わせで混乱する）
 */
export function normalizeTeamColor(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  return COLOR_RE.test(trimmed) ? trimmed : null;
}

/**
 * 背景色に対して読める文字色を返す。
 *
 * パレットに縛らず**どんな色でも選べる**ようにしたぶん、文字色は自動で決める。
 * WCAG の相対輝度で白と黒のコントラスト比を出し、**高い方**を採る。
 * 「輝度 0.5 で切る」ではなく比を比べるのは、境目付近で実際に読める方を選ぶため。
 */
export function readableTextColor(background: string): "#ffffff" | "#000000" {
  return contrastRatio(background, "#ffffff") >= contrastRatio(background, "#000000")
    ? "#ffffff"
    : "#000000";
}

/** WCAG 2.x の相対輝度。sRGB をリニアに戻してから重み付けする */
export function relativeLuminance(color: string): number {
  const hex = normalizeTeamColor(color);
  if (hex === null) return 0;
  const channel = (i: number) => {
    const v = Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/** 2色のコントラスト比（1〜21）。WCAG の AA は本文 4.5、大きい文字 3.0 */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [relativeLuminance(a), relativeLuminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/**
 * **どんな背景色でも、`readableTextColor` が選ぶ文字色とのコントラストは
 * これを下回らない。**
 *
 * 白との比は輝度が上がるほど下がり、黒との比は逆に上がる。高い方を採るので、
 * 最悪になるのは両者が交わる輝度 0.179 付近で、そこでも 4.58:1 ある
 * （実測: グレースケールの最悪は #757575 の 4.608、有彩色を含めても
 * rgb(75,125,135) の 4.583）。**WCAG AA の本文 4.5:1 を必ず満たす。**
 *
 * だから「この色は読みにくい」という警告は**書いても絶対に出ない**。
 * 出ない警告を画面に置くと、次に読む人が「警告が出ていないから安全」と
 * 誤解する余地を残すので、置かない。
 */
export const CONTRAST_FLOOR = 4.5;
