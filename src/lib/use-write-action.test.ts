import { describe, expect, it, vi } from "vite-plus/test";
import type { ApiResult } from "./api";
import { clearPasscode, loadPasscode, savePasscode } from "./passcode";

/**
 * useWriteAction の状態機械そのものはフックなので、DOM 無しでは動かせない。
 * ここでは「フックが依存する passcode.ts の振る舞い」を固定する。
 * 401 → clearPasscode() → 再入力 のループを成立させるのに必要な性質。
 */
/** node 環境には localStorage が無いので、素直なメモリ実装で置き換える */
function stubStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
}

describe("passcode の保管", () => {
  it("保存した値が読み出せる", () => {
    stubStorage();
    savePasscode("abc");
    expect(loadPasscode()).toBe("abc");
    vi.unstubAllGlobals();
  });

  it("消すと null になる（401 のあと古い値で再送しないため）", () => {
    stubStorage();
    savePasscode("abc");
    clearPasscode();
    expect(loadPasscode()).toBeNull();
    vi.unstubAllGlobals();
  });

  it("空文字は未保存として扱う", () => {
    stubStorage();
    savePasscode("");
    expect(loadPasscode()).toBeNull();
    vi.unstubAllGlobals();
  });

  /**
   * ★localStorage が使えない環境（サイトデータのブロック、Safari の
   * プライベートブラウズ）でも落ちないこと。壊れ方は「毎回聞かれるだけ」を選ぶ。
   */
  it("localStorage が例外を投げても落ちない", () => {
    const throwing = {
      getItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
      removeItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
    };
    vi.stubGlobal("localStorage", throwing);

    expect(() => savePasscode("abc")).not.toThrow();
    expect(loadPasscode()).toBeNull();
    expect(() => clearPasscode()).not.toThrow();

    vi.unstubAllGlobals();
  });
});

/**
 * useWriteAction が分岐に使う ApiResult の形を固定する。
 * kind が変わるとフックの分岐（401 は消す / 500 は消さない）が静かに壊れる。
 */
describe("useWriteAction が依存する ApiResult の形", () => {
  it("unauthorized と misconfigured が別の kind であること", () => {
    const unauthorized: ApiResult<never> = {
      ok: false,
      kind: "unauthorized",
      status: 401,
      message: "x",
    };
    const misconfigured: ApiResult<never> = {
      ok: false,
      kind: "misconfigured",
      status: 500,
      message: "x",
    };
    expect(unauthorized.ok).toBe(false);
    expect(misconfigured.ok).toBe(false);
    if (!unauthorized.ok && !misconfigured.ok) {
      expect(unauthorized.kind).not.toBe(misconfigured.kind);
    }
  });
});
