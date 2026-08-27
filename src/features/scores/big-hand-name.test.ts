import { describe, expect, it } from "vite-plus/test";
import { splitBigHandName } from "./big-hand-name";
import { BIG_HANDS } from "./scores-table";

describe("splitBigHandName", () => {
  it("末尾の括弧で2行に割る", () => {
    expect(splitBigHandName("三倍満（11-12翻）")).toEqual(["三倍満", "11-12翻"]);
    expect(splitBigHandName("満貫（5翻）")).toEqual(["満貫", "5翻"]);
  });

  it("中黒を含む長い括弧も1つとして割る（「役満（13翻以上・役満役）」）", () => {
    expect(splitBigHandName("役満（13翻以上・役満役）")).toEqual(["役満", "13翻以上・役満役"]);
  });

  it("括弧が無ければそのまま返す", () => {
    expect(splitBigHandName("満貫")).toEqual(["満貫", null]);
  });

  it("BIG_HANDS の名前は、割っても元に戻せる（表示で中身を落としていない）", () => {
    for (const h of BIG_HANDS) {
      const [主, 副] = splitBigHandName(h.name);
      expect(副 === null ? 主 : `${主}（${副}）`, h.name).toBe(h.name);
    }
  });
});
