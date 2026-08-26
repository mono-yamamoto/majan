import { describe, expect, it, vi } from "vite-plus/test";
import { createGame, updateGame } from "./api";

/** fetch を差し替えて、呼ばれた回数と付いたヘッダを観測する */
function stubFetch(status: number, body: unknown, delayMs = 10) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    await new Promise((r) => setTimeout(r, delayMs));
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

const INPUT = {
  playedOn: "2026-08-26",
  memo: null,
  results: [
    { memberId: 1, rawScore: 42300 },
    { memberId: 6, rawScore: 28100 },
    { memberId: 2, rawScore: 18400 },
    { memberId: 7, rawScore: 11200 },
  ],
};

describe("api / 二重送信の抑止", () => {
  /**
   * ★スマホの二重タップ対策★
   * played_on に UNIQUE が無い（1日に何半荘もやるので仕様どおり）ため、
   * 同じ POST が2回通ると同じ半荘が2件登録される。DBは止めてくれない。
   */
  it("同時に飛んだ同一の POST は1本にまとまる", async () => {
    const calls = stubFetch(201, { id: 1 });
    const [a, b] = await Promise.all([createGame(1, INPUT, "pc"), createGame(1, INPUT, "pc")]);
    expect(calls).toHaveLength(1);
    expect(a).toEqual(b);
    vi.unstubAllGlobals();
  });

  it("内容が違えば別々に送る（同じ日に2半荘は正当な操作）", async () => {
    const calls = stubFetch(201, { id: 1 });
    const other = { ...INPUT, results: [...INPUT.results].reverse() };
    await Promise.all([createGame(1, INPUT, "pc"), createGame(1, other, "pc")]);
    expect(calls).toHaveLength(2);
    vi.unstubAllGlobals();
  });

  /** 1件目が完了したあとの再送は束ねられない。画面側の責務（T7） */
  it("完了後の再送は別リクエストになる（画面側でボタンを無効化する必要がある）", async () => {
    const calls = stubFetch(201, { id: 1 }, 0);
    await createGame(1, INPUT, "pc");
    await createGame(1, INPUT, "pc");
    expect(calls).toHaveLength(2);
    vi.unstubAllGlobals();
  });
});

describe("api / レスポンスの判別", () => {
  it("業務ルール違反は kind:'validation' として errors を持つ", async () => {
    stubFetch(
      400,
      { errors: [{ code: "NOT_IN_LEAGUE", field: "results", memberIds: [99], message: "x" }] },
      0,
    );
    const result = await createGame(1, INPUT, "pc");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("validation");
      if (result.kind === "validation") expect(result.errors[0].code).toBe("NOT_IN_LEAGUE");
    }
    vi.unstubAllGlobals();
  });

  it("形の不正は kind:'badRequest'（同じ 400 でもキー名で分かれる）", async () => {
    stubFetch(400, { error: "playedOn must be a string" }, 0);
    const result = await updateGame(1, INPUT, "pc");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("badRequest");
    vi.unstubAllGlobals();
  });

  it("401 と 500 を別の kind にする（401 は入れ直し / 500 は入れ直させない）", async () => {
    stubFetch(401, { error: "invalid passcode" }, 0);
    const unauthorized = await createGame(1, INPUT, "pc");
    if (!unauthorized.ok) expect(unauthorized.kind).toBe("unauthorized");
    vi.unstubAllGlobals();

    stubFetch(500, { error: "server misconfigured: WRITE_PASSCODE is not set" }, 0);
    const misconfigured = await createGame(1, INPUT, "pc");
    if (!misconfigured.ok) expect(misconfigured.kind).toBe("misconfigured");
    vi.unstubAllGlobals();
  });

  it("通信できなければ kind:'network'（例外を投げない）", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const result = await createGame(1, INPUT, "pc");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("network");
    vi.unstubAllGlobals();
  });
});

describe("api / X-Passcode の付与", () => {
  it("書き込みには付く", async () => {
    const calls = stubFetch(201, { id: 1 }, 0);
    await createGame(1, INPUT, "secret");
    expect((calls[0].init.headers as Record<string, string>)["X-Passcode"]).toBe("secret");
    vi.unstubAllGlobals();
  });

  it("GET には付けない（閲覧URLを共有した端末に入力係の値を残さない）", async () => {
    const calls = stubFetch(200, { league: {}, teams: [], members: [], games: [] }, 0);
    const { fetchLeague } = await import("./api");
    await fetchLeague(1);
    expect((calls[0].init.headers as Record<string, string>)["X-Passcode"]).toBeUndefined();
    vi.unstubAllGlobals();
  });
});
