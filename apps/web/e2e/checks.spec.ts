// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// Message checks in a real browser: the summary line, the list, the marks,
// the version choice, Arabic, a phone, the copied list and the network.
// The field findings use v2.9, so they hold with and without the field
// history. The texts for checks that did not run are tested too.

import { HAS_FIELD_HISTORY, hasFieldFacts } from '@infogleam/message-explainer-core';
import { expect, test, type Request } from '@playwright/test';
import { ar, en, explain, loadSample, scrollsSideways, watchErrors } from './helpers';

/** A made-up v2.9 message with a few findings. Every value holds "QZ", so a test can look for it. */
const MESSAGE = [
  'MSH|^~\\&|QZAPP|QZFAC|QZRCV|QZFAC|20261108093000||ADT^A01|QZ0001|P|2.9',
  'EVN||20261108093000|||||QZHOSP',
  'PID|1||||DOE^JANE^QZ||19800101|F~M',
  'ZQ1|QZ',
].join('\r');

/** "Field checks are available only for HL7 v2.9." */
const FIELDS_ONLY = en.checks.summaryNoneNoFields.split('. ')[1]!.replace('{latest}', '2.9');

const summary = (page: import('@playwright/test').Page) => page.locator('#checks-summary');
const items = (page: import('@playwright/test').Page) => page.locator('.checks-items .chk-item');
/** The list item whose position is the given label, for example "PID-8". */
const itemAt = (page: import('@playwright/test').Page, label: string) =>
  items(page).filter({ has: page.locator('.chk-pos', { hasText: new RegExp('^' + label + '$') }) });

