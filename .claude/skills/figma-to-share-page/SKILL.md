---
name: figma-to-share-page
description: Figma URL と実装先TSXパスを受け取って `packages/auto/src/pages/share/` 配下にautoパッケージのshare配下静的TSXページ（マイページ系・契約手続き系など）を実装するワークフロー。Figmaの再現、コンポーネント選定、画像登録、CSSスコープ管理、ブラウザ検証、レビューまで一気通貫。**ユーザーがFigmaリンク（figma.com/design/...）と `packages/auto/src/pages/share/` 配下の実装先パスを提示した時、または「share配下のページをFigmaから作って」「マイページのFigmaを実装して」と言った時は必ずこのスキルを使用すること。share配下以外のページ（auto/coverages, auto/guide, fire/, pet/ など）には使わない。**
---

# Figma → Share Page 実装スキル

Figmaデザインから **`packages/auto/src/pages/share/...` 配下にのみ** TSXページを作成する時に使う。**コンポーネントでの再現を最優先**し、CSSは原則書かない。ユーザーが許可した場所のみ`public/css/pages/share/index.css`に最小限追記する。

> 🚫 **対象外**: `packages/auto/src/pages/coverages|guide|merit|...` や fire/pet パッケージのページにはこのSkillを使わない。それらのページには別のワークフローを用意するか、このSkillの内容を流用する場合もユーザー確認を経ること。

## 前提引数（ユーザーから受け取る想定）
- 実装先TSXパス（例: `packages/auto/src/pages/share/mypage/pep04230/pep04230.tsx`）
- Figma PC URL / SP URL（node-id付き）
- 開発サーバーURL（例: `http://localhost:5174/auto_b`）

---

## 7ステップ フロー

### Step 1. 前提確認
- 実装先ファイルの存在・空/既存を `Read` で確認
- 同パッケージの `minista.config.ts` から `DEV_SITE_DIR` / `siteDir` 確認
- dev server が起動しているか chrome-devtools `list_pages` で確認

### Step 2. 情報収集（並列実行）
以下は依存なしなので1回のメッセージ内で並列発行：
- `mcp__figma__get_metadata` で **PC** と **SP** のノード階層取得（軽量・ID列挙のみ）
- `mcp__figma__get_screenshot` で **PC** と **SP** の画像保存（目視用）
- `mcp__figma__get_variable_defs` で主要デザイントークン取得
- 同パッケージの参考ページ（`pages/Temp.tsx` + 構造が似た既存ページ1〜2本）を `Read`
- `packages/<pkg>/src/components/index.ts` と `packages/ui-v3/src/components/` のリストを取得

> ⚠️ **既存本番サイトHTMLは取得しない**。URLが同じでも内容が別物のケースが多く、ROIが低い。リンク先が必要になった時点でユーザーに確認する。

### Step 3. Figmaテキスト抽出（context節約が最重要）
`get_design_context` は**ノード1つで100KB超える**ことがあるため、以下ルールで呼ぶ：

- **原則**: 末端の `Frame 2088xxxxxx` 単位で取得、`excludeScreenshot: true` を指定
- **100KB超えた場合**: `scripts/extract-figma-text.py` で tool-result JSON から可視テキストだけ抽出
- accordion内部のような「閉じた状態で見えない」部分は、個別に取得
- 太字/em対象テキストは Figmaでは別`<span>`になっているので `[ ]` マーキングで控える

> 詳細: [Context Budget管理](references/context-budget.md) — Figma MCP取得時のtoken節約手順

### Step 4. コンポーネント棚卸し
以下を実装前に決定：

- **再現できるコンポーネント**: Temp.tsxとindex.tsを突合して選定
- **再現できないもの**: 後で報告する。先にリスト化
  - UIコンポーネント不在（accordion-box内部の図解レイアウトなど）
  - 画像未登録（`imageData.json`に無い）
  - CSS必須なレイアウト（Figmaの独自padding, 中央揃え等）
- **ImageKey決定**: `packages/<pkg>/imageData.json` を `grep` してマッチする画像を選定。無ければ"画像不足"として報告候補

> 詳細: [Component Catalog](references/component-catalog.md) — 利用可能コンポーネント一覧と採用判断

