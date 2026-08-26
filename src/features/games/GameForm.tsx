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
import { toGameInput, type GameFormValue } from "./game-form-value";

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
  const { members, league, roster } = useLeague();

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
  const nonNumeric = value.rows.filter(
    (row) => row.rawScore.trim() !== "" && !Number.isFinite(Number(row.rawScore)),
  ).length;
  const complete = blanks === 0 && nonNumeric === 0;

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

  const total = input.results.reduce(
    (sum, r) => sum + (Number.isFinite(r.rawScore) ? r.rawScore : 0),
    0,
  );
  const expectedTotal = league.startPoint * 4;
  const shown = [...errors, ...(serverErrors ?? [])];
  // 未選択（0）は名前を出しようがないのでハイライトから外す
  const badMemberIds = new Set(shown.flatMap((e) => e.memberIds).filter((id) => id > 0));
  const nameOf = (id: number) => members.find((m) => m.id === id)?.name ?? `#${id}`;
  const canSubmit = complete && errors.length === 0;

  const setRow = (index: number, patch: Partial<{ memberId: number; rawScore: string }>) => {
    const rows = value.rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
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
            <select
              className={`border-input h-9 flex-1 rounded-lg border bg-transparent px-2 text-sm ${
                badMemberIds.has(row.memberId) ? "border-destructive" : ""
              }`}
              value={row.memberId}
              onChange={(e) => setRow(index, { memberId: Number(e.target.value) })}
              aria-label={`${index + 1}人目`}
            >
              <option value={0}>選択</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <Input
              // inputMode="numeric" はテンキーだけを出すので、多くの端末で
              // 「−」が打てず箱下（負の素点）を入力できなくなる。
              // 仕様は「負数OK・箱下精算あり」なので text にして自前で検証する。
              inputMode="text"
              autoComplete="off"
              placeholder="素点"
              className={`w-28 text-right ${badMemberIds.has(row.memberId) ? "border-destructive" : ""}`}
              value={row.rawScore}
              onChange={(e) => setRow(index, { rawScore: e.target.value })}
              aria-label={`${index + 1}人目の素点`}
            />
          </div>
        ))}
      </div>

      <p className="text-muted-foreground mt-2 text-right text-sm">
        合計 {total.toLocaleString()} / {expectedTotal.toLocaleString()}
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
      {nonNumeric > 0 ? (
        <p className="text-destructive mt-4 text-sm">素点は数字で入力してください</p>
      ) : blanks > 0 ? (
        <p className="text-muted-foreground mt-4 text-sm">
          あと {blanks} か所（メンバーと素点）を入力すると保存できます
        </p>
      ) : shown.length > 0 ? (
        <ul className="text-destructive mt-4 space-y-1 text-sm">
          {shown.map((e, i) => {
            const who = e.memberIds.filter((id) => id > 0);
            return (
              <li key={`${e.code}-${i}`}>
                {e.message}
                {who.length > 0 ? `（${who.map(nameOf).join("・")}）` : ""}
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
