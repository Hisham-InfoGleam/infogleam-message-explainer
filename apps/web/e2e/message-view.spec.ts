// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// The message view (lib/messageView.ts) in a real browser. Each row must
// show exactly the text of its segment, and each part must have the right
// data-k key. These are the promises at the top of messageView.ts.

import { parseMessage, type ParsedMessage } from '@infogleam/message-explainer-core';
import { expect, test, type Page } from '@playwright/test';
import { randomMessage } from '../../../packages/core/test/random-message';
import { en, explain, loadSample, sampleText } from './helpers';

interface ViewData {
  rows: string[];
  cells: { key: string; text: string; label: string }[][];
  parts: { key: string; text: string }[];
  hiddenDelimiters: number;
}

async function readView(page: Page): Promise<ViewData> {
  return page.locator('.mv').evaluate((mv) => {
    const rows = Array.from(mv.querySelectorAll<HTMLElement>(':scope > [role="row"]'));
    return {
      rows: rows.map((r) => r.textContent ?? ''),
      cells: rows.map((r) =>
        Array.from(r.querySelectorAll<HTMLElement>(':scope > [role="gridcell"]')).map((c) => ({
          key: c.dataset.k ?? '',
          text: c.textContent ?? '',
          label: c.getAttribute('aria-label') ?? '',
        })),
      ),
      parts: Array.from(mv.querySelectorAll<HTMLElement>('.c[data-k]')).map((p) => ({ key: p.dataset.k ?? '', text: p.textContent ?? '' })),
      hiddenDelimiters: mv.querySelectorAll('.d:not([aria-hidden="true"])').length,
    };
  });
}

/** What the view must show for a parsed message. */
function expected(m: ParsedMessage) {
  const parts: { key: string; text: string }[] = [];
  const cells = m.segments.map((seg) =>
    seg.fields
      .filter((f) => f.value !== '')
      .map((f) => {
        const header = ['MSH', 'BHS', 'FHS'].includes(seg.name) && f.position <= 2;
        const split =
          !header &&
          (f.repetitions.length > 1 || (f.repetitions[0]?.components.length ?? 0) > 1 || (f.repetitions[0]?.components[0]?.subComponents.length ?? 0) > 1);
        if (split) {
          for (const rep of f.repetitions) {
            for (const comp of rep.components) {
              const key = `${seg.index}:${f.position}:${rep.index}:${comp.position}`;
              parts.push({ key, text: comp.value });
              if (comp.subComponents.length > 1) {
                comp.subComponents.forEach((s, i) => parts.push({ key: `${key}:${i + 1}`, text: s }));
              }
            }
          }
        }
        return { key: `${seg.index}:${f.position}`, text: f.value };
      }),
  );
  return { rows: m.segments.map((s) => s.raw), cells, parts };
}

async function checkView(page: Page, text: string): Promise<void> {
  // The text box changes CR and CRLF to LF. The segments stay the same.
  const m = parseMessage(text.replace(/\r\n?/g, '\n'));
  const view = await readView(page);
  const want = expected(m);
  expect(view.rows).toEqual(want.rows);
  expect(view.cells.map((r) => r.map((c) => c.key))).toEqual(want.cells.map((r) => r.map((c) => c.key)));
  expect(view.cells.map((r) => r.map((c) => c.text))).toEqual(want.cells.map((r) => r.map((c) => c.text)));
  expect(view.parts).toEqual(want.parts);
  expect(view.hiddenDelimiters).toBe(0);
}

test.describe('message view', () => {
  for (const id of ['adt-a01', 'v27-oru-r01', 'v28-adt-a08', 'v251-oru-r01']) {
    test(`shows sample ${id} exactly`, async ({ page }) => {
      await page.goto('./');
      await loadSample(page, id);
      await checkView(page, sampleText(id));
    });
  }

  test('shows random messages exactly: other delimiters, escapes, Unicode, long fields', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('./');
    for (let seed = 1; seed <= 40; seed++) {
      const text = randomMessage(seed).text;
      // The page needs a message that is not blank.
      await explain(page, text);
      await checkView(page, text);
    }
  });

  test('labels each field cell with its position, name and value', async ({ page }) => {
    await page.goto('./');
    await loadSample(page, 'adt-a01');
    const view = await readView(page);
    const pid5 = view.cells[2]!.find((c) => c.key === '2:5')!;
    expect(pid5.label).toBe(en.cellLabel.replace('{part}', 'PID-5 Patient Name').replace('{value}', 'TEST^PATIENT^ONE'));
  });

  test('marks masked fields', async ({ page }) => {
    await page.goto('./');
    await loadSample(page, 'adt-a01');
    await page.getByRole('button', { name: en.mask, exact: true }).click();
    const masked = await page.locator('.mv .f.masked').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.k));
    expect(masked).toEqual(['2:3', '2:5', '2:7', '2:11', '2:13', '2:14', '2:19', '3:2', '3:4', '3:5']);
  });
});