### Step 5. 実装
- `metadata` ブロック: `withSideNav` / `pageHeader: { title, lead, pageId }` / 必要に応じ `relatedLinks`
- `Section` ネストで `Heading` level自動計算（level1がSideNavTocに登録される）
- import順: `@ui` → `minista` → `~/components` → 相対（`siteDir` のみ）
- **CSSリンク**: ユーザー許可がある場合のみ `<Head><link rel='stylesheet' href={`${siteDir}/css/pages/<scope>/index.css`} /></Head>`
- **`share/mypage` 配下ページの共通CSS**: 全ページ必ず以下を入れる（共通スタイル `share/index.css` の読み込み）
  ```tsx
  <Head>
    <link rel='stylesheet' href={`${siteDir}/css/pages/share/index.css`} />
  </Head>
  ```
- `siteDir` 相対パス段数は階層で変わる → 詳細は [siteDir パス計算](references/sitedir-paths.md) 参照

#### 画像の追加（ユーザーが画像ファイルを渡してきた時）
1. 日本語名・Slot-*.png → **kebab-case英語名**にrename（移動はしない）
2. `bun media:generate-lists` を**プロジェクトルート**で実行
3. `imageData.json` に登録されたこと確認
4. `ImageKey` 型で `/assets/images/<scope>/<name>` 形式で参照

> 詳細: [Image Workflow](references/image-workflow.md) — 画像追加・rename・imageData.json登録手順

#### CSS追記（許可された時のみ）
- 書く場所: `packages/<pkg>/public/css/pages/<scope>/index.css`
- スコープ: **ページ固有スタイルはid selector で閉じる**（`#mypage-login-box .box-fill`）
- 共通スタイル（`.box-fill`, `.my-page-link` 直指定）は他ページにも波及する点をユーザーに確認
- 禁止事項: `em { font-weight: bold }` のような**セマンティクス改変**は要注意（ユーザー合意時のみ）

#### 🚫 汎用コンポーネントへの修正禁止（重要）
- **原則として `packages/ui-v3/src/components/**` / `packages/ui-v3/src/style/components/**` および `packages/<pkg>/src/components/**` の汎用コンポーネント・本体CSSの追加/修正は禁止**
- share配下などのイレギュラー対応は、ページ専用CSS（`public/css/pages/<scope>/index.css`）で対応する
- どうしても汎用コンポーネントに props / オプション / スタイルを追加すべきと判断した場合、**勝手に修正せず必ずユーザーに判断を仰ぐ**
  - 「このページのデザイン要件を満たすには `<Component>` に `xxx` オプション追加が必要そう。デザインシステムに含めるべきか？それともページ専用CSSで暫定対応するか？」と聞く
  - 過去事例: `BasicDivision` に `equalColumns` props を追加 → デザインシステム化候補だったため正規対応に格上げした（先に判断を仰ぐべきだった）

> 詳細: [CSS Scoping](references/css-scoping.md) — ページ専用CSSと共通CSSの切り分け、layer設計

### Step 6. 検証（末端レイヤー単位で数値化する）

**⚠️ 最重要ルール: セクション単位・全体スクショでの目視判定は禁止。末端ノード単位の数値比較まで降りる。**

#### 6-0. 検証の原則（5ルール）

過去にワタシは「全体スクショで見た目が合ってそう」→「一致」と何度も誤判定した。**全体俯瞰は解像度的に数値差を潰すので、必ず以下のルールで粒度を下げる。**

**ルール1: 検証は「視覚差が1ピクセル単位で見える粒度」まで細分化する**
- `mcp__figma__get_screenshot` は **nodeIdで末端レイヤー単位のスクショが取れる**。セクション全体は構造把握だけで使い、差分判定には使わない
- 例：Stepperなら `2418:15706`（カード1全体）、さらに内部の Slot / heading / アイコン も個別に取得

**ルール2: 実装側も「要素単位のスクショ + computedStyle」をペアで出す**
- `getBoundingClientRect` で位置 + `getComputedStyle` で全スタイル取得 → 「数値」で比較する
- スクショだけで判定しない。**computedStyleが無い判定は判定と呼ばない**

**ルール3: `get_design_context` の CSS class文字列を「仕様書」として精読する**
- `text-[length:var(--heading\/level_3,24px)]` → **24px**
- `font-[family-name:var(...W6...)]` → **Bold**
- `text-center` → **中央揃え**
- `bg-[var(--semantic\/fill\/brand-primary-light,#e6edf5)]` → **#e6edf5**
- これを**一行ずつ読む**。「stepper-contentsインスタンス名だから `<StepperContents>` でOK」という機械マッピング禁止

