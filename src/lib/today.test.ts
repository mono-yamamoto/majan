import { describe, expect, it } from "vite-plus/test";
import { todayLocal } from "./today";

describe("todayLocal", () => {
  /**
   * ★toISOString() を使うと毎日9時間ずれる★
   * JST は UTC+9 なので、日本時間の 00:00〜08:59 は UTC では前日になる。
   * 入力係が翌朝まとめて入力する経路で現実に踏む。
   */
  it.each([
    ["2026-08-26T01:30:00+09:00", "2026-08-26"],
    ["2026-08-26T08:30:00+09:00", "2026-08-26"],
    ["2026-08-27T00:10:00+09:00", "2026-08-27"],
    ["2026-08-26T23:59:00+09:00", "2026-08-26"],
    ["2026-01-01T00:00:00+09:00", "2026-01-01"],
  ])("%s のローカル日付は %s", (iso, expected) => {
    const date = new Date(iso);
    // 実行環境が JST のときだけ意味のある比較になるので、そこを明示する
    if (Intl.DateTimeFormat().resolvedOptions().timeZone !== "Asia/Tokyo") return;
    expect(todayLocal(date)).toBe(expected);
    // 同じ入力で toISOString だと前日になることを示しておく
    if (expected === "2026-08-26" && iso.includes("01:30")) {
      expect(date.toISOString().slice(0, 10)).not.toBe(expected);
    }
  });

  it("月・日が1桁でもゼロ埋めされる", () => {
    expect(todayLocal(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(todayLocal(new Date(2026, 8, 9))).toBe("2026-09-09");
  });

  it("games.played_on の CHECK と同じ形式（YYYY-MM-DD）になる", () => {
    expect(todayLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
