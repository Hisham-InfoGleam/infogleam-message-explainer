// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// Phone, tablet and desktop sizes, light and dark mode.

import { expect, test } from '@playwright/test';
import { en, loadSample, messageWithVersion, scrollsSideways, watchErrors } from './helpers';

const SIZES = [
  { name: 'phone', width: 375, height: 812, wide: false },
  { name: 'tablet', width: 768, height: 1024, wide: false },
  { name: 'desktop', width: 1280, height: 800, wide: true },
];
const SCHEMES = ['light', 'dark'] as const;

/**
 * WCAG contrast ratio of an element's text on its background: the first
 * ancestor (or the element itself) whose background is not transparent.
 * Runs in the page.
 */
function contrastRatio(el: Element): number {
  const parse = (c: string): number[] => (c.match(/[\d.]+/g) ?? []).map(Number);
  const fg = parse(getComputedStyle(el).color);
  let bg = [255, 255, 255];
  for (let n: Element | null = el; n; n = n.parentElement) {
    const c = parse(getComputedStyle(n).backgroundColor);
    if (c.length === 3 || (c[3] ?? 1) > 0) {
      bg = c;
      break;
    }
  }
  const luminance = (rgb: number[]): number => {
    const [r = 0, g = 0, b = 0] = rgb.slice(0, 3).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

for (const size of SIZES) {
  for (const scheme of SCHEMES) {
    test.describe(`${size.name} ${size.width}x${size.height}, ${scheme}`, () => {
      test.use({ viewport: { width: size.width, height: size.height }, colorScheme: scheme });

      test('has no sideways page scroll, and the panel opens and closes', async ({ page }) => {
        const errors = watchErrors(page);
        await page.goto('./');
        expect(await scrollsSideways(page)).toBe(false);

        for (const id of ['v251-oru-r01', 'v28-adt-a08', 'adt-a01']) {
          await loadSample(page, id);
          expect(await scrollsSideways(page), id).toBe(false);
        }

        const panel = page.locator('aside.explain');
        if (!size.wide) await expect(panel).toBeHidden();
        await page.locator('.mv [data-k="2:5"]').click();
        await expect(panel).toHaveClass(/open/);
        await expect(panel).toBeVisible();
        await expect(panel.locator('#xp-title')).toBeVisible();
        await expect(panel).toBeInViewport();
        expect(await scrollsSideways(page)).toBe(false);

        await panel.getByRole('button', { name: en.closePanel }).click();
        await expect(panel).not.toHaveClass(/open/);
        await expect(panel.locator('#xp-title')).toHaveCount(0);
        if (!size.wide) await expect(panel).toBeHidden();
        else await expect(panel.locator('.xp-empty')).toHaveText(en.panelEmpty);

        // Arabic, right to left.
        await page.locator('.lang-btn').click();
        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
        expect(await scrollsSideways(page)).toBe(false);

        // The legal pages.
        await page.goto('./#/terms');
        expect(await scrollsSideways(page)).toBe(false);
        expect(errors).toEqual([]);
      });

      test('the first screen, the samples line and the question fit, in English and Arabic', async ({ page }) => {
        const errors = watchErrors(page);
        await page.goto('./');
        for (const dir of ['ltr', 'rtl']) {
          if (dir === 'rtl') await page.locator('.lang-btn').click();
          await expect(page.locator('html')).toHaveAttribute('dir', dir);
          await expect(page.locator('#sample-pick')).toBeVisible();
          expect(await scrollsSideways(page), dir).toBe(false);
          // The question before replacing own text.
          await page.locator('#message').fill(messageWithVersion('2.5'));
          await page.locator('#sample-pick').selectOption('v29-adt-a04');
          await expect(page.locator('.sample-confirm')).toBeVisible();
          expect(await scrollsSideways(page), dir).toBe(false);
          await page.locator('.sample-confirm button').last().click();
          await page.locator('#message').fill('');
        }
        expect(errors).toEqual([]);
      });

      test('the texts of the first screen have at least WCAG AA contrast', async ({ page }) => {
        await page.goto('./');
        await page.locator('#message').fill(messageWithVersion('2.5'));
        await page.locator('#sample-pick').selectOption('adt-a01');
        await expect(page.locator('.sample-confirm')).toBeVisible();
        const selectors = [
          'p.intro',
          'label[for="sample-pick"]',
          '#sample-pick',
          '#sample-confirm-text',
          '.sample-confirm button',
          '.actions button',
          '.privacy .shortcut',
        ];
        for (const selector of selectors) {
          for (const el of await page.locator(selector).all()) {
            if (!(await el.isVisible())) continue;
            const ratio = await el.evaluate(contrastRatio);
            expect(ratio, `${selector}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
          }
        }
      });

      test(`uses the ${scheme} colours`, async ({ page }) => {
        await page.goto('./');
        const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        const [r, g, b] = (background.match(/\d+/g) ?? []).map(Number);
        const light = (r ?? 0) + (g ?? 0) + (b ?? 0) > 3 * 128;
        expect(light, background).toBe(scheme === 'light');
      });
    });
  }
}
