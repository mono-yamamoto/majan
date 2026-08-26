import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import mermaid from 'astro-mermaid';
import remarkGfm from 'remark-gfm';
import remarkMermaid from './src/plugins/remark-mermaid.mjs';

export default defineConfig({
  markdown: {
    // MDX (@astrojs/mdx 5) はこの配列を読む。GFM(テーブル等) と mermaid 変換をここに載せる
    remarkPlugins: [remarkGfm, remarkMermaid],
  },
  integrations: [
    mermaid({
      theme: 'forest',
      autoTheme: true,
    }),
    starlight({
      title: '麻雀リーグ戦アプリ Guidebook',
      description: '麻雀リーグ戦アプリの要件・設計ガイド',
      defaultLocale: 'ja',
      locales: {
        root: { label: '日本語', lang: 'ja' },
      },
      customCss: ['./src/styles/custom.css'],
      pagefind: true,
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
      head: [
        { tag: 'link', attrs: { rel: 'stylesheet', href: '/guidebook-comments.css' } },
        { tag: 'script', attrs: { src: '/guidebook-comments.js', defer: true } },
        { tag: 'link', attrs: { rel: 'stylesheet', href: '/guidebook-zoom.css' } },
        { tag: 'script', attrs: { src: '/guidebook-zoom.js', defer: true } },
      ],
      sidebar: [
        { label: 'はじめに', link: '/' },
        {
          label: '仕様',
          items: [
            { label: '概要と決めたこと', link: '/spec/overview/' },
            { label: '機能と画面', link: '/spec/features/' },
            { label: 'ポイント計算', link: '/spec/scoring/' },
            { label: 'データモデル', link: '/spec/data-model/' },
            { label: '技術スタック', link: '/spec/tech-stack/' },
            { label: '使い方（運用）', link: '/spec/usage/' },
            { label: '対局ルール', link: '/spec/rules/' },
          ],
        },
        {
          label: 'コンポーネント例',
          collapsed: true,
          items: [{ autogenerate: { directory: 'examples' } }],
        },
      ],
    }),
  ],
  server: {
    port: 4321,
  },
});
