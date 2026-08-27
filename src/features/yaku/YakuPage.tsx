/**
 * 役一覧。**静的**。点数表（ScoresPage）と同じ作りで、計算も DB も無い。
 *
 * 翻数ごとに節を分ける。卓では「この役、何翻だっけ」で引くので、
 * 翻から探せる並びにする。
 *
 * **食い下がりを目立たせる**のがこのページで一番大事なところ。
 * 三色は鳴くと1翻、混一色は2翻で、ここが一番間違えられる。
 */

import { YAKU_SECTIONS, YAKUMAN, type Yaku } from "./yaku-table";

/** 鳴いたときの表示。食い下がりだけ色を変えて、下がったことが分かるようにする */
function OpenCell({ yaku }: { yaku: Yaku }) {
  if (yaku.open === "門前") {
    return <span className="text-muted-foreground">門前のみ</span>;
  }
  if (yaku.open === "未定") {
    return <span className="text-muted-foreground">鳴きの扱いは未定</span>;
  }
  if (yaku.kuisagari === true && yaku.han !== null) {
    return (
      <span className="text-destructive font-medium">
        鳴くと {yaku.open}翻（−{yaku.han - yaku.open}）
      </span>
    );
  }
  return <span className="text-muted-foreground">鳴いても同じ</span>;
}

export function YakuPage() {
  return (
    <section>
      <h2 className="text-xl font-bold">役一覧</h2>
      <p className="text-muted-foreground mt-2 text-sm">
        翻数は<strong>門前</strong>のとき。鳴いたときの扱いを右に出しています。
      </p>
      <p className="text-muted-foreground mt-1 text-sm">
        右が<span className="text-destructive font-medium">赤い役</span>
        は食い下がり（鳴くと翻が下がる役）です。
      </p>

      {YAKU_SECTIONS.map((section) => (
        <div key={section.title}>
          <h3 className="mt-6 font-bold">{section.title}</h3>
          <ul className="mt-2">
            {section.items.map((y) => (
              <li key={y.name} className="border-border border-b py-2 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 font-medium">{y.name}</span>
                  <span className="shrink-0 text-xs">
                    <OpenCell yaku={y} />
                  </span>
                </div>
                <div className="text-muted-foreground mt-0.5 flex items-baseline justify-between gap-2 text-xs">
                  <span>{y.reading}</span>
                  <span className="shrink-0">{y.note}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <h3 className="mt-6 font-bold">役満</h3>
      <ul className="mt-2">
        {YAKUMAN.map((y) => (
          <li key={y.name} className="border-border border-b py-2 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 font-medium">{y.name}</span>
              <span className="text-muted-foreground shrink-0 text-xs">{y.open}</span>
            </div>
            <div className="text-muted-foreground mt-0.5 text-xs">{y.reading}</div>
          </li>
        ))}
      </ul>

      {/* 決まっていないものを、決まったように見せない */}
      <p className="border-border mt-4 rounded-lg border p-3 text-sm">
        <strong>ダブル役満は未定です。</strong>
        この一覧は<strong>すべて役満1つ分</strong>として書いています。
      </p>

      <p className="text-muted-foreground mt-3 text-sm">
        <strong>パオあり</strong>（大三元・大四喜・四槓子）。詳しくはルールのページを見てください。
      </p>

      <h3 className="mt-6 font-bold">ドラについて</h3>
      <p className="text-muted-foreground mt-1 text-sm">
        <strong>ドラは役ではありません。</strong>
        ドラだけでは和了れず、翻だけが増えます。裏ドラ・赤ドラ・カンドラも同じです。
      </p>

      <p className="text-muted-foreground mt-6 text-xs">
        翻数と食い下がりは、このリーグのルール（連風牌 2翻・Mリーグ準拠）に合わせています。
      </p>
    </section>
  );
}
