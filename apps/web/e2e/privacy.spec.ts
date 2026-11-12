// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// The page must never send data. While the user works with a message, the
// only requests are GET requests for the page's own files.

import { expect, test, type Request } from '@playwright/test';
import { en, loadSample, sampleText } from './helpers';

test('no request leaves the page, while every control is used', async ({ page, context, baseURL }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const requests: Request[] = [];
  page.on('request', (r) => requests.push(r));
  // Also requests from workers or other pages of this context.
  context.on('request', (r) => {
    if (!requests.includes(r)) requests.push(r);
  });

  await page.goto('./');

  // Paste a message and explain it.
  await page.evaluate((t) => navigator.clipboard.writeText(t), sampleText('v23-adt-a01'));
  await page.locator('#message').click();
  await page.keyboard.press('Control+V');
  await expect(page.locator('.mv-row')).toHaveCount(5);
  await page.getByRole('button', { name: en.explain, exact: true }).click();

  // Open a made-up file.
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: en.openFile }).click();
  await (await chooser).setFiles({ name: 'made-up.hl7', mimeType: 'text/plain', buffer: Buffer.from(sampleText('oru-r01')) });
  await expect(page.locator('.mv-row')).toHaveCount(6);

  // Every sample.
  for (const id of Object.keys(en.samples as Record<string, string>)) await loadSample(page, id);

  // Version choice, panel, copy buttons, parts toggles, search.
  await page.locator('#explain-as').selectOption('2.3');
  await page.locator('#explain-as').selectOption('auto');
  await page.locator('.mv [data-k="2:5"]').click();
  await page.locator('aside.explain .xp-copy').click();
  await page.locator('table.fields button.copy-path').first().click();
  for (const toggle of await page.locator('button.parts-toggle').all()) await toggle.click();
  for (const name of await page.locator('table.fields button.field-name').all()) await name.click();
  for (const more of await page.locator('details.more summary').all()) await more.click();
  await page.locator('#field-search').fill('PID-3');
  await page.locator('#field-search').fill('');
  for (const link of await page.locator('nav.segments a').all()) await link.click();
  await page.getByRole('button', { name: en.closePanel }).click();

  // Mask and copy.
  await page.getByRole('button', { name: en.copyMasked, exact: true }).click();
  await page.getByRole('button', { name: en.mask, exact: true }).click();

  // Arabic (this loads the Arabic font) and back.
  await page.locator('.lang-btn').click();
  await page.locator('.mv [data-k="2:5"]').click();
  await page.locator('.lang-btn').click();

  // The legal pages.
  for (const hash of ['#/terms', '#/privacy', '#/credits']) {
    await page.goto('./' + hash);
    await page.getByRole('link', { name: en.back }).click();
  }
  // Wait for late requests, if any.
  await page.waitForTimeout(500);

  const origin = new URL(baseURL!).origin;
  const bad = requests
    .filter((r) => !r.url().startsWith('data:'))
    .filter((r) => r.method() !== 'GET' || new URL(r.url()).origin !== origin)
    .map((r) => `${r.method()} ${r.url()}`);
  expect(bad).toEqual([]);
  // All requests are for the page's own files.
  for (const r of requests.filter((x) => !x.url().startsWith('data:'))) {
    expect(new URL(r.url()).pathname, r.url()).toMatch(/^\/tools\/message-explainer\//);
  }
  expect(requests.length).toBeGreaterThan(0);
});
