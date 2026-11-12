// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// A big made-up message must load in a reasonable time.

import { expect, test } from '@playwright/test';
import { en, watchErrors } from './helpers';

// The longest time to explain the big message, in milliseconds. A slow
// machine can set E2E_BIG_MESSAGE_MS.
const LIMIT = Number(process.env.E2E_BIG_MESSAGE_MS ?? 15_000);
const SEGMENTS = 3000;

function bigMessage(): string {
  const lines = [
    'MSH|^~\\&|DEMO_LAB|DEMO HOSPITAL|DEMO_APP|DEMO HOSPITAL|20261108101500||ORU^R01^ORU_R01|MSG99001|P|2.5.1',
    'PID|1||TEST0001^^^DEMOHOSP&DEMO HOSPITAL&L^MR||TEST^PATIENT^ONE||19800101|F',
    'OBR|1|ORD9001|FIL9001|PANEL^Made-up panel^L|||20261108080000',
  ];
  for (let i = 1; lines.length < SEGMENTS; i++) {
    lines.push(`OBX|${i}|NM|T${i}^Test ${i}^L||${i % 97}.5|mg/dL|1-99|N|||F|||20261108095500`);
  }
  return lines.join('\r') + '\r';
}

test(`a message with ${SEGMENTS} segments loads in time and stays usable`, async ({ page }) => {
  test.setTimeout(LIMIT * 4 + 30_000);
  const errors = watchErrors(page);
  await page.goto('./');
  const text = bigMessage();
  await page.locator('#message').fill(text);

  const start = Date.now();
  await page.getByRole('button', { name: en.explain, exact: true }).click();
  await expect(page.locator('.mv-row')).toHaveCount(SEGMENTS, { timeout: LIMIT });
  const took = Date.now() - start;
  test.info().annotations.push({ type: 'explain time', description: `${took} ms` });
  console.log(`Big message (${SEGMENTS} segments) explained in ${took} ms.`);
  expect(took).toBeLessThan(LIMIT);

  // The last segment opens in the panel with the right Mirth path.
  const last = page.locator(`.mv [data-k="${SEGMENTS - 1}:5"]`);
  await last.scrollIntoViewIfNeeded();
  await last.click();
  await expect(page.locator('aside.explain #xp-title')).toContainText('OBX-5');
  await expect(page.locator('aside.explain .xp-path')).toHaveText(`msg['OBX'][${SEGMENTS - 4}]['OBX.5']`);

  // Search still works.
  await page.locator('#field-search').fill('OBX-5');
  await expect(page.locator('#search-count')).toHaveText(en.matchesMany.replace('{count}', String(SEGMENTS - 3)));
  expect(errors).toEqual([]);
});
