import { describe, expect, it } from "vite-plus/test";
import { scoreGame, type LeagueRule } from "./scoring";
import { computeStats, rankMembers, type StatsGame } from "./stats";
import type { Roster } from "./validation";

const RULE: LeagueRule = { startPoint: 25000, returnPoint: 30000, uma: [30, 10, -10, -30] };

/** チームA = 1,2,3 / チームB = 6,7,8。5 と 9 は未出場の要員 */
const ROSTER: Roster = new Map([
  [1, 1],
  [2, 1],
  [3, 1],
  [5, 1],
  [6, 2],
  [7, 2],
  [8, 2],
  [9, 2],
]);

const game = (id: number, playedOn: string, rows: [number, number][]): StatsGame => ({
  id,
  playedOn,
  results: rows.map(([memberId, rawScore]) => ({ memberId, rawScore })),
});

/** 同点なし / トップ同点 / 3人トップ同点 を含み、5 と 9 は一度も出場しない */
const GAMES: StatsGame[] = [
  game(1, "2026-08-26", [
    [1, 42300],
    [6, 28100],
    [2, 18400],
    [7, 11200],
  ]),
  game(2, "2026-08-26", [
    [1, 35000],
    [6, 35000],
    [2, 20000],
    [7, 10000],
  ]),
  game(3, "2026-08-27", [
    [1, 30000],
    [6, 30000],
    [2, 30000],
    [7, 10000],
  ]),
  game(4, "2026-08-28", [
    [3, 40000],
    [8, 20000],
    [1, 20000],
    [6, 20000],
  ]),
];

const deci = (pt: number): number => Math.round(pt * 10);
const byId = (memberId: number) =>
  computeStats(GAMES, ROSTER, RULE).members.find((m) => m.memberId === memberId);

// ---------------------------------------------------------------------------
// 独立オラクル: 実装とは別の書き方（素朴な二重ループ）で同じ値を組み直す。
// 不変条件は「合計が合う」タイプばかりで、個々の値の正しさは保証しない
// （T2 の教訓: 全員 pt=0 を返す実装でも 650,491件の sweep を通った）。
// ---------------------------------------------------------------------------
function naiveStats(games: StatsGame[], rule: LeagueRule, memberId: number) {
  let gameCount = 0;
  let totalPtDeci = 0;
  let occupiedSumTimesTwo = 0;
  const rankCounts = [0, 0, 0, 0];
  const raws: number[] = [];
  const cumulative: number[] = [];

  const ordered = [...games].sort((a, b) =>
    a.playedOn < b.playedOn ? -1 : a.playedOn > b.playedOn ? 1 : a.id - b.id,
  );

  for (const g of ordered) {
    const scored = scoreGame(g.results as { memberId: number; rawScore: number }[], rule);
    for (const s of scored) {
      if (s.memberId !== memberId) continue;
      gameCount++;
      totalPtDeci += deci(s.pt);
      // 占める順位: 自分と同じ rank の人数から求める
      let sameRank = 0;
      for (const o of scored) if (o.rank === s.rank) sameRank++;
      occupiedSumTimesTwo += 2 * s.rank + sameRank - 1;
      rankCounts[s.rank - 1]++;
      raws.push(s.rawScore);
      cumulative.push(totalPtDeci / 10);
    }
  }

  return {
    gameCount,
    totalPt: totalPtDeci / 10,
    averagePt: gameCount === 0 ? null : totalPtDeci / 10 / gameCount,
    averageRank: gameCount === 0 ? null : occupiedSumTimesTwo / 2 / gameCount,
    rankCounts,
    maxRawScore: raws.length === 0 ? null : Math.max(...raws),
    minRawScore: raws.length === 0 ? null : Math.min(...raws),
    cumulative,
  };
}

describe("computeStats / 独立オラクルとの一致", () => {
  it.each([1, 2, 3, 5, 6, 7, 8, 9])("memberId %i の全項目が素朴な実装と一致する", (memberId) => {
    const actual = byId(memberId);
    const expected = naiveStats(GAMES, RULE, memberId);

    expect(actual).toBeDefined();
    expect(actual?.gameCount).toBe(expected.gameCount);
    expect(deci(actual?.totalPt ?? 0)).toBe(deci(expected.totalPt));
    expect(actual?.averagePt).toBe(expected.averagePt);
    expect(actual?.averageRank).toBe(expected.averageRank);
    expect(actual?.rankCounts).toEqual(expected.rankCounts);
    expect(actual?.maxRawScore).toBe(expected.maxRawScore);
    expect(actual?.minRawScore).toBe(expected.minRawScore);
    expect(actual?.cumulative.map((c) => deci(c.totalPt))).toEqual(expected.cumulative.map(deci));
  });
});

