import { useLeague } from "@/lib/league-context";

/** 対局ルール（Markdown）は T9 で差し込む。ここでは換算設定だけ出す */
export function RulesPage() {
  const { league } = useLeague();
  const oka = ((league.returnPoint - league.startPoint) * 4) / 1000;
  return (
    <section>
      <h2 className="text-xl font-bold">ルール確認</h2>
      <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-muted-foreground">持ち点</dt>
        <dd>{league.startPoint.toLocaleString()}</dd>
        <dt className="text-muted-foreground">返し点</dt>
        <dd>{league.returnPoint.toLocaleString()}</dd>
        <dt className="text-muted-foreground">ウマ</dt>
        <dd>{league.uma.join(" / ")}</dd>
        <dt className="text-muted-foreground">オカ</dt>
        <dd>{oka}pt</dd>
      </dl>
      <p className="text-muted-foreground mt-6 text-sm">対局ルールの本文は T9 で追加します。</p>
    </section>
  );
}
