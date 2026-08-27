/**
 * 役一覧のデータ。**静的**。計算もしないし DB も引かない。
 *
 * 翻数・食い下がりは `rules.mdx`（連風牌 2翻・Mリーグ準拠）と整合させてある。
 * 卓では「この役、何翻だっけ」で引くので、**翻から探せる並び**にしている。
 *
 * ★ 画像から作っていない。渡された3枚は第三者の制作物で、このアプリは
 *   公開サイト・リポジトリも public なので、貼ると再配布になる。
 *   役名と翻数は事実なので、表として自前で持つ。
 */

export type Yaku = {
  name: string;
  reading: string;
  /** 門前での翻数。役満は null */
  han: number | null;
  /**
   * 鳴いたときの翻数。
   *   "門前"   … 門前のみ（鳴くと成立しない）
   *   "未定"   … このリーグでまだ決めていない（決まったように書かない）
   *   number   … 鳴いても同じ／食い下がる
   */
  open: "門前" | "未定" | number;
  /** 鳴くと翻が下がる（画面で目立たせる。ここが一番間違えられる） */
  kuisagari?: boolean;
  note?: string;
  /**
   * 例の手牌。`m`=萬子 `p`=筒子 `s`=索子 `z`=字牌（1z東 2z南 3z西 4z北 5z白 6z發 7z中）。
   *
   * ★ マネージャーが「4面子1雀頭（または七対子・国士）に分解できる」ことを
   *   プログラムで確認した24手だけを載せる。**1枚も書き換えないこと。**
   *   検算していない手を足さないこと（間違った例は無い方がまし）。
   */
  hand?: string;
};

export type YakuSection = { title: string; note?: string; items: Yaku[] };

export const YAKU_SECTIONS: YakuSection[] = [
  {
    title: "1翻",
    items: [
      { name: "立直", reading: "リーチ", han: 1, open: "門前" },
      { name: "一発", reading: "イッパツ", han: 1, open: "門前" },
      { name: "門前清自摸和", reading: "メンゼンツモ", han: 1, open: "門前" },
      { name: "平和", reading: "ピンフ", han: 1, open: "門前", hand: "234m 345p 678p 234s 55s" },
      {
        name: "一盃口",
        reading: "イーペーコー",
        han: 1,
        open: "門前",
        hand: "223344m 456p 678p 99s",
      },
      { name: "断幺九", reading: "タンヤオ", han: 1, open: 1 },
      { name: "役牌（白・發・中・場風・自風）", reading: "ヤクハイ", han: 1, open: 1 },
      { name: "嶺上開花", reading: "リンシャンカイホー", han: 1, open: 1 },
      { name: "槍槓", reading: "チャンカン", han: 1, open: 1 },
      { name: "海底摸月", reading: "ハイテイ", han: 1, open: 1 },
      { name: "河底撈魚", reading: "ホウテイ", han: 1, open: 1 },
    ],
  },
  {
    title: "2翻",
    items: [
      { name: "ダブル立直", reading: "ダブリー", han: 2, open: "門前" },
      {
        name: "七対子",
        reading: "チートイツ",
        han: 2,
        open: "門前",
        hand: "11m 44m 22p 77p 33s 88s 77z",
      },
      {
        name: "三色同順",
        reading: "サンショクドウジュン",
        han: 2,
        open: 1,
        kuisagari: true,
        hand: "234m 567m 234p 234s 55z",
      },
      {
        name: "一気通貫",
        reading: "イッキツウカン",
        han: 2,
        open: 1,
        kuisagari: true,
        hand: "123456789m 456p 11z",
      },
      {
        name: "混全帯幺九",
        reading: "チャンタ",
        han: 2,
        open: 1,
        kuisagari: true,
        hand: "123m 999m 789p 123s 11z",
      },
      { name: "対々和", reading: "トイトイ", han: 2, open: 2, hand: "111m 99m 333p 555s 111z" },
      { name: "三暗刻", reading: "サンアンコウ", han: 2, open: 2, hand: "111m 456m 333p 555s 99s" },
      {
        name: "三色同刻",
        reading: "サンショクドウコー",
        han: 2,
        open: 2,
        hand: "333m 456m 333p 333s 11z",
      },
      { name: "三槓子", reading: "サンカンツ", han: 2, open: 2 },
      {
        name: "小三元",
        reading: "ショウサンゲン",
        han: 2,
        open: 2,
        hand: "123m 456p 555z 666z 77z",
      },
      { name: "混老頭", reading: "ホンロウトウ", han: 2, open: 2, hand: "111m 999m 111p 111z 55z" },
      { name: "連風牌（ダブ東・ダブ南）", reading: "レンフンパイ", han: 2, open: 2 },
    ],
  },
  {
    title: "3翻",
    items: [
      {
        name: "二盃口",
        reading: "リャンペーコー",
        han: 3,
        open: "門前",
        hand: "223344m 556677p 99s",
      },
      {
        name: "純全帯幺九",
        reading: "ジュンチャン",
        han: 3,
        open: 2,
        kuisagari: true,
        hand: "123m 789m 123p 789s 99p",
      },
      {
        name: "混一色",
        reading: "ホンイツ",
        han: 3,
        open: 2,
        kuisagari: true,
        hand: "123m 456m 789m 111z 55z",
      },
    ],
  },
  {
    title: "6翻",
    items: [
      {
        name: "清一色",
        reading: "チンイツ",
        han: 6,
        open: 5,
        kuisagari: true,
        hand: "123456789m 234m 99m",
      },
    ],
  },
  {
    title: "満貫扱い",
    items: [
      {
        // rules.mdx にあるのは「流し満貫: あり」だけ。副露していても成立するかは
        // 書かれていないので、「鳴いても同じ」と決めつけない（原則5）。
        name: "流し満貫",
        reading: "ナガシマンガン",
        han: null,
        open: "未定",
        note: "このリーグは「あり」",
      },
    ],
  },
];

export type Yakuman = { name: string; reading: string; open: string; hand?: string };

export const YAKUMAN: Yakuman[] = [
  { name: "国士無双", reading: "コクシムソウ", open: "門前のみ", hand: "19m 19p 19s 1234567z 1m" },
  { name: "四暗刻", reading: "スーアンコウ", open: "門前のみ", hand: "111m 99m 333p 555s 777s" },
  { name: "九蓮宝燈", reading: "チューレンポウトウ", open: "門前のみ", hand: "1112345678999m 5m" },
  { name: "天和", reading: "テンホー", open: "親のみ・門前" },
  { name: "地和", reading: "チーホー", open: "子のみ・門前" },
  { name: "大三元", reading: "ダイサンゲン", open: "鳴きOK", hand: "123m 99p 555z 666z 777z" },
  { name: "字一色", reading: "ツーイーソー", open: "鳴きOK", hand: "111z 222z 555z 666z 77z" },
  { name: "緑一色", reading: "リューイーソー", open: "鳴きOK", hand: "234s 234s 666s 888s 66z" },
  { name: "清老頭", reading: "チンロウトウ", open: "鳴きOK", hand: "111m 999m 111p 999s 99p" },
  { name: "小四喜", reading: "ショウスーシー", open: "鳴きOK", hand: "123m 111z 222z 333z 44z" },
  { name: "大四喜", reading: "ダイスーシー", open: "鳴きOK", hand: "99m 111z 222z 333z 444z" },
  { name: "四槓子", reading: "スーカンツ", open: "鳴きOK" },
  { name: "数え役満（13翻以上）", reading: "カゾエヤクマン", open: "—" },
];