describe("computeStats / 不変条件", () => {
  const { members } = computeStats(GAMES, ROSTER, RULE);
  const gameCount = GAMES.length;

  it("1. 1人あたり 1〜4着回数の合計 = その人の半荘数", () => {
    for (const m of members) {
      expect(m.rankCounts.reduce((a, b) => a + b, 0)).toBe(m.gameCount);
    }
  });

  it("2. 全メンバーの半荘数の総和 = 4 x 半荘数", () => {
    expect(members.reduce((sum, m) => sum + m.gameCount, 0)).toBe(4 * gameCount);
  });

  it("3. 全メンバーの「占める順位」の総和 = 10 x 半荘数（rank を素朴に足すと合わない）", () => {
    // averageRank x gameCount が「占める順位の総和」。2倍して整数で比べる
    const sumTimesTwo = members.reduce(
      (sum, m) => sum + (m.averageRank === null ? 0 : Math.round(m.averageRank * 2 * m.gameCount)),
      0,
    );
    expect(sumTimesTwo).toBe(20 * gameCount);

    // 素朴に rank を足すと 10 x 半荘数 にならないことも示しておく
    const naiveRankSum = GAMES.reduce(
      (sum, g) =>
        sum +
        scoreGame(g.results as { memberId: number; rawScore: number }[], RULE).reduce(
          (s, x) => s + x.rank,
          0,
        ),
      0,
    );
    expect(naiveRankSum).toBeLessThan(10 * gameCount);
  });

  it("4. 全メンバーの合計pt の総和 = 0（deci 整数で厳密に）", () => {
    expect(members.reduce((sum, m) => sum + deci(m.totalPt), 0)).toBe(0);
  });

  it("5. 累計pt推移の最終点 = 合計pt / 点数 = 半荘数 / x軸が playedOn, id 順", () => {
    for (const m of members) {
      expect(m.cumulative.length).toBe(m.gameCount);
      if (m.gameCount > 0) {
        expect(deci(m.cumulative[m.cumulative.length - 1].totalPt)).toBe(deci(m.totalPt));
      }
      const keys = m.cumulative.map((c) => `${c.playedOn}#${String(c.gameId).padStart(6, "0")}`);
      expect(keys).toEqual([...keys].sort());
    }
  });
});

describe("computeStats / 半荘数0 のメンバー（NaN / Infinity を返さない）", () => {
  const zero = byId(5);

  it("未定義の指標はすべて null", () => {
    expect(zero?.gameCount).toBe(0);
    expect(zero?.totalPt).toBe(0);
    expect(zero?.averagePt).toBeNull();
    expect(zero?.averageRank).toBeNull();
    expect(zero?.rankRates).toEqual([null, null, null, null]);
    expect(zero?.topRate).toBeNull();
    expect(zero?.lastRate).toBeNull();
    expect(zero?.maxRawScore).toBeNull();
    expect(zero?.minRawScore).toBeNull();
    expect(zero?.cumulative).toEqual([]);
  });

  it("着順回数は 0 で、NaN や ±Infinity を含まない", () => {
    expect(zero?.rankCounts).toEqual([0, 0, 0, 0]);
    const values = [zero?.averagePt, zero?.averageRank, zero?.maxRawScore, zero?.minRawScore];
    for (const v of values) {
      expect(Number.isNaN(v as number)).toBe(false);
      expect(v).not.toBe(Infinity);
      expect(v).not.toBe(-Infinity);
    }
  });

  it("半荘が1件も無ければ全員が半荘数0（リーグ開始直後）", () => {
    const { members } = computeStats([], ROSTER, RULE);
    expect(members).toHaveLength(ROSTER.size);
    expect(members.every((m) => m.gameCount === 0 && m.averagePt === null)).toBe(true);
  });
});

