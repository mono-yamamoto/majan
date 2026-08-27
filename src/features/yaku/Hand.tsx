/**
 * 手牌を牌の並びで見せる。**画像は使わない**（CSS の箱と文字だけ・T27）。
 *
 * 牌は**装飾ではなく情報**なので、1枚を `role="img"` + `aria-label` にして
 * 「二萬」と1語で読ませる。上下2段は見た目だけの都合で、そのまま読ませると
 * 「二 萬」とバラバラに読まれる。
 *
 * 本物の牌は白いので、**ダークモードでも白のまま**にする（`bg-white` を
 * そのまま使い、テーマのトークンには乗せない）。背景に溶かさない。
 */

import { parseHand, tileFace, type Tile as TileType } from "./tiles";

function Tile({ tile }: { tile: TileType }) {
  const face = tileFace(tile);
  // 色を付けるのは中（赤）と發（緑）だけ。白は薄く出す。増やすと読みにくい
  const tone =
    face.tone === "red"
      ? "text-red-600"
      : face.tone === "green"
        ? "text-green-700"
        : face.tone === "blank"
          ? "text-neutral-400"
          : "text-neutral-900";
  return (
    <span
      role="img"
      aria-label={face.label}
      className="inline-flex h-9 w-6 shrink-0 flex-col items-center justify-center rounded-sm border border-neutral-400 bg-white leading-none"
    >
      <span
        aria-hidden="true"
        className={`${tone} ${face.bottom === null ? "text-sm" : "text-xs"}`}
      >
        {face.top}
      </span>
      {face.bottom === null ? null : (
        <span aria-hidden="true" className={`${tone} mt-0.5 text-[9px]`}>
          {face.bottom}
        </span>
      )}
    </span>
  );
}

export function Hand({ hand }: { hand: string }) {
  let tiles: TileType[];
  try {
    tiles = parseHand(hand);
  } catch {
    // 黙って手牌を消さない。表記が壊れていることを画面に出す（他の役は見えたまま）
    return <p className="text-destructive mt-1 text-xs">手牌の表記が読めません（{hand}）</p>;
  }
  return (
    // 14枚は 320px に並ばないので、この行だけ横に振れるようにする。
    // ページ全体は横スクロールさせない（T18 の約束）
    <div className="mt-1.5 -mx-1 overflow-x-auto px-1 py-0.5">
      <div className="flex w-max gap-px">
        {tiles.map((tile, i) => (
          // 同じ牌が並ぶので、識別子になるのは位置しかない
          <Tile key={`${tile.suit}${tile.rank}-${i}`} tile={tile} />
        ))}
      </div>
    </div>
  );
}
