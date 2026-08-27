/**
 * 「満貫以上」の役名を、表の固定列に収まる形に割る。
 *
 * `BIG_HANDS` の `name` は「三倍満（11-12翻）」のように翻数を括弧で持っている。
 * 16px にするとこれが1行では 212px になり、320px の画面では固定列だけで
 * 幅を使い切って、横に振っても数字が読めなくなる（T26 で実測）。
 *
 * **名前そのものは変えない。** 表示のときだけ2行に割って、翻数を小さく出す。
 * 割れない名前（括弧が無い）はそのまま1行で返す。
 */

/** 役名を [主, 副] に割る。副は括弧の中身。括弧が無ければ副は null */
export function splitBigHandName(name: string): [string, string | null] {
  // 全角括弧で終わる形だけを見る。途中の括弧では割らない（役名の一部かもしれない）
  const matched = /^(.+?)（(.+)）$/.exec(name);
  if (matched === null) return [name, null];
  return [matched[1], matched[2]];
}