describe("computeStats / 平均順位は占める順位で数える", () => {
  it("3人トップ同点の半荘だけなら、上位3人の平均順位は 2.0・4位は 4.0", () => {
    const { members } = computeStats([GAMES[2]], ROSTER, RULE);
    const rankOf = (id: number) => members.find((m) => m.memberId === id)?.averageRank;
    // rank は 1,1,1,4 だが占める順位は 2,2,2,4
    expect(rankOf(1)).toBe(2);
    expect(rankOf(6)).toBe(2);
    expect(rankOf(2)).toBe(2);
    expect(rankOf(7)).toBe(4);
  });

  it("2位が2人同点なら 1, 2.5, 2.5, 4", () => {
    const g = game(9, "2026-09-01", [
      [1, 40000],
      [6, 25000],
      [2, 25000],
      [7, 10000],
    ]);
    const { members } = computeStats([g], ROSTER, RULE);
    const rankOf = (id: number) => members.find((m) => m.memberId === id)?.averageRank;
    expect([rankOf(1), rankOf(6), rankOf(2), rankOf(7)]).toEqual([1, 2.5, 2.5, 4]);
  });

  it("全員同点なら全員 2.5", () => {
    const g = game(9, "2026-09-01", [
      [1, 25000],
      [6, 25000],
      [2, 25000],
      [7, 25000],
    ]);
    const { members } = computeStats([g], ROSTER, RULE);
    expect(members.filter((m) => m.gameCount > 0).map((m) => m.averageRank)).toEqual([
      2.5, 2.5, 2.5, 2.5,
    ]);
  });
});

describe("computeStats / 同点1位は全員1着", () => {
  it("3人トップ同点では1着が3人、2着と3着は0人", () => {
    const { members } = computeStats([GAMES[2]], ROSTER, RULE);
    const played = members.filter((m) => m.gameCount > 0);
    const totals = [0, 1, 2, 3].map((i) => played.reduce((s, m) => s + m.rankCounts[i], 0));
    expect(totals).toEqual([3, 0, 0, 1]);
  });

  it("横に足すと半荘数と合わないが、1人あたりでは必ず一致する", () => {
    const { members } = computeStats(GAMES, ROSTER, RULE);
    const across = [0, 1, 2, 3].map((i) => members.reduce((s, m) => s + m.rankCounts[i], 0));
    // 4半荘だが 1着は 4回にならない（同点1位を全員数えるため）
    expect(across[0]).toBeGreaterThan(GAMES.length);
    for (const m of members) {
      expect(m.rankCounts.reduce((a, b) => a + b, 0)).toBe(m.gameCount);
    }
  });
});

/**
 * stats が `Math.round(pt * 10)` で pt を deci 整数に戻せるのは、
 * 「scoreGame の出力が厳密に 整数/10 である」ことに依存している。
 * その前提自体をここで固定する（前提が壊れたら stats の集計も壊れる）。
 */
describe("stats が依存する scoring 側の前提", () => {
  it("scoreGame の pt は常に厳密に「整数/10」で表せる", () => {
    const rules: LeagueRule[] = [
      { startPoint: 25000, returnPoint: 30000, uma: [30, 10, -10, -30] },
      { startPoint: 25000, returnPoint: 27500, uma: [30, 10, -10, -30] },
      { startPoint: 25000, returnPoint: 25000, uma: [10, 5, -5, -10] },
    ];
    let checked = 0;
    const violations: { rawScores: number[]; pt: number }[] = [];

    for (const rule of rules) {
      for (let a = -20000; a <= 80000; a += 2000) {
        for (let b = -20000; b <= 80000; b += 2000) {
          const c = rule.startPoint;
          const d = rule.startPoint * 4 - a - b - c;
          if (d < -20000 || d > 80000) continue;
          const rawScores = [a, b, c, d];
          for (const sc of scoreGame(
            rawScores.map((rawScore, i) => ({ memberId: i + 1, rawScore })),
            rule,
          )) {
            checked++;
            if (Math.round(sc.pt * 10) / 10 !== sc.pt && violations.length < 5) {
              violations.push({ rawScores, pt: sc.pt });
            }
          }
        }
      }
    }

    expect(violations).toEqual([]);
    expect(checked).toBeGreaterThan(10000);
  });

  /**
   * pt を deci に戻す往復（n → n/10 → *10）が厳密に元に戻る範囲の話。
   * 実測では |n| が 6e15 あたりから壊れ始めるが、素点は validation が
   * 安全整数までしか許さないので |ptDeci| は高々 9.0e13 程度。約67倍の余裕がある。
   */
  it("到達しうる ptDeci の範囲では n → n/10 → *10 が厳密に元に戻る", () => {
    const maxReachable = Math.round(Number.MAX_SAFE_INTEGER / 100) + 500;
    expect(maxReachable).toBeLessThan(1e14);

    const samples = [
      0,
      1,
      -1,
      167,
      -500,
      623,
      100000,
      -100000,
      maxReachable,
      -maxReachable,
      Math.floor(maxReachable / 3),
      Math.floor(maxReachable / 7) * -1,
    ];
    for (const n of samples) {
      expect((n / 10) * 10).toBe(n);
      expect(Math.round((n / 10) * 10)).toBe(n);
    }

    // 壊れ始める領域が到達範囲より十分上にあること（前提が薄氷でないことの確認）
    expect((6000000000000007 / 10) * 10).not.toBe(6000000000000007);
  });
});

