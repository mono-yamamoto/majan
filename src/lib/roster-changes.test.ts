import { describe, expect, it } from "vite-plus/test";
import {
  diffNames,
  diffRoster,
  nextMemberId,
  sanitizeName,
  type EditedRow,
  type RosterRow,
} from "./roster-changes";

const CURRENT: RosterRow[] = [
  { memberId: 1, name: "山田", teamId: 1 },
  { memberId: 2, name: "佐藤", teamId: 1 },
  { memberId: 6, name: "伊藤", teamId: 2 },
];

const asEdited = (rows: RosterRow[]): EditedRow[] =>
  rows.map((r) => ({ memberId: r.memberId, name: r.name, teamId: r.teamId }));

describe("nextMemberId", () => {
  it("連番の次を返す", () => {
    expect(nextMemberId([1, 2, 3])).toBe(4);
  });

  it("★ 穴は埋めない。外した人の id を再利用すると UNIQUE で落ちる", () => {
    // 5 を名簿から外すと GET の members から消えるが、members テーブルには残る。
    // 穴を埋めると、外した直後の追加でちょうど 5 を提案してしまう
    expect(nextMemberId([1, 2, 3, 4, 6, 7, 8, 9, 10])).toBe(11);
  });

  it("空なら 1", () => {
    expect(nextMemberId([])).toBe(1);
  });

  it("順不同でも最大 + 1", () => {
    expect(nextMemberId([10, 1, 3, 2])).toBe(11);
  });
});

describe("sanitizeName", () => {
  it("NUL を落とす（--file で流すと SQL がそこで切れ、黙って捨てられる）", () => {
    expect(sanitizeName("a\u0000b")).toBe("ab");
  });

  it("ESC・BEL・改行・タブなどの C0 制御文字と DEL を落とす", () => {
    expect(sanitizeName("a\u001bb\u0007c\nd\te\u007ff")).toBe("abcdef");
  });

  it("普通の文字は触らない（絵文字・全角・記号・引用符）", () => {
    expect(sanitizeName('O\'Brien \u3000 🀄 $HOME `id` "x"')).toBe(
      'O\'Brien \u3000 🀄 $HOME `id` "x"',
    );
  });

  it("空文字はそのまま", () => {
    expect(sanitizeName("")).toBe("");
  });

  it("★ ゼロ幅スペース（U+200B）を落とす（見えない名前を作らせない）", () => {
    expect(sanitizeName("\u200b")).toBe("");
    expect(sanitizeName("a\u200bb")).toBe("ab");
  });

  it("★ BOM（U+FEFF）と双方向制御（U+202E）も落とす", () => {
    expect(sanitizeName("\ufeff")).toBe("");
    expect(sanitizeName("a\u202eb")).toBe("ab");
  });

  it("絵文字の ZWJ も落ちる（結合絵文字はばらける。承知のうえ）", () => {
    // \u{1F468}\u200D\u{1F469} は ZWJ が落ちて2つの絵文字になる
    expect(sanitizeName("\u{1F468}\u200D\u{1F469}")).toBe("\u{1F468}\u{1F469}");
  });
});

