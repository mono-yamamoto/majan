import { describe, expect, it } from "vite-plus/test";
import {
  buildScript,
  buildWranglerCommand,
  confirmQuery,
  diffNames,
  diffRoster,
  nextMemberId,
  sanitizeName,
  shellSingleQuote,
  sqlString,
  statementFor,
  type EditedRow,
  type RosterRow,
} from "./sql";

const CURRENT: RosterRow[] = [
  { memberId: 1, name: "山田", teamId: 1 },
  { memberId: 2, name: "佐藤", teamId: 1 },
  { memberId: 6, name: "伊藤", teamId: 2 },
];

const asEdited = (rows: RosterRow[]): EditedRow[] =>
  rows.map((r) => ({ memberId: r.memberId, name: r.name, teamId: r.teamId }));

describe("sqlString", () => {
  it("シングルクォートで囲む", () => {
    expect(sqlString("山田")).toBe("'山田'");
  });

  it("シングルクォートを '' に重ねる", () => {
    expect(sqlString("O'Connor")).toBe("'O''Connor'");
  });

  it("複数のシングルクォートを全部置き換える（1つ目だけにしない）", () => {
    expect(sqlString("a'b'c")).toBe("'a''b''c'");
  });

  it("バックスラッシュはそのまま（SQLite では特別扱いされない）", () => {
    expect(sqlString(String.raw`a\b`)).toBe(String.raw`'a\b'`);
  });

  it("二重引用符はそのまま（文字列リテラルの中では普通の文字）", () => {
    expect(sqlString('say "hi"')).toBe(`'say "hi"'`);
  });
});

describe("shellSingleQuote", () => {
  it("シングルクォートで囲む", () => {
    expect(shellSingleQuote("SELECT 1;")).toBe("'SELECT 1;'");
  });

  it("中のシングルクォートを '\\'' にする", () => {
    // 閉じる → エスケープした ' → 開き直す
    expect(shellSingleQuote("a'b")).toBe(String.raw`'a'\''b'`);
  });

  it("$ やバッククォートは囲むだけで無害になる（展開されない）", () => {
    expect(shellSingleQuote("$HOME `id`")).toBe("'$HOME `id`'");
  });
});

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

describe("statementFor", () => {
  it("rename", () => {
    expect(
      statementFor({ kind: "rename", memberId: 3, before: "鈴木", after: "鈴木一" }, 1),
    ).toEqual(["UPDATE members SET name = '鈴木一' WHERE id = 3;"]);
  });

  it("team", () => {
    expect(
      statementFor({ kind: "team", memberId: 3, name: "鈴木", before: 1, after: 2 }, 1),
    ).toEqual(["UPDATE league_members SET team_id = 2 WHERE league_id = 1 AND member_id = 3;"]);
  });

  it("remove", () => {
    expect(statementFor({ kind: "remove", memberId: 5, name: "高橋", teamId: 1 }, 1)).toEqual([
      "DELETE FROM league_members WHERE league_id = 1 AND member_id = 5;",
    ]);
  });

  it("add は members → league_members の順（逆だと外部キーで落ちる）", () => {
    expect(statementFor({ kind: "add", memberId: 11, name: "新人", teamId: 1 }, 1)).toEqual([
      "INSERT INTO members (id, name) VALUES (11, '新人');",
      "INSERT INTO league_members (league_id, member_id, team_id) VALUES (1, 11, 1);",
    ]);
  });

  it("名前の ' がエスケープされる（rename も add も）", () => {
    expect(statementFor({ kind: "rename", memberId: 3, before: "a", after: "O'Brien" }, 1)[0]).toBe(
      "UPDATE members SET name = 'O''Brien' WHERE id = 3;",
    );
    expect(statementFor({ kind: "add", memberId: 11, name: "O'Brien", teamId: 1 }, 1)[0]).toBe(
      "INSERT INTO members (id, name) VALUES (11, 'O''Brien');",
    );
  });

  it("league_id は引数のものを使う（1 を埋め込まない）", () => {
    expect(statementFor({ kind: "remove", memberId: 5, name: "高橋", teamId: 1 }, 7)[0]).toContain(
      "league_id = 7",
    );
  });
});

