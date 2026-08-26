/**
 * API クライアント。
 *
 * 例外を投げず、**判別可能ユニオン**を返す。throw にすると呼び出し側の分岐が
 * catch の中に押し込まれ、400（業務違反 → フォームに表示）/ 401（パスコード）/
 * 500（サーバー設定ミス）/ ネットワークエラー の区別が崩れる。
 * サーバー側で 401 と 500 を分け、ボディを `{ error }` と `{ errors }` で
 * 分けているのは、呼び出し側が分岐できるようにするため。
 */

import type { ValidationError } from "./validation";

export type ApiOk<T> = { ok: true; data: T };

export type ApiFailure =
  /** 業務ルール違反。各 message をそのまま表示し、memberIds で該当者をハイライトする */
  | { ok: false; kind: "validation"; status: 400; errors: ValidationError[] }
  /** パスコード不一致。保存済みの値を消して入力し直してもらう */
  | { ok: false; kind: "unauthorized"; status: 401; message: string }
  /** サーバーの設定ミス（500）。パスコードの問題ではないので、入力し直させない */
  | { ok: false; kind: "misconfigured"; status: 500; message: string }
  /** 502/503/522 など。Cloudflare 側の一時的な不調なので、時間を置けば直る */
  | { ok: false; kind: "serverError"; status: number; message: string }
  /** 対象が見つからない（削除済みの可能性） */
  | { ok: false; kind: "notFound"; status: 404; message: string }
  /** 入力が大きすぎる */
  | { ok: false; kind: "tooLarge"; status: 413; message: string }
  /** 形の不正など。本来フロントからは出ないはずで、出たら実装バグ */
  | { ok: false; kind: "badRequest"; status: number; message: string }
  /** 通信できなかった／レスポンスが JSON でない */
  | { ok: false; kind: "network"; status: 0; message: string };

export type ApiResult<T> = ApiOk<T> | ApiFailure;

// --- GET /api/leagues/:id のレスポンス ---------------------------------------

export type LeagueResponse = {
  league: {
    id: number;
    name: string;
    startPoint: number;
    returnPoint: number;
    uma: [number, number, number, number];
    createdAt: string;
  };
  teams: { id: number; name: string }[];
  members: { id: number; name: string; teamId: number }[];
  games: {
    id: number;
    playedOn: string;
    memo: string | null;
    createdAt: string;
    /** 素点。予約（次の対局を先に登録した状態）では全員 null */
    results: { memberId: number; rawScore: number | null }[];
  }[];
};

/** トップのリーグ選択用。設定値やメンバーは選択後に fetchLeague で取る */
export type LeagueSummary = { id: number; name: string };

export type GameRequest = {
  playedOn: string;
  memo: string | null;
  /** 全部数値なら確定、全部 null なら予約。混在は API が弾く */
  results: { memberId: number; rawScore: number | null }[];
};

// --- 内部 --------------------------------------------------------------------

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** ボディの形（キー名）で 400 の2種類を判別する。Array.isArray では分岐しない */
function toFailure(status: number, body: unknown): ApiFailure {
  const message = isRecord(body) && typeof body.error === "string" ? body.error : "";

  if (status === 400 && isRecord(body) && Array.isArray(body.errors)) {
    return { ok: false, kind: "validation", status: 400, errors: body.errors as ValidationError[] };
  }
  if (status === 401) {
    return {
      ok: false,
      kind: "unauthorized",
      status: 401,
      message: message || "パスコードが違います",
    };
  }
  if (status === 404) {
    return {
      ok: false,
      kind: "notFound",
      status: 404,
      message: message || "対象が見つかりません（削除済みの可能性があります）",
    };
  }
  if (status === 413) {
    return { ok: false, kind: "tooLarge", status: 413, message: message || "入力が大きすぎます" };
  }
  // 500 と 502/503/522 を分ける。前者はこちらの設定ミス（運営に連絡すれば直る）、
  // 後者は Cloudflare 側の一時的な不調（時間を置けば直る）。同じ文言にすると、
  // 一時的な不調のたびに運営へ連絡が飛ぶ。
  if (status === 500) {
    return {
      ok: false,
      kind: "misconfigured",
      status: 500,
      message: message || "サーバー側の問題です",
    };
  }
  if (status > 500) {
    return {
      ok: false,
      kind: "serverError",
      status,
      message: message || "サーバーが一時的に応答していません",
    };
  }
  return { ok: false, kind: "badRequest", status, message: message || "リクエストが不正です" };
}

