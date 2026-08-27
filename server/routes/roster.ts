/**
 * POST /api/leagues/:id/roster — 名簿の変更をまとめて適用する。
 *
 * 運営メニュー（`/leagues/:id/admin`）が、現状と編集後の差分（`Change[]`）を
 * そのまま送る。差分の作り方は `src/lib/roster-changes.ts` にあり、
 * **フロントとサーバで同じ型を使う**。
 *
 * 設計の芯は3つ。
 *
 * 1. **値は必ずバインドパラメータで渡す。** 名前は運営が自由に入れる欄なので、
 *    SQL 文字列に埋め込まない。
 *
 * 2. **`before` を現在の DB と突き合わせ、1つでも違えば丸ごと 409。**
 *    この画面は**開いた時点の名簿を保持していて、裏の変更を知らない**
 *    （`diffRoster` のコメント参照）。2人が同時に開いていると、後から押した方が
 *    相手の変更を黙って踏み潰す。SQL を手で流していたときは1人でやっていたので
 *    起きなかった事故が、API にすると起きる。
 *
 *    ★ **塞いだのは「画面を開いたまま放置した」長い窓だけ。**
 *    読み取りと `batch()` の間のミリ秒の窓は残っている。同時に2人が同じ人を
 *    改名すると、**両方が `before` 検証を通って後勝ちになる**（実測）。
 *    D1 に対話的トランザクションが無く、読んでから書くまでを1つにできない。
 *    「原子的だから安全」ではない。**`batch()` が原子的なのは1リクエストの中だけ**で、
 *    リクエスト同士は直列化していない。
 *    id の衝突だけは、落ちたときに 409 へ写して読み込み直させている（下の catch）。
 *
 * 3. **`batch()` で全部一括。** D1 に対話的トランザクションは無く、
 *    原子化の手段はこれだけ。1件ずつ流すと、途中で落ちたときに
 *    「チーム名だけ変わって所属は変わっていない」半端な状態が残る。
 */

import { Hono } from "hono";
import { NAME_MAX_LENGTH, sanitizeName, type Change } from "../../src/lib/roster-changes";
import { requirePasscode } from "../auth";
import { readJson } from "../body";
import type { Bindings } from "../index";
import { parseId } from "./leagues";

export const roster = new Hono<{ Bindings: Bindings }>();

roster.on(["POST"], "/api/leagues/:id/roster", requirePasscode);

/** 現在の DB の状態。`before` の突き合わせに使う */
type Current = {
  leagueName: string;
  /** team_id → チーム名。**このリーグのチームだけ** */
  teams: Map<number, string>;
  /** member_id → 名前。members 全体（別リーグの人も含む。id の重複を見るため） */
  memberNames: Map<number, string>;
  /** member_id → team_id。**このリーグの所属だけ** */
  roster: Map<number, number>;
};

async function loadCurrent(db: D1Database, leagueId: number): Promise<Current | null> {
  const [leagueRes, teamRes, memberRes, rosterRes] = await db.batch([
    db.prepare("SELECT name FROM leagues WHERE id = ?1").bind(leagueId),
    db.prepare("SELECT id, name FROM teams WHERE league_id = ?1").bind(leagueId),
    db.prepare("SELECT id, name FROM members"),
    db.prepare("SELECT member_id, team_id FROM league_members WHERE league_id = ?1").bind(leagueId),
  ]);

  const league = (leagueRes.results as { name: string }[])[0];
  if (league === undefined) return null;

  return {
    leagueName: league.name,
    teams: new Map((teamRes.results as { id: number; name: string }[]).map((t) => [t.id, t.name])),
    memberNames: new Map(
      (memberRes.results as { id: number; name: string }[]).map((m) => [m.id, m.name]),
    ),
    roster: new Map(
      (rosterRes.results as { member_id: number; team_id: number }[]).map((r) => [
        r.member_id,
        r.team_id,
      ]),
    ),
  };
}

