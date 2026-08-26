/**
 * 今日の日付を `YYYY-MM-DD` で返す。
 *
 * `toISOString().slice(0, 10)` を使ってはいけない。UTC に変換されるので、
 * JST（UTC+9）では **00:00〜08:59 のあいだ前日の日付になる**。
 * 実測: JST 2026-08-26 01:30 → "2026-08-25" / 08:30 → "2026-08-25"
 *
 * 麻雀は夜遅くまでやるうえ、入力係が翌朝まとめて入力することもあるので、
 * 1日のうち9時間が該当する。エッジケースではない。
 */
export function todayLocal(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
