---
name: markuplint-fix
description: markuplintエラーを検出・修正する。TSXファイルのマークアップ品質を改善する時に使用。
---

# Markuplint Fix

TSXファイルに対してmarkuplintを実行し、検出されたエラーを修正する。

## ワークフロー

### Step 1: エラー検出

指定されたファイルまたはパッケージに対してmarkuplintを実行する。

```bash
# 特定ファイル
bunx markuplint --config ./lint-tools/.markuplintrc.yml <file-path>

# パッケージ全体
bunx markuplint --config ./lint-tools/.markuplintrc.yml "packages/<package>/src/**/*.tsx"
```

### Step 2: エラー分析

markuplintの出力を分析し、以下のカテゴリに分類:

1. **属性エラー**: 必須属性の欠落、無効な属性値
2. **要素エラー**: 無効なネスティング、廃止された要素の使用
3. **アクセシビリティエラー**: ARIA属性、ラベル関連
4. **コンテンツモデル違反**: HTML仕様に反するコンテンツ配置

### Step 3: 修正実行

各エラーを分析し、HTML仕様とプロジェクト規約に基づいて修正する。

**修正時の注意点:**
- TSXはReactではなくMinista（静的HTML生成）のテンプレート
- ルート要素の単一className構造を壊さない
- セマンティックHTMLを優先（div soupにしない）
- 修正によって既存のCSS・レイアウトが崩れないか確認

### Step 4: 再検証

修正後、再度markuplintを実行してエラーが解消されたことを確認する。

```bash
bunx markuplint --config ./lint-tools/.markuplintrc.yml <file-path>
```

## 使い方

```
/markuplint-fix                          # 変更されたファイルを自動検出
/markuplint-fix packages/auto/src/...    # 特定ファイル指定
/markuplint-fix pet                      # パッケージ指定
```
