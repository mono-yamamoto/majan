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

/**
 * 提案する member_id。**穴は埋めず、既知の最大 + 1** にする。
 *
 * 画面が知っているのは `GET /api/leagues/:id` が返す名簿（= league_members を
 * JOIN したもの）だけで、**名簿から外した人**（members には残る）や
 * **別リーグにしかいない人**の id は見えない。
 *
 * 穴を埋める実装にすると、「外した直後に新しい人を足す」という**この画面の
 * 主要な操作**でちょうど外した人の id を提案してしまい、
 * `UNIQUE constraint failed: members.id` で落ちる（実測）。
 * 単調増加にすれば、実運用では衝突がほぼ起きない。
 *
 * それでも衝突する可能性は残る（別リーグの id は見えないため）。
 * そこは **`ON CONFLICT` で握りつぶさず、落ちるのが正しい**。
 * 別人の id を上書きすると、その人の過去の半荘が新しい名前に付いてしまう。
 */
export function nextMemberId(knownIds: number[]): number {
  return knownIds.length === 0 ? 1 : Math.max(...knownIds) + 1;
}

/**
 * 名前から C0 制御文字（NUL・ESC・BEL など）と DEL を落とす。
 *
 * とくに **NUL が致命的**で、`--file` で流すと **SQL が NUL の位置で切れ、
 * sqlite3 が黙って残りを捨てる**（エラーにならず、何も入らない）。
 * 「実行したのに何も起きない」は、壊れた SQL を出すより気づきにくい。
 *
 * 落とす場所を「SQL を作るとき」ではなく「入力を受けるとき」にしているのは、
 * **入力欄に見えているものと SQL の中身をずらさない**ため。
 * 生成のときに黙って落とすと、画面は変更を表示しているのに SQL には
 * 出ない／別物が出る、という食い違いが起きる。
 * **制御文字そのものは目に見えない**ので、落としても見た目は変わらない。
 * （ESC で始まるエスケープシーケンスは、ESC を落とすと `[31m` のような
 * 残りが見えるようになるが、それは隠れていたものが見えるだけで正しい挙動）
 */
export function sanitizeName(value: string): string {
  // oxlint の no-control-regex を抑制する。制御文字を落とすのが目的なので、
  // 正規表現に制御文字が出るのは意図どおり（外すと実際に警告が出ることを確認済み）
  // eslint-disable-next-line no-control-regex
  return value.replaceAll(/[\u0000-\u001F\u007F]/gu, "");
}

export type Change =
  | { kind: "leagueName"; before: string; after: string }
  | { kind: "teamName"; teamId: number; before: string; after: string }
  | { kind: "rename"; memberId: number; before: string; after: string }
  /**
   * `team` と `remove` の `name` は**画面の入力欄に見えている名前**。
   * 同じ編集で改名と所属変更を同時にすると、DB 側の名前で警告を出すと
   * 「入力欄には新しい名前が見えているのに、警告は古い名前を名乗る」ことになる。
   * 名前欄が空（＝改名を出さない）のときは DB の名前に戻す。
   * その場合は SQL を流したあとも DB の名前のままなので、それが正しい。
   */
  | { kind: "team"; memberId: number; name: string; before: number; after: number }
  | { kind: "remove"; memberId: number; name: string; teamId: number }
  | { kind: "add"; memberId: number; name: string; teamId: number };

/**
 * 現状と編集後を突き合わせて、変更の一覧を作る。
 *
 * SQL を先に組み立てず、いったん「何が変わったか」にするのは、画面が
 * 警告（開幕後の所属変更・半荘に出た人を外す）を出す判断に使うため。
 *
 * `current` に無い member_id は無視する。画面は開いた時点の名簿を保持していて、
 * **裏で名簿が変わっても再取得までは初回のまま**なので、知らない id に対して
 * SQL を出さない側に倒す（増えた人は再読み込みするまで画面に出ない）。
 */
export function diffRoster(current: RosterRow[], edited: EditedRow[], added: NewRow[]): Change[] {
  const changes: Change[] = [];
  const byId = new Map(edited.map((row) => [row.memberId, row]));

  for (const row of current) {
    const next = byId.get(row.memberId);
    if (next === undefined) continue;

    // 名前の変更と所属の変更は別の操作。両方あれば両方出す
    const after = sanitizeName(next.name).trim();
    if (after !== "" && after !== row.name) {
      changes.push({ kind: "rename", memberId: row.memberId, before: row.name, after });
    }
    // 警告や注記に出す名前。入力欄に見えているものを使う
    const shown = after === "" ? row.name : after;
    if (next.teamId === null) {
      changes.push({ kind: "remove", memberId: row.memberId, name: shown, teamId: row.teamId });
    } else if (next.teamId !== row.teamId) {
      changes.push({
        kind: "team",
        memberId: row.memberId,
        name: shown,
        before: row.teamId,
        after: next.teamId,
      });
    }
  }

  for (const row of added) {
    if (sanitizeName(row.name).trim() === "") continue;
    changes.push({
      kind: "add",
      memberId: row.memberId,
      name: sanitizeName(row.name).trim(),
      teamId: row.teamId,
    });
  }

  return changes;
}

/**
 * リーグ名とチーム名の変更。名簿（人）とは別の関数にしているのは、
 * 突き合わせる相手が違うだけで、扱いは名前の変更とまったく同じにするため。
 *
 * ★ 換算値（start_point / return_point / uma）はここで扱わない。
 *   名前は表示が変わるだけだが、換算値を変えると**過去の半荘の pt が全部
 *   計算し直される**。取り違えたときの被害が桁違いなので、同じ画面に
 *   並べない（変更手順は Guidebook の「ルール変更したいとき」）。
 */
export function diffNames(
  current: { leagueName: string; teams: { id: number; name: string }[] },
  edited: { leagueName: string; teams: { id: number; name: string }[] },
): Change[] {
  const changes: Change[] = [];

  const leagueAfter = sanitizeName(edited.leagueName).trim();
  if (leagueAfter !== "" && leagueAfter !== current.leagueName) {
    changes.push({ kind: "leagueName", before: current.leagueName, after: leagueAfter });
  }

  const byId = new Map(edited.teams.map((t) => [t.id, t]));
  for (const team of current.teams) {
    const next = byId.get(team.id);
    if (next === undefined) continue;
    const after = sanitizeName(next.name).trim();
    // 空は「消す」ではなく「入力途中」。メンバー名と同じ扱い
    if (after !== "" && after !== team.name) {
      changes.push({ kind: "teamName", teamId: team.id, before: team.name, after });
    }
  }

  return changes;
}

/** 1つの変更を SQL 文にする。末尾のセミコロンまで含める */
export function statementFor(change: Change, leagueId: number): string[] {
  switch (change.kind) {
    case "leagueName":
      return [`UPDATE leagues SET name = ${sqlString(change.after)} WHERE id = ${leagueId};`];
    case "teamName":
      return [`UPDATE teams SET name = ${sqlString(change.after)} WHERE id = ${change.teamId};`];
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
