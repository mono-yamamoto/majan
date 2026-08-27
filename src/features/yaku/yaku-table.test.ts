/**
 * 役一覧の**データの整合**を守るテスト。
 *
 * 画面の見た目は測って確かめるしかないが、ここで守れるのは
 * 「データ自身が矛盾していないか」。役を足すときに一番やりそうな取り違えは
 *
 *   - 食い下がるのに `kuisagari` を付け忘れる（画面で赤くならない＝卓で間違える）
 *   - 下がらないのに `kuisagari` を付ける（赤いのに翻が同じ＝嘘）
 *   - 節の見出しと `han` がずれる（「2翻」の節に3翻の役が混ざる）
 *
 * の3つなので、そこだけを見る。翻数そのものが正しいかは、麻雀のルールの話で
 * このテストでは分からない（rules.mdx との突き合わせは人がやる）。
 */

import { describe, expect, it } from "vite-plus/test";
import { YAKU_SECTIONS, YAKUMAN } from "./yaku-table";

const 全部 = YAKU_SECTIONS.flatMap((s) => s.items);

describe("YAKU_SECTIONS", () => {
  it("食い下がりの印と、実際に翻が下がることが一致する", () => {
    for (const y of 全部) {
      if (typeof y.open !== "number" || y.han === null) continue;
      expect(y.kuisagari === true, `${y.name}: kuisagari と open/han が食い違う`).toBe(
        y.open < y.han,
      );
    }
  });

  it("節の見出しの翻数と、中の役の翻数が一致する", () => {
    for (const section of YAKU_SECTIONS) {
      const 見出しの翻 = /^(\d+)翻$/.exec(section.title)?.[1];
      if (見出しの翻 === undefined) continue; // 「満貫扱い」など翻で括れない節
      for (const y of section.items) {
        expect(y.han, `${section.title} の ${y.name}`).toBe(Number(見出しの翻));
      }
    }
  });

  it("役名が重複しない", () => {
    const 名前 = [...全部, ...YAKUMAN].map((y) => y.name);
    expect(new Set(名前).size).toBe(名前.length);
  });

  it("読みが空でない（卓で名前が読めないと引けない）", () => {
    for (const y of [...全部, ...YAKUMAN]) {
      expect(y.reading.length, y.name).toBeGreaterThan(0);
    }
  });
});