/** 形の検査。validate の前に、型どおりであることをここで保証する */
function parseChanges(body: unknown): { ok: true; value: Change[] } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "body must be an object" };
  }
  const raw = (body as { changes?: unknown }).changes;
  if (!Array.isArray(raw)) return { ok: false, error: "changes must be an array" };
  // 空の適用は「押したのに何も起きない」ので、成功と言わずに弾く。
  // 画面はボタンを押せなくしているので、ここに来るのは呼び出し側の不具合。
  if (raw.length === 0) return { ok: false, error: "changes must not be empty" };

  const int = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
  const str = (v: unknown) => typeof v === "string";

  /**
   * DB に入れる名前を整える。**ここを通った値しか書き込まない。**
   *
   * 通さないと、空文字・空白だけ・制御文字入り・前後空白つき・
   * 極端に長い名前がそのまま入る。名前はランキング・ヘッダ・
   * 登録画面の optgroup ラベルにそのまま出るので、
   * **「誰がどのチームか分からなくて登録できない」（T7 で直した状態）に戻る**。
   *
   * 400 にするのは、空の名前は**読み込み直しても直らない**から
   * （409 は「読み込み直せば直る」ものに使う）。
   *
   * 正規化した値を使うことで、「運営が触っていない行が勝手に改名として
   * 差分に出る」も消える。DB に正規化済みの値しか入らなくなるため。
   */
  const cleanName = (v: unknown): { ok: true; value: string } | { ok: false; why: string } => {
    if (!str(v)) return { ok: false, why: "must be a string" };
    const name = sanitizeName(v as string).trim();
    if (name === "") return { ok: false, why: "must not be empty" };
    if (name.length > NAME_MAX_LENGTH) {
      return { ok: false, why: `must be ${NAME_MAX_LENGTH} characters or fewer` };
    }
    return { ok: true, value: name };
  };

  const out: Change[] = [];
  for (const [i, item] of raw.entries()) {
    if (typeof item !== "object" || item === null) {
      return { ok: false, error: `changes[${i}] must be an object` };
    }
    const c = item as Record<string, unknown>;
    const bad = (why: string) => ({ ok: false as const, error: `changes[${i}]: ${why}` });
    switch (c.kind) {
      case "leagueName": {
        if (!str(c.before)) return bad("before must be a string");
        const after = cleanName(c.after);
        if (!after.ok) return bad(`after ${after.why}`);
        out.push({ kind: "leagueName", before: c.before as string, after: after.value });
        break;
      }
      case "teamName": {
        if (!int(c.teamId)) return bad("teamId must be a positive integer");
        if (!str(c.before)) return bad("before must be a string");
        const after = cleanName(c.after);
        if (!after.ok) return bad(`after ${after.why}`);
        out.push({
          kind: "teamName",
          teamId: c.teamId as number,
          before: c.before as string,
          after: after.value,
        });
        break;
      }
      case "rename": {
        if (!int(c.memberId)) return bad("memberId must be a positive integer");
        if (!str(c.before)) return bad("before must be a string");
        const after = cleanName(c.after);
        if (!after.ok) return bad(`after ${after.why}`);
        out.push({
          kind: "rename",
          memberId: c.memberId as number,
          before: c.before as string,
          after: after.value,
        });
        break;
      }
      case "team":
        if (!int(c.memberId)) return bad("memberId must be a positive integer");
        if (!int(c.before) || !int(c.after)) return bad("before/after must be positive integers");
        if (!str(c.name)) return bad("name must be a string");
        out.push({
          kind: "team",
          memberId: c.memberId as number,
          name: c.name as string,
          before: c.before as number,
          after: c.after as number,
        });
        break;
      case "remove":
        if (!int(c.memberId)) return bad("memberId must be a positive integer");
        if (!int(c.teamId)) return bad("teamId must be a positive integer");
        if (!str(c.name)) return bad("name must be a string");
        out.push({
          kind: "remove",
          memberId: c.memberId as number,
          name: c.name as string,
          teamId: c.teamId as number,
        });
        break;
      case "add": {
        if (!int(c.memberId)) return bad("memberId must be a positive integer");
        if (!int(c.teamId)) return bad("teamId must be a positive integer");
        const name = cleanName(c.name);
        if (!name.ok) return bad(`name ${name.why}`);
        out.push({
          kind: "add",
          memberId: c.memberId as number,
          name: name.value,
          teamId: c.teamId as number,
        });
        break;
      }
      default:
        return bad(`unknown kind: ${String(c.kind)}`);
    }
  }
  return { ok: true, value: out };
}

