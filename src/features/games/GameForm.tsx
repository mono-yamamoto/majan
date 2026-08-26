/**
 * 半荘の入力フォーム。登録と編集で共有する（PATCH は全置換なので同じ形・D-2）。
 *
 * 保存できない理由は**常に見えている**こと。押せないボタンだけを見せると、
 * 入力係は何を直せばいいか分からない。validateGameInput はエラーを全部返し、
 * 派生エラーを抑制してあるので（T3）、出るのは本当の原因だけ。
 */

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLeague } from "@/lib/league-context";
import { scoreGame } from "@/lib/scoring";
import type { GameInput } from "@/lib/types";
import { validateGameInput, type ValidationError } from "@/lib/validation";
import { toGameInput, updateRow, type GameFormRow, type GameFormValue } from "./game-form-value";

export function GameForm({
  value,
  onChange,
  onSubmit,
  submitLabel,
  pending,
  serverErrors,
  extraMessage,
}: {
  value: GameFormValue;
  onChange: (value: GameFormValue) => void;
  onSubmit: (input: GameInput) => void;
  submitLabel: string;
  pending: boolean;
  /** API から返った業務ルール違反（フロントで拾えないものが出た場合） */
  serverErrors?: ValidationError[];
  extraMessage?: string | null;
}) {
  const { members, teams, league, roster } = useLeague();

  const input = useMemo(() => toGameInput(value), [value]);
  const rule = useMemo(
    () => ({ startPoint: league.startPoint, returnPoint: league.returnPoint, uma: league.uma }),
    [league],
  );
  // 入力途中の状態を「不正」として扱わない。
  // 何も入れていない時点で validateGameInput に渡すと、memberId=0 が4つ並ぶので
  // 「同じメンバーが複数回選ばれています（#0）」、素点が NaN なので
  // 「素点の値が大きすぎます」まで出る（実機で確認）。
  // 入力係はまだ何も間違えていないのに赤い指摘が3つ出る状態になる。
  const blanks = value.rows.filter(
    (row) => row.memberId === 0 || row.rawScore.trim() === "",
  ).length;
  // 中身が数字かどうかは validateGameInput が RAW_SCORE_NOT_A_NUMBER として
  // 理由つきで返すので、ここで二重に判定しない（掟4）。ここは「入力し終わったか」だけ
  const complete = blanks === 0;

  const errors = useMemo(
    () => (complete ? validateGameInput(input, rule, roster) : []),
    [complete, input, rule, roster],
  );

  // 全員そろって素点が数値になったときだけプレビューを出す（誤入力に気づける）
  const preview = useMemo(() => {
    const ready =
      input.results.length === 4 &&
      input.results.every((r) => r.memberId > 0 && Number.isSafeInteger(r.rawScore));
    if (!ready) return null;
    try {
      return scoreGame(input.results, rule);
    } catch {
      return null;
    }
  }, [input, rule]);

  // 未入力は 0 として足す（残り1人を暗算で埋める使い方ができる）。
  // ただし「読めない値」が入っているときは合計を出さない。
  // NaN を 0 として足すと、abc + 30000 + 20000 + 50000 で
  // 「合計 100,000 / 100,000」と表示され、問題が無いように見えてしまう。
  const unreadable = value.rows.some(
    (row) => row.rawScore.trim() !== "" && !Number.isFinite(Number(row.rawScore)),
  );
  const total = unreadable
    ? null
    : input.results.reduce((sum, r) => sum + (Number.isFinite(r.rawScore) ? r.rawScore : 0), 0);
  const expectedTotal = league.startPoint * 4;
  const shown = [...errors, ...(serverErrors ?? [])];
  // 未選択（0）は名前を出しようがないのでハイライトから外す
  const badMemberIds = new Set(shown.flatMap((e) => e.memberIds).filter((id) => id > 0));
  const nameOf = (id: number) => members.find((m) => m.id === id)?.name ?? `#${id}`;
  const canSubmit = complete && errors.length === 0;

  // チームごとの見た目。teams は2つ想定だが、増えても壊れないよう index で回す
  const teamStyles = ["bg-sky-500", "bg-rose-500", "bg-emerald-500", "bg-amber-500"];
  const teamIndex = (teamId: number | undefined) =>
    teamId === undefined ? -1 : teams.findIndex((t) => t.id === teamId);
  const teamOf = (memberId: number) => teams.find((t) => t.id === roster.get(memberId));
  /** 選択肢に出す表示名。誰がどのチームかが**選ぶ前に**分かるようにする */
  const optionLabel = (m: { id: number; name: string }) => {
    const team = teamOf(m.id);
    return team === undefined ? m.name : `${m.name}（${team.name}）`;
  };

  const setRow = (index: number, patch: Partial<GameFormRow>) => {
    const rows = value.rows.map((row, i) => (i === index ? updateRow(row, patch) : row));
    onChange({ ...value, rows });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        onSubmit(input);
      }}
    >
      <label className="block">
        <span className="text-muted-foreground text-sm">日付</span>
        <Input
          type="date"
          value={value.playedOn}
          onChange={(e) => onChange({ ...value, playedOn: e.target.value })}
          className="mt-1"
        />
      </label>

      <div className="mt-6 space-y-3">
        {value.rows.map((row, index) => (
          <div key={index} className="flex items-center gap-2">
            {/* 選択済みのチームを色で示す。2-2 になっているかがひと目で分かる */}
            <span
              className={`h-9 w-1.5 shrink-0 rounded-full ${
                teamIndex(roster.get(row.memberId)) >= 0
                  ? teamStyles[teamIndex(roster.get(row.memberId)) % teamStyles.length]
                  : "bg-border"
              }`}
              aria-hidden="true"
            />
            <select
              className={`border-input h-9 min-w-0 flex-1 rounded-lg border bg-transparent px-2 text-sm ${
                badMemberIds.has(row.memberId) ? "border-destructive" : ""
              }`}
              value={row.memberId}
              onChange={(e) => setRow(index, { memberId: Number(e.target.value) })}
              aria-label={`${index + 1}人目`}
            >
              <option value={0}>選択</option>
              {/* チームごとに分ける。あわせて名前にもチーム名を付ける。
                  optgroup のラベルが出ない端末でも、選ぶ前にチームが分かるようにするため
                  （利用者から「どのチームか分からず登録できない」と指摘があった箇所） */}
              {teams.map((team) => (
                <optgroup key={team.id} label={team.name}>
                  {members
                    .filter((m) => roster.get(m.id) === team.id)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {optionLabel(m)}
                      </option>
                    ))}
                </optgroup>
              ))}
              {/* 現状の GET は league_members を JOIN するので members に名簿外は来ず、
                  この分岐は空にしかならない。残しているのは、集計側が名簿外のメンバーを
                  unassigned として扱う設計になっており（D-23）、GET が名簿外を返す
                  変更はありうるため。そのとき「なぜ空なのか」を調べ直さずに済む */}
              {members.filter((m) => roster.get(m.id) === undefined).length > 0 ? (
                <optgroup label="所属不明">
                  {members
                    .filter((m) => roster.get(m.id) === undefined)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </optgroup>
              ) : null}
            </select>
            {/* 箱下は「たまに」なので、頻度の高い数字入力（テンキー）を優先し、
                符号は専用ボタンで切り替える。inputMode="numeric" のテンキーには
                「−」キーが無い端末が多く、そのままでは箱下を入力できない */}
            <button
              type="button"
              onClick={() => setRow(index, { negative: !row.negative })}
              aria-label={`${index + 1}人目の素点の符号（現在 ${row.negative ? "マイナス" : "プラス"}）`}
              aria-pressed={row.negative}
              className={`h-9 w-9 shrink-0 rounded-lg border text-base font-bold ${
                row.negative
                  ? "border-destructive text-destructive bg-destructive/10"
                  : "border-input text-muted-foreground"
              }`}
            >
              {row.negative ? "−" : "+"}
            </button>
            <Input
              inputMode="numeric"
              autoComplete="off"
              placeholder="素点"
              className={`w-24 text-right ${badMemberIds.has(row.memberId) ? "border-destructive" : ""}`}
              value={row.rawScore}
              onChange={(e) => {
                // PC で "-500" と打たれた場合も符号ボタン側に寄せる
                const text = e.target.value;
                if (text.startsWith("-")) {
                  setRow(index, { rawScore: text.slice(1), negative: true });
                } else {
                  setRow(index, { rawScore: text });
                }
              }}
              aria-label={`${index + 1}人目の素点`}
            />
          </div>
        ))}
      </div>

      <p className="text-muted-foreground mt-2 text-right text-sm">
        合計 {total === null ? "—" : total.toLocaleString()} / {expectedTotal.toLocaleString()}
      </p>

      <label className="mt-4 block">
        <span className="text-muted-foreground text-sm">メモ（任意）</span>
        <Input
          value={value.memo}
          onChange={(e) => onChange({ ...value, memo: e.target.value })}
          className="mt-1"
          placeholder="任意"
        />
      </label>

      {preview === null ? null : (
        <div className="border-border mt-6 rounded-lg border p-3">
          <p className="text-muted-foreground text-sm">プレビュー</p>
          <ul className="mt-2 space-y-1 text-sm">
            {preview.map((s) => (
              <li key={s.memberId} className="flex justify-between">
                <span>
                  {s.rank}位 {nameOf(s.memberId)}
                </span>
                <span className="tabular-nums">
                  {s.rawScore.toLocaleString()} / {s.pt > 0 ? "+" : ""}
                  {s.pt.toFixed(1)}pt
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 保存できない理由は常に見せる。押せないボタンだけでは何を直せばよいか分からない。
          ただし「まだ入力していない」と「入力が誤っている」は区別する */}
      {blanks > 0 ? (
        <p className="text-muted-foreground mt-4 text-sm">
          あと {blanks} か所（メンバーと素点）を入力すると保存できます
        </p>
      ) : shown.length > 0 ? (
        <ul className="text-destructive mt-4 space-y-1 text-sm">
          {shown.map((e, i) => {
            const who = e.memberIds.filter((id) => id > 0);
            // 該当者が同じチームなら、チーム名を添える（どちらが多いか分かるように）
            const teamNames = new Set(who.map((id) => teamOf(id)?.name).filter(Boolean));
            const prefix = teamNames.size === 1 ? `${[...teamNames][0]}: ` : "";
            return (
              <li key={`${e.code}-${i}`}>
                {e.message}
                {who.length > 0 ? `（${prefix}${who.map(nameOf).join("・")}）` : ""}
              </li>
            );
          })}
        </ul>
      ) : null}

      {extraMessage === null || extraMessage === undefined ? null : (
        <p className="text-destructive mt-4 text-sm">{extraMessage}</p>
      )}

      <Button type="submit" className="mt-6 w-full" disabled={pending || !canSubmit}>
        {pending ? "保存中…" : submitLabel}
      </Button>
    </form>
  );
}