**ルール4: PC版とSP版は別モノとして検証する**
- PC `get_design_context` で済ませず、**SP nodeIdでも同じ精度で `get_design_context` を取る**
- 過去事例: Figma SP Stepperは「タイムライン構造（左縦線 + 番号バッジ付き見出し横並び + 青カード）」でPCと**完全に別設計**だった。metadataのサイズだけ見て「縦並びで再現できてる」と即断→誤判定

**ルール5: 「再現できてる」と言う前に、差分ゼロを数値で証明する**
- 末端要素ごとに `{figma: {...}, impl: {...}, diff: [...]}` のJSONを出す
- **差分が1件でもあれば「一致」とは言わない**。"構造一致" や "だいたい合ってる" は禁止表現
- 差分列挙 → ユーザー判断仰ぐ、が正しいフロー

#### 6-1. 基本チェック（並列実行）
- `cd packages/<pkg> && npx tsc --noEmit` で型チェック
- chrome-devtools / playwright で PC (1440×900) と SP (390×844) にリサイズ→リロード→フルページスクショ（**構造確認用**、判定に使わない）
- `list_console_messages` でエラー確認（`_satellite`など環境由来は無視）

#### 6-2. 末端レイヤー数値表の作成（本命）

以下の流れを**全ての主要コンポーネント（Heading, Stepper, Callouts, BoxFill, BasicDivision等）で実施**:

1. Figma `get_metadata` で末端ノードID列挙
2. 各nodeで `get_design_context`（CSS文字列取得）+ `get_screenshot`（拡大PNG取得、`.playwright-mcp/figma-<node>.png` に保存）
3. 実装側で対応DOMを `document.querySelector` で特定し、`getBoundingClientRect` と `getComputedStyle` を取得
4. `evaluate_script` で要素単体の viewport スクショが撮れる位置までスクロール→ `take_screenshot`
5. 数値表を作成:

```json
{
  "component": "Stepper Card Heading (Step 1)",
  "figma_node": "I2418:15706;10177:9854",
  "figma": {"fontSize": "24px", "fontWeight": "700", "textAlign": "center", "color": "#000"},
  "impl": {"fontSize": "16px", "fontWeight": "400", "textAlign": "start", "color": "rgb(0,0,0)"},
  "diff": ["fontSize: 24→16", "fontWeight: 700→400", "textAlign: center→start"]
}
```

6. 差分が1件でもあれば**優先順位付きで列挙してユーザーに提示**、勝手に「一致」判定しない

#### 6-3. PCとSPは別検証

PC と SP は別の `get_design_context` を取って、**それぞれ独立に数値表を作る**。
- PC: 1440×900 viewport で計測
- SP: 390×844 viewport で計測
- **どちらかだけで合格判定禁止**

#### 6-4. スクショ保存先ルール

> ⚠️ **テストスクショの保存先ルール（重要）**
> - playwright/chrome-devtools の `take_screenshot` で `filename` を相対パスだけ指定すると **プロジェクトルート** に出力されてしまい、git untrackedで残る
> - 必ず `.playwright-mcp/<name>.png` のように **`.playwright-mcp/` 配下** に明示保存する（既に gitignore 済み）
> - もしくは検証完了後 `rm pep04230_*-pc*.png pep04230_*-sp*.png` のように **都度削除**
> - 過去の失敗例: `pep04230_pc.png` `pep04230_1-pc-final.png` 等7ファイルがルートに散乱した

### Step 7. レビュー（並列サブエージェント 3本）
1メッセージで3本同時発行。**必ずRun in background**。

1. **general-purpose** でテキスト一致度
2. **compound-engineering:design:design-implementation-reviewer** でデザイン再現度
3. **compound-engineering:review:kieran-typescript-reviewer** でコード一貫性

レビュー結果を受けて、ユーザーに**優先順付きの対応候補リスト**を提示し、どれを適用するか選ばせる。

#### 🔒 レビュアー共通の絶対ルール（最優先・必ずプロンプト冒頭に明記）

