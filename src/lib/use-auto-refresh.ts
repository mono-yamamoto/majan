/**
 * 見ている間だけリーグデータを取り直す。
 *
 * 半荘が登録されたあと、他の人がリロードしないと更新されないのを直すもの。
 *
 * ★ **「見るだけの画面」でしか呼ばないこと。**
 *   `LeagueProvider` に入れると全画面に効き、**入力中のフォームが消えます**。
 *   運営メニューはサーバから来た名簿を key にして作り直す（T21）ので、
 *   裏で更新が走ると編集内容が丸ごと消えます。半荘の登録・編集も同じ。
 *
 *   「フォームが空なら更新していい」のような条件にはしない。判定が増えるほど
 *   「どういうときに消えるのか」が読めなくなる。**画面単位で線を引く**。
 *
 * 効かせている画面: 戦績 / 半荘一覧 / 個人成績 / ルール
 * 効かせていない画面: 半荘の登録 / 半荘の編集 / 運営メニュー
 *
 * ---
 *
 * 2段構え。
 *
 * 1. **見えたときに取り直す**（`visibilitychange` / `focus`）。
 *    「スマホを置いて、また開いた」が使われ方の大半で、待ち時間ゼロで直る。
 * 2. **見えている間だけ、一定間隔で取り直す**。隠れている間は止める
 *    （電池と無駄な起床を避ける）。卓を囲みながら他の卓の結果を見る用。
 *
 * 同じ内容なら `LeagueProvider` が状態を差し替えないので、再描画も
 * グラフの再生も起きない（そちらのコメント参照）。
 */

import { useEffect, useRef } from "react";

/** 取り直す間隔。半荘が終わって登録されるまで（数十分）に対して十分細かい */
export const REFRESH_INTERVAL_MS = 30_000;

export function useAutoRefresh(reload: () => void): void {
  const lastAt = useRef(0);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    /**
     * 続けて来た要求をまとめる。
     *
     * タブに戻ると `visibilitychange` と `focus` が**続けて来る**ので、
     * そのままだと2回取りに行く。`focus` 側を消さないのは、デスクトップで
     * 別アプリから戻ったときに `visibilitychange` が出ない（`visible` のまま）
     * ことがあり、そこを拾えなくなるため。
     */
    const refreshOnce = () => {
      const now = Date.now();
      if (now - lastAt.current < 1000) return;
      lastAt.current = now;
      reload();
    };

    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const start = () => {
      stop();
      timer = setInterval(refreshOnce, REFRESH_INTERVAL_MS);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        // 見えた瞬間に1回。間隔を待たせない
        refreshOnce();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [reload]);
}
