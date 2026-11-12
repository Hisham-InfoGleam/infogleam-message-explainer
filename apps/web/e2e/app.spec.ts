// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// The main features of the built page, in a real browser.

import { HAS_FIELD_HISTORY } from '@infogleam/message-explainer-core';
import { expect, test } from '@playwright/test';
import {
  ar,
  arabicName,
  boxText,
  en,
  explain,
  loadSample,
  messageWithVersion,
  sampleText,
  templatePattern,
  watchErrors,
} from './helpers';

test.describe('page load', () => {
  test('loads with no console errors and has the security policy', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await expect(page.locator('h1')).toContainText(en.appName);
    const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(policy).toContain("connect-src 'none'");
    expect(policy).toContain("default-src 'self'");
    await loadSample(page, 'adt-a01');
    expect(errors).toEqual([]);
  });

  test('the policy blocks network requests from the page', async ({ page }) => {
    await page.goto('./');
    const blocked = await page.evaluate(async () => {
      try {
        await fetch('https://example.com/');
        return false;
      } catch {
        return true;
      }
    });
    expect(blocked).toBe(true);
  });
});

test.describe('samples', () => {
  const ids = Object.keys(en.samples as Record<string, string>);

  for (const id of ids) {
    test(`sample ${id} shows its segments`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('./');
      await loadSample(page, id);
      const names = sampleText(id)
        .split('\r')
        .filter((line) => line !== '')
        .map((line) => line.slice(0, 3));
      await expect(page.locator('.mv-row [role="rowheader"]')).toHaveText(names);
      await expect(page.locator('section.segment h2 .seg-code')).toHaveText(names);
      await expect(page.locator('nav.segments a')).toHaveText(names);
      expect(errors).toEqual([]);
    });
  }

  test('the samples line has a visible label, a placeholder and two groups, under the actions', async ({ page }) => {
    await page.goto('./');
    const pick = page.locator('#sample-pick');
    // The label is visible and tied to the list.
    await expect(page.locator('label[for="sample-pick"]')).toHaveText(en.samplePrompt);
    await expect(page.getByLabel(en.samplePrompt)).toHaveCount(1);
    // The placeholder is shown, so the list never looks like a setting.
    await expect(pick).toHaveValue('');
    await expect(pick.locator('option').first()).toHaveText(en.samplePlaceholder);
    await expect(pick.locator('optgroup')).toHaveCount(2);
    expect(await pick.locator('optgroup').evaluateAll((groups) => groups.map((g) => g.getAttribute('label')))).toEqual([
      en.sampleGroups.admission,
      en.sampleGroups.lab,
    ]);
    const values = (n: number) => pick.locator(`optgroup:nth-of-type(${n}) option`).evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value));
    expect(await values(1)).toEqual(['v22-adt-a01', 'v23-adt-a01', 'adt-a01', 'v28-adt-a08', 'v29-adt-a04']);
    expect(await values(2)).toEqual(['v24-orm-o01', 'oru-r01', 'v251-oru-r01', 'v27-oru-r01']);
    // One place for samples: no sample buttons.
    await expect(page.getByRole('button', { name: /sample/i })).toHaveCount(0);
    // The samples line comes after the action row, apart from Explain.
    const actions = await page.locator('.actions').boundingBox();
    const line = await page.locator('.sample-line').boundingBox();
    expect(line!.y).toBeGreaterThanOrEqual(actions!.y + actions!.height);
  });

  test('choosing a sample loads it and explains it at once', async ({ page }) => {
    await page.goto('./');
    await page.locator('#sample-pick').selectOption('v28-adt-a08');
    await expect(page.locator('#message')).toHaveValue(boxText(sampleText('v28-adt-a08')));
    await expect(page.locator('.mv-row')).toHaveCount(4);
    await expect(page.locator('#sample-pick')).toHaveValue('v28-adt-a08');
    await expect(page.locator('.sample-confirm')).toHaveCount(0);
  });

  test('the list shows the placeholder again after an edit or an opened file', async ({ page }) => {
    await page.goto('./');
    await loadSample(page, 'adt-a01');
    await page.locator('#message').press('Control+End');
    await page.locator('#message').press('X');
    await expect(page.locator('#sample-pick')).toHaveValue('');

    await loadSample(page, 'oru-r01');
    await expect(page.locator('#sample-pick')).toHaveValue('oru-r01');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: en.openFile }).click();
    await (await chooser).setFiles({ name: 'made-up.hl7', mimeType: 'text/plain', buffer: Buffer.from(sampleText('v24-orm-o01')) });
    await expect(page.locator('.mv-row')).toHaveCount(5);
    await expect(page.locator('#sample-pick')).toHaveValue('');
  });

  test('the user\'s own text is not replaced without a yes, and Cancel keeps it', async ({ page }) => {
    await page.goto('./');
    const box = page.locator('#message');
    const pick = page.locator('#sample-pick');
    const question = page.locator('.sample-confirm');
    const own = messageWithVersion('2.5');

    // Typed or pasted text: ask first.
    await box.fill(own);
    await pick.selectOption('adt-a01');
    await expect(question).toBeVisible();
    await expect(question.locator('#sample-confirm-text')).toHaveText(en.sampleReplace);
    // Screen readers read the question with its buttons.
    await expect(page.getByRole('group', { name: en.sampleReplace })).toBeVisible();
    await expect(box).toHaveValue(boxText(own));
    // The safe answer has the focus.
    await expect(question.getByRole('button', { name: en.sampleReplaceNo, exact: true })).toBeFocused();
    await question.getByRole('button', { name: en.sampleReplaceNo, exact: true }).click();
    await expect(question).toHaveCount(0);
    await expect(box).toHaveValue(boxText(own));
    await expect(pick).toHaveValue('');
    await expect(pick).toBeFocused();

    // Escape answers "Cancel" too.
    await pick.selectOption('oru-r01');
    await expect(question).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(question).toHaveCount(0);
    await expect(box).toHaveValue(boxText(own));
    await expect(pick).toHaveValue('');

    // Typing while the question is open closes it, and nothing is replaced.
    await pick.selectOption('oru-r01');
    await expect(question).toBeVisible();
    await box.press('Control+End');
    await box.press('Y');
    await expect(question).toHaveCount(0);
    await expect(pick).toHaveValue('');
    await expect(box).toHaveValue(boxText(own) + 'Y');

    // Replace loads and explains the sample.
    await pick.selectOption('adt-a01');
    await question.getByRole('button', { name: en.sampleReplaceYes, exact: true }).click();
    await expect(box).toHaveValue(boxText(sampleText('adt-a01')));
    await expect(page.locator('.mv-row')).toHaveCount(5);
    await expect(pick).toHaveValue('adt-a01');

    // An unchanged sample is replaced without a question.
    await pick.selectOption('v23-adt-a01');
    await expect(question).toHaveCount(0);
    await expect(box).toHaveValue(boxText(sampleText('v23-adt-a01')));

    // An edited sample is the user's text: ask first.
    await box.press('Control+End');
    await box.press('X');
    await pick.selectOption('v28-adt-a08');
    await expect(question).toBeVisible();
    await question.getByRole('button', { name: en.sampleReplaceNo, exact: true }).click();
    await expect(box).toHaveValue(new RegExp(`X$`));

    // An opened file is the user's text: ask first.
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: en.openFile }).click();
    await (await chooser).setFiles({ name: 'made-up.hl7', mimeType: 'text/plain', buffer: Buffer.from(own) });
    await expect(page.locator('.mv-row')).toHaveCount(3);
    await pick.selectOption('v28-adt-a08');
    await expect(question).toBeVisible();
    await question.getByRole('button', { name: en.sampleReplaceNo, exact: true }).click();
    await expect(box).toHaveValue(boxText(own));

    // An empty box (or only spaces) needs no question.
    await box.fill('   ');
    await pick.selectOption('v28-adt-a08');
    await expect(question).toHaveCount(0);
    await expect(box).toHaveValue(boxText(sampleText('v28-adt-a08')));
  });

  test('the samples line and the question in Arabic', async ({ page }) => {
    await page.goto('./');
    await page.locator('.lang-btn').click();
    await expect(page.locator('label[for="sample-pick"]')).toHaveText(ar.samplePrompt);
    await expect(page.locator('#sample-pick option').first()).toHaveText(ar.samplePlaceholder);
    expect(await page.locator('#sample-pick optgroup').evaluateAll((groups) => groups.map((g) => g.getAttribute('label')))).toEqual([
      ar.sampleGroups.admission,
      ar.sampleGroups.lab,
    ]);
    await expect(page.locator('#sample-pick option[value="v29-adt-a04"]')).toHaveText(ar.samples['v29-adt-a04']);
    await expect(page.locator('#message')).toHaveAttribute('placeholder', ar.placeholder);
    await expect(page.locator('p.intro')).toHaveText(ar.intro);
    // The Arabic hint in the empty box reads right to left; a message is left to right.
    const direction = () => page.locator('#message').evaluate((el) => getComputedStyle(el).direction);
    expect(await direction()).toBe('rtl');
    await page.locator('#message').fill(messageWithVersion('2.5'));
    expect(await direction()).toBe('ltr');
    await page.locator('#sample-pick').selectOption('adt-a01');
    await expect(page.locator('#sample-confirm-text')).toHaveText(ar.sampleReplace);
    await expect(page.locator('.sample-confirm button')).toHaveText([ar.sampleReplaceYes, ar.sampleReplaceNo]);
  });
});

