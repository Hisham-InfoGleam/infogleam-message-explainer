// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// The main controls work with the keyboard: Tab, Enter and Escape.

import { expect, test, type Page } from '@playwright/test';
import { boxText, en, messageWithVersion, sampleText } from './helpers';

/** Press Tab until the focus is on an element that matches the test, at most `max` times. */
async function tabTo(page: Page, matches: string, max = 40): Promise<boolean> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate((sel) => document.activeElement?.matches(sel) ?? false, matches)) return true;
  }
  return false;
}

/** True when the element with the focus shows the focus outline. */
async function showsFocus(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const el = document.activeElement;
    return !!el && el.matches(':focus-visible') && getComputedStyle(el).outlineStyle !== 'none';
  });
}

test('Tab reaches the header links in order, with a visible focus, in English and Arabic', async ({ page }) => {
  await page.goto('./');
  // The symbol (website), the name (start of the tool), the website link, the language button.
  const order = ['a.brand-logo', 'h1 a', 'a.site-link', 'button.lang-btn'];
  const focused = (sel: string) => page.evaluate((s) => document.activeElement?.matches(s) ?? false, sel);
  for (const sel of order) {
    await page.keyboard.press('Tab');
    expect(await focused(sel), sel).toBe(true);
    expect(await showsFocus(page), sel).toBe(true);
  }
  // Arabic: Enter on the language button, then back through the same links.
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  for (const sel of [...order].reverse().slice(1)) {
    await page.keyboard.press('Shift+Tab');
    expect(await focused(sel), sel).toBe(true);
    expect(await showsFocus(page), sel).toBe(true);
  }
});

test('a sample can be chosen with the keyboard', async ({ page }) => {
  await page.goto('./');
  expect(await tabTo(page, '#sample-pick')).toBe(true);
  expect(await showsFocus(page)).toBe(true);
  // The arrow key picks the first sample; it loads and is explained at once.
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#sample-pick')).toHaveValue('v22-adt-a01');
  await expect(page.locator('#message')).toHaveValue(boxText(sampleText('v22-adt-a01')));
  await expect(page.locator('.mv-row').first()).toBeVisible();
});

test('the question before replacing own text works with the keyboard', async ({ page }) => {
  await page.goto('./');
  const own = messageWithVersion('2.5');
  await page.locator('#message').fill(own);
  await page.locator('#sample-pick').focus();
  await page.keyboard.press('ArrowDown');
  // The question gets the focus on "Cancel"; Enter keeps the text.
  const cancel = page.locator('.sample-confirm').getByRole('button', { name: en.sampleReplaceNo, exact: true });
  await expect(cancel).toBeFocused();
  expect(await showsFocus(page)).toBe(true);
  await page.keyboard.press('Enter');
  await expect(page.locator('.sample-confirm')).toHaveCount(0);
  await expect(page.locator('#message')).toHaveValue(boxText(own));
  await expect(page.locator('#sample-pick')).toBeFocused();
  await expect(page.locator('#sample-pick')).toHaveValue('');
  // Again, then Shift+Tab to "Replace" and Enter.
  await page.keyboard.press('ArrowDown');
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.sample-confirm').getByRole('button', { name: en.sampleReplaceYes, exact: true })).toBeFocused();
  expect(await showsFocus(page)).toBe(true);
  await page.keyboard.press('Enter');
  await expect(page.locator('#message')).toHaveValue(boxText(sampleText('v22-adt-a01')));
  await expect(page.locator('#sample-pick')).toBeFocused();
});

test('Ctrl+Enter in the text box explains', async ({ page }) => {
  await page.goto('./');
  expect(await tabTo(page, '#message')).toBe(true);
  await page.locator('#message').fill(sampleText('adt-a01'));
  await page.keyboard.press('Control+Enter');
  await expect(page.locator('.mv-row')).toHaveCount(5);
});

test('Tab reaches the message view; arrows move; Enter opens; Escape closes and gives focus back', async ({ page }) => {
  await page.goto('./');
  await page.locator('#message').fill(sampleText('adt-a01'));
  await page.getByRole('button', { name: en.explain, exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.mv-row')).toHaveCount(5);

  // From "Explain as version", Tab goes on to the message view.
  await page.locator('#explain-as').focus();
  expect(await tabTo(page, '.mv [role="gridcell"]', 5)).toBe(true);
  // Only one cell is in the Tab order.
  await expect(page.locator('.mv [role="gridcell"][tabindex="0"]')).toHaveCount(1);

  const key = () => page.evaluate(() => (document.activeElement as HTMLElement).dataset.k);
  expect(await key()).toBe('0:1');
  await page.keyboard.press('ArrowDown');
  expect(await key()).toBe('1:1');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  const last = await key();
  expect(last?.startsWith('2:')).toBe(true);
  await page.keyboard.press('Home');
  expect(await key()).toBe('2:1');
  await page.keyboard.press('ArrowRight');
  const cell = await key();

  await page.keyboard.press('Enter');
  const panel = page.locator('aside.explain');
  await expect(panel).toHaveClass(/open/);
  await expect(panel.locator('#xp-title')).toContainText(`PID-${cell!.split(':')[1]}`);

  await page.keyboard.press('Escape');
  await expect(panel).not.toHaveClass(/open/);
  expect(await key()).toBe(cell);
});

test('Enter on a field name opens the panel; the close button works with Enter', async ({ page }) => {
  await page.goto('./');
  await page.locator('#message').fill(sampleText('adt-a01'));
  await page.getByRole('button', { name: en.explain, exact: true }).click();
  const name = page.locator('table.fields button.field-name', { hasText: 'Patient Name' });
  await name.focus();
  await page.keyboard.press('Enter');
  const panel = page.locator('aside.explain');
  await expect(panel.locator('#xp-title')).toContainText('PID-5');
  await panel.getByRole('button', { name: en.closePanel }).focus();
  await page.keyboard.press('Enter');
  await expect(panel).not.toHaveClass(/open/);
});

test('Escape in the search box clears it', async ({ page }) => {
  await page.goto('./');
  await page.locator('#message').fill(sampleText('adt-a01'));
  await page.getByRole('button', { name: en.explain, exact: true }).click();
  const search = page.locator('#field-search');
  await search.fill('PID-3');
  await expect(page.locator('#search-count')).not.toHaveText('');
  await search.press('Escape');
  await expect(search).toHaveValue('');
});

test('the parts toggle opens and closes with Enter', async ({ page }) => {
  await page.goto('./');
  await page.locator('#message').fill(sampleText('adt-a01'));
  await page.getByRole('button', { name: en.explain, exact: true }).click();
  const toggle = page.locator('section#seg-2 button.parts-toggle').first();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});
