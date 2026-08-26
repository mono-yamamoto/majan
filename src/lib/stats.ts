/**
 * 個人成績・チーム集計。
 *
 * 仕様: `Guidebook/src/content/docs/spec/features.mdx` の「個人成績」節。
 * `scoring.ts` と同じく DB にも HTTP にも依存しない純粋関数。
 *
 * 集計はすべて **deci 整数**（0.1pt 単位）で行い、最後に `/ 10` する。
 * `pt` は 0.1 刻みの浮動小数なので素朴に `reduce` で足すと誤差が出る
 * （`16.7` を10回足すと `166.99999999999997`）。表示は `toFixed(1)` で隠れるが、
 * **ランキングのソートと同点判定が壊れる**。`scoring.ts` が内部を deci にしたのと同じ理由。
 */

import { scoreGame, type LeagueRule, type Result, type Scored } from "./scoring";
import type { Roster } from "./validation";

/** 集計対象の半荘。論理削除済みの半荘は呼び出し側で除外して渡す */
export type StatsGame = {
  id: number;
  /** YYYY-MM-DD */
  playedOn: string;
  /** 素点。予約（次の対局を先に登録した状態）では全員 null */
  results: { memberId: number; rawScore: number | null }[];
};

/** 累計pt推移の1点。x軸は playedOn → id の順 */
export type CumulativePoint = {
  gameId: number;
  playedOn: string;
  /** その半荘を終えた時点の累計pt */
  totalPt: number;
};

export type MemberStats = {
  memberId: number;
  /** 出場した半荘の数 */
  gameCount: number;
  /** 合計pt。未出場なら 0 */
  totalPt: number;
  /** 以下、未出場（gameCount === 0）なら null。NaN や ±Infinity は返さない */
  averagePt: number | null;
  /** 平均順位。同点は「占める順位」で数える（1,1,3,4 の rank をそのまま足さない） */
  averageRank: number | null;
  /** 1着〜4着の回数。同点1位は全員が1着 */
  rankCounts: [number, number, number, number];
  /** 1着〜4着の率 */
  rankRates: [number | null, number | null, number | null, number | null];
  /** rankRates[0] と同じ値（仕様の指標名に合わせた別名） */
  topRate: number | null;
  /** rankRates[3] と同じ値 */
  lastRate: number | null;
  maxRawScore: number | null;
  minRawScore: number | null;
  cumulative: CumulativePoint[];
};

export type TeamStats = {
  teamId: number;
  /** 所属メンバーの pt 総和（決定#6） */
  totalPt: number;
  /** そのチームのメンバーが1人でも出場した半荘の数 */
  gameCount: number;
  cumulative: CumulativePoint[];
};

/**
 * どのチームにも紐づかなかったぶんの集計。
 *
 * `roster` に無い memberId が半荘に現れると（リーグを外れた人の過去の半荘が残る等）、
 * その人の pt はチーム合計のどこにも入らない。そのまま表示すると
 * **チーム合計の和が 0 にならないのに、それが画面から分からない**状態になる。
 *
 * ここに分けて返すことで
 *   Σ(teams[].totalPt) + unassigned.totalPt = 0
 * が不変条件として成立し、`memberIds` が空でなければ壊れていると検知できる。
 *
 * 個人成績（`members`）には通常どおり含まれるので、`MemberStats` を重複して持たない。
 * 全項目が要るなら `members` から memberId で引けばよく、二重に持つと食い違う余地ができる。
 */
/**
 * 集計から除外した半荘のID。
 *
 * `scoreGame` は4件でないと RangeError を投げる（事前条件・T2）。
 * `games` / `game_results` は運営が SQL で直接触れるので（決定#11）、
 * 4件でない半荘は作れてしまう。そのまま通すと**戦績画面全体が落ちて**
 * 閲覧者10人全員が画面を失う。
 *
 * 除外はするが**黙って落とさない**。呼び出し側が警告を出せるように返す。
 * 目的は「1件の壊れたデータで全員が画面を失う」ことを防ぐことであって、
 * 「壊れていることを隠す」ことではない。
 */
export type BrokenGames = number[];

export type UnassignedStats = {
  /** 所属が引けなかったメンバー。空配列なら健全 */
  memberIds: number[];
  /** それらの合計pt */
  totalPt: number;
};

const DECI_PER_PT = 10;

/**
 * 予約か。素点が1つも入っていない＝「次に誰が対局するか」だけ決まった状態。
 * **正常な状態**なので、集計から外すが警告は出さない（broken とは違う）。
 */
export function isReserved(game: { results: { rawScore: number | null }[] }): boolean {
  return game.results.length > 0 && game.results.every((r) => r.rawScore === null);
}

/**
 * 集計（= scoreGame）に渡せる半荘か。
 *
 * 「人数がそろっている」「素点が全員ぶん入っている」の両方が要る。
 * この判定は computeStats だけでなく画面側（一覧・戦績のグラフと件数）でも必要で、
 * 各所に条件を書くと**予約のような新しい状態を足すたびに全箇所を洗う**ことになる。
 * 1か所に置いて、条件が増えてもここだけ直せば全画面が追従するようにする。
 */