test.describe('first screen', () => {
  test('the tagline stays, and the intro line adds something new', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('.tagline')).toHaveText(en.tagline);
    await expect(page.locator('p.intro')).toHaveText(en.intro);
    await expect(page.locator('section.start ol.steps li')).toHaveCount(3);
  });

  test('the box hint is short, and the drop tip is in the helper line on wide screens', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#message')).toHaveAttribute('placeholder', en.placeholder);
    expect(await page.locator('#message').evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');
    await expect(page.locator('.privacy .shortcut', { hasText: en.dropHint })).toBeVisible();
    await expect(page.locator('.privacy .shortcut', { hasText: en.shortcutHint })).toBeVisible();
  });

  test('Mask and Copy show only when the box holds a message', async ({ page }) => {
    await page.goto('./');
    const mask = page.getByRole('button', { name: en.mask, exact: true });
    const copy = page.getByRole('button', { name: en.copyMasked, exact: true });
    await expect(page.getByRole('button', { name: en.explain, exact: true })).toBeVisible();
    await expect(mask).toHaveCount(0);
    await expect(copy).toHaveCount(0);
    await page.locator('#message').fill(messageWithVersion('2.5'));
    await expect(mask).toBeVisible();
    await expect(copy).toBeVisible();
    // Explain stays the one primary button.
    await expect(page.locator('.actions button.primary')).toHaveText(en.explain);
    await expect(page.locator('.actions button')).toHaveCount(3);
    await page.locator('#message').fill('   ');
    await expect(mask).toHaveCount(0);
    await expect(copy).toHaveCount(0);
  });

  test('at 1024 px the action row has no lone wrapped button', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto('./');
    await expect(page.locator('.actions button')).toHaveCount(1);
    await page.locator('#message').fill(messageWithVersion('2.5'));
    const tops = () => page.locator('.actions button').evaluateAll((b) => b.map((x) => Math.round(x.getBoundingClientRect().top)));
    expect(await tops()).toHaveLength(3);
    expect(new Set(await tops()).size).toBe(1);
    // The Arabic labels are longer; they fit on one row too.
    await page.locator('.lang-btn').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    expect(new Set(await tops()).size).toBe(1);
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test('Explain fills the row, and the wide-screen tips are hidden', async ({ page }) => {
      await page.goto('./');
      const explainBox = await page.getByRole('button', { name: en.explain, exact: true }).boundingBox();
      const rowBox = await page.locator('.actions').boundingBox();
      expect(Math.abs(explainBox!.width - rowBox!.width)).toBeLessThanOrEqual(1);
      await expect(page.locator('.privacy .shortcut', { hasText: en.dropHint })).toBeHidden();
      await expect(page.locator('#message')).toHaveAttribute('placeholder', en.placeholder);
      // The list fits the screen.
      const pickBox = await page.locator('#sample-pick').boundingBox();
      expect(pickBox!.x + pickBox!.width).toBeLessThanOrEqual(375);
    });
  });
});

