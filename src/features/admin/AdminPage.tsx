/**
 * 運営ページ。**読み取り専用**で、名簿を編集した結果の SQL を表示するだけ。
 * 実行はしない（決定#11: 運営系テーブルへの書き込みAPIは作らない）。
 *
 * ★ パスコードで隠しているが、これは**セキュリティ境界ではない**。
 *   パスコードは localStorage にあるだけでサーバー側のセッションが無いので、
 *   DevTools を開けば誰でも見られる。
 *
 *   それで構わないのは、このページが出すのが `GET /api/leagues/:id` で
 *   **既に誰でも取得できるデータ**（member_id・名前・チーム）だけだから。
 *   新しく秘密になるものは無い。
 *
 *   目的は「**閲覧専用の10人に余計な導線を出さない**」ことだけ。
 *   「認証されている」と読まないこと。
 *
 * 手順は Guidebook の「メンバー・チームを変更したいとき」と同じ。
 * 食い違ったら仕様書側を直すこと。
 */

import { useMemo, useState } from "react";
import { PasscodeDialog } from "@/components/PasscodeDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLeague } from "@/lib/league-context";
import { loadPasscode } from "@/lib/passcode";
import {
  buildScript,
  buildWranglerCommand,
  confirmQuery,
  diffRoster,
  nextMemberId,
  sanitizeName,
  type EditedRow,
  type NewRow,
  type RosterRow,
} from "./sql";

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
          名簿とチーム分けを変更する SQL を作るページです。運営以外は使いません。
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

  return <AdminBody />;
}