/** 画面に出す用の、何が食い違ったかの説明 */
type Conflict = { kind: Change["kind"]; message: string };

/**
 * 現在の DB と突き合わせる。
 *
 * 「今の状態と噛み合わない」（409）と「そもそもこのリーグの話ではない」（400）を
 * 分ける。前者は読み込み直せば直るが、後者は直らないので、画面の出し方が変わる。
 */
function validate(
  changes: Change[],
  current: Current,
  leagueId: number,
): { conflicts: Conflict[]; badRequests: string[] } {
  const conflicts: Conflict[] = [];
  const badRequests: string[] = [];

  // 同じ適用の中で追加した id も「使用済み」として扱う（重複した add を弾く）
  const addedIds = new Set<number>();

  for (const change of changes) {
    switch (change.kind) {
      case "leagueName":
        if (current.leagueName !== change.before) {
          conflicts.push({
            kind: change.kind,
            message: `リーグ名が「${current.leagueName}」に変わっています`,
          });
        }
        break;

      case "teamName": {
        // teams.id はグローバルな主キーなので、league_id で絞らないと
        // body に他リーグの teamId を入れて別リーグの名前を書き換えられる
        const name = current.teams.get(change.teamId);
        if (name === undefined) {
          badRequests.push(`team ${change.teamId} is not in league ${leagueId}`);
        } else if (name !== change.before) {
          conflicts.push({ kind: change.kind, message: `チーム名が「${name}」に変わっています` });
        }
        break;
      }

      case "rename": {
        const name = current.memberNames.get(change.memberId);
        if (name === undefined || !current.roster.has(change.memberId)) {
          conflicts.push({
            kind: change.kind,
            message: `#${change.memberId} はこのリーグの名簿にありません`,
          });
        } else if (name !== change.before) {
          conflicts.push({
            kind: change.kind,
            message: `#${change.memberId} の名前が「${name}」に変わっています`,
          });
        }
        break;
      }

      case "team": {
        const team = current.roster.get(change.memberId);
        if (team === undefined) {
          conflicts.push({
            kind: change.kind,
            message: `${change.name} はこのリーグの名簿にありません`,
          });
        } else if (team !== change.before) {
          conflicts.push({ kind: change.kind, message: `${change.name} の所属が変わっています` });
        }
        if (!current.teams.has(change.after)) {
          badRequests.push(`team ${change.after} is not in league ${leagueId}`);
        }
        break;
      }

      case "remove": {
        const team = current.roster.get(change.memberId);
        if (team === undefined) {
          conflicts.push({
            kind: change.kind,
            message: `${change.name} は既にこのリーグの名簿から外れています`,
          });
        } else if (team !== change.teamId) {
          conflicts.push({ kind: change.kind, message: `${change.name} の所属が変わっています` });
        }
        break;
      }

      case "add": {
        // member_id は画面（nextMemberId）が決めている。2人が同時に追加すると
        // 同じ番号を採るので、ここで使用済みなら 409 にして読み込み直させる。
        // INSERT に任せると UNIQUE の生エラーになり、何が起きたか読めない。
        if (current.memberNames.has(change.memberId) || addedIds.has(change.memberId)) {
          conflicts.push({
            kind: change.kind,
            message: `#${change.memberId} は既に使われています（${change.name} を追加できません）`,
          });
        }
        addedIds.add(change.memberId);
        if (!current.teams.has(change.teamId)) {
          badRequests.push(`team ${change.teamId} is not in league ${leagueId}`);
        }
        break;
      }
    }
  }

  return { conflicts, badRequests };
}