describe("buildScript / buildWranglerCommand", () => {
  const edited = asEdited(CURRENT);
  edited[0]!.name = "O'Brien";
  edited[0]!.teamId = 2;
  const changes = diffRoster(CURRENT, edited, [{ memberId: 11, name: "新人", teamId: 1 }]);

  it("変更を1つのブロックにまとめる", () => {
    expect(buildScript(changes, 1)).toBe(
      [
        "UPDATE members SET name = 'O''Brien' WHERE id = 1;",
        "UPDATE league_members SET team_id = 2 WHERE league_id = 1 AND member_id = 1;",
        "INSERT INTO members (id, name) VALUES (11, '新人');",
        "INSERT INTO league_members (league_id, member_id, team_id) VALUES (1, 11, 1);",
      ].join("\n"),
    );
  });

  it("変更が無ければ空文字", () => {
    expect(buildScript([], 1)).toBe("");
  });

  it("wrangler の形はシングルクォートで包み、中の ' を壊さない", () => {
    const command = buildWranglerCommand(changes, 1);
    expect(command.startsWith("wrangler d1 execute majan --remote --command '")).toBe(true);
    expect(command.endsWith("'")).toBe(true);
    // SQL 側の '' が、シェルのエスケープで '\''\'' になっている
    expect(command).toContain(String.raw`'\''`);
  });
});

describe("confirmQuery", () => {
  it("チーム別人数と wrong_league を見る（usage.mdx と同じ）", () => {
    const sql = confirmQuery(1);
    expect(sql).toContain("wrong_league");
    expect(sql).toContain("COUNT(*)");
    expect(sql).toContain("WHERE lm.league_id = 1");
  });
});

// 実 D1 に流して往復一致することを確認した入力（SQL 直・wrangler コマンド経由の両方）。
// このページは SQL を人に渡すので、壊れた SQL を出すと害になる。壊し方を固定しておく。
describe("エスケープ / 壊しにいく入力", () => {
  const NASTY: [string, string][] = [
    ["SQL 注入っぽいもの", "x'; DROP TABLE members; --"],
    ["二重引用符とシェル特殊文字", 'a"b$c`d\\e'],
    ["改行", "line1\nline2"],
    ["タブ", "tab\there"],
    ["SQL コメント", "-- comment"],
    ["セミコロン", ";;;"],
    ["全角スペース", "全角\u3000スペース"],
    ["末尾バックスラッシュ", "a\\"],
    ["すでに '' が入っている", "a''b"],
    ["絵文字", "🀄🀅🀆"],
    ["長い名前", "あ".repeat(200)],
    ["復帰改行", "a\r\nb"],
  ];

  for (const [label, name] of NASTY) {
    it(`${label}: SQL リテラルは ' だけを '' にして、他はそのまま通す`, () => {
      const literal = sqlString(name);
      expect(literal.startsWith("'")).toBe(true);
      expect(literal.endsWith("'")).toBe(true);
      // 中身は元の文字列の ' を倍にしたものと一致する（他の文字を触っていない）
      expect(literal.slice(1, -1)).toBe(name.replaceAll("'", "''"));
    });

    it(`${label}: シェルの引用は ' 以外を触らない`, () => {
      const quoted = shellSingleQuote(name);
      expect(quoted.slice(1, -1)).toBe(name.replaceAll("'", String.raw`'\''`));
    });
  }

  it("閉じていない引用符を作らない（' の数が必ず偶数になる）", () => {
    for (const [, name] of NASTY) {
      const literal = sqlString(name);
      // 絵文字を含むので spread ではなくマッチ数で数える（コードポイント分割を避ける）
      expect((literal.match(/'/g) ?? []).length % 2).toBe(0);
    }
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

describe("statementFor / リーグ名・チーム名", () => {
  it("leagueName は leagues を引数の id で更新する", () => {
    expect(statementFor({ kind: "leagueName", before: "a", after: "2026 合宿" }, 7)).toEqual([
      "UPDATE leagues SET name = '2026 合宿' WHERE id = 7;",
    ]);
  });

  it("teamName は teams を team_id で更新する（league_id では引かない）", () => {
    expect(statementFor({ kind: "teamName", teamId: 2, before: "a", after: "青" }, 1)).toEqual([
      "UPDATE teams SET name = '青' WHERE id = 2;",
    ]);
  });

  it("' はエスケープされる", () => {
    expect(statementFor({ kind: "teamName", teamId: 2, before: "a", after: "O'Team" }, 1)[0]).toBe(
      "UPDATE teams SET name = 'O''Team' WHERE id = 2;",
    );
  });
});
