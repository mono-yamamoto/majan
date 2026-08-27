/**
 * 点数早見表のデータ。**静的**。実行時に計算しない。
 *
 * `scoring.ts` とは無関係（あちらは順位・ウマ・オカから pt を出すもので、
 * こちらは和了点）。卓で見るための一覧なので、計算の仕組みは持たない。
 *
 * ★ 数値はマネージャーが生成して標準の点数表と突き合わせたもの。
 *   **1マスでも書き換えないこと。** 卓で揉める。
 *
 * このリーグは「切り上げ満貫: あり」（rules.mdx）なので、
 * **30符4翻と60符3翻が満貫**になる。普通の表と違うのはそこ。
 */

/** 1マス。`ron` / `tsumo` が null なら「その組み合わせは存在しない」 */
export type Cell = {
  ron: string | null;
  tsumo: string | null;
  /** 切り上げ満貫を含む「満貫」。画面では 満 の印を付ける */
  mangan?: boolean;
};

export type ScoreRow = { fu: number; cells: [Cell, Cell, Cell, Cell] };

export const HAN_LABELS = ["1翻", "2翻", "3翻", "4翻"] as const;

/** 子。ツモは「子から-親から」 */
export const CHILD_ROWS: ScoreRow[] = [
  {
    fu: 20,
    cells: [
      { ron: null, tsumo: null },
      { ron: null, tsumo: "400-700" },
      { ron: null, tsumo: "700-1300" },
      { ron: null, tsumo: "1300-2600" },
    ],
  },
  {
    fu: 25,
    cells: [
      { ron: null, tsumo: null },
      { ron: "1600", tsumo: "400-800" },
      { ron: "3200", tsumo: "800-1600" },
      { ron: "6400", tsumo: "1600-3200" },
    ],
  },
  {
    fu: 30,
    cells: [
      { ron: "1000", tsumo: "300-500" },
      { ron: "2000", tsumo: "500-1000" },
      { ron: "3900", tsumo: "1000-2000" },
      { ron: "8000", tsumo: "2000-4000", mangan: true },
    ],
  },
  {
    fu: 40,
    cells: [
      { ron: "1300", tsumo: "400-700" },
      { ron: "2600", tsumo: "700-1300" },
      { ron: "5200", tsumo: "1300-2600" },
      { ron: "8000", tsumo: "2000-4000", mangan: true },
    ],
  },
  {
    fu: 50,
    cells: [
      { ron: "1600", tsumo: "400-800" },
      { ron: "3200", tsumo: "800-1600" },
      { ron: "6400", tsumo: "1600-3200" },
      { ron: "8000", tsumo: "2000-4000", mangan: true },
    ],
  },
  {
    fu: 60,
    cells: [
      { ron: "2000", tsumo: "500-1000" },
      { ron: "3900", tsumo: "1000-2000" },
      { ron: "8000", tsumo: "2000-4000", mangan: true },
      { ron: "8000", tsumo: "2000-4000", mangan: true },
    ],
  },
  {
    fu: 70,
    cells: [
      { ron: "2300", tsumo: "600-1200" },
      { ron: "4500", tsumo: "1200-2300" },
      { ron: "8000", tsumo: null, mangan: true },
      { ron: "8000", tsumo: null, mangan: true },
    ],
  },
  {
    fu: 80,
    cells: [
      { ron: "2600", tsumo: "700-1300" },
      { ron: "5200", tsumo: "1300-2600" },
      { ron: "8000", tsumo: null, mangan: true },
      { ron: "8000", tsumo: null, mangan: true },
    ],
  },
  {
    fu: 90,
    cells: [
      { ron: "2900", tsumo: "800-1500" },
      { ron: "5800", tsumo: "1500-2900" },
      { ron: "8000", tsumo: null, mangan: true },
      { ron: "8000", tsumo: null, mangan: true },
    ],
  },
  {
    fu: 100,
    cells: [
      { ron: "3200", tsumo: "800-1600" },
      { ron: "6400", tsumo: "1600-3200" },
      { ron: "8000", tsumo: null, mangan: true },
      { ron: "8000", tsumo: null, mangan: true },
    ],
  },
  {
    fu: 110,
    cells: [
      { ron: "3600", tsumo: "900-1800" },
      { ron: "7100", tsumo: "1800-3600" },
      { ron: "8000", tsumo: null, mangan: true },
      { ron: "8000", tsumo: null, mangan: true },
    ],
  },
];