test.describe('explain as version', () => {
  test('a v2.3 message: the note about the v2.9 field facts, and no history list without the field history', async ({ page }) => {
    await page.goto('./');
    await loadSample(page, 'v23-adt-a01');
    const select = page.locator('#explain-as');
    await expect(select).toHaveValue('auto');
    await expect(select.locator('option[value="auto"]')).toContainText('2.3');
    const note = page.locator('.facts-note');
    const namesNote = page.locator('.names-note');

    const pid = await page.locator('.mv-row').evaluateAll((rows) => rows.findIndex((r) => r.textContent?.startsWith('PID')));
    await page.locator(`.mv [data-k="${pid}:8"]`).click();
    const panel = page.locator('aside.explain');
    await expect(panel).toHaveClass(/open/);
    await expect(panel.locator('#xp-title')).toContainText('PID-8');

    if (HAS_FIELD_HISTORY) {
      await expect(note).toHaveCount(0);
      await expect(namesNote).toContainText(en.namesPick);
    } else {
      // The v2.9 name and data type, with one calm note near the version bar.
      await expect(note).toHaveText(en.factsNote.replace('{version}', '2.9'));
      await expect(panel.locator('#xp-title')).toContainText('Administrative Sex');
      await expect(panel.locator('.xp-meta')).toContainText('CWE');
      // No history list, no later names, no rule tag of an older version, no empty box.
      await expect(panel.locator('.fp-history')).toHaveCount(0);
      await expect(panel.locator('.xp-later')).toHaveCount(0);
      await expect(page.locator(`[title="${en.optTitle.replace('{version}', '2.3')}"]`)).toHaveCount(0);
      await expect(namesNote).toContainText(en.namesNote.replace('{version}', '2.9'));
      await expect(namesNote).not.toContainText(en.namesPick);
    }

    // Explain as 2.9: no note.
    await select.selectOption('2.9');
    await expect(note).toHaveCount(0);
    await expect(panel.locator('#xp-title')).toContainText('Administrative Sex');
    await expect(panel.locator('.xp-meta')).toContainText('CWE');

    // Back to Auto, and in Arabic.
    await select.selectOption('auto');
    await expect(note).toHaveCount(HAS_FIELD_HISTORY ? 0 : 1);
    await page.locator('.lang-btn').click();
    if (!HAS_FIELD_HISTORY) await expect(note).toHaveText(ar.factsNote.replace('{version}', '2.9'));
  });

  test('the note shows for every picked version but 2.9, when there is no field history', async ({ page }) => {
    test.skip(HAS_FIELD_HISTORY, 'The field history has the facts of every version.');
    await page.goto('./');
    await loadSample(page, 'adt-a01');
    const note = page.locator('.facts-note');
    await expect(note).toHaveCount(1);
    for (const version of ['2.3', '2.4', '2.7', '2.8.2']) {
      await page.locator('#explain-as').selectOption(version);
      await expect(note, version).toHaveCount(1);
    }
    await page.locator('#explain-as').selectOption('2.9');
    await expect(note).toHaveCount(0);
    // A message of an unknown version is explained as v2.9: no note.
    await explain(page, messageWithVersion('2.10'));
    await expect(note).toHaveCount(0);
  });

  test('MSH-9.1 shows "Message Code"', async ({ page }) => {
    await page.goto('./');
    await loadSample(page, 'v23-adt-a01');
    await page.locator('.mv [data-k="0:9:1:1"]').click();
    const panel = page.locator('aside.explain');
    await expect(panel.locator('#xp-title')).toContainText('MSH-9.1');
    await expect(panel.locator('#xp-title')).toContainText('Message Code');
    // Without the field history, the names come from the v2.9 data type: only the usual note.
    if (!HAS_FIELD_HISTORY) await expect(panel.locator('.xp-note')).toHaveText([en.componentNamesNote]);
  });

  test('a field added later shows a warning', async ({ page }) => {
    await page.goto('./');
    await loadSample(page, 'v23-adt-a01');
    // EVN-7 is from v2.4; the sample fills it on purpose.
    const evn = page.locator('section.segment').filter({ has: page.locator('.seg-code', { hasText: 'EVN' }) });
    await expect(evn.locator('.tag-warn')).toContainText('2.4');
    await page.locator('.mv [data-k="1:7"]').click();
    await expect(page.locator('aside.explain .warning')).toContainText('2.4');
  });

  test('a code that later versions removed shows "until" and a warning', async ({ page }) => {
    await page.goto('./');
    // OBX-2 code CE exists only up to v2.5.1. Made-up message in v2.6.
    const msh = 'MSH|^~\\&|DEMO_APP|DEMO HOSPITAL|DEMO_RECEIVER|DEMO HOSPITAL|20261108093000||ORU^R01|MSG90002|P|2.6';
    await explain(page, msh + '\rOBX|1|CE|TEST-1^Made-up test^L||POS^Positive^L||||||F');
    await page.locator('.mv [data-k="1:2"]').click();
    const panel = page.locator('aside.explain');
    const row = (code: string) => panel.locator('table.codes tbody tr').filter({ has: page.locator('code', { hasText: new RegExp(`^${code}$`) }) });
    const fill = (text: string, version: string) => text.replace('{code}', 'CE').replace('{until}', '2.5.1').replace('{version}', version);

    await expect(row('CE').locator('.tag-warn')).toHaveText(en.codeUntil.replace('{until}', '2.5.1'));
    await expect(row('TS').locator('.tag-warn')).toHaveText(en.codeUntil.replace('{until}', '2.5.1'));
    await expect(row('NM').locator('.tag')).toHaveCount(0);
    await expect(panel.getByText(fill(en.codeRemoved, '2.6'))).toBeVisible();

    await page.locator('.lang-btn').click();
    await expect(row('CE').locator('.tag-warn')).toHaveText(ar.codeUntil.replace('{until}', '2.5.1'));
    await expect(panel.getByText(fill(ar.codeRemoved, '2.6'))).toBeVisible();
    await page.locator('.lang-btn').click();

    // In v2.5.1 the code exists: the tag stays, without the mark and the warning.
    await page.locator('#explain-as').selectOption('2.5.1');
    await expect(row('CE').locator('.tag')).toHaveText([en.codeUntil.replace('{until}', '2.5.1'), en.inMessage]);
    await expect(row('CE').locator('.tag-warn')).toHaveCount(0);
    await expect(panel.locator('.warning')).toHaveCount(0);

    // A picked version after v2.5.1 uses the "you picked" text.
    await page.locator('#explain-as').selectOption('2.7');
    await expect(panel.getByText(fill(en.codeRemovedChosen, '2.7'))).toBeVisible();
  });

  test('a message older than v2.3 shows a note', async ({ page }) => {
    await page.goto('./');
    for (const version of ['2.2', '2.1']) {
      await explain(page, messageWithVersion(version));
      await expect(page.locator('.info-note')).toHaveText(en.olderNote);
      await expect(page.locator('.tag.support-older')).toHaveText(en.support.older);
      await expect(page.locator('#explain-as option[value="auto"]')).toHaveText(en.autoLatest);
    }
  });

  test('a message newer than v2.9, or with no version, shows a note', async ({ page }) => {
    await page.goto('./');
    for (const version of ['2.10', '3.0', 'v2.5']) {
      await explain(page, messageWithVersion(version));
      await expect(page.locator('.info-note')).toHaveText(en.unknownNote);
      await expect(page.locator('.tag.support-unknown')).toHaveText(en.support.unknown);
    }
    await explain(page, messageWithVersion(''));
    await expect(page.locator('.info-note')).toHaveText(en.noVersion);
  });

  test('a message without MSH shows a problem in the message checks', async ({ page }) => {
    await page.goto('./');
    await explain(page, 'PID|1||TEST9001||DOE^JANE');
    // The parse warnings moved into the message checks (check S1).
    await expect(page.locator('#checks-summary')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.checks-items .chk-sentence').first()).toHaveText(en.checks.sentences['S1-not-first']);
  });

  test('a message with a BOM and MLLP frame characters is explained, with a hint', async ({ page }) => {
    await page.goto('./');
    const plain = sampleText('adt-a01');
    await explain(page, plain);
    const plainChecks = await page.locator('#checks-summary').innerText();
    await expect(page.locator('p.summary')).not.toContainText(en.bomNote);
    await expect(page.locator('p.summary')).not.toContainText(en.mllpNote);

    await explain(page, '﻿\u000B' + plain + '\u001C\r');
    await expect(page.locator('.mv-row')).toHaveCount(5);
    await expect(page.locator('.mv-row').first()).toHaveText(/^MSH\|/);
    await expect(page.locator('p.summary')).toContainText(en.bomNote);
    await expect(page.locator('p.summary')).toContainText(en.mllpNote);
    // The same checks as the message without the frame: no S1 problem.
    await expect(page.locator('#checks-summary')).toHaveText(plainChecks);
  });
});

test.describe('search', () => {
  const rows = (page: import('@playwright/test').Page) => page.locator('table.fields tbody td.pos');

  test('finds fields by English name, Arabic name and position', async ({ page }) => {
    await page.goto('./');
    await loadSample(page, 'v23-adt-a01');
    const search = page.locator('#field-search');

    await search.fill('Patient Name');
    await expect(rows(page).filter({ hasText: /^PID-5\b/ }).first()).toBeVisible();
    await expect(page.locator('#search-count')).not.toHaveText(en.noMatches);

    // The v2.9 name also finds the field in a v2.3 message.
    await search.fill('Administrative Sex');
    await expect(rows(page).first()).toHaveText(/PID-8/);

    await search.fill(arabicName('PID', 'PID-5'));
    await expect(rows(page).first()).toHaveText(/PID-5/);

    await search.fill('PID-3.1');
    await expect(rows(page).filter({ hasText: 'PID-3.1' })).toHaveCount(1);
    await expect(page.locator('#search-count')).toHaveText(en.matchesOne);

    await search.fill('zzqqxx');
    await expect(page.locator('#search-count')).toHaveText(en.noMatches);
    await expect(rows(page)).toHaveCount(0);

    await search.fill('');
    await expect(page.locator('#search-count')).toHaveText('');
    expect(await rows(page).count()).toBeGreaterThan(10);
  });
});

test.describe('Arabic', () => {
  test('switches to Arabic and back to English', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('./');
    await loadSample(page, 'adt-a01');
    await page.locator('.lang-btn').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('label[for="message"]')).toHaveText(ar.inputLabel);
    await expect(page.getByRole('button', { name: ar.explain, exact: true })).toBeVisible();
    await expect(page.locator('.lang-btn')).toHaveText(ar.language);
    await expect(page.locator('label[for="explain-as"]')).toHaveText(ar.explainAs);
    // A field name in Arabic in the field list.
    await expect(page.locator('table.fields button.field-name', { hasText: arabicName('PID', 'PID-5') })).toBeVisible();
    // The panel in Arabic.
    await page.locator('.mv [data-k="2:5"]').click();
    await expect(page.locator('#xp-field')).toHaveAttribute('dir', 'rtl');

    await page.locator('.lang-btn').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('label[for="message"]')).toHaveText(en.inputLabel);
    expect(errors).toEqual([]);
  });
});