**全てのレビュアーに以下5ルールを強制する**。Step 6 と同じ内容。曖昧な「構造一致」「だいたい合ってる」判定を禁止。

```
【必須ルール】
1. 検証は「視覚差が1ピクセル単位で見える粒度」まで細分化する。セクション全体スクショでの目視判定は禁止
2. Figma側は `get_screenshot` を **末端ノード単位** で個別取得すること（nodeIdで切り出し可能）
3. 実装側は `getBoundingClientRect` + `getComputedStyle` で **全スタイル数値** を取得すること
4. PC版とSP版は **それぞれ独立に** `get_design_context` を取得して検証すること（レスポンシブで一致と即断禁止）
5. 「再現できてる」と言う前に、差分ゼロを数値で証明すること。差分1件でも残れば「一致」と書かない
```

#### テキスト一致レビュアーへの指示テンプレ（精度低下対策）

過去のレビュー精度が低かった原因と対策。プロンプトに以下を明記：

- **上記「レビュアー共通の絶対ルール」をそのまま貼り付けて最優先と宣言**
- **2-pass検証を要求**: ①Figma末端 `visible:true` テキストノードのみ抽出（hidden除外）→ ②実装DOMの `textContent` 抽出 → ③配列diff
- **Section単位で `get_design_context` を分割呼び出し**（長尺ページはtoken切れで末尾省略、要回避）
- **`hidden=true` の旧バリアントを除外**（古い文言が残ってると誤差分発生）
- **画像内テキストは別軸**: `<Image>` 周辺は「画像差分レビュー対象」フラグ付け、テキスト一致から除外宣言
- **表記揺れチェッカー**: 全角半角数字、波ダッシュ、長音、サフィックス（「家族」vs「家族割引」等）を pre-check
- **JSON成果物**: `severity` (high/mid/low) と `category` (suffix_mismatch / spacing / image_text 等) で構造化

```json
{ "page": "...", "summary": {...}, "diffs": [{"severity":"high","location":"...","figma":"","code":"","category":""}], "todo_in_code": [], "skipped_hidden_nodes": [] }
```

#### デザイン再現性レビュアーへの指示テンプレ（精度低下対策）

- **上記「レビュアー共通の絶対ルール」をプロンプト冒頭に貼り付けて最優先と宣言**
- **末端ノード単位のスクショ取得を必須化**: Figma `get_screenshot` は nodeId で末端レイヤー単位に取れる → セクション全体じゃなく Heading/Slot/Icon 1つずつ取得して**同じ縮尺で拡大比較**
- **PC/SP 別々に `get_design_context` を取得**: レスポンシブで同じ構造と仮定せず、SP版のnodeIdで独立にCSS class文字列を精読する。**SPでタイムライン構造/番号バッジ横並び等のPCと別設計がよくある**
- **`get_design_context` のCSS class文字列を1行ずつ精読**: `text-[length:var(--heading\/level_3,24px)]`→24px、`font-[family-name:var(...W6...)]`→Bold、`text-center`→中央揃え、など**数値を全て表に抜き出す**
- **実装側は `getComputedStyle` で全プロパティ取得**: fontSize, fontWeight, textAlign, color, lineHeight, bg, padding, margin, borderRadius, width, height を**要素ごとに測って表にする**
- **token値ペア取得必須**: `get_variable_defs` で取得したFigma token と、実装の `getComputedStyle` を同じ表に並べる（hex正規化、px換算）
- **clamp font-size は3点測定**（375/768/1280 viewport）
- **CSS @layer の cascade origin** をDevTools Computedで確認、報告に含める
- **影響範囲調査**: 修正候補が `packages/ui/` 配下なら `Grep` で他product利用箇所を必ず洗う
- **設計判断パート**を成果物に含める: 「汎用コンポ修正で全product波及」vs「ページ専用CSSで吸収」のoption A/B 提示
- **成果物は末端要素ごとのJSONで、差分1件でも残れば「一致」と書かない**:
  ```json
  { "component": "Stepper Card Heading (Step 1)", "figma_node": "...", "figma": {...}, "impl": {...}, "diff": [...] }
  ```
- 成果物は `## 末端ノード別の数値表` `## 差分一覧（severity順）` `## CSS層・cascade` `## 設計上の懸念` `## 修正提案(影響範囲別)` で構造化

---

## 完了報告フォーマット