/**
 * 注: `Math.round(pt * DECI_PER_PT)` から `round` を外す変異は**等価変異**で、
 * どんな入力でも結果が変わらない（scoreGame の出力に対しては no-op のため）。
 * mutation check で検出できないのはテストの欠陥ではなく変異の性質。
 * 「検出できない＝テストが弱い」と読まないこと。
 * 実際に効いているのは「pt を float のまま累積しない」という構造の方で、
 * それは下の2本が捕まえる。
 */
describe("computeStats / deci 整数で集計する", () => {
  it("同じ pt を10回足しても誤差が出ない（float の reduce なら壊れる）", () => {
    // 3人トップ同点（pt = 16.7）の半荘を10回
    const games = Array.from({ length: 10 }, (_, i) =>
      game(i + 1, "2026-08-26", [
        [1, 30000],
        [6, 30000],
        [2, 30000],
        [7, 10000],
      ]),
    );
    const { members } = computeStats(games, ROSTER, RULE);
    const m1 = members.find((m) => m.memberId === 1);
    expect(m1?.totalPt).toBe(167);
    // 素朴に float で足すと 166.99999999999997 になることを示す
    const naive = Array.from({ length: 10 }, () => 16.7).reduce((a, b) => a + b, 0);
    expect(naive).not.toBe(167);
  });

  it("数学的に同点の2人が合計ptで厳密に等しくなる", () => {
    const games = Array.from({ length: 10 }, (_, i) =>
      game(i + 1, "2026-08-26", [
        [1, 35000],
        [6, 35000],
        [2, 20000],
        [7, 10000],
      ]),
    );
    const { members } = computeStats(games, ROSTER, RULE);
    const a = members.find((m) => m.memberId === 1)?.totalPt;
    const b = members.find((m) => m.memberId === 6)?.totalPt;
    expect(a).toBe(b);
  });
});

describe("computeStats / チーム集計", () => {
  const { members, teams } = computeStats(GAMES, ROSTER, RULE);

  it("チーム合計pt = 所属メンバーの pt 総和", () => {
    for (const t of teams) {
      const expected = members
        .filter((m) => ROSTER.get(m.memberId) === t.teamId)
        .reduce((sum, m) => sum + deci(m.totalPt), 0);
      expect(deci(t.totalPt)).toBe(expected);
    }
  });

  it("チーム累計推移の最終点 = チーム合計pt", () => {
    for (const t of teams) {
      expect(deci(t.cumulative[t.cumulative.length - 1].totalPt)).toBe(deci(t.totalPt));
    }
  });

  it("2-2固定なので両チームの出場半荘数が一致する", () => {
    expect(teams[0].gameCount).toBe(teams[1].gameCount);
  });
});