test.describe('message checks', () => {
  test('show the summary and the list, and an item opens the explanation', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await explain(page, MESSAGE);
    await expect(summary(page)).toContainText('Checked against HL7 v2.9');
    await expect(summary(page)).toContainText('differences');
    // Open, because there is a difference.
    await expect(summary(page)).toHaveAttribute('aria-expanded', 'true');
    const f7 = itemAt(page, 'PID-8');
    await expect(f7.locator('.chk-sentence')).toContainText('Repeats 2 times. In HL7 v2.9 this field does not repeat.');

    // "Why?" shows the rule and its source.
    await f7.locator('.chk-why summary').click();
    await expect(f7.locator('.chk-why')).toContainText('HL7 v2.9, chapter 3, PID attribute table');

    // The item opens the explanation of PID-8.
    await f7.locator('.chk-go').click();
    await expect(page.locator('aside.explain #xp-title')).toContainText('PID-8');

    // The summary line folds and unfolds the list.
    await summary(page).click();
    await expect(page.locator('#checks-list')).toBeHidden();
    await summary(page).click();
    await expect(page.locator('#checks-list')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('mark the places in the message view and the field list', async ({ page }) => {
    await page.goto('./');
    await explain(page, MESSAGE);
    // PID-8 repeats in v2.9 (F7): a wavy line, and the sentence in its accessible name.
    const pid8 = page.locator('.mv [data-k="2:8"]');
    await expect(pid8).toHaveClass(/chk-differs/);
    await expect(pid8).toHaveAttribute('aria-label', /Repeats 2 times/);
    // PID-3 is empty (F6): the segment name carries the mark.
    const pidName = page.locator('.mv-row').nth(2).locator('[role="rowheader"]');
    await expect(pidName).toHaveClass(/chk-differs/);
    await expect(pidName).toHaveText('PID');
    // The field list shows a tag with an icon on PID-8.
    const pid = page.locator('section.segment').filter({ has: page.locator('.seg-code', { hasText: 'PID' }) });
    await expect(pid.locator('.chk-tag.chk-differs svg')).toHaveCount(1);
    // The local segment gets a note mark on its name.
    await expect(page.locator('.mv-row').nth(3).locator('[role="rowheader"]')).toHaveClass(/chk-note/);
  });

  test('an empty required field opens its explanation', async ({ page }) => {
    await page.goto('./');
    await explain(page, MESSAGE);
    await itemAt(page, 'PID-3').locator('.chk-go').click();
    const panel = page.locator('aside.explain');
    await expect(panel.locator('#xp-title')).toContainText('PID-3');
    await expect(panel).toContainText(en.emptyValue);
  });

  test('run again when "Explain as version" changes', async ({ page }) => {
    await page.goto('./');
    await explain(page, MESSAGE);
    await expect(itemAt(page, 'PID-8')).toHaveCount(1);
    await expect(page.locator('.mv [data-k="2:8"]')).toHaveClass(/chk-differs/);

    await page.locator('#explain-as').selectOption('2.4');
    await expect(summary(page)).toContainText('Checked against HL7 v2.4');
    if (!hasFieldFacts('2.4')) {
      // No field facts for v2.4: no field findings, and the page says so.
      await expect(summary(page)).toContainText(FIELDS_ONLY);
      await expect(itemAt(page, 'PID-8')).toHaveCount(0);
      await expect(page.locator('.mv [data-k="2:8"]')).not.toHaveClass(/chk-differs/);
    }

    // An older message: no field checks until a version is picked.
    await loadSample(page, 'v22-adt-a01');
    await expect(summary(page)).toHaveText(new RegExp(en.checks.summaryNoVersion.split('{counts}')[0]));
    await expect(summary(page)).toHaveAttribute('aria-expanded', 'false');
    await page.locator('#explain-as').selectOption('2.3');
    await expect(summary(page)).toContainText('Checked against HL7 v2.3');
  });

  test('say when the field checks did not run for the version', async ({ page, context }) => {
    test.skip(hasFieldFacts('2.3'), 'The field history has the facts of v2.3.');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('./');
    await loadSample(page, 'v23-adt-a01');
    await expect(summary(page)).toContainText('Checked against HL7 v2.3');
    await expect(summary(page)).toContainText(FIELDS_ONLY);
    await summary(page).click();
    const hint = en.checks.fieldsSkipped.replace('{latest}', '2.9');
    await expect(page.locator('.checks-hint')).toHaveText(hint);
    // The structure checks still ran: the field of a later version gives the V3 hint.
    await expect(itemAt(page, 'MSH-12')).toHaveCount(1);
    await page.getByRole('button', { name: en.checks.copyList }).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied.split(/\r?\n/)).toContain(hint);
    // In Arabic.
    await page.locator('.lang-btn').click();
    await expect(page.locator('.checks-hint')).toHaveText(ar.checks.fieldsSkipped.replace('{latest}', '2.9'));
  });

  test('the v2.9 sample shows its two mistakes, and no note about v2.9 field facts', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await loadSample(page, 'v29-adt-a04');
    await expect(page.locator('.facts-note')).toHaveCount(0);
    await expect(summary(page)).toHaveText('Checked against HL7 v2.9: 2 differences');
    // Open, because there are differences.
    await expect(summary(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(items(page)).toHaveCount(2);
    // PID-7: not a real date (31 February).
    const d2 = itemAt(page, 'PID-7');
    await expect(d2.locator('.chk-sentence')).toHaveText(en.checks.sentences['D2-calendar'].replace('{type}', 'DTM'));
    await expect(page.locator('.mv [data-k="2:7"]')).toHaveClass(/chk-differs/);
    // PV1-2: required, but empty. The segment name carries the mark.
    const f6 = itemAt(page, 'PV1-2');
    await expect(f6.locator('.chk-sentence')).toHaveText('Required in HL7 v2.9, but it is empty.');
    await expect(page.locator('.mv-row').nth(3).locator('[role="rowheader"]')).toHaveClass(/chk-differs/);
    await f6.locator('.chk-go').click();
    await expect(page.locator('aside.explain #xp-title')).toContainText('PV1-2');
    // In Arabic.
    await page.locator('.lang-btn').click();
    await expect(summary(page)).toHaveText('نتيجة الفحص حسب HL7 v2.9: المخالفات: 2');
    await expect(itemAt(page, 'PV1-2').locator('.chk-sentence')).toHaveText('مطلوب في معيار HL7 v2.9، لكنه فارغ.');
    await expect(page.locator('.facts-note')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('say which fields were not checked for v2.9 without the field history', async ({ page }) => {
    test.skip(HAS_FIELD_HISTORY, 'The field history knows which fields are withdrawn.');
    await page.goto('./');
    await explain(page, MESSAGE);
    await expect(page.locator('.checks-not-status')).toHaveText(en.checks.statusSkipped.replace('{version}', '2.9'));
    await page.locator('.lang-btn').click();
    await expect(page.locator('.checks-not-status')).toHaveText(ar.checks.statusSkipped.replace('{version}', '2.9'));
  });

  test('filter by level', async ({ page }) => {
    await page.goto('./');
    await explain(page, MESSAGE);
    const all = await items(page).count();
    expect(all).toBeGreaterThan(3);
    await page.locator('.checks-filter button', { hasText: en.checks.groups.note }).click();
    await expect(page.locator('.checks-group')).toHaveCount(1);
    await expect(page.locator('.checks-group')).toHaveText(en.checks.groups.note);
    await page.locator('.checks-filter button', { hasText: en.checks.filterAll }).click();
    await expect(items(page)).toHaveCount(all);
  });

  test('work in Arabic, with positions left to right', async ({ page }) => {
    await page.goto('./');
    await explain(page, MESSAGE);
    await page.locator('.lang-btn').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(summary(page)).toContainText('نتيجة الفحص حسب HL7 v2.9');
    const f6 = itemAt(page, 'PID-3');
    await expect(f6.locator('.chk-sentence')).toHaveText('مطلوب في معيار HL7 v2.9، لكنه فارغ.');
    await expect(f6.locator('.chk-pos')).toHaveAttribute('dir', 'ltr');
    await expect(f6.locator('.chk-tag')).toContainText(ar.checks.levels.differs);
    await expect(page.locator('.checks-not')).toHaveText(ar.checks.notChecked);
  });

  test('copy a list with no values from the message', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('./');
    await explain(page, MESSAGE);
    await page.getByRole('button', { name: en.checks.copyList }).click();
    await expect(page.locator('.checks-status')).toHaveText(en.checks.listCopied);
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    // The clipboard may turn line ends into CRLF.
    const lines = copied.split(/\r?\n/);
    expect(lines[0]).toBe('Message checks against HL7 v2.9');
    expect(copied).toContain('Differs from HL7 | Line 3 | PID-8 Administrative Sex | Repeats 2 times.');
    expect(lines.at(-1)).toBe(en.checks.notChecked);
    for (const value of ['QZ', 'DOE', 'JANE', '19800101', '20261108093000']) expect(copied, value).not.toContain(value);
  });
});

test.describe('message checks on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('the list starts folded, has no sideways scroll, and an item opens the sheet', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await explain(page, MESSAGE);
    await expect(summary(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#checks-list')).toBeHidden();
    expect(await scrollsSideways(page)).toBe(false);

    await summary(page).click();
    await expect(page.locator('#checks-list')).toBeVisible();
    expect(await scrollsSideways(page)).toBe(false);
    await page.locator('.chk-why summary').first().click();
    expect(await scrollsSideways(page)).toBe(false);

    const panel = page.locator('aside.explain');
    await expect(panel).toBeHidden();
    await itemAt(page, 'PID-8').locator('.chk-go').click();
    await expect(panel).toHaveClass(/open/);
    await expect(panel).toBeInViewport();
    await expect(panel.locator('#xp-title')).toContainText('PID-8');

    await page.locator('.lang-btn').click();
    expect(await scrollsSideways(page)).toBe(false);
    expect(errors).toEqual([]);
  });
});

test('message checks send no request', async ({ page, context, baseURL }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const requests: Request[] = [];
  context.on('request', (r) => requests.push(r));
  await page.goto('./');
  const before = requests.length;
  await explain(page, MESSAGE);
  await page.locator('#explain-as').selectOption('2.3');
  await page.locator('#explain-as').selectOption('auto');
  for (const why of await page.locator('.chk-why summary').all()) await why.click();
  for (const go of await page.locator('button.chk-go').all()) await go.click();
  await page.getByRole('button', { name: en.checks.copyList }).click();
  await page.locator('.checks-filter button').last().click();
  await summary(page).click();
  await page.waitForTimeout(300);
  const origin = new URL(baseURL!).origin;
  const late = requests.slice(before).filter((r) => !r.url().startsWith('data:'));
  expect(late.filter((r) => r.method() !== 'GET' || new URL(r.url()).origin !== origin).map((r) => r.url())).toEqual([]);
  for (const r of late) expect(new URL(r.url()).pathname, r.url()).toMatch(/^\/tools\/message-explainer\//);
});
