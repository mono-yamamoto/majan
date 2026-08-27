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
};

export type YakuSection = { title: string; note?: string; items: Yaku[] };

export const YAKU_SECTIONS: YakuSection[] = [
  {
    title: "1翻",
    items: [
      { name: "立直", reading: "リーチ", han: 1, open: "門前" },
      { name: "一発", reading: "イッパツ", han: 1, open: "門前" },
      { name: "門前清自摸和", reading: "メンゼンツモ", han: 1, open: "門前" },
      { name: "平和", reading: "ピンフ", han: 1, open: "門前" },
      { name: "一盃口", reading: "イーペーコー", han: 1, open: "門前" },
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
      { name: "七対子", reading: "チートイツ", han: 2, open: "門前" },
      { name: "三色同順", reading: "サンショクドウジュン", han: 2, open: 1, kuisagari: true },
      { name: "一気通貫", reading: "イッキツウカン", han: 2, open: 1, kuisagari: true },
      { name: "混全帯幺九", reading: "チャンタ", han: 2, open: 1, kuisagari: true },
      { name: "対々和", reading: "トイトイ", han: 2, open: 2 },
      { name: "三暗刻", reading: "サンアンコウ", han: 2, open: 2 },
      { name: "三色同刻", reading: "サンショクドウコー", han: 2, open: 2 },
      { name: "三槓子", reading: "サンカンツ", han: 2, open: 2 },
      { name: "小三元", reading: "ショウサンゲン", han: 2, open: 2 },
      { name: "混老頭", reading: "ホンロウトウ", han: 2, open: 2 },
      { name: "連風牌（ダブ東・ダブ南）", reading: "レンフンパイ", han: 2, open: 2 },
    ],
  },
  {
    title: "3翻",
    items: [
      { name: "二盃口", reading: "リャンペーコー", han: 3, open: "門前" },
      { name: "純全帯幺九", reading: "ジュンチャン", han: 3, open: 2, kuisagari: true },
      { name: "混一色", reading: "ホンイツ", han: 3, open: 2, kuisagari: true },
    ],
  },
  {
    title: "6翻",
    items: [{ name: "清一色", reading: "チンイツ", han: 6, open: 5, kuisagari: true }],
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

export type Yakuman = { name: string; reading: string; open: string };

export const YAKUMAN: Yakuman[] = [
  { name: "国士無双", reading: "コクシムソウ", open: "門前のみ" },
  { name: "四暗刻", reading: "スーアンコウ", open: "門前のみ" },
  { name: "九蓮宝燈", reading: "チューレンポウトウ", open: "門前のみ" },
  { name: "天和", reading: "テンホー", open: "親のみ・門前" },
  { name: "地和", reading: "チーホー", open: "子のみ・門前" },
  { name: "大三元", reading: "ダイサンゲン", open: "鳴きOK" },
  { name: "字一色", reading: "ツーイーソー", open: "鳴きOK" },
  { name: "緑一色", reading: "リューイーソー", open: "鳴きOK" },
  { name: "清老頭", reading: "チンロウトウ", open: "鳴きOK" },
  { name: "小四喜", reading: "ショウスーシー", open: "鳴きOK" },
  { name: "大四喜", reading: "ダイスーシー", open: "鳴きOK" },
  { name: "四槓子", reading: "スーカンツ", open: "鳴きOK" },
  { name: "数え役満（13翻以上）", reading: "カゾエヤクマン", open: "—" },
];