describe("computeStats / roster に無いメンバー（unassigned）", () => {
  /** 4人目がリーグ名簿に載っていない半荘。所属を外されたあとに過去の半荘が残るケース */
  const STRAY_GAMES: StatsGame[] = [
    game(1, "2026-08-26", [
      [1, 42300],
      [6, 28100],
      [2, 18400],
      [99, 11200],
    ]),
  ];

  it("健全なら unassigned は空で合計 0", () => {
    const { unassigned } = computeStats(GAMES, ROSTER, RULE);
    expect(unassigned.memberIds).toEqual([]);
    expect(unassigned.totalPt).toBe(0);
  });

  it("所属の引けないメンバーは個人成績には出るが、チーム集計には入らない", () => {
    const { members, teams, unassigned } = computeStats(STRAY_GAMES, ROSTER, RULE);

    const stray = members.find((m) => m.memberId === 99);
    expect(stray?.gameCount).toBe(1);
    expect(stray?.totalPt).toBe(-48.8);

    expect(unassigned.memberIds).toEqual([99]);
    expect(deci(unassigned.totalPt)).toBe(deci(stray?.totalPt ?? 0));

    // チーム集計には 99 のぶんが入っていない
    const teamSum = teams.reduce((sum, t) => sum + deci(t.totalPt), 0);
    expect(teamSum).not.toBe(0);
  });

  /**
   * ★これが unassigned を分けて返す理由★
   * Σ(チーム合計) だけを見ると 0 にならないが、それが画面から分からない状態になる。
   * unassigned を足せば必ず 0 になるので、壊れていることを検知できる。
   */
  it("Σ(チーム合計pt) + unassigned の合計pt = 0（deci 整数で厳密に）", () => {
    for (const games of [GAMES, STRAY_GAMES]) {
      const { teams, unassigned } = computeStats(games, ROSTER, RULE);
      const total = teams.reduce((sum, t) => sum + deci(t.totalPt), 0) + deci(unassigned.totalPt);
      expect(total).toBe(0);
    }
  });

  it("個人成績側の Σ合計pt は unassigned がいても 0 のまま", () => {
    const { members } = computeStats(STRAY_GAMES, ROSTER, RULE);
    expect(members.reduce((sum, m) => sum + deci(m.totalPt), 0)).toBe(0);
  });

  it("unassigned は memberId 昇順で重複しない", () => {
    const games: StatsGame[] = [
      game(1, "2026-08-26", [
        [1, 42300],
        [98, 28100],
        [99, 18400],
        [97, 11200],
      ]),
      game(2, "2026-08-27", [
        [1, 42300],
        [99, 28100],
        [98, 18400],
        [97, 11200],
      ]),
    ];
    const { unassigned } = computeStats(games, ROSTER, RULE);
    expect(unassigned.memberIds).toEqual([97, 98, 99]);
  });
});

describe("computeStats / 4件でない半荘（broken）", () => {
  /**
   * ★1件の壊れたデータで全員が画面を失うのを防ぐ★
   * scoreGame は4件でないと RangeError を投げる（事前条件・T2）。
   * games / game_results は運営が SQL で直接触れるので（決定#11）、
   * 4件でない半荘は作れてしまう。そのまま通すと戦績画面全体が落ちる。
   */
  const BROKEN: StatsGame[] = [
    game(1, "2026-08-26", [
      [1, 42300],
      [6, 28100],
      [2, 18400],
      [7, 11200],
    ]),
    // 3人だけの壊れた半荘
    game(2, "2026-08-27", [
      [1, 40000],
      [6, 30000],
      [2, 30000],
    ]),
    // 5人いる壊れた半荘
    game(3, "2026-08-28", [
      [1, 20000],
      [6, 20000],
      [2, 20000],
      [7, 20000],
      [3, 20000],
    ]),
  ];

  it("例外を投げずに集計できる（素朴に scoreGame へ渡すと RangeError で落ちる）", () => {
    expect(() =>
      scoreGame(BROKEN[1].results as { memberId: number; rawScore: number }[], RULE),
    ).toThrow(RangeError);
    expect(() => computeStats(BROKEN, ROSTER, RULE)).not.toThrow();
  });

  it("壊れた半荘のIDを broken で返す（黙って落とさない）", () => {
    const { broken } = computeStats(BROKEN, ROSTER, RULE);
    expect(broken).toEqual([2, 3]);
  });

  it("健全な半荘だけで集計する", () => {
    const { members } = computeStats(BROKEN, ROSTER, RULE);
    const m1 = members.find((m) => m.memberId === 1);
    expect(m1?.gameCount).toBe(1);
    expect(m1?.totalPt).toBe(62.3);
    // 除外した半荘は累計推移にも現れない
    expect(m1?.cumulative.map((c) => c.gameId)).toEqual([1]);
  });

  it("除外後も不変条件が成立する（Σ合計pt = 0 / Σ半荘数 = 4 x 有効半荘数）", () => {
    const { members, teams, unassigned } = computeStats(BROKEN, ROSTER, RULE);
    expect(members.reduce((sum, m) => sum + deci(m.totalPt), 0)).toBe(0);
    expect(members.reduce((sum, m) => sum + m.gameCount, 0)).toBe(4 * 1);
    expect(teams.reduce((sum, t) => sum + deci(t.totalPt), 0) + deci(unassigned.totalPt)).toBe(0);
  });

  it("健全なデータなら broken は空", () => {
    expect(computeStats(GAMES, ROSTER, RULE).broken).toEqual([]);
  });
});

