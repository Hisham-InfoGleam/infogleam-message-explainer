// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

import terms from '../../../../docs/legal/terms.md?raw';
import privacy from '../../../../docs/legal/privacy.md?raw';
import notice from '../../../../NOTICE?raw';
import { parseMarkdown, type Block } from './markdown';

export type LegalPage = 'terms' | 'privacy' | 'credits';

export const LEGAL_PAGES: readonly LegalPage[] = ['terms', 'privacy', 'credits'];

/**
 * The NOTICE file is plain text. Paragraphs are split by blank lines and
 * their lines are joined. The lines of the first paragraph (the name and
 * the copyright line) stay separate.
 */
export function parseNotice(source: string): Block[] {
  const paragraphs = source
    .split(/\r?\n[ \t]*\r?\n/)
    .map((p) => p.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== ''))
    .filter((lines) => lines.length > 0);
  return paragraphs.flatMap((lines, i): Block[] =>
    i === 0 ? lines.map((text) => ({ kind: 'p', text })) : [{ kind: 'p', text: lines.join(' ') }],
  );
}

export const LEGAL: Record<LegalPage, Block[]> = {
  terms: parseMarkdown(terms),
  privacy: parseMarkdown(privacy),
  credits: [{ kind: 'h1', text: 'Credits' }, ...parseNotice(notice)],
};
