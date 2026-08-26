/**
 * 運営ページが表示する SQL の組み立て。
 *
 * このファイルは**文字列を作るだけ**で、何も実行しない。実行するのは運営が
 * `wrangler` か Cloudflare のダッシュボードで行う（決定#11: 運営系テーブルへの
 * 書き込みAPIは作らない）。
 *
 * 生成した SQL が壊れていたらこのページの価値はゼロなので、エスケープと
 * 差分の取り方はここに閉じてテストで固定する。
 */

/** 名簿の1行。画面の編集前後で同じ形を使う */
export type RosterRow = {
  memberId: number;
  name: string;
  teamId: number;
};

/** 画面で編集したあとの1行。teamId が null なら「所属を外す」 */
export type EditedRow = {
  memberId: number;
  name: string;
  teamId: number | null;
};

/** 追加する人。id は未使用のものを画面が提案する */
export type NewRow = {
  memberId: number;
  name: string;
  teamId: number;
};

/**
 * SQL の文字列リテラルにする。
 *
 * SQLite の文字列リテラルでエスケープが要るのは **シングルクォートだけ**で、
 * `''` と重ねる。バックスラッシュは特別扱いされない（`\` はただの文字）。
 * 名前に `'` が入るのは普通にありうる（オコナー等）。
 */
export function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * シェルのシングルクォート文字列にする。
 *
 * `--command "..."` だと名前に含まれる `"` や `$` や `` ` `` が展開されてしまう。
 * シングルクォートで囲み、中の `'` を `'\''`（閉じる→エスケープした'→開き直す）に
 * すれば、**どんな中身でもそのまま渡せる**。
 */
export function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", String.raw`'\''`)}'`;
}

/** 未使用のうち一番小さい正の id。members の id は運営が手で振る */
export function nextMemberId(usedIds: number[]): number {
  const used = new Set(usedIds);
  let id = 1;
  while (used.has(id)) id += 1;
  return id;
}

export type Change =
  | { kind: "rename"; memberId: number; before: string; after: string }
  | { kind: "team"; memberId: number; name: string; before: number; after: number }
  | { kind: "remove"; memberId: number; name: string; teamId: number }
  | { kind: "add"; memberId: number; name: string; teamId: number };

/**
 * 現状と編集後を突き合わせて、変更の一覧を作る。
 *
 * SQL を先に組み立てず、いったん「何が変わったか」にするのは、画面が
 * 警告（開幕後の所属変更・半荘に出た人を外す）を出す判断に使うため。
 */
export function diffRoster(current: RosterRow[], edited: EditedRow[], added: NewRow[]): Change[] {
  const changes: Change[] = [];
  const byId = new Map(edited.map((row) => [row.memberId, row]));

  for (const row of current) {
    const next = byId.get(row.memberId);
    if (next === undefined) continue;

    // 名前の変更と所属の変更は別の操作。両方あれば両方出す
    const after = next.name.trim();
    if (after !== "" && after !== row.name) {
      changes.push({ kind: "rename", memberId: row.memberId, before: row.name, after });
    }
    if (next.teamId === null) {
      changes.push({ kind: "remove", memberId: row.memberId, name: row.name, teamId: row.teamId });
    } else if (next.teamId !== row.teamId) {
      changes.push({
        kind: "team",
        memberId: row.memberId,
        name: row.name,
        before: row.teamId,
        after: next.teamId,
      });
    }
  }

  for (const row of added) {
    if (row.name.trim() === "") continue;
    changes.push({
      kind: "add",
      memberId: row.memberId,
      name: row.name.trim(),
      teamId: row.teamId,
    });
  }

  return changes;
}

/** 1つの変更を SQL 文にする。末尾のセミコロンまで含める */
export function statementFor(change: Change, leagueId: number): string[] {
  switch (change.kind) {
    case "rename":
      return [
        `UPDATE members SET name = ${sqlString(change.after)} WHERE id = ${change.memberId};`,
      ];
    case "team":
      return [
        `UPDATE league_members SET team_id = ${change.after}` +
          ` WHERE league_id = ${leagueId} AND member_id = ${change.memberId};`,
      ];
    case "remove":
      return [
        `DELETE FROM league_members WHERE league_id = ${leagueId} AND member_id = ${change.memberId};`,
      ];
    case "add":
      return [
        `INSERT INTO members (id, name) VALUES (${change.memberId}, ${sqlString(change.name)});`,
        `INSERT INTO league_members (league_id, member_id, team_id)` +
          ` VALUES (${leagueId}, ${change.memberId}, ${change.teamId});`,
      ];
  }
}

/** 変更後に必ず見る確認クエリ（usage.mdx「変更後に必ず確認する」と同じもの） */
export function confirmQuery(leagueId: number): string {
  return (
    "SELECT t.name AS team, COUNT(*) AS n, SUM(t.league_id <> lm.league_id) AS wrong_league\n" +
    "FROM league_members lm JOIN teams t ON t.id = lm.team_id\n" +
    `WHERE lm.league_id = ${leagueId} GROUP BY t.id;`
  );
}

/**
 * 貼り付ける用の SQL 全体。
 *
 * 追加は members → league_members の順でないと外部キーで落ちるので、
 * 並び順は statementFor の返り値の順をそのまま保つ。
 */
export function buildScript(changes: Change[], leagueId: number): string {
  return changes.flatMap((change) => statementFor(change, leagueId)).join("\n");
}

/** wrangler で流す形。1コマンドに複数文を `;` で区切って渡せる */
export function buildWranglerCommand(changes: Change[], leagueId: number): string {
  const sql = buildScript(changes, leagueId);
  return `wrangler d1 execute majan --remote --command ${shellSingleQuote(sql)}`;
}
