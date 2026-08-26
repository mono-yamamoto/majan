# `siteDir` 相対パス早見表

`minista.config.ts` からの import 相対パス段数は、実装ファイルの階層に依存する。

## minista.config の位置
`packages/<pkg>/minista.config.ts`

## 実装ファイルと段数の対応

| 実装ファイルの階層 | 相対パス |
|---|---|
| `src/pages/index.tsx` | `../../minista.config` |
| `src/pages/xxx/yyy.tsx` | `../../../minista.config` |
| `src/pages/a/b/yyy.tsx` | `../../../../minista.config` |
| `src/pages/a/b/c/yyy.tsx` | `../../../../../minista.config` |
| `src/pages/share/mypage/pep04230/pep04230.tsx` | `../../../../../minista.config` |

## 数え方
`packages/auto/src/pages/share/mypage/pep04230/pep04230.tsx` から `packages/auto/minista.config.ts`：
```
pep04230/pep04230.tsx
  ↑ pep04230/
    ↑ mypage/
      ↑ share/
        ↑ pages/
          ↑ src/
            ↑ auto/ ← minista.config.ts と同階層
```
src→auto は `..` 1つなので、pep04230.tsx から auto/ まで遡るのに `../../../../../` (5つ)。

## ミスった時の症状
```
error TS2307: Cannot find module '../../../../minista.config' or its corresponding type declarations.
```
→ 段数を1つ増やして再試行。

## import 例
```tsx
import { siteDir } from '../../../../../minista.config';
// ...
<Head>
  <link rel='stylesheet' href={`${siteDir}/css/pages/share/index.css`} />
</Head>
```

## 本番 / 開発 の違い
```ts
// minista.config.ts
export const DEV_SITE_DIR = "auto_b";
export const siteDir = import.meta.env?.PROD ? `/${DEV_SITE_DIR}` : '';
```
- 開発: `siteDir = ''` → URL は `http://localhost:5174/css/...`
- 本番: `siteDir = '/auto_b'` → URL は `.../auto_b/css/...`
