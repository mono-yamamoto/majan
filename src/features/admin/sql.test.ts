import { describe, expect, it } from "vite-plus/test";
import {
  buildScript,
  buildWranglerCommand,
  confirmQuery,
  diffRoster,
  nextMemberId,
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

  it("穴があればそこを埋める", () => {
    expect(nextMemberId([1, 2, 4, 5])).toBe(3);
  });

  it("空なら 1", () => {
    expect(nextMemberId([])).toBe(1);
  });

  it("順不同でも正しい", () => {
    expect(nextMemberId([10, 1, 3, 2])).toBe(4);
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
    expect(diffRoster(CURRENT, edited, []).map((c) => c.memberId)).toEqual([1, 6]);
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
