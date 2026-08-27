/**
 * 下から出る登録シート。下バーの「登録」から開く。
 *
 * ★ 開いている間は**自動更新を止める**。
 *   シートは戦績・半荘一覧・ルール（＝自動更新する画面）の上に開くので、
 *   下でポーリングが回り続ける。裏で誰かが半荘を登録すると再描画が走り、
 *   入力中のものが巻き込まれうる。
 *   T21・T22 で引いた線（**書き込む画面では自動更新しない**）をそのまま守る。
 *   「たぶん消えない」で判定を増やさない。
 *
 *   閉じたら1回取り直す。登録が成功していれば新しいデータが要る。
 *
 * ★ シートの中はスクロールできるようにする。
 *   タイトル + 日付 + 4人 x（メンバー + 素点）はハーフモーダルに入りきらない。
 *   T21 のダイアログと同じで、スクロールできないと保存ボタンに届かない。
 *   キーボードが出るとさらに縮むので、`max-h` は控えめにしてある。
 */

import { useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useLeague } from "@/lib/league-context";
import { NewGameForm } from "./NewGameForm";

export function NewGameSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { reload } = useLeague();

  // 閉じたときに1回取り直す（開いている間は下の画面が止めている）
  useEffect(() => {
    if (!open) return;
    return () => reload();
  }, [open, reload]);

  /**
   * 開くたびにフォームを作り直すための番号。
   *
   * `useWriteAction` は**成功しても `pending` を戻さない**（遷移するので
   * 二重登録が起きない、という設計）。ページは遷移で unmount されるので
   * 成立するが、**このシートは常駐**していて、`pending` が下りるのは
   * 「閉じたら Base UI が中身を unmount してくれる」ことに乗っている。
   *
   * つまり **`pending` を下ろす責任がこのコードの外にある**。実際、
   * unmount しない環境では**1件目のあと保存ボタンが押せないまま**になり、
   * 2件目が登録できなかった（レビューで実測された）。
   * 合宿は半荘ごとに登録するので、2卓目が登録できないと作業が止まる。
   *
   * key を変えて自分で作り直せば、ライブラリの unmount のタイミングに
   * 依らなくなる。`useWriteAction` 側の設計（成功後に戻さない）は
   * 遷移する画面では正しいので、そちらに穴を開けない。
   */

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>半荘登録</SheetTitle>
          <SheetDescription>保存すると半荘一覧へ移ります。</SheetDescription>
        </SheetHeader>
        {/*
          底の余白は、下バーと同じ考え方でセーフエリアぶんを足す。
          足さないと iPhone のホームインジケータと保存ボタンが重なる。
        */}
        <div className="px-4" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
          {/* 開いている間だけ描く。閉じたら必ず消えるので、
              ライブラリが中身を残す作りに変わっても pending が持ち越されない */}
          {open ? <NewGameForm /> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