describe("computeStats / 予約（素点が全部 null）", () => {
  const reservation = (id: number, playedOn: string): StatsGame => ({
    id,
    playedOn,
    results: [1, 6, 2, 7].map((memberId) => ({ memberId, rawScore: null })),
  });

  const WITH_RESERVATION: StatsGame[] = [GAMES[0], reservation(90, "2026-09-10")];

  it("予約は集計に入らない（半荘数にも数えない）", () => {
    const { members } = computeStats(WITH_RESERVATION, ROSTER, RULE);
    const m1 = members.find((m) => m.memberId === 1);
    expect(m1?.gameCount).toBe(1);
    expect(m1?.cumulative.map((c) => c.gameId)).toEqual([1]);
  });

  /**
   * ★予約は broken に入れない★
   * broken は「運営が直すべき異常」、予約は正常な状態。
   * 混ぜると画面が「壊れています」と嘘をつく（原則5）。
   */
  it("予約は broken に入れない（正常な状態なので警告を出させない）", () => {
    const { broken } = computeStats(WITH_RESERVATION, ROSTER, RULE);
    expect(broken).toEqual([]);
  });

  it("予約だけなら全員が半荘数0で、broken も空", () => {
    const { members, broken } = computeStats([reservation(90, "2026-09-10")], ROSTER, RULE);
    expect(members.every((m) => m.gameCount === 0 && m.averagePt === null)).toBe(true);
    expect(broken).toEqual([]);
  });

  it("予約を除外しても不変条件が成立する", () => {
    const { members, teams, unassigned } = computeStats(WITH_RESERVATION, ROSTER, RULE);
    expect(members.reduce((sum, m) => sum + deci(m.totalPt), 0)).toBe(0);
    expect(members.reduce((sum, m) => sum + m.gameCount, 0)).toBe(4);
    expect(teams.reduce((sum, t) => sum + deci(t.totalPt), 0) + deci(unassigned.totalPt)).toBe(0);
  });

  /** 素点が一部だけ入っている半荘は pt を計算できないので broken 扱い（API は弾くが SQL 直操作では作れる） */
  it("素点が一部だけの半荘は broken に入れる（予約とは違い異常な状態）", () => {
    const partial: StatsGame = {
      id: 91,
      playedOn: "2026-09-11",
      results: [
        { memberId: 1, rawScore: 25000 },
        { memberId: 6, rawScore: null },
        { memberId: 2, rawScore: null },
        { memberId: 7, rawScore: null },
      ],
    };
    const { broken } = computeStats([GAMES[0], partial], ROSTER, RULE);
    expect(broken).toEqual([91]);
  });

  /**
   * ★3区分は排他かつ網羅★
   * どれにも入らない半荘が出たら分類漏れ。予約は「有効半荘数」に数えないが
   * 「壊れた半荘」でもない、という区別が保たれていることを機械的に確認する。
   */
  it("scored + reserved + broken = 全件（排他かつ網羅）", () => {
    const mixed: StatsGame[] = [
      GAMES[0],
      GAMES[1],
      reservation(90, "2026-09-10"),
      reservation(91, "2026-09-11"),
      // 3人しかいない壊れた半荘
      {
        id: 92,
        playedOn: "2026-09-12",
        results: [1, 6, 2].map((m) => ({ memberId: m, rawScore: 25000 })),
      },
      // 素点が一部だけ
      {
        id: 93,
        playedOn: "2026-09-13",
        results: [
          { memberId: 1, rawScore: 25000 },
          { memberId: 6, rawScore: null },
          { memberId: 2, rawScore: null },
          { memberId: 7, rawScore: null },
        ],
      },
    ];
    const { scoredGameIds, reservedGameIds, broken } = computeStats(mixed, ROSTER, RULE);

    expect(scoredGameIds.length + reservedGameIds.length + broken.length).toBe(mixed.length);
    // 排他: 同じ id が2つの区分に入らない
    const all = [...scoredGameIds, ...reservedGameIds, ...broken];
    expect(new Set(all).size).toBe(all.length);
    // 網羅: 元の id 集合と一致する
    expect([...all].sort((a, b) => a - b)).toEqual(mixed.map((g) => g.id).sort((a, b) => a - b));

    expect(scoredGameIds).toEqual([1, 2]);
    expect(reservedGameIds).toEqual([90, 91]);
    expect(broken).toEqual([92, 93]);
  });

  it("予約が混ざっていても不変条件が成立する", () => {
    const mixed: StatsGame[] = [GAMES[0], GAMES[1], reservation(90, "2026-09-10")];
    const { members, teams, unassigned, scoredGameIds } = computeStats(mixed, ROSTER, RULE);
    expect(members.reduce((sum, m) => sum + deci(m.totalPt), 0)).toBe(0);
    expect(members.reduce((sum, m) => sum + m.gameCount, 0)).toBe(4 * scoredGameIds.length);
    expect(teams.reduce((sum, t) => sum + deci(t.totalPt), 0) + deci(unassigned.totalPt)).toBe(0);
  });

  it("scoredGameIds は playedOn → id 順（グラフの x 軸に使える）", () => {
    const shuffled = [GAMES[3], GAMES[1], GAMES[0], GAMES[2]];
    expect(computeStats(shuffled, ROSTER, RULE).scoredGameIds).toEqual([1, 2, 3, 4]);
  });

  it("予約を渡しても scoreGame が呼ばれず例外にならない", () => {
    expect(() => computeStats([reservation(90, "2026-09-10")], ROSTER, RULE)).not.toThrow();
  });
});

