# Mermaid Patterns

よく使う図のテンプレ集。コピペして書き換える。

## データフロー（flowchart）

UI からデータ層までの流れ。横方向 (LR) が読みやすい。

````mdx
```mermaid
flowchart LR
    User[ユーザー] --> Search[検索フォーム]
    Search --> Filter[useFilteredBuildings]
    Filter --> Query[useBuildings + TanStack Query]
    Query --> API[/api/v1/buildings]
    Filter --> List[SearchResultList]
    Filter --> Map[MapView]
```
````

## API シーケンス（sequenceDiagram）

複数 actor をまたぐ非同期処理。

````mdx
```mermaid
sequenceDiagram
    participant U as User
    participant C as Component
    participant H as Hook
    participant Q as TanStack Query
    participant A as API

    U->>C: イベント
    C->>H: hook を呼ぶ
    H->>Q: useQuery
    Q->>A: HTTP GET（dedupe）
    A-->>Q: JSON
    Q-->>H: data
    H-->>C: filtered
    C-->>U: 描画
```
````

## ドメインモデル（classDiagram）

型 / インターフェースの関係。

````mdx
```mermaid
classDiagram
    class Building {
        +string id
        +string name
        +Coordinates coordinates
        +Financial[] financials
    }
    class Financial {
        +number rent
        +number occupancyRate
    }
    Building "1" --> "many" Financial
```
````

## 状態遷移（stateDiagram-v2）

UI の状態遷移を可視化。

````mdx
```mermaid
stateDiagram-v2
    [*] --> idle
    idle --> loading: fetch 開始
    loading --> success: 200
    loading --> error: 4xx/5xx
    success --> idle: 条件変更
    error --> loading: retry
```
````

## アーキテクチャ（subgraph）

レイヤ分割を表現。

````mdx
```mermaid
flowchart TB
    subgraph UI[UI Layer]
        Page[page.tsx]
        List[SearchResultList]
        Map[MapView]
    end
    subgraph Hooks[Hooks]
        UseFiltered[useFilteredBuildings]
        UseBuildings[useBuildings]
    end
    subgraph Data[Data]
        QC[QueryClient]
        API[/api/v1/buildings]
    end
    Page --> List
    Page --> Map
    List --> UseFiltered
    Map --> UseFiltered
    UseFiltered --> UseBuildings
    UseBuildings --> QC
    QC --> API
```
````

## ER（erDiagram）

DB / JSON スキーマの関係。

````mdx
```mermaid
erDiagram
    BUILDING ||--o{ FINANCIAL : has
    BUILDING ||--o{ CAP_RATE_HISTORY : has
    BUILDING ||--o| TRANSFER : "may have"
    BUILDING {
        string id PK
        string name
        json coordinates
    }
    FINANCIAL {
        number rent
        number occupancyRate
    }
```
````

## 注意

- `flowchart` ノードラベルに半角カッコを含めると parse 失敗する → 全角 `（）` or `\(` でエスケープ
- 日本語ラベルは `["..."]` で囲むと安全
- 長文ラベルは改行 `<br/>` を使う
