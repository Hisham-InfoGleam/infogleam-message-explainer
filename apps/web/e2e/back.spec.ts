// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// What the browser's Back button does after the user leaves the tool in the
// same tab (here with the footer link) and comes back.
//
// Edge shows the tool again with the message only when it kept the page in
// its back/forward cache. Without that cache, Back loads the tool again and
// the message is gone. The cache is not always used: these tests turn it off
// (Playwright does this by default), and a browser can drop a page from it
// (for example after some minutes, or when memory is low). This is why the
// header links to the InfoGleam website open a new tab.

import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { boxText, en, fakeWebsite, sampleText } from './helpers';

interface AfterBack {
  /** The text in the box. */
  box: string;
  /** The rows of the message view: the message is explained. */
  rows: number;
  /** True when the browser showed the page from its back/forward cache. */
  fromCache: boolean;
}

async function leaveAndComeBack(page: Page, context: BrowserContext): Promise<AfterBack> {
  await fakeWebsite(context);
  await page.goto('./');
  await page.evaluate(() => {
    const w = window as unknown as { fromCache: boolean };
    w.fromCache = false;
    addEventListener('pageshow', (e) => {
      if (e.persisted) w.fromCache = true;
    });
  });
  await page.locator('#message').fill(sampleText('adt-a01'));
  await page.getByRole('button', { name: en.explain, exact: true }).click();
  await expect(page.locator('.mv-row')).toHaveCount(5);

  // The footer link opens the website in the same tab.
  await page.locator('footer a[href^="https://infogleam.com"]').click();
  await page.waitForURL('https://infogleam.com/');
  // A page from the cache has no "load" event, so wait only for the commit.
  await page.goBack({ waitUntil: 'commit' });
  await page.waitForURL(/\/tools\/message-explainer\//, { waitUntil: 'commit' });
  await page.locator('#message').waitFor();
  return page.evaluate(() => ({
    box: (document.querySelector('#message') as HTMLTextAreaElement).value,
    rows: document.querySelectorAll('.mv-row').length,
    fromCache: (window as unknown as { fromCache?: boolean }).fromCache === true,
  }));
}

test('without the back/forward cache, Back loads the tool again and the message is gone', async ({ page, context }) => {
  expect(await leaveAndComeBack(page, context)).toEqual({ box: '', rows: 0, fromCache: false });
});

test('with the back/forward cache, Back shows the message again, still explained', async ({ baseURL }) => {
  // The same browser as the other tests, with the cache turned on.
  const { channel, headless } = test.info().project.use;
  const browser = await chromium.launch({ channel, headless, ignoreDefaultArgs: ['--disable-back-forward-cache'] });
  const context = await browser.newContext({ baseURL });
  try {
    const back = await leaveAndComeBack(await context.newPage(), context);
    expect(back).toEqual({ box: boxText(sampleText('adt-a01')), rows: 5, fromCache: true });
  } finally {
    await context.close();
    await browser.close();
  }
});
