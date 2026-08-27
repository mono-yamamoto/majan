/**
 * 点数早見表。**静的**。計算しないし、DB も引かない。
 *
 * 卓で開いて読むものなので、**読めること**が第一。11行 x 4列は 390px に
 * 収まらないので、**表だけを横スクロール**させ、符の列は左に固定する。
 * ページ全体は横スクロールさせない（T18 で守っている）。
 *
 * 子と親をタブで切り替える案もあったが、**状態を増やさずスクロールで足りた**
 * ので採らなかった（実測は報告に記載）。
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
      <div className="border-border mt-2 overflow-x-auto rounded-lg border">
        <table className="w-max border-collapse text-xs tabular-nums">
          <thead>
            <tr className="border-border border-b">
              {/* 横に振ってもどの符か分かるように左端を固定する */}
              <th className="bg-background sticky left-0 z-10 border-r border-border px-2 py-1.5 text-left font-medium">
                符
              </th>
              {HAN_LABELS.map((h) => (
                <th key={h} className="px-2 py-1.5 text-left font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.fu} className="border-border border-b last:border-b-0">
                <th className="bg-background border-border sticky left-0 z-10 border-r px-2 py-1.5 text-left font-medium">
                  {row.fu}
                </th>
                {row.cells.map((cell, i) => (
                  <td key={HAN_LABELS[i]} className="px-2 py-1.5 whitespace-nowrap">
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
      <p className="text-muted-foreground mt-1 text-xs">符と翻に依りません。</p>
      <div className="border-border mt-2 overflow-x-auto rounded-lg border">
        <table className="w-max border-collapse text-xs tabular-nums">
          <thead>
            <tr className="border-border border-b">
              <th className="bg-background border-border sticky left-0 z-10 border-r px-2 py-1.5 text-left font-medium"></th>
              <th className="px-2 py-1.5 text-left font-medium">子 ロン</th>
              <th className="px-2 py-1.5 text-left font-medium">子 ツモ（子-親）</th>
              <th className="px-2 py-1.5 text-left font-medium">親 ロン</th>
              <th className="px-2 py-1.5 text-left font-medium">親 ツモ（各家）</th>
            </tr>
          </thead>
          <tbody>
            {BIG_HANDS.map((h) => (
              <tr key={h.name} className="border-border border-b last:border-b-0">
                <th className="bg-background border-border sticky left-0 z-10 border-r px-2 py-1.5 text-left font-medium whitespace-nowrap">
                  {h.name}
                </th>
                <td className="px-2 py-1.5 whitespace-nowrap">{h.childRon}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{h.childTsumo}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{h.parentRon}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{h.parentTsumo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
