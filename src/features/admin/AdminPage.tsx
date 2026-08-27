/**
 * 運営ページ。名簿・チーム名・リーグ名を編集して、まとめて反映する。
 *
 * 現状と編集後の差分（`Change[]`）を作り、`POST /api/leagues/:id/roster` に
 * そのまま送る。差分の作り方は `src/lib/roster-changes.ts`（サーバと共有）。
 *
 * ★ パスコードの位置づけが2つある。混ぜないこと。
 *
 *   **画面を開くとき**のパスコードは**セキュリティ境界ではない**。
 *   localStorage にあるだけでサーバー側のセッションが無く、DevTools を開けば
 *   誰でも見られる。それで構わないのは、この画面が出すのが
 *   `GET /api/leagues/:id` で**既に誰でも取得できるデータ**だけだから。
 *   目的は「閲覧専用の10人に余計な導線を出さない」ことだけで、
 *   「認証されている」と読まないこと。
 *
 *   **反映するとき**のパスコードは本物の境界。半荘の登録と同じ
 *   `X-Passcode` をサーバが `requirePasscode` で検証する。
 *   画面の開閉を突破しても、書き込みは通らない。
 *
 * 手順は Guidebook の「メンバー・チームを変更したいとき」と同じ。
 * 食い違ったら仕様書側を直すこと。
 */

import { useMemo, useState } from "react";
import { PasscodeDialog } from "@/components/PasscodeDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { describeFailure, useLeague } from "@/lib/league-context";
import { loadPasscode } from "@/lib/passcode";
import { applyRosterChanges } from "@/lib/api";
import {
  diffNames,
  diffRoster,
  nextMemberId,
  sanitizeName,
  NAME_MAX_LENGTH,
  type Change,
  type EditedRow,
  type NewRow,
  type RosterRow,
} from "@/lib/roster-changes";
import { membersByImpact } from "./impact";
import { useWriteAction } from "@/lib/use-write-action";

export function AdminPage() {
  // 初期値は描画時に1回だけ読む。エフェクトで後から差し替えると、
  // 一瞬だけ中身が見えてしまう
  const [unlocked, setUnlocked] = useState(() => loadPasscode() !== null);
  const [askOpen, setAskOpen] = useState(false);

  if (!unlocked) {
    return (
      <section>
        <h2 className="text-xl font-bold">運営メニュー</h2>
        <p className="text-muted-foreground mt-4 text-sm">
          リーグ名・チーム名・名簿を変更するページです。運営以外は使いません。
        </p>
        <Button className="mt-4" onClick={() => setAskOpen(true)}>
          パスコードを入れて開く
        </Button>
        <PasscodeDialog
          open={askOpen}
          onOpenChange={setAskOpen}
          onSaved={() => setUnlocked(true)}
          message="運営メニューを開きます。半荘の登録に使うものと同じパスコードです。"
        />
      </section>
    );
  }

  return <AdminUnlocked />;
}

/**
 * サーバから来た名簿が変わったら、編集状態を作り直す。
 *
 * 編集欄（名前・チーム・追加行）は useState の初期値で作るので、
 * `reload()` でデータが変わっても**そのまま残る**。反映したあとも
 * 「まだ追加していない」と表示され続け、もう一度押すと 409 になる（実測）。
 *
 * key を変えて丸ごと作り直すのが一番確実。編集途中だったものは消えるが、
 * それは**古い状態を前提に作った差分**なので、残す方が危ない
 * （そのまま送ると、もう当たっている before を送ることになる）。
 */
function AdminUnlocked() {
  const { league, teams, members } = useLeague();
  // 「反映しました」は作り直しの外に置く。中に置くと、反映 → 再取得 → 作り直しで
  // 成功メッセージごと消え、押したのに何も言わない画面になる
  const [applied, setApplied] = useState<number | null>(null);
  const dataKey = [
    league.name,
    teams.map((t) => `${t.id}:${t.name}`).join(","),
    members.map((m) => `${m.id}:${m.name}:${m.teamId}`).join(","),
  ].join("|");
  return <AdminBody key={dataKey} applied={applied} onApplied={setApplied} />;
}

