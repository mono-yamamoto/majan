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
      title: 'Guidebook',
      description: '実装ガイドブック',
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
          label: 'コンポーネント例',
          items: [{ autogenerate: { directory: 'examples' } }],
        },
      ],
    }),
  ],
  server: {
    port: 4321,
  },
});