export function isScorable(
  game: { results: { rawScore: number | null }[] },
  rule: LeagueRule,
): boolean {
  return game.results.length === rule.uma.length && game.results.every((r) => r.rawScore !== null);
}

/** 半荘の並び順を playedOn → id で固定する。累計推移の x 軸はこの順序 */
const byPlayedOnThenId = (a: StatsGame, b: StatsGame): number =>
  a.playedOn < b.playedOn ? -1 : a.playedOn > b.playedOn ? 1 : a.id - b.id;

/**
 * 同点グループを考慮した「占める順位」を 2倍した整数。
 *
 * 占める順位 = rank + (同じ rank を持つ人数 − 1) / 2 なので、2倍すると
 * `2 * rank + size - 1` で必ず整数になる。半荘ごとの総和は常に 20（= 2 × (1+2+3+4)）。
 */
function occupiedRankTimesTwo(scored: Scored[]): Map<number, number> {
  const sizeByRank = new Map<number, number>();
  for (const s of scored) sizeByRank.set(s.rank, (sizeByRank.get(s.rank) ?? 0) + 1);

  const out = new Map<number, number>();
  for (const s of scored) {
    out.set(s.memberId, 2 * s.rank + (sizeByRank.get(s.rank) as number) - 1);
  }
  return out;
}

type Accumulator = {
  gameCount: number;
  totalPtDeci: number;
  occupiedRankTimesTwoSum: number;
  rankCounts: [number, number, number, number];
  maxRawScore: number | null;
  minRawScore: number | null;
  cumulative: CumulativePoint[];
};

const emptyAccumulator = (): Accumulator => ({
  gameCount: 0,
  totalPtDeci: 0,
  occupiedRankTimesTwoSum: 0,
  rankCounts: [0, 0, 0, 0],
  maxRawScore: null,
  minRawScore: null,
  cumulative: [],
});

/**
 * 個人成績とチーム集計をまとめて算出する。
 *
 * `roster`（memberId → teamId）に載っているメンバーは、出場していなくても
 * 半荘数 0 のエントリとして必ず返す。リーグ開始直後は全員が 0 で、
 * その日に来なかった人もそのままなので、未出場者は例外ではなく通常の状態。
 *
 * `roster` に無い memberId が半荘に現れた場合（所属を外されたあとに過去の半荘が残る等）も
 * 個人成績としては集計する。ただしチームが決まらないので**チーム集計には入らない**ので、
 * そのぶんは `unassigned` に分けて返す（→ {@link UnassignedStats}）。
 */
