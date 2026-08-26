// ```mermaid コードブロックを <pre class="mermaid"> に変換する remark プラグイン。
// Astro 6.4+ / @astrojs/mdx 5 では astro-mermaid が markdown.processor 側に
// プラグインを載せる一方、MDX は旧 markdown.remarkPlugins しか読まないため、
// こちらで明示的に登録する。描画は astro-mermaid が注入するクライアントスクリプトが行う。
import { visit } from 'unist-util-visit';

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export default function remarkMermaid() {
  return (tree) => {
    visit(tree, 'code', (node, index, parent) => {
      if (node.lang !== 'mermaid' || !parent || index == null) return;
      parent.children[index] = {
        type: 'html',
        value: `<pre class="mermaid">${escapeHtml(node.value)}</pre>`,
      };
    });
  };
}
