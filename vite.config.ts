import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, lazyPlugins } from "vite-plus";

// https://vite.dev/config/
export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  // Guidebook（Astro）と docs は別管理なので Vite+ の整形・lint 対象から外す
  fmt: {
    ignorePatterns: ["dist/**", ".wrangler/**", "Guidebook/**", "docs/**", ".claude/**"],
  },
  lint: {
    ignorePatterns: ["dist/**", ".wrangler/**", "Guidebook/**", "docs/**", ".claude/**"],
    plugins: ["react", "typescript", "oxc"],
    rules: {
      "react/rules-of-hooks": "error",
      "react/only-export-components": ["warn", { allowConstantExport: true }],
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    options: {
      typeAware: true,
      typeCheck: true,
    },
    overrides: [
      {
        // shadcn/ui が生成したファイル。buttonVariants の export は意図的なので、
        // Fast Refresh 用の規則をここだけ外す（次に shadcn add しても消えないよう設定側に置く）
        files: ["src/components/ui/**"],
        rules: { "react/only-export-components": "off" },
      },
    ],
    jsPlugins: [
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin",
      },
    ],
  },
  test: {
    // 既定の include は Guidebook まで走査してしまうので、アプリのソースに限定する
    include: ["src/**/*.{test,spec}.{ts,tsx}", "server/**/*.{test,spec}.ts"],
  },
  resolve: {
    // shadcn/ui が前提にするエイリアス。tsconfig.app.json の paths と揃える
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  plugins: lazyPlugins(() => [react(), tailwindcss()]),
  server: {
    // wrangler dev（:8787）へ /api/* を委譲。`vp dev` と `wrangler dev` の併用時に使う
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
