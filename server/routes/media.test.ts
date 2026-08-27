/**
 * `Range` の解釈のテスト。
 *
 * ここを間違えると**ブラウザが黙って再生しないだけ**で、エラーが出ない。
 * 経路（実 HTTP で 206 と Content-Range が返るか）は verify-api.sh が見る。
 * ここで見るのは、境界の数え方（末尾指定・末尾の丸め・実体外）だけ。
 */

import { describe, expect, it } from "vite-plus/test";
import { parseRange } from "./media";

const SIZE = 1000;

describe("parseRange", () => {
  it("Range が無ければ全体", () => {
    expect(parseRange(undefined, SIZE)).toEqual({ kind: "whole" });
  });

  it("先頭からの範囲", () => {
    expect(parseRange("bytes=0-99", SIZE)).toEqual({ kind: "partial", offset: 0, length: 100 });
  });

  it("終端を省くと最後まで", () => {
    expect(parseRange("bytes=900-", SIZE)).toEqual({ kind: "partial", offset: 900, length: 100 });
  });

  it("末尾指定（bytes=-N）", () => {
    expect(parseRange("bytes=-100", SIZE)).toEqual({ kind: "partial", offset: 900, length: 100 });
  });

  it("末尾指定がサイズを超えたら全体分に丸める", () => {
    expect(parseRange("bytes=-5000", SIZE)).toEqual({ kind: "partial", offset: 0, length: SIZE });
  });

  it("終端がサイズを超えたら最後で止める", () => {
    expect(parseRange("bytes=990-5000", SIZE)).toEqual({
      kind: "partial",
      offset: 990,
      length: 10,
    });
  });

  it("最後の1バイト", () => {
    expect(parseRange("bytes=999-999", SIZE)).toEqual({ kind: "partial", offset: 999, length: 1 });
  });

  it("実体の外は unsatisfiable（416 にする）", () => {
    expect(parseRange("bytes=1000-", SIZE)).toEqual({ kind: "unsatisfiable" });
    expect(parseRange("bytes=1500-2000", SIZE)).toEqual({ kind: "unsatisfiable" });
    expect(parseRange("bytes=500-400", SIZE)).toEqual({ kind: "unsatisfiable" });
    expect(parseRange("bytes=-0", SIZE)).toEqual({ kind: "unsatisfiable" });
  });

  it("解釈しない形は全体（複数レンジ・単位違い・壊れた形）", () => {
    expect(parseRange("bytes=0-99,200-299", SIZE)).toEqual({ kind: "whole" });
    expect(parseRange("items=0-99", SIZE)).toEqual({ kind: "whole" });
    expect(parseRange("bytes=abc", SIZE)).toEqual({ kind: "whole" });
    expect(parseRange("bytes=-", SIZE)).toEqual({ kind: "whole" });
    expect(parseRange("", SIZE)).toEqual({ kind: "whole" });
  });

  it("前後の空白は無視する", () => {
    expect(parseRange("  bytes=0-9  ", SIZE)).toEqual({ kind: "partial", offset: 0, length: 10 });
  });
});