/**
 * 進行中の書き込みリクエスト。同じ内容の書き込みが重なったら同じ Promise を返す。
 *
 * スマホの二重タップで POST が2回飛ぶと、`played_on` に UNIQUE が無い（1日に何半荘も
 * やるので仕様どおり）ため**同じ半荘が2件登録される**。DBは止めてくれない。
 * ここで束ねるのは「同時に飛んだ同一リクエスト」だけで、
 * **1件目が完了したあとの再送は防げない**（画面側で保存後にボタンを無効化し、
 * 成功したら遷移する必要がある → T7）。
 */
const inFlight = new Map<string, Promise<ApiResult<unknown>>>();

async function request<T>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  options: { body?: unknown; passcode?: string | null } = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  // X-Passcode は書き込み系にだけ付ける。GET は無認証（決定#16）なので、
  // 付けると閲覧URLを共有したメンバーの端末に入力係の値が残る経路になる。
  if (method !== "GET" && options.passcode) headers["X-Passcode"] = options.passcode;

  try {
    const res = await fetch(path, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    let body: unknown = null;
    let parsed = true;
    try {
      body = await res.json();
    } catch {
      parsed = false;
    }

    if (!res.ok) return toFailure(res.status, body);

    // 2xx でも JSON でなければ成功にしない。run_worker_first の設定ミスやパスの
    // タイポで /api/* が SPA fallback に落ちると HTML 200 が返り、
    // そのまま data として扱うと呼び出し側が undefined を触って白画面になる。
    if (!parsed) {
      return {
        ok: false,
        kind: "network",
        status: 0,
        message: "サーバーの応答を読めませんでした",
      };
    }
    return { ok: true, data: body as T };
  } catch {
    return {
      ok: false,
      kind: "network",
      status: 0,
      message: "通信できませんでした。電波の状態を確認してもう一度お試しください",
    };
  }
}

/** 同時に飛んだ同一の書き込みを1本に束ねる */
async function writeOnce<T>(
  method: "POST" | "PATCH",
  path: string,
  body: unknown,
  passcode: string | null,
): Promise<ApiResult<T>> {
  const key = `${method} ${path} ${JSON.stringify(body)}`;
  const running = inFlight.get(key);
  if (running !== undefined) return running as Promise<ApiResult<T>>;

  const promise = request<T>(method, path, { body, passcode }).finally(() => {
    inFlight.delete(key);
  }) as Promise<ApiResult<unknown>>;
  inFlight.set(key, promise);
  return promise as Promise<ApiResult<T>>;
}

// --- 公開 API ----------------------------------------------------------------

/** リーグの一覧（id と name だけ）。トップのリーグ選択で使う */
export const fetchLeagues = (): Promise<ApiResult<{ leagues: LeagueSummary[] }>> =>
  request<{ leagues: LeagueSummary[] }>("GET", "/api/leagues");

/** リーグ設定・チーム・メンバー・全半荘を1回で取得する（決定#14。追加の往復を作らない） */
export const fetchLeague = (leagueId: number): Promise<ApiResult<LeagueResponse>> =>
  request<LeagueResponse>("GET", `/api/leagues/${leagueId}`);

export const createGame = (
  leagueId: number,
  input: GameRequest,
  passcode: string | null,
): Promise<ApiResult<{ id: number }>> =>
  writeOnce("POST", "/api/games", { leagueId, ...input }, passcode);

/** 全置換（D-2）。leagueId は送らない。サーバーが DB の games 行から読む（D-14） */
export const updateGame = (
  gameId: number,
  input: GameRequest,
  passcode: string | null,
): Promise<ApiResult<{ id: number }>> =>
  writeOnce("PATCH", `/api/games/${gameId}`, input, passcode);

/** 論理削除。片道（復活は作らない） */
export const deleteGame = (
  gameId: number,
  passcode: string | null,
): Promise<ApiResult<{ id: number; deleted: true }>> =>
  writeOnce("PATCH", `/api/games/${gameId}/deleted`, { deleted: true }, passcode);
