/**
 * 素点からリーグ pt と順位を求める純粋関数。
 *
 * 仕様: `Guidebook/src/content/docs/spec/scoring.mdx`
 * DB にも HTTP にも依存しないので、フロントと Hono API の両方から呼べる。
 */

export type LeagueRule = {
  /** 持ち点。例: 25000 */
  startPoint: number;
  /** 返し点。例: 30000 */
  returnPoint: number;
  /** 1位〜4位のウマ。例: [30, 10, -10, -30] */
  uma: [number, number, number, number];
};

export type Result = {
  memberId: number;
  /** 素点。100 の倍数、負数可（箱下） */
  rawScore: number;
};

export type Scored = Result & {
  /** 同点グループの先頭順位。同点があると 1,1,3,4 のような形になる */
  rank: number;
  /** リーグ pt。0.1 刻み */
  pt: number;
};

/**
 * 内部計算は 0.1pt 単位の整数（deci-pt）で行う。
 * 小数のまま各自を丸めると、端数の出る同点ケースで pt 合計がゼロサムから外れるため。
 */
const DECI_PER_PT = 10;

/** 素点 1000点 = 1pt = 10 deci-pt。よって素点差は 100 で割ると deci-pt になる。 */
const RAW_PER_DECI = 100;

/**
 * 4人の素点から順位と pt を求める。返り値は pt/順位の高い順（素点降順 → memberId 昇順）。
 *
 * pt 合計は次の3条件がそろったときに厳密に 0 になる:
 *   1. 素点合計 = `startPoint * 4`
 *   2. ウマの合計 = 0
 *   3. `rawScore` / `startPoint` / `returnPoint` がすべて 100 の倍数
 * いずれも DB の CHECK 制約と `validation.ts` 側の責務で、この関数は検証しない
 * （`scoreGame` は「与えられた4人を採点する」だけ）。
 *
 * `rule.uma` は4人ぶんの並びなので、`results` はちょうど4件を渡すこと。
 */
export function scoreGame(results: Result[], rule: LeagueRule): Scored[] {
  // 返し点−持ち点が25の倍数でない設定でも deci-pt の整数前提を壊さないよう丸める
  const okaDeci = Math.round(((rule.returnPoint - rule.startPoint) * 4) / RAW_PER_DECI);

  // 同点内の並びを決定的にするため、素点降順 → memberId 昇順で固定する
  const sorted = [...results].sort((a, b) => b.rawScore - a.rawScore || a.memberId - b.memberId);

  const scored: Scored[] = [];

  for (let head = 0; head < sorted.length;) {
    // 同点グループは [head, tail)
    let tail = head;
    while (tail < sorted.length && sorted[tail].rawScore === sorted[head].rawScore) tail++;
    const size = tail - head;

    // グループが占める順位ぶんのウマを合算する。先頭グループにはオカも乗る
    const umaDeci = rule.uma.slice(head, tail).reduce((sum, u) => sum + u * DECI_PER_PT, 0);
    const bonusDeci = umaDeci + (head === 0 ? okaDeci : 0);

    // 整数除算で山分けし、余りはグループ先頭から 1 ずつ配る。
    // Math.trunc はゼロ方向に丸めるので、余りの符号は bonusDeci の符号と一致する。
    const shareDeci = Math.trunc(bonusDeci / size);
    let remainderDeci = bonusDeci - shareDeci * size;

    for (let k = head; k < tail; k++) {
      const extraDeci = Math.sign(remainderDeci); // 1 / -1 / 0
      remainderDeci -= extraDeci;

      const baseDeci = Math.round((sorted[k].rawScore - rule.returnPoint) / RAW_PER_DECI);
      scored.push({
        ...sorted[k],
        rank: head + 1,
        pt: (baseDeci + shareDeci + extraDeci) / DECI_PER_PT,
      });
    }

    head = tail;
  }

  return scored;
}
