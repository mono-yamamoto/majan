/**
 * 書き込みパスコードの保管。
 *
 * `WRITE_PASSCODE` はビルドに埋め込まない（`VITE_` 接頭辞を使わない）。
 * 利用者が入力した値を `localStorage` に置き、リクエストヘッダで送るだけ。
 */

const STORAGE_KEY = "majan:passcode";

/**
 * `localStorage` はアクセス自体が例外を投げることがある。
 * - サイトデータをブロックしている設定 → 参照で SecurityError
 * - Safari のプライベートブラウズ → 使えるがクォータ0で setItem が QuotaExceededError
 *
 * 入力係はスマホのブラウザで使うので、プライベートタブで開かれる経路は現実にある。
 * 壊れ方は「毎回パスコードを聞かれるだけ」を選ぶ（アプリが落ちる／機能が使えない、にしない）。
 */
export function loadPasscode(): string | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value !== null && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

/** 保存できなくても黙って諦める。その回の書き込みは成功させ、次回また聞く */
export function savePasscode(passcode: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, passcode);
  } catch {
    // 保存できないだけで機能は使える
  }
}

export function clearPasscode(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 消せなくても実害はない（次の書き込みで 401 になり、また消しにいく）
  }
}
