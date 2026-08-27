/**
 * 名簿から外したときに何が起きるかで、メンバーを分ける。
 *
 * まとめて「半荘に出ている」と言うと、**予定にだけ入っている人に
 * 「チーム合計 pt が釣り合わなくなる」と嘘をつく**（予定には pt が無い）。
 * 運営メニューの確認は「読ませる」ために名指しにしているので、
 * そこに事実でない文が混ざると次から読まれなくなる。
 *
 * 「結果が出ているか」は `stats.ts` の `isScorable` に聞く。
 * T13 で条件を1か所に置くと決めたので、ここで書き直さない。
 */

import { isScorable } from "@/lib/stats";
import type { LeagueRule } from "@/lib/scoring";

export type ImpactGame = {
  results: { memberId: number; rawScore: number | null }[];
};

export type Impact = {
  /** 結果の出た半荘に出ている。pt が動く + その半荘が編集できなくなる */
  scored: Set<number>;
  /**
   * 予定（素点がまだ）か、素点のそろっていない半荘にだけ入っている。
   * pt は無いが、その半荘が編集できなくなる。
   * 素点が欠けた壊れた半荘もこちら（pt が付いていないので pt の話にならない）。
   */
  other: Set<number>;
};

export function membersByImpact(games: ImpactGame[], rule: LeagueRule): Impact {
  const scored = new Set<number>();
  const other = new Set<number>();

  for (const game of games) {
    const target = isScorable(game, rule) ? scored : other;
    for (const r of game.results) target.add(r.memberId);
  }

  // 結果の出た半荘にも出ている人は scored 側だけに置く。
  // 両方に入れると、確認の文が二重に出る
  for (const id of scored) other.delete(id);

  return { scored, other };
}
