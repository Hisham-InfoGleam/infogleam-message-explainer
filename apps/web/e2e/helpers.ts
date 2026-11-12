// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

import { readFileSync } from 'node:fs';
import { expect, type BrowserContext, type Page } from '@playwright/test';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

/** The page text, so the tests do not repeat any wording. */
export const en = readJson<Record<string, any>>('../src/i18n/en.json');
export const ar = readJson<Record<string, any>>('../src/i18n/ar.json');

/** A sample file from samples/, exactly as it is (CR between segments). */
export function sampleText(id: string): string {
  return readFileSync(new URL(`../../../samples/${id}.hl7`, import.meta.url), 'utf8');
}

/** The Arabic name of a field from the explanation files. */
export function arabicName(segment: string, id: string): string {
  const doc = readJson<{ fields: Record<string, { nameAr: string }> }>(
    `../../../packages/core/src/dictionary/explanations/${segment}.json`,
  );
  return doc.fields[id]!.nameAr;
}

/** Collect console errors and page errors. Check them with expectNoErrors(). */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

/** Put a message in the text box and press Explain. */
export async function explain(page: Page, text: string): Promise<void> {
  await page.locator('#message').fill(text);
  await page.getByRole('button', { name: en.explain, exact: true }).click();
  await expect(page.locator('.mv-row').first()).toBeVisible();
}

/** The text of a sample as the text box shows it: the box turns CR into LF. */
export function boxText(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/**
 * Load a sample with the sample list. When the box holds the user's own
 * text, the page asks first; this answers "Replace".
 */
export async function loadSample(page: Page, id: string): Promise<void> {
  await page.locator('#sample-pick').selectOption(id);
  const replace = page.locator('.sample-confirm').getByRole('button', { name: en.sampleReplaceYes, exact: true });
  if (await replace.isVisible()) await replace.click();
  await expect(page.locator('#message')).toHaveValue(boxText(sampleText(id)));
  const segments = sampleText(id).split('\r').filter((line) => line !== '').length;
  await expect(page.locator('.mv-row')).toHaveCount(segments);
}

/** A made-up message with the given HL7 version in MSH-12. */
export function messageWithVersion(version: string): string {
  return [
    `MSH|^~\\&|DEMO_APP|DEMO HOSPITAL|DEMO_RECEIVER|DEMO HOSPITAL|20261108093000||ADT^A01|MSG90001|P|${version}`,
    'EVN|A01|20261108093000',
    'PID|1||TEST9001^^^DEMOHOSP^MR||DOE^JANE||19800101|F',
  ].join('\r');
}

/** A pattern for a text template: each {placeholder} matches any text. */
export function templatePattern(template: string): RegExp {
  const parts = template.split(/\{\w+\}/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${parts.join('.+')}$`);
}

/** True when the page can scroll sideways. */
export async function scrollsSideways(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}

/** The address of the InfoGleam website, as the header links to it. */
export const SITE_HOME = 'https://infogleam.com/';

/**
 * Answer requests to the InfoGleam website with a small made-up page, so
 * the tests never reach the real website.
 */
export async function fakeWebsite(context: BrowserContext): Promise<void> {
  await context.route('https://infogleam.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><meta charset="utf-8"><title>Made-up page</title><p>A made-up page for a test.</p>',
    }),
  );
}