describe("computeStats / 削除済み半荘は入力の時点で除外されている前提", () => {
  it("渡さなかった半荘は集計に現れない", () => {
    const withAll = computeStats(GAMES, ROSTER, RULE).members.find((m) => m.memberId === 1);
    const withoutLast = computeStats(GAMES.slice(0, 3), ROSTER, RULE).members.find(
      (m) => m.memberId === 1,
    );
    expect(withAll?.gameCount).toBe(4);
    expect(withoutLast?.gameCount).toBe(3);
    expect(withoutLast?.cumulative.some((c) => c.gameId === 4)).toBe(false);
  });
});

describe("rankMembers / ソート順", () => {
  const { members } = computeStats(GAMES, ROSTER, RULE);
  const ranked = rankMembers(members);

  it("合計pt 降順で、未出場者は末尾に来る", () => {
    const played = ranked.filter((m) => m.gameCount > 0);
    const notPlayed = ranked.filter((m) => m.gameCount === 0);
    expect(ranked.slice(0, played.length).every((m) => m.gameCount > 0)).toBe(true);
    expect(notPlayed.map((m) => m.memberId)).toEqual([5, 9]);
    for (let i = 1; i < played.length; i++) {
      expect(deci(played[i - 1].totalPt)).toBeGreaterThanOrEqual(deci(played[i].totalPt));
    }
  });

  it("★未出場者（合計pt 0）がマイナスのメンバーより上に来ない", () => {
    const negative = ranked.filter((m) => m.gameCount > 0 && m.totalPt < 0);
    expect(negative.length).toBeGreaterThan(0);
    const lastNegativeIndex = ranked.findIndex(
      (m) => m.memberId === negative[negative.length - 1].memberId,
    );
    const firstZeroGameIndex = ranked.findIndex((m) => m.gameCount === 0);
    expect(firstZeroGameIndex).toBeGreaterThan(lastNegativeIndex);
  });

  it("同値は memberId 昇順で決定的", () => {
    const games = [
      game(1, "2026-08-26", [
        [1, 35000],
        [6, 35000],
        [2, 20000],
        [7, 10000],
      ]),
    ];
    const ranked = rankMembers(computeStats(games, ROSTER, RULE).members);
    expect(ranked[0].memberId).toBe(1);
    expect(ranked[1].memberId).toBe(6);
    expect(ranked[0].totalPt).toBe(ranked[1].totalPt);
  });

  it("元の配列を壊さない", () => {
    const before = members.map((m) => m.memberId);
    rankMembers(members);
    expect(members.map((m) => m.memberId)).toEqual(before);
  });
});