export function computeStats(
  games: StatsGame[],
  roster: Roster,
  rule: LeagueRule,
): {
  members: MemberStats[];
  teams: TeamStats[];
  unassigned: UnassignedStats;
  broken: BrokenGames;
  /** 実際に採点した半荘のID。playedOn → id 順。グラフの x 軸に使える */
  scoredGameIds: number[];
  /** 予約として除外した半荘のID。警告には使わない（正常な状態なので） */
  reservedGameIds: number[];
} {
  const broken: BrokenGames = [];
  const reserved: number[] = [];
  const ordered = [...games]
    .filter((g) => {
      // 予約は集計に入れないが broken には入れない。broken は「運営が直すべき異常」で、
      // **予約は正常な状態**。混ぜると画面が「壊れています」と嘘をつく（原則5）。
      if (isReserved(g)) {
        reserved.push(g.id);
        return false;
      }
      if (isScorable(g, rule)) return true;
      // 人数が足りない／素点が一部だけ、は pt を計算できない異常
      // （API が弾いているので通常は現れないが、運営の SQL 直操作では作れる）
      broken.push(g.id);
      return false;
    })
    .sort(byPlayedOnThenId);

  const acc = new Map<number, Accumulator>();
  const ensure = (memberId: number): Accumulator => {
    let a = acc.get(memberId);
    if (a === undefined) {
      a = emptyAccumulator();
      acc.set(memberId, a);
    }
    return a;
  };
  // 未出場でも必ず結果に出す
  for (const memberId of roster.keys()) ensure(memberId);

  let unassignedDeci = 0;
  const unassignedIds = new Set<number>();

  const teamAcc = new Map<
    number,
    { totalPtDeci: number; gameCount: number; cumulative: CumulativePoint[] }
  >();
  for (const teamId of new Set(roster.values())) {
    teamAcc.set(teamId, { totalPtDeci: 0, gameCount: 0, cumulative: [] });
  }

  for (const game of ordered) {
    // ここに来るのは4件そろって素点も全部入っている半荘だけ（上の filter が保証する）
    const scored = scoreGame(game.results as Result[], rule);
    const occupied = occupiedRankTimesTwo(scored);
    const teamDeciThisGame = new Map<number, number>();

    for (const s of scored) {
      const a = ensure(s.memberId);
      // float 領域 → 整数 deci 領域への境界変換。
      // scoreGame の出力（整数deci / 10）に対しては no-op だが、変換の正しさを
      // 「JS の float で (d/10)*10 が往復する」という経験的性質に依存させないために置く。
      // pt が JSON 経由で来る・scoring.ts が表現を変える、といった変更で静かに壊れるのを防ぐ。
      const ptDeci = Math.round(s.pt * DECI_PER_PT);

      a.gameCount += 1;
      a.totalPtDeci += ptDeci;
      a.occupiedRankTimesTwoSum += occupied.get(s.memberId) as number;
      a.rankCounts[s.rank - 1] += 1;
      a.maxRawScore = a.maxRawScore === null ? s.rawScore : Math.max(a.maxRawScore, s.rawScore);
      a.minRawScore = a.minRawScore === null ? s.rawScore : Math.min(a.minRawScore, s.rawScore);
      a.cumulative.push({
        gameId: game.id,
        playedOn: game.playedOn,
        totalPt: a.totalPtDeci / DECI_PER_PT,
      });

      const teamId = roster.get(s.memberId);
      if (teamId !== undefined) {
        teamDeciThisGame.set(teamId, (teamDeciThisGame.get(teamId) ?? 0) + ptDeci);
      } else {
        unassignedDeci += ptDeci;
        unassignedIds.add(s.memberId);
      }
    }

    for (const [teamId, deci] of teamDeciThisGame) {
      const t = teamAcc.get(teamId) ?? { totalPtDeci: 0, gameCount: 0, cumulative: [] };
      t.totalPtDeci += deci;
      t.gameCount += 1;
      t.cumulative.push({
        gameId: game.id,
        playedOn: game.playedOn,
        totalPt: t.totalPtDeci / DECI_PER_PT,
      });
      teamAcc.set(teamId, t);
    }
  }

  const members: MemberStats[] = [...acc.entries()]
    .map(([memberId, a]) => finalize(memberId, a))
    .sort((a, b) => a.memberId - b.memberId);

  const teams: TeamStats[] = [...teamAcc.entries()]
    .map(([teamId, t]) => ({
      teamId,
      totalPt: t.totalPtDeci / DECI_PER_PT,
      gameCount: t.gameCount,
      cumulative: t.cumulative,
    }))
    .sort((a, b) => a.teamId - b.teamId);

  return {
    members,
    teams,
    unassigned: {
      memberIds: [...unassignedIds].sort((a, b) => a - b),
      totalPt: unassignedDeci / DECI_PER_PT,
    },
    broken: [...broken].sort((a, b) => a - b),
    scoredGameIds: ordered.map((g) => g.id),
    reservedGameIds: [...reserved].sort((a, b) => a - b),
  };
}

function finalize(memberId: number, a: Accumulator): MemberStats {
  const played = a.gameCount > 0;
  const rate = (n: number): number | null => (played ? n / a.gameCount : null);
  const rankRates: [number | null, number | null, number | null, number | null] = [
    rate(a.rankCounts[0]),
    rate(a.rankCounts[1]),
    rate(a.rankCounts[2]),
    rate(a.rankCounts[3]),
  ];

  return {
    memberId,
    gameCount: a.gameCount,
    totalPt: a.totalPtDeci / DECI_PER_PT,
    averagePt: played ? a.totalPtDeci / DECI_PER_PT / a.gameCount : null,
    // 「占める順位 × 2」の総和なので、2 と半荘数で割って戻す
    averageRank: played ? a.occupiedRankTimesTwoSum / 2 / a.gameCount : null,
    rankCounts: a.rankCounts,
    rankRates,
    topRate: rankRates[0],
    lastRate: rankRates[3],
    maxRawScore: a.maxRawScore,
    minRawScore: a.minRawScore,
    cumulative: a.cumulative,
  };
}

/**
 * ランキング順に並べ替える（元の配列は壊さない）。
 *
 * 合計pt 降順 → 未出場者（半荘数0）は末尾 → 同値は memberId 昇順。
 * 未出場者を明示的に末尾へ送るのは、素朴に `b.totalPt - a.totalPt` で並べると
 * 合計pt が 0 の未出場者が、マイナスのメンバーより上に来てしまうため。
 * 同値の並びを memberId で決めるのは scoreGame の tie-break と同じ方針。
 */
export function rankMembers(members: MemberStats[]): MemberStats[] {
  return [...members].sort((a, b) => {
    const aPlayed = a.gameCount > 0 ? 0 : 1;
    const bPlayed = b.gameCount > 0 ? 0 : 1;
    if (aPlayed !== bPlayed) return aPlayed - bPlayed;
    // 浮動小数のまま比較しないよう deci 整数に戻して比べる
    const diff = Math.round(b.totalPt * DECI_PER_PT) - Math.round(a.totalPt * DECI_PER_PT);
    if (diff !== 0) return diff;
    return a.memberId - b.memberId;
  });
}