/** 親。ツモは各家から */
export const PARENT_ROWS: ScoreRow[] = [
  {
    fu: 20,
    cells: [
      { ron: null, tsumo: null },
      { ron: null, tsumo: "700" },
      { ron: null, tsumo: "1300" },
      { ron: null, tsumo: "2600" },
    ],
  },
  {
    fu: 25,
    cells: [
      { ron: null, tsumo: null },
      { ron: "2400", tsumo: "800" },
      { ron: "4800", tsumo: "1600" },
      { ron: "9600", tsumo: "3200" },
    ],
  },
  {
    fu: 30,
    cells: [
      { ron: "1500", tsumo: "500" },
      { ron: "2900", tsumo: "1000" },
      { ron: "5800", tsumo: "2000" },
      { ron: "12000", tsumo: "4000", mangan: true },
    ],
  },
  {
    fu: 40,
    cells: [
      { ron: "2000", tsumo: "700" },
      { ron: "3900", tsumo: "1300" },
      { ron: "7700", tsumo: "2600" },
      { ron: "12000", tsumo: "4000", mangan: true },
    ],
  },
  {
    fu: 50,
    cells: [
      { ron: "2400", tsumo: "800" },
      { ron: "4800", tsumo: "1600" },
      { ron: "9600", tsumo: "3200" },
      { ron: "12000", tsumo: "4000", mangan: true },
    ],
  },
  {
    fu: 60,
    cells: [
      { ron: "2900", tsumo: "1000" },
      { ron: "5800", tsumo: "2000" },
      { ron: "12000", tsumo: "4000", mangan: true },
      { ron: "12000", tsumo: "4000", mangan: true },
    ],
  },
  {
    fu: 70,
    cells: [
      { ron: "3400", tsumo: "1200" },
      { ron: "6800", tsumo: "2300" },
      { ron: "12000", tsumo: null, mangan: true },
      { ron: "12000", tsumo: null, mangan: true },
    ],
  },
  {
    fu: 80,
    cells: [
      { ron: "3900", tsumo: "1300" },
      { ron: "7700", tsumo: "2600" },
      { ron: "12000", tsumo: null, mangan: true },
      { ron: "12000", tsumo: null, mangan: true },
    ],
  },
  {
    fu: 90,
    cells: [
      { ron: "4400", tsumo: "1500" },
      { ron: "8700", tsumo: "2900" },
      { ron: "12000", tsumo: null, mangan: true },
      { ron: "12000", tsumo: null, mangan: true },
    ],
  },
  {
    fu: 100,
    cells: [
      { ron: "4800", tsumo: "1600" },
      { ron: "9600", tsumo: "3200" },
      { ron: "12000", tsumo: null, mangan: true },
      { ron: "12000", tsumo: null, mangan: true },
    ],
  },
  {
    fu: 110,
    cells: [
      { ron: "5300", tsumo: "1800" },
      { ron: "10600", tsumo: "3600" },
      { ron: "12000", tsumo: null, mangan: true },
      { ron: "12000", tsumo: null, mangan: true },
    ],
  },
];

/** 満貫以上。符と翻に依らない */
export const BIG_HANDS = [
  {
    name: "満貫（5翻）",
    childRon: "8000",
    childTsumo: "2000-4000",
    parentRon: "12000",
    parentTsumo: "4000",
  },
  {
    name: "跳満（6-7翻）",
    childRon: "12000",
    childTsumo: "3000-6000",
    parentRon: "18000",
    parentTsumo: "6000",
  },
  {
    name: "倍満（8-10翻）",
    childRon: "16000",
    childTsumo: "4000-8000",
    parentRon: "24000",
    parentTsumo: "8000",
  },
  {
    name: "三倍満（11-12翻）",
    childRon: "24000",
    childTsumo: "6000-12000",
    parentRon: "36000",
    parentTsumo: "12000",
  },
  {
    // 数え役満は rules.mdx で「あり」（13翻以上は役満）
    name: "役満（13翻以上・役満役）",
    childRon: "32000",
    childTsumo: "8000-16000",
    parentRon: "48000",
    parentTsumo: "16000",
  },
] as const;

/** ノーテン罰符（場3,000）。rules.mdx の決めごとをそのまま出す */
export const NOTEN = [
  { tenpai: "1人", detail: "ノーテン3人が 1,000ずつ", result: "テンパイ者 +3,000" },
  { tenpai: "2人", detail: "ノーテン2人が 1,500ずつ", result: "テンパイ者 +1,500ずつ" },
  { tenpai: "3人", detail: "ノーテン1人が 3,000", result: "テンパイ者 +1,000ずつ" },
  { tenpai: "0人 / 4人", detail: "授受なし", result: "—" },
] as const;