/** 1つの変更を、バインド済みの文（複数のこともある）にする */
function statementsFor(db: D1Database, change: Change, leagueId: number): D1PreparedStatement[] {
  switch (change.kind) {
    case "leagueName":
      return [
        db.prepare("UPDATE leagues SET name = ?1 WHERE id = ?2").bind(change.after, leagueId),
      ];
    case "teamName":
      return [
        db
          .prepare("UPDATE teams SET name = ?1 WHERE id = ?2 AND league_id = ?3")
          .bind(change.after, change.teamId, leagueId),
      ];
    case "rename":
      // members はリーグ横断（人は全体で1行）。同じ人が別リーグにもいれば
      // そちらの表示も変わるが、それが正しい。このリーグの名簿にいることは
      // validate で確認済み。members に league_id は無いので絞りようもない。
      return [
        db
          .prepare("UPDATE members SET name = ?1 WHERE id = ?2")
          .bind(change.after, change.memberId),
      ];
    case "team":
      return [
        db
          .prepare("UPDATE league_members SET team_id = ?1 WHERE league_id = ?2 AND member_id = ?3")
          .bind(change.after, leagueId, change.memberId),
      ];
    case "remove":
      // league_members からだけ消す。members からも game_results からも消さない。
      // 半荘に出た人を名簿から外すと戦績が「名簿に無いメンバー」と注記する設計
      // （unassigned・D-23）で、それが正しい。成績を消すとゼロサムが壊れる。
      return [
        db
          .prepare("DELETE FROM league_members WHERE league_id = ?1 AND member_id = ?2")
          .bind(leagueId, change.memberId),
      ];
    case "add":
      // members → league_members の順。逆だと外部キーで落ちる
      return [
        db
          .prepare("INSERT INTO members (id, name) VALUES (?1, ?2)")
          .bind(change.memberId, change.name),
        db
          .prepare("INSERT INTO league_members (league_id, member_id, team_id) VALUES (?1, ?2, ?3)")
          .bind(leagueId, change.memberId, change.teamId),
      ];
  }
}

roster.post("/api/leagues/:id/roster", async (c) => {
  const leagueId = parseId(c.req.param("id"));
  if (leagueId === null) return c.json({ error: "not found" }, 404);

  const body = await readJson(c);
  if (!body.ok) return c.json({ error: body.error }, body.status);

  const parsed = parseChanges(body.value);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);

  const db = c.env.DB;
  const current = await loadCurrent(db, leagueId);
  if (current === null) return c.json({ error: "league not found" }, 404);

  const { conflicts, badRequests } = validate(parsed.value, current, leagueId);
  if (badRequests.length > 0) return c.json({ error: badRequests.join(" / ") }, 400);
  // 1つでも食い違えば丸ごと断る。一部だけ通すと、画面が出していた
  // 「変更後の人数」と実際の結果がずれる
  if (conflicts.length > 0) return c.json({ conflicts }, 409);

  const statements = parsed.value.flatMap((change) => statementsFor(db, change, leagueId));
  try {
    await db.batch(statements);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // 検証と batch の間に別のリクエストが同じ id を入れると、ここで落ちる。
    // 500 のままだと「サーバーが壊れた」に見えるが、実際は読み込み直せば直る。
    // games.ts が NOT NULL → 404 に写しているのと同じ手法。
    if (message.includes("UNIQUE constraint failed: members.id")) {
      const conflicts = [
        { kind: "add", message: "追加しようとした番号を、ほぼ同時に別の人が使いました" },
      ];
      return c.json({ conflicts }, 409);
    }
    console.error("[roster] batch failed:", message);
    return c.json({ error: "database error" }, 500);
  }

  return c.json({ applied: parsed.value.length });
});
