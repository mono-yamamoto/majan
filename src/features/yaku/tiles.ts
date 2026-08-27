/**
 * 手牌の表記（`234m 345p 678p 234s 55s`）を牌の並びに開く。
 *
 * **画像は使わない。** 牌は CSS の箱と文字で描く（T27）。画像ファイルを置くと
 * 公開リポジトリに入り、他人の制作物なら再配布になる。文字なら
 * ダークモードにも追従するし、拡大してもボケない。
 *
 * 表記は `m`=萬子 `p`=筒子 `s`=索子 `z`=字牌（`1z`東 `2z`南 `3z`西 `4z`北
 * `5z`白 `6z`發 `7z`中）。**マネージャーが検算した表をそのまま持つ**ので、
 * 配列に展開せず**文字列のまま**置いて、ここで開く。渡された表と1対1で
 * 見比べられる形を崩さない。
 *
 * ①〜⑨ と １〜９ が実際に出ることは canvas のピクセル比較で確認した
 * （未割り当ての符号位置と同じ絵にならないこと。検査自体が偽物を捕まえる
 * ことも確認済み）。ただし**測ったのは開発機の Chrome だけ**で、
 * iPhone / Android で確かめたわけではない。
 */

export type Suit = "m" | "p" | "s" | "z";

export type Tile = { suit: Suit; rank: number };

/** 字牌の並び。添字は rank - 1 */
const HONORS = ["東", "南", "西", "北", "白", "發", "中"] as const;

const MAN = ["一", "二", "三", "四", "五", "六", "七", "八", "九"] as const;
const PIN = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨"] as const;
const SOU = ["１", "２", "３", "４", "５", "６", "７", "８", "９"] as const;

/**
 * `234m 55z` のような表記を牌の並びに開く。
 * 読めない表記は投げる（黙って落とすと、間違った手牌が黙って短くなる）。
 */
export function parseHand(text: string): Tile[] {
  const tiles: Tile[] = [];
  for (const group of text.trim().split(/\s+/)) {
    // 0 と 10 は `[1-9]+` に入らないので、ここで落ちる
    const matched = /^([1-9]+)([mpsz])$/.exec(group);
    if (matched === null) throw new Error(`読めない表記: ${group}`);
    const suit = matched[2] as Suit;
    for (const ch of matched[1]) {
      const rank = Number(ch);
      if (suit === "z" && rank > 7) throw new Error(`字牌は 1-7 まで: ${group}`);
      tiles.push({ suit, rank });
    }
  }
  return tiles;
}

/** 牌1枚の見た目と読み。上下2段に割るのは見た目だけで、読みは1つにまとめる */
export type TileFace = {
  /** 上段（字牌は1文字だけなのでここに入れて下段は null） */
  top: string;
  bottom: string | null;
  /** 読み上げ・ツールチップ用。「二萬」のように1語で読ませる */
  label: string;
  /** 中と發だけ色を変える。白は枠だけにする */
  tone: "red" | "green" | "blank" | "plain";
};

export function tileFace(tile: Tile): TileFace {
  const i = tile.rank - 1;
  switch (tile.suit) {
    case "m":
      return { top: MAN[i], bottom: "萬", label: `${MAN[i]}萬`, tone: "plain" };
    case "p":
      return { top: PIN[i], bottom: "筒", label: `${MAN[i]}筒`, tone: "plain" };
    case "s":
      return { top: SOU[i], bottom: "索", label: `${MAN[i]}索`, tone: "plain" };
    case "z": {
      const ch = HONORS[i];
      const tone = ch === "中" ? "red" : ch === "發" ? "green" : ch === "白" ? "blank" : "plain";
      return { top: ch, bottom: null, label: ch, tone };
    }
  }
}
