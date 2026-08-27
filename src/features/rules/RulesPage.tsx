/**
 * 対局ルール。
 *
 * Markdown ではなく TSX に直書きする（決定#10）。Markdown を画面に出すには
 * 実行時パーサ（react-markdown + remark で +40〜60 kB gz）かビルド時変換が要るが、
 * 変更は PR → 再デプロイなのでどちらでも「非開発者が気軽に編集できる」にはならない。
 * めったに開かない画面のために初期バンドルへ依存を足さない（Recharts を
 * React.lazy で分割したのと同じ判断軸）。
 *
 * ★換算まわり（持ち点・返し点・ウマ・オカ）は本文中であっても DB から差し込む。
 * 文字列としてコピーすると、運営が leagues を UPDATE したときに本文だけ
 * 古い値のまま残る。初期値と一致している間は正しく見えるので気づきにくい。
 */

import { useLeague } from "@/lib/league-context";
import { useNewGameSheet } from "@/lib/new-game-sheet";
import { useAutoRefresh } from "@/lib/use-auto-refresh";

function Table({ title, rows }: { title: string; rows: [string, React.ReactNode][] }) {
  return (
    <>
      <h3 className="mt-6 font-bold">{title}</h3>
      <dl className="mt-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="border-border flex justify-between gap-4 border-b py-2">
            <dt className="text-muted-foreground shrink-0">{label}</dt>
            <dd className="text-right">{value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

export function RulesPage() {
  const { league, reload } = useLeague();
  // 見るだけの画面なので自動更新する（入力中のフォームが無い）。
  // ただし登録シートが開いている間は止める（上に書き込む UI が載るため）
  useAutoRefresh(reload, useNewGameSheet().open);

  const startPoint = league.startPoint.toLocaleString();
  const returnPoint = league.returnPoint.toLocaleString();
  // オカ = (返し点 − 持ち点) × 4 / 1000。カラムには持たず、都度導出する
  const okaPt = ((league.returnPoint - league.startPoint) * league.uma.length) / 1000;
  const umaText = league.uma.map((u) => (u > 0 ? `+${u}` : `${u}`)).join(" / ");

  return (
    <section>
      <h2 className="text-xl font-bold">対局ルール</h2>

      <Table
        title="基本"
        rows={[
          ["荘", "東南戦"],
          ["喰いタン・後付け", "アリアリ"],
          ["持ち点", startPoint],
          ["返し点", returnPoint],
          ["オカ", okaPt === 0 ? "なし" : `${okaPt}pt（トップに加算）`],
          [
            "ウマ（1〜4位）",
            <span key="uma" className="tabular-nums">
              {umaText}
            </span>,
          ],
          ["トビ終了", "なし"],
          ["箱下精算", "あり"],
          ["テンパイ連荘", "なし"],
          [`${returnPoint}点以上のオーラスあがりやめ`, "なし"],
        ]}
      />

      <Table
        title="進行"
        rows={[
          ["ノーテン罰符", "場3,000"],
          ["積み棒", "1本 300"],
          ["鳴き", "ポン優先"],
          ["同時ロン", "頭ハネ"],
          ["加槓・大明槓", "新ドラ先めくり"],
        ]}
      />

      <Table
        title="途中流局・特殊"
        rows={[
          ["流し満貫", "あり"],
          ["九種九牌", "あり（親流れ）"],
          ["四家立直", "あり（続行）"],
          ["四風連打", "あり（親流れ）"],
          ["四槓子流れ", "流れない（4回目のカンはできない）"],
        ]}
      />

      <Table
        title="役・責任払い"
        rows={[
          ["パオ", "あり（大三元・大四喜・四槓子）"],
          ["切り上げ満貫", "あり"],
        ]}
      />

      <Table
        title="反則"
        rows={[
          ["多牌", "満貫払い"],
          ["少牌", "和了放棄"],
        ]}
      />

      <h3 className="mt-6 font-bold">配牌について</h3>
      {/*
        58MB あって Workers の静的アセット（25 MiB/ファイル）に入らないので、
        R2 に置いて `/api/media/haipai.mp4` から配っている（Range 対応）。

        - `autoplay` を付けない。3分47秒・58MB が勝手に流れ始めるのは最悪
        - `preload="metadata"`。`auto` だと開いただけで落とし始める。
          合宿先の電波で全員に 58MB を落とさせない
        - `playsInline` で iOS が全画面に飛ばないようにする
      */}
      <p className="text-muted-foreground mt-1 text-sm">
        約 58MB あります。<strong>Wi-Fi での再生をおすすめします。</strong>
      </p>
      <video
        controls
        playsInline
        preload="metadata"
        className="border-border mt-2 aspect-video w-full max-w-full rounded-lg border"
      >
        <source src="/api/media/haipai.mp4" type="video/mp4" />
      </video>

      <p className="text-muted-foreground mt-6 text-xs">
        持ち点・返し点・ウマ・オカはリーグ設定から表示しています。ほかの項目の変更は運営まで。
      </p>
    </section>
  );
}
