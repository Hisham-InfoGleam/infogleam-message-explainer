// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// A very small Markdown reader for our own legal pages. It only knows
// headings, list items and paragraphs. The result is shown as plain text,
// so no HTML is ever injected into the page.

export type Block =
  | { kind: 'h1' | 'h2' | 'p'; text: string }
  | { kind: 'ul' | 'ol'; items: string[] };

function clean(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1');
}

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];

  const flush = () => {
    if (para.length) blocks.push({ kind: 'p', text: clean(para.join(' ')) });
    para = [];
  };

  for (const line of source.split(/\r?\n/)) {
    const t = line.trim();
    const ul = /^[-*] (.*)$/.exec(t);
    const ol = /^\d+\. (.*)$/.exec(t);

    if (t === '') {
      flush();
    } else if (t.startsWith('## ')) {
      flush();
      blocks.push({ kind: 'h2', text: clean(t.slice(3)) });
    } else if (t.startsWith('# ')) {
      flush();
      blocks.push({ kind: 'h1', text: clean(t.slice(2)) });
    } else if (ul || ol) {
      flush();
      const kind = ul ? 'ul' : 'ol';
      const text = clean((ul ?? ol)![1] ?? '');
      const last = blocks[blocks.length - 1];
      if (last && last.kind === kind) last.items.push(text);
      else blocks.push({ kind, items: [text] });
    } else {
      const last = blocks[blocks.length - 1];
      // Indented line after a list item continues that item.
      if (para.length === 0 && line.startsWith('  ') && last && (last.kind === 'ul' || last.kind === 'ol')) {
        last.items[last.items.length - 1] += ' ' + clean(t);
      } else {
        para.push(t);
      }
    }
  }
  flush();
  return blocks;
}