実装完了時、以下3カテゴリで **再現できなかったもの** を必ず明示：

```
## 再現できなかった／要報告点
1. **Accordion内の図解** — FigmaのcollapsedなaccordionサイズからXXpx想定だがUIコンポーネント不在
2. **画像不足** — `imageData.json` に対応assetがなく、近い illustration で代替
3. **CSS追加候補** — BoxFill padding を Figma仕様 (48px) に合わせるには共通CSS調整が必要
4. **リンク URL** — 既存導線が不明な箇所は `href='#'` ＋ TODO として残置
```

---

## 過去のやらかし（再発防止メモ）

- `get_design_context` を最上位ノードで呼ぶ → context爆発
- 画像をimageData.jsonに登録せず `<img>` 直書き → ビルド時にAVIF/DPR最適化漏れ
- `em { font-weight: bold }` をグローバルCSSに → HTMLセマンティクス崩壊
- レビュアーに抽出済みテキスト資料だけ渡す → 旧版/新版ノードの取り違えを見逃す
- `siteDir` 相対パスを `../../../minista.config` 固定で書く → ディレクトリ深度に合わず型エラー
- **コンポーネント本体にprops追加したのにCSSをページ専用スコープに置く** → propsは「全auto」だがスタイルは「share配下のみ」で死ぬ。**propsとCSSはセット**。コンポーネント本体に`equalColumns`等のオプション足したら、CSSも `packages/ui-v3/src/style/components/<comp>.css`（基本レシピへの上書きなら同 `overrides/<comp>.css`）の本体に書く（既存の`[data-square-image]`の隣など）
- **全体スクショで「だいたい合ってる」判定 → 末端の数値差を見逃す** → 過去事例: Stepperの見出しが `<Heading unstyled>` で 16px/400/left になってたのに、Figmaは 24px/700/center。全体スクショでは縮尺で潰れて気付けず「再現できてる」と誤判定した。**セクション全体スクショは構造確認のみ、判定は末端ノード単位の数値比較**（Step 6 参照）
- **PC版の `get_design_context` だけ読んでSPを即断** → 過去事例: Figma SP Stepperは「タイムライン構造（左縦線 + 番号バッジ横並び + 青カード）」でPCと完全に別設計だったのに、metadataのサイズだけ見て「縦並びで再現できてる」と誤判定。**SP nodeId でも独立に `get_design_context` を取得して精読**
- **DOM階層の取り違えでcomputedStyleを誤読** → 過去事例: `.stepper-contents-body` を測って「bg: transparent / radius: 0」と報告 → 実際は子の `img` 要素に `bg:#e6edf5 / radius:16px` がかかっていた。**DOM階層を `querySelectorAll('*')` で全要素走査して、背景色やradiusがかかっている実要素を特定してから測る**
- **`get_design_context` の `text-center` を機械的に center と解釈** → 過去事例: Figma SP Stepper heading の class に `text-center` があったので SPもcenter揃えと実装したが、実際は num(20px) + heading の flex 横並び構造で heading側は `whitespace-nowrap` + flex-1 のため、**視覚的には左寄せ**。CSSのtext-centerはテキストボックス内の中央揃えで、**レイアウト次元で左寄せになっているかは別軸**。→ **`get_design_context` の class文字列 + `get_screenshot` の末端ノードスクショ の2つを必ず並べて確認**、片方だけでは誤読する
- **share/index.css に汎用コンポーネントのスタイルを追加する時、既存コンポCSSを読まずに重複ルールを書いた** → 過去事例: SideNavTocの`color`/`font-weight`をshare/index.cssに足したが、元の `side-nav-toc.css` で同じ指定が既にあり、かつ `[data-current="true"]` で色差がついていた → shareの重複ルールがカレント状態の色を**打ち消し**、カレント/非カレントが同色になって退化。**share共通CSS追加前に、対象コンポーネントの本体CSS（`packages/ui-v3/src/style/components/<comp>.css`）を必ず読んで既存ルールを確認する。既存で一致していれば追加不要**
- **ユーザーが「共通CSSから削除」と言っても `packages/ui/src/assets/ui-system/<comp>.css` を直接いじってはいけない** → 過去事例: `.my-page-link` の上部マージンが `.box-fill > * + *` で 24px 付いてて gap:24px と二重になってた。「共通CSSから削除して」とユーザーが言った時、`packages/ui/src/assets/ui-system/box-fill.css` の `> * + *` セレクタに `:not(.my-page-link)` を足して「修正」したら、**「共通CSSってshare/index.cssのことだよ。なんでコンポーネントのCSS修正してんの」とゆるされへん判定**。**「共通CSS」= `packages/<pkg>/public/css/pages/share/index.css`（share配下ページ共通スタイル）。`ui/src/assets/ui-system/` はUIコンポーネント本体（全product全ページ影響）で、ユーザー合意なく触ってはいけない**。share配下のイレギュラー対応は必ず share/index.css で `.box-fill > .my-page-link { margin-block-start: 0 }` のように打ち消しで対応する
- **design-system層のCSSを変更したのに `bun build:share` を忘れる** → 過去事例: `packages/ui/src/assets/ui-system/box-fill.css` を編集したが dev server で反映されなかった。理由は `public/design-system/v1/ui-system.css` が**ビルドコピー済みのバンドル**で、dev モードでもこっちを読み込んでるため。**ui-system配下のCSSを編集したら必ず `bun build:share` を実行**（package.json scripts 名は `build:design-system` ではなく `build:share`）。もっとも、share配下ページの調整ならそもそも `packages/<pkg>/public/css/pages/share/index.css` に書くべきで、ui-system CSSは触らないのが原則
- **`bun build:share` 副作用で編集してないCSSにフォーマッタ差分が出る** → 過去事例: box-fill.css修正（＆revert）のあと `bun build:share` を実行したら、`packages/{auto,fire,pet}/public/design-system/v1/{scoped-ui-core,scoped-ui-system,ui-system}.css` の全9ファイルにSVGアイコン定数追加などの副作用差分が出た。「レビューする側の面倒くさい」とユーザー激怒。**対策**: ①そもそも build:share を打つ必要がないよう share/index.css で済ませる。②やむを得ず build:share を打ったら直後に `git status` で差分ファイルを確認し、**意図して編集したファイル以外の差分は `git checkout --` で全revertする**。フォーマッタは直接修正したファイルにだけ効かせて、その他は元に戻すのが原則