function AdminBody({
  applied,
  onApplied,
}: {
  applied: number | null;
  onApplied: (n: number | null) => void;
}) {
  const { league, teams, members, games, reload } = useLeague();

  const current: RosterRow[] = useMemo(
    () => members.map((m) => ({ memberId: m.id, name: m.name, teamId: m.teamId })),
    [members],
  );

  const [edited, setEdited] = useState<EditedRow[]>(() =>
    current.map((r) => ({ memberId: r.memberId, name: r.name, teamId: r.teamId })),
  );
  // リーグ名とチーム名も同じ「編集して差分を取る」形で扱う
  const [leagueName, setLeagueName] = useState(league.name);
  const [teamNames, setTeamNames] = useState(() => teams.map((t) => ({ id: t.id, name: t.name })));
  const [added, setAdded] = useState<NewRow[]>([]);

  const apply = useWriteAction<Change[], { applied: number }>(
    (changes, passcode) => applyRosterChanges(league.id, changes, passcode),
    (data) => {
      onApplied(data.applied);
      // 反映後は取り直す。画面が古い名簿を映したままだと、
      // 次の変更が「もう当たっている before」を送ることになる
      reload();
    },
  );
  const applyError = apply.failure === null ? null : describeFailure(apply.failure);

  const changes = useMemo(
    () => [
      // 名前の変更を先に出す。リーグ → チーム → メンバー の順で読める
      ...diffNames({ leagueName: league.name, teams }, { leagueName, teams: teamNames }),
      ...diffRoster(current, edited, added),
    ],
    [league.name, teams, leagueName, teamNames, current, edited, added],
  );

  const rule = useMemo(
    () => ({ startPoint: league.startPoint, returnPoint: league.returnPoint, uma: league.uma }),
    [league],
  );

  // 影響の分け方は impact.ts に置いてテストしてある（予定だけの人に
  // 「pt が釣り合わなくなる」と言わないための分岐）
  const { scoredGames, scored, other } = useMemo(() => membersByImpact(games, rule), [games, rule]);
  const played = useMemo(() => new Set([...scored, ...other]), [scored, other]);

  // 表示は編集後の名前を使う。「チームA から」の注記や人数が古い名前のままだと、
  // 画面が事実と違うことを言うことになる
  const teamName = (id: number) => teamNames.find((t) => t.id === id)?.name.trim() || `#${id}`;

  const setRow = (memberId: number, patch: Partial<EditedRow>) => {
    onApplied(null);
    setEdited((rows) => rows.map((r) => (r.memberId === memberId ? { ...r, ...patch } : r)));
  };

  // 「画面が知っている id」。名簿から外した人や別リーグの人は含まれない
  const knownIds = useMemo(
    () => [...members.map((m) => m.id), ...added.map((a) => a.memberId)],
    [members, added],
  );

  // 変更後の人数。反映する前に 5-5 のままかを見られるようにする
  const counts = useMemo(() => {
    const map = new Map<number, number>(teams.map((t) => [t.id, 0]));
    for (const row of edited) {
      if (row.teamId === null) continue;
      map.set(row.teamId, (map.get(row.teamId) ?? 0) + 1);
    }
    for (const row of added) {
      if (row.name.trim() === "") continue;
      map.set(row.teamId, (map.get(row.teamId) ?? 0) + 1);
    }
    return map;
  }, [edited, added, teams]);

  const removingScored = changes.filter((c) => c.kind === "remove" && scored.has(c.memberId));
  const removingReserved = changes.filter((c) => c.kind === "remove" && other.has(c.memberId));
  // games.length で数えない。予定しか無いリーグでも「pt が移る」と言うことになる
  const movingAfterStart = scoredGames > 0 && changes.some((c) => c.kind === "team");

  /**
   * 確認を1枚挟むかどうか。**戻らない操作のときだけ**出す。
   *
   * SQL をコピペしていた頃は、貼る前に読み返す時間が自然にあった。それが
   * 消えたぶん、被害が戻らない操作にだけ確認を戻す。ただの改名やチーム名変更で
   * 毎回出すと、山本さんが「SQL が面倒」と言って消したはずの摩擦が戻る。
   */
  const removes = changes.filter((c) => c.kind === "remove");
  // 予定しか無いなら所属変更は**戻せる操作**（戻せば完全に元通り）なので、
  // 確認を挟まない。「戻せない変更が含まれています」の見出しも当てはまらない
  const moves = scoredGames > 0 ? changes.filter((c) => c.kind === "team") : [];
  const needsConfirm = removes.length > 0 || moves.length > 0;
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <section>
      <h2 className="text-xl font-bold">運営メニュー</h2>

      <p className="text-muted-foreground mt-2 text-sm">
        名簿を編集すると、下に変更内容が出ます。
        <strong>「反映する」を押すまで DB は変わりません</strong>
        。反映にはパスコードが必要です。
      </p>

      <h3 className="mt-6 font-bold">リーグとチームの名前</h3>
      <label className="mt-2 block">
        <span className="text-muted-foreground text-sm">リーグ名</span>
        <Input
          value={leagueName}
          onChange={(e) => setLeagueName(sanitizeName(e.target.value))}
          className="mt-1"
          maxLength={NAME_MAX_LENGTH}
          aria-label="リーグ名"
        />
      </label>
      {teamNames.map((t) => (
        <label key={t.id} className="mt-3 block">
          <span className="text-muted-foreground text-sm">チーム名（#{t.id}）</span>
          <Input
            value={t.name}
            onChange={(e) =>
              setTeamNames((rows) =>
                rows.map((r) => (r.id === t.id ? { ...r, name: sanitizeName(e.target.value) } : r)),
              )
            }
            className="mt-1"
            maxLength={NAME_MAX_LENGTH}
            aria-label={`チーム名 #${t.id}`}
          />
        </label>
      ))}
      {/* 換算値をここに置かない理由を、画面にも書いておく */}
      <p className="text-muted-foreground mt-2 text-xs">
        ウマ・オカ・持ち点は<strong>ここでは変更できません</strong>。
        名前は表示が変わるだけですが、換算値を変えると
        <strong>過去の半荘の pt が全部計算し直されます</strong>
        。手順は仕様書の「ルール変更したいとき」を見てください。
      </p>

      <h3 className="mt-6 font-bold">名簿</h3>
      <ul className="mt-2 space-y-3">
        {edited.map((row) => {
          const before = current.find((r) => r.memberId === row.memberId);
          return (
            <li key={row.memberId} className="border-border rounded-lg border p-3">
              <div className="flex items-center gap-2">
                {/* member_id を調べる手間を消すのが、このページの主目的 */}
                <span className="text-muted-foreground w-10 shrink-0 text-sm tabular-nums">
                  #{row.memberId}
                </span>
                <Input
                  value={row.name}
                  onChange={(e) => setRow(row.memberId, { name: sanitizeName(e.target.value) })}
                  aria-label={`#${row.memberId} の名前`}
                  maxLength={NAME_MAX_LENGTH}
                  className="min-w-0 flex-1"
                />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <select
                  className="border-input h-9 min-w-0 flex-1 rounded-lg border bg-transparent px-2 text-sm"
                  value={row.teamId ?? "none"}
                  onChange={(e) =>
                    setRow(row.memberId, {
                      teamId: e.target.value === "none" ? null : Number(e.target.value),
                    })
                  }
                  aria-label={`#${row.memberId} のチーム`}
                >
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {teamName(t.id)}
                    </option>
                  ))}
                  <option value="none">所属を外す</option>
                </select>
                {before !== undefined && row.teamId !== before.teamId ? (
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {teamName(before.teamId)} から
                  </span>
                ) : null}
                {played.has(row.memberId) ? (
                  <span className="text-muted-foreground shrink-0 text-xs">半荘あり</span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <h3 className="mt-6 font-bold">メンバーを追加</h3>
      {added.map((row, index) => (
        <div key={row.memberId} className="border-border mt-2 rounded-lg border p-3">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-10 shrink-0 text-sm tabular-nums">
              #{row.memberId}
            </span>
            <Input
              value={row.name}
              onChange={(e) =>
                setAdded((rows) =>
                  rows.map((r, i) =>
                    i === index ? { ...r, name: sanitizeName(e.target.value) } : r,
                  ),
                )
              }
              placeholder="名前"
              aria-label={`追加する #${row.memberId} の名前`}
              maxLength={NAME_MAX_LENGTH}
              className="min-w-0 flex-1"
            />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <select
              className="border-input h-9 min-w-0 flex-1 rounded-lg border bg-transparent px-2 text-sm"
              value={row.teamId}
              onChange={(e) =>
                setAdded((rows) =>
                  rows.map((r, i) => (i === index ? { ...r, teamId: Number(e.target.value) } : r)),
                )
              }
              aria-label={`追加する #${row.memberId} のチーム`}
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {teamName(t.id)}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="ghost"
              className="shrink-0"
              onClick={() => setAdded((rows) => rows.filter((_, i) => i !== index))}
            >
              取り消す
            </Button>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        className="mt-2"
        onClick={() => {
          onApplied(null);
          setAdded((rows) => [
            ...rows,
            { memberId: nextMemberId(knownIds), name: "", teamId: teams[0]?.id ?? 1 },
          ]);
        }}
      >
        + 追加する
      </Button>
      {added.length > 0 ? (
        // 画面から見えるのは「いまリーグに所属している人」だけ。名簿から外した人や
        // 別リーグにしかいない人の id は分からないので、提案が当たらないことがある
        <p className="text-muted-foreground mt-2 text-xs">
          id は分かっている中で一番大きい番号の次を提案しています。名簿から外した人や 別リーグの人の
          id は画面から見えないので、まれに既に使われていることがあります。 その場合は
          <strong>反映が断られ、1件も書き込まれません</strong>。
          読み込み直せば、空いている番号を提案し直します。
        </p>
      ) : null}

      <h3 className="mt-6 font-bold">変更後の人数</h3>
      <ul className="mt-2 text-sm">
        {teams.map((t) => (
          <li key={t.id} className="flex justify-between tabular-nums">
            {/* 編集後の名前で出す。t.name のままだと「変更後の人数」が
                変更前の名前を名乗ることになる */}
            <span>{teamName(t.id)}</span>
            <span>{counts.get(t.id) ?? 0}人</span>
          </li>
        ))}
      </ul>

      {removingScored.length > 0 ? (
        <p className="border-destructive text-destructive mt-6 rounded-lg border p-3 text-sm">
          <strong>
            {removingScored.map((c) => (c.kind === "remove" ? c.name : "")).join("・")}
          </strong>
          は結果の出た半荘に出ています。所属を外すと、
          <strong>その人を含む過去の半荘が編集できなくなり</strong>、
          <strong>チーム合計 pt が釣り合わなくなります</strong>
          （その人の pt がどちらのチームにも入らないため）。
        </p>
      ) : null}

      {removingReserved.length > 0 ? (
        <p className="border-destructive text-destructive mt-4 rounded-lg border p-3 text-sm">
          <strong>
            {removingReserved.map((c) => (c.kind === "remove" ? c.name : "")).join("・")}
          </strong>
          は、結果として集計されていない半荘（予定や、素点のそろっていない半荘）に入っています。
          所属を外すと、<strong>その半荘が編集できなくなります</strong>。pt
          はまだ付いていないので、チーム合計は狂いません。
        </p>
      ) : null}

      {movingAfterStart ? (
        <p className="border-destructive text-destructive mt-4 rounded-lg border p-3 text-sm">
          既に結果の出た半荘が {scoredGames} 件あります。
          <strong>開幕後に所属を変えると、その人が過去に稼いだ pt も新しいチームに移ります</strong>
          。チーム合計 pt
          は「現在の所属メンバーの総和」で計算していて、過去の所属を記録していないためです。
        </p>
      ) : null}

      <h3 className="mt-6 font-bold">反映する内容</h3>
      {changes.length === 0 ? (
        <p className="text-muted-foreground mt-2 text-sm">
          まだ変更がありません。上で名前かチームを変えると、ここに出ます。
        </p>
      ) : (
        <>
          {/* 押す前に、何が変わるかを必ず見せる。SQL を挟まなくなったぶん、
              「押したら何が起きるか」を確かめる場がここしか無くなった */}
          <ul className="border-border mt-2 space-y-1 rounded-lg border p-3 text-sm">
            {changes.map((change, i) => (
              <li key={`${change.kind}-${i}`}>{describeChange(change, teamName)}</li>
            ))}
          </ul>
          <Button
            type="button"
            className="mt-4 w-full"
            disabled={apply.pending}
            onClick={() => (needsConfirm ? setConfirmOpen(true) : apply.run(changes))}
          >
            {apply.pending ? "反映中…" : `この内容で反映する（${changes.length}件）`}
          </Button>
        </>
      )}

      {applyError === null ? null : (
        <div className="border-destructive mt-4 rounded-lg border p-3">
          <p className="text-destructive text-sm">{applyError}</p>
          {apply.failure?.kind === "conflict" ? (
            // 「読み込み直してください」と言うなら、その操作を画面に置く。
            // スマホだとブラウザのリロード操作になってしまう
            <>
              <Button type="button" variant="ghost" className="mt-2" onClick={reload}>
                読み込み直す
              </Button>
              <p className="text-muted-foreground mt-1 text-xs">
                読み込み直すと、編集中の内容は消えます。
              </p>
            </>
          ) : null}
        </div>
      )}
      {applied === null ? null : (
        <p className="border-border mt-4 rounded-lg border p-3 text-sm">
          {applied}件を反映しました。
        </p>
      )}

      <p className="text-muted-foreground mt-6 text-xs">
        ここで変えたら、テンプレート側も同じ内容に直しておくと、あとで流し直したときに
        古い内容へ戻りません。メンバーと所属は <code>db/roster.local.sql</code>、
        <strong>
          リーグ名とチーム名は <code>db/seed.local.sql</code>
        </strong>{" "}
        です。
      </p>

      {/* 「よろしいですか」だけにしない。誰を外すのか / 誰の pt がどちらへ移るのかを
          名指しで出す。出せないなら確認を挟む意味が無い */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        {/* 10人全員を外すと項目が11行になる。iPhone SE（高さ 568px）だと
            ボタンが画面の外に出るので、中身をスクロールさせて必ず届くようにする */}
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>戻せない変更が含まれています</DialogTitle>
            <DialogDescription>反映すると、次のことが起きます。</DialogDescription>
          </DialogHeader>
          <ul className="mt-2 space-y-2 text-sm">
            {removes.map((c) => (
              <li key={`r-${c.kind === "remove" ? c.memberId : ""}`}>
                <strong>{c.kind === "remove" ? c.name : ""}</strong> を名簿から外します。
                {c.kind !== "remove" ? null : scored.has(c.memberId) ? (
                  <>
                    この人は結果の出た半荘に出ているので、
                    <strong>
                      過去の半荘が編集できなくなり、チーム合計 pt が釣り合わなくなります
                    </strong>
                    。
                  </>
                ) : other.has(c.memberId) ? (
                  <>
                    この人は結果として集計されていない半荘（予定や、素点のそろっていない半荘）に
                    入っているので、<strong>その半荘が編集できなくなります</strong>。pt
                    はまだ付いていないので、チーム合計は狂いません。
                  </>
                ) : (
                  <>まだどの半荘にも入っていないので、影響はありません。</>
                )}
              </li>
            ))}
            {moves.map((c) => (
              <li key={`t-${c.kind === "team" ? c.memberId : ""}`}>
                <strong>{c.kind === "team" ? c.name : ""}</strong> を{" "}
                {c.kind === "team" ? teamName(c.before) : ""} から{" "}
                {c.kind === "team" ? teamName(c.after) : ""} へ移します。
                <strong>この人が過去に稼いだ pt も移ります</strong>（既に結果の出た半荘が{" "}
                {scoredGames} 件あります）。
              </li>
            ))}
          </ul>
          <DialogFooter className="mt-4">
            <Button type="button" variant="ghost" onClick={() => setConfirmOpen(false)}>
              やめる
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={apply.pending}
              onClick={() => {
                setConfirmOpen(false);
                apply.run(changes);
              }}
            >
              反映する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PasscodeDialog
        open={apply.passcodeOpen}
        onOpenChange={apply.setPasscodeOpen}
        onSaved={apply.onPasscodeSaved}
        message={apply.passcodeMessage}
      />
    </section>
  );
}

/** 1つの変更を、押す前に読んで分かる日本語にする */
function describeChange(change: Change, teamName: (id: number) => string): string {
  switch (change.kind) {
    case "leagueName":
      return `リーグ名: 「${change.before}」→「${change.after}」`;
    case "teamName":
      return `チーム名: 「${change.before}」→「${change.after}」`;
    case "rename":
      return `#${change.memberId} の名前: 「${change.before}」→「${change.after}」`;
    case "team":
      return `${change.name}: ${teamName(change.before)} → ${teamName(change.after)}`;
    case "remove":
      return `${change.name}: ${teamName(change.teamId)} から名簿を外す`;
    case "add":
      return `#${change.memberId} ${change.name} を ${teamName(change.teamId)} に追加`;
  }
}