function AdminBody() {
  const { league, teams, members, games } = useLeague();

  const current: RosterRow[] = useMemo(
    () => members.map((m) => ({ memberId: m.id, name: m.name, teamId: m.teamId })),
    [members],
  );

  const [edited, setEdited] = useState<EditedRow[]>(() =>
    current.map((r) => ({ memberId: r.memberId, name: r.name, teamId: r.teamId })),
  );
  const [added, setAdded] = useState<NewRow[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  const changes = useMemo(() => diffRoster(current, edited, added), [current, edited, added]);
  const script = useMemo(() => buildScript(changes, league.id), [changes, league.id]);
  const command = useMemo(() => buildWranglerCommand(changes, league.id), [changes, league.id]);

  // 半荘に1度でも出た人。所属を外すと過去の半荘が編集できなくなる
  const played = useMemo(() => {
    const ids = new Set<number>();
    for (const game of games) for (const r of game.results) ids.add(r.memberId);
    return ids;
  }, [games]);

  const teamName = (id: number) => teams.find((t) => t.id === id)?.name ?? `#${id}`;

  const setRow = (memberId: number, patch: Partial<EditedRow>) =>
    setEdited((rows) => rows.map((r) => (r.memberId === memberId ? { ...r, ...patch } : r)));

  // 「画面が知っている id」。名簿から外した人や別リーグの人は含まれない
  const knownIds = useMemo(
    () => [...members.map((m) => m.id), ...added.map((a) => a.memberId)],
    [members, added],
  );

  const copy = (label: string, text: string) => {
    void navigator.clipboard.writeText(text).then(
      () => setCopied(label),
      // クリップボードは権限や http で失敗する。押したのに何も起きない、を避ける
      () => setCopied("失敗"),
    );
  };

  // 変更後の人数。SQL を流す前に 5-5 のままかを見られるようにする
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

  const removingPlayed = changes.filter((c) => c.kind === "remove" && played.has(c.memberId));
  const movingAfterStart = games.length > 0 && changes.some((c) => c.kind === "team");

  return (
    <section>
      <h2 className="text-xl font-bold">運営メニュー</h2>

      <p className="text-muted-foreground mt-2 text-sm">
        名簿を編集すると、下に流す SQL が出ます。このページは<strong>実行しません</strong>。
        コピーして Cloudflare のダッシュボード（D1 → majan → Console）か <code>wrangler</code>{" "}
        で流してください。
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
                      {t.name}
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
                  {t.name}
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
        onClick={() =>
          setAdded((rows) => [
            ...rows,
            { memberId: nextMemberId(knownIds), name: "", teamId: teams[0]?.id ?? 1 },
          ])
        }
      >
        + 追加する
      </Button>
      {added.length > 0 ? (
        // 画面から見えるのは「いまリーグに所属している人」だけ。名簿から外した人や
        // 別リーグにしかいない人の id は分からないので、提案が当たらないことがある
        <p className="text-muted-foreground mt-2 text-xs">
          id は分かっている中で一番大きい番号の次を提案しています。流したときに{" "}
          <code>UNIQUE constraint failed: members.id</code> が出たら、その id は
          別の人が使っています。SQL の id を空いている番号に変えて流し直してください。
          <strong>失敗した場合は1行も書き込まれていない</strong>ので、DB は壊れていません。
        </p>
      ) : null}

      <h3 className="mt-6 font-bold">変更後の人数</h3>
      <ul className="mt-2 text-sm">
        {teams.map((t) => (
          <li key={t.id} className="flex justify-between tabular-nums">
            <span>{t.name}</span>
            <span>{counts.get(t.id) ?? 0}人</span>
          </li>
        ))}
      </ul>

      {removingPlayed.length > 0 ? (
        <p className="border-destructive text-destructive mt-6 rounded-lg border p-3 text-sm">
          <strong>
            {removingPlayed.map((c) => (c.kind === "remove" ? c.name : "")).join("・")}
          </strong>
          は既に半荘に出ています。所属を外すと、
          <strong>その人を含む過去の半荘が編集できなくなり</strong>、
          <strong>チーム合計 pt が釣り合わなくなります</strong>
          （その人の pt
          がどちらのチームにも入らないため）。まだ半荘に出ていない人なら外して問題ありません。
        </p>
      ) : null}

      {movingAfterStart ? (
        <p className="border-destructive text-destructive mt-4 rounded-lg border p-3 text-sm">
          既に半荘が {games.length} 件あります。
          <strong>開幕後に所属を変えると、その人が過去に稼いだ pt も新しいチームに移ります</strong>
          。チーム合計 pt
          は「現在の所属メンバーの総和」で計算していて、過去の所属を記録していないためです。
        </p>
      ) : null}

      <h3 className="mt-6 font-bold">流す SQL</h3>
      {changes.length === 0 ? (
        <p className="text-muted-foreground mt-2 text-sm">
          まだ変更がありません。上で名前かチームを変えると、ここに SQL が出ます。
        </p>
      ) : (
        <>
          <SqlBlock
            title="ダッシュボードに貼る"
            text={script}
            copied={copied === "sql"}
            onCopy={() => copy("sql", script)}
          />
          <SqlBlock
            title="コマンドで流す"
            text={command}
            copied={copied === "cmd"}
            onCopy={() => copy("cmd", command)}
          />
        </>
      )}

      <h3 className="mt-6 font-bold">流したあとに必ず確認する</h3>
      <p className="text-muted-foreground mt-1 text-sm">
        各チームの人数と、<code>wrong_league</code> が 0 であることを見ます。
      </p>
      <SqlBlock
        title="確認クエリ"
        text={confirmQuery(league.id)}
        copied={copied === "check"}
        onCopy={() => copy("check", confirmQuery(league.id))}
      />

      {copied === "失敗" ? (
        <p className="text-destructive mt-2 text-sm">
          コピーできませんでした。上のテキストを選んで手でコピーしてください。
        </p>
      ) : null}

      <p className="text-muted-foreground mt-6 text-xs">
        DB を直接変えたら、<code>db/roster.local.sql</code>{" "}
        も同じ内容に直しておくと、あとで流し直したときに古い内容へ戻りません。
      </p>
    </section>
  );
}

function SqlBlock({
  title,
  text,
  copied,
  onCopy,
}: {
  title: string;
  text: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-sm">{title}</span>
        <Button type="button" variant="ghost" className="shrink-0" onClick={onCopy}>
          {copied ? "コピーしました" : "コピー"}
        </Button>
      </div>
      {/* 長い SQL は横に溢れさせず、この中だけでスクロールさせる */}
      <pre className="border-border bg-muted/40 mt-1 overflow-x-auto rounded-lg border p-3 text-xs">
        {text}
      </pre>
    </div>
  );
}