test.describe('mask and copy', () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  });

  test('masks patient data in the text box and the view', async ({ page }) => {
    await page.goto('./');
    await loadSample(page, 'adt-a01');
    await page.getByRole('button', { name: en.mask, exact: true }).click();
    const text = await page.locator('#message').inputValue();
    expect(text).toContain('MASKED^PATIENT');
    expect(text).not.toContain('TEST^PATIENT');
    expect(text).not.toContain('19800101');
    await expect(page.locator('p.status')).toHaveText(templatePattern(en.maskedSummary));
    expect(await page.locator('.mv .f.masked').count()).toBeGreaterThan(3);
    await expect(page.locator('table.fields .badge').first()).toHaveText(en.maskedBadge);
    // Masking again changes nothing.
    await page.getByRole('button', { name: en.mask, exact: true }).click();
    await expect(page.locator('p.status')).toHaveText(en.maskedNone);
    expect(await page.locator('#message').inputValue()).toBe(text);
  });

  test('copies the masked message and leaves the text box alone', async ({ page }) => {
    await page.goto('./');
    await loadSample(page, 'adt-a01');
    const before = await page.locator('#message').inputValue();
    await page.getByRole('button', { name: en.copyMasked, exact: true }).click();
    await expect(page.locator('p.status')).toHaveText(en.maskedCopied);
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain('MASKED^PATIENT');
    expect(copied).not.toContain('TEST^PATIENT');
    // The text box keeps line endings as LF, so the copy has LF too.
    expect(copied.split('\n').length).toBe(before.split('\n').length);
    expect(await page.locator('#message').inputValue()).toBe(before);
  });

  test('copies Mirth paths from the panel and from the field list', async ({ page }) => {
    await page.goto('./');
    await loadSample(page, 'oru-r01');
    // The second OBX, field 5.
    const obx2 = await page.locator('.mv-row').evaluateAll((rows) => rows.findIndex((r) => r.textContent?.startsWith('OBX|2|')));
    await page.locator(`.mv [data-k="${obx2}:5"]`).click();
    await page.locator('aside.explain .xp-copy').click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("msg['OBX'][1]['OBX.5']");
    await expect(page.locator('aside.explain .xp-copy')).toContainText(en.copied);

    await page.getByRole('button', { name: en.copyMirthFor.replace('{label}', 'PID-5') }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("msg['PID']['PID.5']");
  });

  test('pasting a message explains it', async ({ page }) => {
    await page.goto('./');
    const text = sampleText('v24-orm-o01');
    await page.evaluate((t) => navigator.clipboard.writeText(t), text);
    await page.locator('#message').click();
    await page.keyboard.press('Control+V');
    await expect(page.locator('.mv-row')).toHaveCount(5);
  });

  test('says when there is no message', async ({ page }) => {
    await page.goto('./');
    // Mask and Copy show only with a message; Explain says what to do.
    await page.getByRole('button', { name: en.explain, exact: true }).click();
    await expect(page.locator('p.status')).toHaveText(en.noMessage);
  });
});

test.describe('open a file', () => {
  test('reads a made-up .hl7 file with a BOM and CRLF endings', async ({ page }) => {
    await page.goto('./');
    const text = '﻿' + sampleText('adt-a01').split('\r').join('\r\n');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: en.openFile }).click();
    await (await chooser).setFiles({ name: 'made-up.hl7', mimeType: 'text/plain', buffer: Buffer.from(text, 'utf8') });
    await expect(page.locator('.mv-row')).toHaveCount(5);
    await expect(page.locator('.mv-row').first()).toHaveText(/^MSH\|/);
    await expect(page.locator('p.warning')).toHaveCount(0);
  });
});

test.describe('legal pages', () => {
  for (const [hash, title] of [
    ['#/terms', 'Terms of use'],
    ['#/privacy', 'Privacy'],
    ['#/credits', 'Credits'],
  ] as const) {
    test(`${hash} shows its text and a way back`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('./' + hash);
      await expect(page.locator('main.legal h2').first()).toContainText(title);
      await page.getByRole('link', { name: en.back }).click();
      await expect(page.locator('#message')).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
});
