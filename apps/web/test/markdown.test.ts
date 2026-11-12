// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// The legal pages are read by a very small Markdown reader. Its result is
// plain text, and the page shows it as text. So HTML and links in the
// source must come out as the same plain text, never as markup or a link.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LEGAL, LEGAL_PAGES, parseNotice } from '../src/lib/legal';
import { parseMarkdown, type Block } from '../src/lib/markdown';

const ATTACKS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<a href="javascript:alert(1)">x</a>',
  '[x](javascript:alert(1))',
  '[x](JAVASCRIPT:alert(1))',
  '[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
  '[x](vbscript:msgbox(1))',
  '![x](javascript:alert(1))',
  '<javascript:alert(1)>',
  '<svg onload=alert(1)>',
  '<iframe src="https://example.com"></iframe>',
  '&lt;script&gt;',
  '**<b>bold</b>**',
  '`<script>`',
];

/** Every text in the blocks. */
function texts(blocks: Block[]): string[] {
  return blocks.flatMap((b) => ('text' in b ? [b.text] : b.items));
}

function checkShape(blocks: Block[]): void {
  for (const b of blocks) {
    expect(['h1', 'h2', 'p', 'ul', 'ol']).toContain(b.kind);
    // Only text: a block has no href, no html and nothing else.
    expect(Object.keys(b).sort()).toEqual('text' in b ? ['kind', 'text'] : ['items', 'kind']);
    for (const t of texts([b])) expect(typeof t).toBe('string');
  }
}

describe('parseMarkdown', () => {
  it('reads headings, lists and paragraphs', () => {
    const blocks = parseMarkdown('# Title\n\n## Part\n\nOne line\nsame paragraph.\n\n- a\n- **b**\n  more of b\n\n1. first\n2. `second`\n');
    expect(blocks).toEqual([
      { kind: 'h1', text: 'Title' },
      { kind: 'h2', text: 'Part' },
      { kind: 'p', text: 'One line same paragraph.' },
      { kind: 'ul', items: ['a', 'b more of b'] },
      { kind: 'ol', items: ['first', 'second'] },
    ]);
  });

  it('reads Windows line endings', () => {
    expect(parseMarkdown('# A\r\n\r\ntext\r\n')).toEqual([
      { kind: 'h1', text: 'A' },
      { kind: 'p', text: 'text' },
    ]);
  });

  for (const attack of ATTACKS) {
    it(`keeps ${JSON.stringify(attack)} as plain text`, () => {
      for (const source of [attack, `# ${attack}`, `- ${attack}`, `1. ${attack}`, `text ${attack} text`]) {
        const blocks = parseMarkdown(source);
        checkShape(blocks);
        const all = texts(blocks).join('\n');
        // The dangerous part is still there as text (the page escapes it),
        // and no link was made from it.
        if (attack.includes('javascript:')) expect(all.toLowerCase()).toContain('javascript:');
        if (attack.includes('<script>') && !attack.startsWith('`')) expect(all).toContain('<script>');
      }
    });
  }

  it('gives only text for odd input', () => {
    for (const source of ['', '\n\n', '#', '##', '-', '1.', '  indented', '- \n  ', '#no space', '**', '`', '\u0000']) {
      checkShape(parseMarkdown(source));
    }
  });
});

describe('legal pages', () => {
  it('has the three pages, each with text and a heading first', () => {
    expect(LEGAL_PAGES).toEqual(['terms', 'privacy', 'credits']);
    for (const page of LEGAL_PAGES) {
      const blocks = LEGAL[page];
      expect(blocks.length, page).toBeGreaterThan(2);
      expect(blocks[0]?.kind, page).toBe('h1');
      checkShape(blocks);
    }
  });

  it('keeps the first lines of NOTICE apart and joins the lines of other paragraphs', () => {
    expect(parseNotice('Name\nCopyright line\n\nOne\ntwo\n\n\nThree\r\n')).toEqual([
      { kind: 'p', text: 'Name' },
      { kind: 'p', text: 'Copyright line' },
      { kind: 'p', text: 'One two' },
      { kind: 'p', text: 'Three' },
    ]);
    expect(parseNotice('')).toEqual([]);
  });
});

describe('the page shows text, not HTML', () => {
  const srcDir = fileURLToPath(new URL('../src/', import.meta.url));

  function svelteFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? svelteFiles(`${dir}${e.name}/`) : e.name.endsWith('.svelte') ? [`${dir}${e.name}`] : [],
    );
  }

  it('uses {@html} only for the InfoGleam symbol, a file of this project', () => {
    const uses = svelteFiles(srcDir).flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/\{@html\s+([^}]+)\}/g)].map((m) => `${file.slice(srcDir.length)}: ${m[1]!.trim()}`),
    );
    expect(uses).toEqual(['App.svelte: SYMBOL']);
  });

  it('does not set innerHTML or outerHTML in the page code', () => {
    const files = [...svelteFiles(srcDir), ...readdirSync(srcDir + 'lib').map((f) => `${srcDir}lib/${f}`)];
    for (const file of files) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/\b(innerHTML|outerHTML|insertAdjacentHTML)\b|document\.write/);
    }
  });
});
