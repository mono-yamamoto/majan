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
 * ## 1つの色を、要求が正反対な2つの仕事に使わない
 *
 * 山本さんが選んだ色は、**名前の背景**と**グラフの線**の両方に使う。ところが
 *
 *   名前の背景 … 黒い文字が乗るので **薄い方がいい**
 *   グラフの線 … ほぼ白の上に 2px で引くので **濃い方がいい**
 *
 * で要求が正反対になる。1色では両立しないので（T32 で山本さんが実際に踏んだ）、
 * **選んだ色から用途ごとの濃さを作る**。選ぶのは今までどおり1色だけ。
 *
 * ★ **DB に保存する値は変えない。** 選ばれた `#rrggbb` をそのまま持ち、派生は
 *   表示側で計算する。保存値を派生後にすると、次に開いたときピッカーの色が動く。
 *
 * ## なぜ HSL か（oklch ではなく）
 *
 * このアプリの CSS トークンは `oklch` だが、派生には **HSL** を使う。
 * oklch は知覚的に素直な代わりに、明度と彩度を動かすと **sRGB の外に出る**ことが
 * あり、戻すためのガマット処理が要る。HSL は定義上いつも sRGB の中に収まるので、
 * **「必ず色が作れる」ことが計算せずに言える**。
 * 用途は「薄くする」「暗くする」の2つだけで、色相さえ保てれば足りる。
 */

/** 名前の背景。黒文字を乗せる前提なので、明度を高く固定する */
const BADGE_LIGHTNESS = 0.92;
/** 薄くすると色が浮くので、彩度も少し落とす */
const BADGE_SATURATION_SCALE = 0.9;

/** 名前の背景に乗せる文字色。背景の明度を固定したので**常に黒**でよい */
export const BADGE_TEXT_COLOR = "#000000";

/**
 * グラフの線に必要な、白地に対するコントラスト。
 * WCAG 2.1 の非テキストコントラスト（1.4.11）と同じ 3:1。
 */
export const MIN_LINE_CONTRAST = 3;

/** 二分探索の反復回数。**固定**にする（テストが揺れると意味がない） */
const SEARCH_STEPS = 24;

type Hsl = { h: number; s: number; l: number };

/** `#rrggbb` → HSL。読めない色は null */
function toHsl(color: string): Hsl | null {
  const hex = normalizeTeamColor(color);
  if (hex === null) return null;
  const [r, g, b] = [0, 1, 2].map(
    (i) => Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255,
  );
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h =
    max === r
      ? ((g - b) / d + (g < b ? 6 : 0)) * 60
      : max === g
        ? ((b - r) / d + 2) * 60
        : ((r - g) / d + 4) * 60;
  return { h, s, l };
}

/** HSL → `#rrggbb`。HSL は定義上いつも sRGB に収まるので、丸め以外の補正は要らない */
function fromHsl({ h, s, l }: Hsl): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const t = Math.floor((((h % 360) + 360) % 360) / 60);
  const rgb = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][t];
  return `#${rgb
    .map((v) =>
      Math.round((v + m) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/**
 * 名前の背景に使う色。色相はそのまま、**明度を 0.92 に固定**して薄くする。
 * どの色を選んでも黒文字が読める明るさになる（→ テストで下限を固定）。
 */
export function badgeBackground(color: string): string {
  const hsl = toHsl(color);
  if (hsl === null) return color;
  return fromHsl({ h: hsl.h, s: hsl.s * BADGE_SATURATION_SCALE, l: BADGE_LIGHTNESS });
}

/**
 * グラフの線に使う色。**選んだ色が既に十分濃ければ、そのまま返す**
 * （赤・青・緑ならユーザーが選んだ色そのものが線になる）。
 * 白地で 3:1 に届かないときだけ、色相と彩度を保ったまま明度を下げる。
 *
 * 白地に対するコントラストは明度について単調（暗いほど上がる）なので、
 * **条件を満たす最大の明度**を二分探索で求める。回数は固定。
 */
export function lineColor(color: string): string {
  const hsl = toHsl(color);
  if (hsl === null) return color;
  if (contrastRatio(color, "#ffffff") >= MIN_LINE_CONTRAST)
    return normalizeTeamColor(color) ?? color;

  let ok = 0; // 必ず満たす（黒は 21:1）
  let ng = hsl.l; // 満たさない（ここから来た）
  for (let i = 0; i < SEARCH_STEPS; i++) {
    const mid = (ok + ng) / 2;
    if (contrastRatio(fromHsl({ ...hsl, l: mid }), "#ffffff") >= MIN_LINE_CONTRAST) ok = mid;
    else ng = mid;
  }
  return fromHsl({ ...hsl, l: ok });
}
