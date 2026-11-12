// SPDX-License-Identifier: MPL-2.0
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// The English and Arabic explanations must say the same facts. The words
// differ, but codes, numbers, field ids, versions and table numbers are
// written the same way in both languages. This test finds them in each
// text and compares the two lists. It does not check the wording.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = fileURLToPath(new URL('../src/dictionary/explanations/', import.meta.url));

interface Pair {
  en: string;
  ar: string;
}

/** Every English and Arabic text pair in the explanation files, with its place. */
function textPairs(): { where: string; pair: Pair; label?: boolean }[] {
  const out: { where: string; pair: Pair; label?: boolean }[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const doc = JSON.parse(readFileSync(dir + file, 'utf8')) as Record<string, unknown> & {
      fields: Record<string, Record<string, unknown>>;
    };
    const seg = file.replace(/\.json$/, '');
    for (const key of ['title', 'summary', 'details']) out.push({ where: `${seg}.${key}`, pair: doc[key] as Pair });
    for (const [id, field] of Object.entries(doc.fields)) {
      for (const key of ['summary', 'details', 'versionNote', 'tip']) {
        if (field[key] !== undefined) out.push({ where: `${id}.${key}`, pair: field[key] as Pair });
      }
      for (const v of (field.values ?? []) as (Pair & { code: string })[]) {
        out.push({ where: `${id} code ${v.code}`, pair: { en: v.en, ar: v.ar }, label: true });
      }
    }
  }
  return out;
}

// Short English words written in capitals, which the Arabic text may
// translate: "patient ID" and "MRN" (medical record number).
const ENGLISH_WORDS = new Set(['ID', 'IDs', 'MRN']);

/** Change Arabic-Indic digits to 0-9. */
function westernDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0));
}

/**
 * The facts in a text that do not change with the language:
 * - field ids, for example PID-3 or PID-5.1
 * - versions, for example 2.5.1 (with or without "v")
 * - 4-digit numbers, such as table numbers
 * - codes in capitals, for example CWE, ADT or A01 (a plural "s" is dropped)
 * - other numbers above 10 (smaller ones may be written as words)
 * Single capital letters are left out, because "A" is also a word. For a
 * short label (the meaning of a code), words in capitals are left out too,
 * because labels such as "OK" or "CAT scan" are translated.
 */
export function facts(text: string, label = false): Set<string> {
  let t = westernDigits(text);
  const out = new Set<string>();
  // A number ends at a character that is not a digit and not ".digit".
  const END = String.raw`(?!\d|\.\d)`;
  const FIELD_ID = /\b[A-Z][A-Z0-9]{2}-\d+(?:\.\d+)*/g;
  for (const m of t.matchAll(FIELD_ID)) out.add(`field ${m[0]}`);
  // Take the field ids out, so their parts are not read again.
  t = t.replace(FIELD_ID, ' ');
  for (const m of t.matchAll(new RegExp(String.raw`(?<![\d.])v?(\d+\.\d+(?:\.\d+)?)${END}`, 'g'))) out.add(`version ${m[1]}`);
  for (const m of t.matchAll(new RegExp(String.raw`(?<![\d.\-])\d{4}${END}`, 'g'))) out.add(`number ${m[0]}`);
  for (const m of t.matchAll(/(?<![A-Za-z0-9])([A-Z][A-Z0-9_]+)s?(?![A-Za-z0-9])/g)) {
    if (!label && !ENGLISH_WORDS.has(m[1]!)) out.add(`code ${m[1]}`);
  }
  for (const m of t.matchAll(/(?<![\d.])\d+(?![\d])/g)) if (Number(m[0]) > 10) out.add(`number ${m[0]}`);
  return out;
}

/**
 * Arabic text often adds the English term in brackets, for example
 * "إقرار القبول (Accept ACK)". Such a gloss may hold codes that the
 * English text does not repeat, so it is left out of the Arabic-only check.
 */
function withoutGloss(ar: string): string {
  return ar.replace(/\([^()؀-ۿ]*\)/g, '');
}

const ARABIC = /[؀-ۿ]/;

describe('the fact finder of this test', () => {
  it('finds field ids, versions, tables, codes and numbers', () => {
    expect([...facts('PID-5.1 is CWE in v2.7. Table 0001, for example F. ISO 3166.')].sort()).toEqual(
      ['code CWE', 'code ISO', 'field PID-5.1', 'number 0001', 'number 3166', 'version 2.7'].sort(),
    );
    expect([...facts('في الإصدارين v2.3 وv2.4.')].sort()).toEqual(['version 2.3', 'version 2.4']);
    expect([...facts('رقم ٠٠٠١')]).toEqual(['number 0001']);
    expect([...facts('the patient ID and some DRGs')]).toEqual(['code DRG']);
    expect([...facts('OK, CAT scan 120', true)]).toEqual(['number 120']);
  });
});

describe('English and Arabic explanations', () => {
  const pairs = textPairs();

  it('has text pairs to check', () => {
    expect(pairs.length).toBeGreaterThan(500);
  });

  it('every Arabic text has Arabic letters, and every English text has none', () => {
    const problems: string[] = [];
    for (const { where, pair } of pairs) {
      if (typeof pair?.en !== 'string' || typeof pair?.ar !== 'string') {
        problems.push(`${where}: not a text pair`);
        continue;
      }
      if (!ARABIC.test(pair.ar)) problems.push(`${where}: the Arabic has no Arabic letters`);
      if (ARABIC.test(pair.en)) problems.push(`${where}: the English has Arabic letters`);
    }
    expect(problems).toEqual([]);
  });

  it('the Arabic text has every code, number, field id, version and table of the English', () => {
    const problems: string[] = [];
    for (const { where, pair, label } of pairs) {
      const ar = facts(pair.ar, label);
      const missing = [...facts(pair.en, label)].filter((f) => !ar.has(f));
      if (missing.length > 0) problems.push(`${where}: Arabic lacks ${missing.join(', ')}`);
    }
    expect(problems).toEqual([]);
  });

  it('the English text has every code, number, field id, version and table of the Arabic', () => {
    const problems: string[] = [];
    for (const { where, pair, label } of pairs) {
      const en = facts(pair.en, label);
      const extra = [...facts(withoutGloss(pair.ar), label)].filter((f) => !en.has(f));
      if (extra.length > 0) problems.push(`${where}: English lacks ${extra.join(', ')}`);
    }
    expect(problems).toEqual([]);
  });
});
