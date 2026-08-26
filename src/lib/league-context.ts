/**
 * リーグデータのコンテキストとフック。
 *
 * コンポーネントを export しないので Fast Refresh の境界を汚さない
 * （プロバイダは components/LeagueProvider.tsx）。
 */

import { createContext, use } from "react";
import type { ApiFailure, LeagueResponse } from "./api";
import type { Roster } from "./validation";

export type LeagueData = LeagueResponse & {
  /** memberId → teamId。validateGameInput と computeStats にそのまま渡せる */
  roster: Roster;
  /** 再取得（書き込み後に呼ぶ） */
  reload: () => void;
};

export const LeagueContext = createContext<LeagueData | null>(null);

export function useLeague(): LeagueData {
  const value = use(LeagueContext);
  if (value === null) throw new Error("useLeague must be used inside <LeagueProvider>");
  return value;
}

/** ApiFailure を画面に出す文言に変換する */
export function describeFailure(failure: ApiFailure): string {
  switch (failure.kind) {
    case "validation":
      return failure.errors.map((e) => e.message).join(" / ");
    case "unauthorized":
      return "パスコードが違います";
    case "misconfigured":
      // パスコードの問題ではないので、入力し直させない
      return "サーバー設定に問題があります。運営に連絡してください";
    case "serverError":
      // 設定ミスではないので運営への連絡を促さない
      return "サーバーが一時的に応答していません。しばらくしてからもう一度お試しください";
    case "notFound":
      return "対象が見つかりません（削除済みの可能性があります）";
    case "tooLarge":
      return "入力が大きすぎます";
    default:
      return failure.message;
  }
}