---

## 🧠 気づきの逐次追記ルール（重要）

このSkillを使って作業する中で **役に立つ気づき・ハマり事例・改善アイデア** が出てきたら、**その場でSKILL.mdまたはreferences/の該当ファイルに追記する**。

### 追記タイミング
- ユーザーから指摘・修正依頼を受けた時（「これ違うよ」「こう直して」）
- レビューエージェントから指摘があった時
- 自分で試行錯誤してワークアラウンドを見つけた時
- プロジェクト規約を新たに学んだ時

### 追記先の判断
| 気づきの種類 | 追記先 |
|---|---|
| ワークフローそのものの改善 | `SKILL.md` の該当Step |
| 再発防止したい失敗パターン | `SKILL.md` の「過去のやらかし」セクション |
| コンポーネント採用ノウハウ | `references/component-catalog.md` |
| 画像関連 | `references/image-workflow.md` |
| CSS関連 | `references/css-scoping.md` |
| パス関連 | `references/sitedir-paths.md` |
| Figma MCP関連 | `references/context-budget.md` |
| どこにも当てはまらない | `SKILL.md` 末尾に新セクション追加 |

### 追記の粒度
- **具体例込み** で書く（「こういう場合はこう」）
- 抽象論だけで済ませない
- コード片/コマンド/失敗メッセージはそのまま転記
- 2〜5行でコンパクトに。長文エッセイ化しない

### 追記しない方がいいもの
- 1回限りのバグ修正（コード側で解決済みならOK）
- 個人的な好み
- プロジェクト外の一般論

**このSkillは「使うたびに賢くなる」設計**。気づきを溜めずに蒸発させるのは最大の機会損失。

---

## 呼び出し例

```
ユーザー: このページをFigmaから作って
  TSX: packages/auto/src/pages/share/mypage/pep04230/pep04230.tsx
  Figma PC: https://figma.com/design/<key>?node-id=133-3053
  Figma SP: https://figma.com/design/<key>?node-id=212-3054
  dev: http://localhost:5174/auto_b

→ このSkillを起動し、Step 1〜7を順に実施、最後にユーザーへ完了報告
```