describe("diffRoster", () => {
  it("何も変えなければ空", () => {
    expect(diffRoster(CURRENT, asEdited(CURRENT), [])).toEqual([]);
  });

  it("名前の変更を拾う", () => {
    const edited = asEdited(CURRENT);
    edited[0]!.name = "山田太郎";
    expect(diffRoster(CURRENT, edited, [])).toEqual([
      { kind: "rename", memberId: 1, before: "山田", after: "山田太郎" },
    ]);
  });

  it("前後の空白だけの違いは変更としない", () => {
    const edited = asEdited(CURRENT);
    edited[0]!.name = "  山田  ";
    expect(diffRoster(CURRENT, edited, [])).toEqual([]);
  });

  it("空にしただけなら変更としない（消す操作ではない）", () => {
    const edited = asEdited(CURRENT);
    edited[0]!.name = "";
    expect(diffRoster(CURRENT, edited, [])).toEqual([]);
  });

  it("チームの変更を拾う", () => {
    const edited = asEdited(CURRENT);
    edited[0]!.teamId = 2;
    expect(diffRoster(CURRENT, edited, [])).toEqual([
      { kind: "team", memberId: 1, name: "山田", before: 1, after: 2 },
    ]);
  });

  it("★ 改名しつつ外すと、remove の name は編集後の名前（警告が古い名前を名乗らない）", () => {
    const edited = asEdited(CURRENT);
    edited[0]!.name = "山田太郎";
    edited[0]!.teamId = null;
    expect(diffRoster(CURRENT, edited, [])).toEqual([
      { kind: "rename", memberId: 1, before: "山田", after: "山田太郎" },
      { kind: "remove", memberId: 1, name: "山田太郎", teamId: 1 },
    ]);
  });

  it("改名しつつチームを変えても、team の name は編集後の名前", () => {
    const edited = asEdited(CURRENT);
    edited[0]!.name = "山田太郎";
    edited[0]!.teamId = 2;
    expect(diffRoster(CURRENT, edited, [])[1]).toEqual({
      kind: "team",
      memberId: 1,
      name: "山田太郎",
      before: 1,
      after: 2,
    });
  });

  it("名前欄が空なら DB の名前に戻す（改名を出さないので、流したあともその名前）", () => {
    const edited = asEdited(CURRENT);
    edited[0]!.name = "";
    edited[0]!.teamId = null;
    expect(diffRoster(CURRENT, edited, [])).toEqual([
      { kind: "remove", memberId: 1, name: "山田", teamId: 1 },
    ]);
  });

  it("所属を外すのは remove（team の変更としては出さない）", () => {
    const edited = asEdited(CURRENT);
    edited[0]!.teamId = null;
    expect(diffRoster(CURRENT, edited, [])).toEqual([
      { kind: "remove", memberId: 1, name: "山田", teamId: 1 },
    ]);
  });

  it("名前とチームを両方変えたら2件出る", () => {
    const edited = asEdited(CURRENT);
    edited[0]!.name = "山田太郎";
    edited[0]!.teamId = 2;
    expect(diffRoster(CURRENT, edited, []).map((c) => c.kind)).toEqual(["rename", "team"]);
  });

  it("追加を拾う", () => {
    expect(
      diffRoster(CURRENT, asEdited(CURRENT), [{ memberId: 11, name: "新人", teamId: 2 }]),
    ).toEqual([{ kind: "add", memberId: 11, name: "新人", teamId: 2 }]);
  });

  it("名前が空の追加行は無視する（入力途中の行を SQL に出さない）", () => {
    expect(
      diffRoster(CURRENT, asEdited(CURRENT), [{ memberId: 11, name: "  ", teamId: 1 }]),
    ).toEqual([]);
  });

  it("複数人をまとめて動かせる（チーム入れ替え）", () => {
    const edited = asEdited(CURRENT);
    edited[0]!.teamId = 2;
    edited[2]!.teamId = 1;
    expect(
      diffRoster(CURRENT, edited, []).map((c) => (c.kind === "team" ? c.memberId : null)),
    ).toEqual([1, 6]);
  });
});

describe("diffNames", () => {
  const CURRENT_NAMES = {
    leagueName: "2026 秋リーグ",
    teams: [
      { id: 1, name: "チームA" },
      { id: 2, name: "チームB" },
    ],
  };

  it("何も変えなければ空", () => {
    expect(diffNames(CURRENT_NAMES, CURRENT_NAMES)).toEqual([]);
  });

  it("リーグ名の変更を拾う", () => {
    expect(diffNames(CURRENT_NAMES, { ...CURRENT_NAMES, leagueName: "2026 合宿" })).toEqual([
      { kind: "leagueName", before: "2026 秋リーグ", after: "2026 合宿" },
    ]);
  });

  it("チーム名の変更を拾う", () => {
    const edited = {
      ...CURRENT_NAMES,
      teams: [
        { id: 1, name: "赤" },
        { id: 2, name: "チームB" },
      ],
    };
    expect(diffNames(CURRENT_NAMES, edited)).toEqual([
      { kind: "teamName", teamId: 1, before: "チームA", after: "赤" },
    ]);
  });

  it("両方変えたら2件（リーグが先）", () => {
    const edited = {
      leagueName: "2026 合宿",
      teams: [
        { id: 1, name: "赤" },
        { id: 2, name: "青" },
      ],
    };
    expect(diffNames(CURRENT_NAMES, edited).map((c) => c.kind)).toEqual([
      "leagueName",
      "teamName",
      "teamName",
    ]);
  });

  it("空は「入力途中」として変更に出さない（メンバー名と同じ扱い）", () => {
    const edited = {
      leagueName: "",
      teams: [
        { id: 1, name: "  " },
        { id: 2, name: "チームB" },
      ],
    };
    expect(diffNames(CURRENT_NAMES, edited)).toEqual([]);
  });

  it("前後の空白だけの違いは変更としない", () => {
    const edited = { ...CURRENT_NAMES, leagueName: "  2026 秋リーグ  " };
    expect(diffNames(CURRENT_NAMES, edited)).toEqual([]);
  });

  it("制御文字は落としてから比べる", () => {
    const edited = { ...CURRENT_NAMES, leagueName: "2026 秋\u0000リーグ" };
    expect(diffNames(CURRENT_NAMES, edited)).toEqual([]);
  });

  it("知らない team_id は無視する（画面が持っているチームだけを触る）", () => {
    const edited = { ...CURRENT_NAMES, teams: [{ id: 99, name: "知らないチーム" }] };
    expect(diffNames(CURRENT_NAMES, edited)).toEqual([]);
  });
});
