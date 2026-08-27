/**
 * 点数早見表。**静的**。計算しないし、DB も引かない。
 *
 * 卓で開いて読むものなので、**読めること**が第一。11行 x 4列は 390px に
 * 収まらないので、**表だけを横スクロール**させ、符の列は左に固定する。
 * ページ全体は横スクロールさせない（T18 で守っている）。
 *
 * 子と親をタブで切り替える案もあったが、**状態を増やさずスクロールで足りた**
 * ので採らなかった（実測は報告に記載）。
 *
 * 文字は **16px**（T26）。12px は卓で読めないという差し戻しを受けた。
 * 広くなった分は**セルの縦余白**で返す（`py-1.5` → `py-1`）。
 *
 * 横に振ったとき列の途中で止まると、固定した符の列のすぐ右に数字の切れ端が
 * 残って「20 0」のように読めてしまう。**列の頭でスナップ**させて防ぐ
 * （`snap-x snap-mandatory` ＋ 各セルの `snap-start`、`scroll-pl-12` は
 * 固定した符の列の幅 `w-12` と揃えてある）。
 * ただし**右端まで振り切ったときだけ**は、そこにスナップ点が無いので
 * 切れ端が残る。これは直せていない。
 */

import {
  BIG_HANDS,
  CHILD_ROWS,
  HAN_LABELS,
  NOTEN,
  PARENT_ROWS,
  type ScoreRow,
} from "./scores-table";

function ScoreTable({ title, note, rows }: { title: string; note: string; rows: ScoreRow[] }) {
  return (
    <>
      <h3 className="mt-6 font-bold">{title}</h3>
      <p className="text-muted-foreground mt-1 text-xs">{note}</p>
      {/* 横スクロールはこの中だけ。ページ全体を横に動かさない */}
      <div className="border-border mt-2 snap-x snap-mandatory scroll-pl-12 overflow-x-auto rounded-lg border">
        <table className="w-max border-collapse text-base tabular-nums">
          <thead>
            <tr className="border-border border-b">
              {/* 横に振ってもどの符か分かるように左端を固定する */}
              <th className="bg-background sticky left-0 z-10 w-12 border-r border-border px-2 py-1 text-left font-medium">
                符
              </th>
              {HAN_LABELS.map((h) => (
                <th key={h} className="snap-start px-2 py-1 text-left font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.fu} className="border-border border-b last:border-b-0">
                <th className="bg-background border-border sticky left-0 z-10 w-12 border-r px-2 py-1 text-left font-medium">
                  {row.fu}
                </th>
                {row.cells.map((cell, i) => (
                  <td key={HAN_LABELS[i]} className="snap-start px-2 py-1 whitespace-nowrap">
                    {cell.ron === null && cell.tsumo === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <>
                        <span className={cell.mangan === true ? "font-medium" : undefined}>
                          {cell.ron ?? "—"}
                          {cell.mangan === true ? " 満" : ""}
                        </span>
                        {cell.tsumo === null ? null : (
                          <span className="text-muted-foreground block">{cell.tsumo}</span>
                        )}
                      </>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function ScoresPage() {
  return (
    <section>
      <h2 className="text-xl font-bold">点数表</h2>
      <p className="text-muted-foreground mt-2 text-sm">
        上段がロン、下段がツモ。<strong>満</strong> は満貫（ツモは下の「満貫以上」を見てください）。
      </p>
      <p className="text-muted-foreground mt-2 text-sm">
        このリーグは<strong>切り上げ満貫あり</strong>なので、
        <strong>30符4翻と60符3翻が満貫</strong>になります。ふつうの表と違うのはそこです。
      </p>

      <ScoreTable title="子" note="ツモは「子から-親から」" rows={CHILD_ROWS} />
      <ScoreTable title="親" note="ツモは各家から" rows={PARENT_ROWS} />

      {/* 空欄の理由を書く。書かないと「載っていない＝調べ直す」になる */}
      <p className="text-muted-foreground mt-3 text-xs">
        <strong>「—」について。</strong>20符のロンはありません（20符はツモのみ。ロンの平和は30符）。
        20符・25符の1翻もありません（25符は七対子で最低2翻）。
      </p>

      <h3 className="mt-6 font-bold">満貫以上</h3>
      <p className="text-muted-foreground mt-1 text-xs">
        符と翻に依りません。子のツモは「子から-親から」、親のツモは各家から。
      </p>
      {/*
        ここは横に振らせない。役名が「三倍満（11-12翻）」と長く、16px にすると
        固定列だけで 212px（320px 幅の残りは 74px）になって、振っても読めない。
        1役1ブロックの縦積みなら、子と親を並べたまま 320px に収まる（実測）。
      */}
      <ul className="mt-2 space-y-2">
        {BIG_HANDS.map((h) => (
          <li key={h.name} className="border-border rounded-lg border p-3">
            <p className="font-medium">{h.name}</p>
            <table className="mt-1 w-full text-base tabular-nums">
              <thead>
                <tr className="text-muted-foreground text-xs">
                  <th className="w-10 text-left font-normal"></th>
                  <th className="text-left font-normal">子</th>
                  <th className="text-left font-normal">親</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th className="text-muted-foreground text-left text-xs font-normal">ロン</th>
                  <td className="whitespace-nowrap">{h.childRon}</td>
                  <td className="whitespace-nowrap">{h.parentRon}</td>
                </tr>
                <tr>
                  <th className="text-muted-foreground text-left text-xs font-normal">ツモ</th>
                  <td className="whitespace-nowrap">{h.childTsumo}</td>
                  <td className="whitespace-nowrap">{h.parentTsumo}</td>
                </tr>
              </tbody>
            </table>
          </li>
        ))}
      </ul>

      <h3 className="mt-6 font-bold">積み棒</h3>
      <p className="text-muted-foreground mt-1 text-sm">
        1本 <strong>300点</strong>。ロンは放銃者が <strong>+300 × 本数</strong>、 ツモは
        <strong>各家 +100 × 本数</strong>。
      </p>

      <h3 className="mt-6 font-bold">ノーテン罰符</h3>
      <p className="text-muted-foreground mt-1 text-sm">
        場 <strong>3,000</strong>。
      </p>
      <ul className="mt-2 space-y-1 text-sm">
        {NOTEN.map((n) => (
          <li key={n.tenpai} className="border-border flex flex-wrap gap-x-2 border-b py-1.5">
            <span className="font-medium">テンパイ {n.tenpai}</span>
            <span className="text-muted-foreground">{n.detail}</span>
            <span className="ml-auto tabular-nums">{n.result}</span>
          </li>
        ))}
      </ul>

      <p className="text-muted-foreground mt-6 text-xs">
        点数は固定の一覧です。この画面は計算をしません。ウマ・オカを含む pt
        への換算は戦績の方で行っています。
      </p>
    </section>
  );
}
