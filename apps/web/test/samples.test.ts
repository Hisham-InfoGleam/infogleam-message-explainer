// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// The samples that the page offers.

import { readdirSync, readFileSync } from 'node:fs';
import { compareVersions, messageVersion, parseMessage } from '@infogleam/message-explainer-core';
import { describe, expect, it } from 'vitest';
import { messagesFor } from '../src/i18n';
import { isOwnText, isSampleId, SAMPLE_GROUPS, SAMPLE_IDS, SAMPLES, type SampleId } from '../src/lib/samples';

const samplesDir = new URL('../../../samples/', import.meta.url);

describe('SAMPLES', () => {
  it('has every file in samples/, and nothing else', () => {
    const files = readdirSync(samplesDir).filter((f) => f.endsWith('.hl7')).map((f) => f.replace(/\.hl7$/, ''));
    expect([...SAMPLE_IDS].sort()).toEqual(files.sort());
    expect(SAMPLE_IDS).toEqual(Object.keys(SAMPLES));
  });

  it('holds the exact file text', () => {
    for (const id of SAMPLE_IDS) {
      expect(SAMPLES[id], id).toBe(readFileSync(new URL(`${id}.hl7`, samplesDir), 'utf8'));
    }
  });

  it('is listed by HL7 version, oldest first', () => {
    const versions = SAMPLE_IDS.map((id) => messageVersion(parseMessage(SAMPLES[id]))!);
    const sorted = [...versions].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    expect(versions).toEqual(sorted);
  });

  for (const id of SAMPLE_IDS) {
    it(`${id}: parses without warnings, and its labels say what it is in plain words, then its type and version`, () => {
      const m = parseMessage(SAMPLES[id]);
      expect(m.warnings).toEqual([]);
      const msh9 = m.segments[0]!.fields.find((f) => f.position === 9)!.repetitions[0]!.components;
      const type = `${msh9[0]!.value}^${msh9[1]!.value}`;
      const version = messageVersion(m)!;
      // English: "Patient admit (ADT^A01, v2.3)". Arabic uses the Arabic comma.
      expect(messagesFor('en').samples[id]).toMatch(new RegExp(`^[A-Z][^()]+ \\(${escape(type)}, v${escape(version)}\\)$`));
      expect(messagesFor('ar').samples[id]).toMatch(new RegExp(`^[\\u0600-\\u06FF][^()]+ \\(${escape(type)}، v${escape(version)}\\)$`));
    });
  }
});

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('SAMPLE_GROUPS (the sample list on the page)', () => {
  it('lists every sample once', () => {
    const listed = SAMPLE_GROUPS.flatMap((g) => g.ids);
    expect([...listed].sort()).toEqual([...SAMPLE_IDS].sort());
    expect(new Set(listed).size).toBe(listed.length);
  });

  it('sorts the samples by HL7 version inside each group', () => {
    for (const group of SAMPLE_GROUPS) {
      const versions = group.ids.map((id) => messageVersion(parseMessage(SAMPLES[id]))!);
      expect([...versions].sort(compareVersions), group.id).toEqual(versions);
    }
  });

  it('puts admissions and registrations in one group, and lab orders and results in the other', () => {
    // The message code: the first part of MSH-9, such as ADT or ORU.
    const code = (id: SampleId): string =>
      parseMessage(SAMPLES[id]).segments[0]!.fields.find((f) => f.position === 9)!.repetitions[0]!.components[0]!.value;
    const admission = SAMPLE_GROUPS.find((g) => g.id === 'admission')!;
    const lab = SAMPLE_GROUPS.find((g) => g.id === 'lab')!;
    for (const id of admission.ids) expect(code(id), id).toBe('ADT');
    for (const id of lab.ids) expect(['ORM', 'ORU'], id).toContain(code(id));
  });

  it('has a group name in both languages', () => {
    for (const lang of ['en', 'ar'] as const) {
      for (const group of SAMPLE_GROUPS) expect(messagesFor(lang).sampleGroups[group.id].trim(), `${lang} ${group.id}`).not.toBe('');
    }
  });
});

describe('isOwnText (ask before a sample replaces the text)', () => {
  it('is false for an empty box and for an unchanged sample', () => {
    expect(isOwnText('', null)).toBe(false);
    expect(isOwnText('  \n ', null)).toBe(false);
    for (const id of SAMPLE_IDS) expect(isOwnText(SAMPLES[id], id), id).toBe(false);
  });

  it('is true for typed, pasted or opened text, and for a changed sample', () => {
    expect(isOwnText('MSH|^~\\&|DEMO', null)).toBe(true);
    // A sample whose text was changed, or text that is not the loaded sample.
    expect(isOwnText(SAMPLES['adt-a01'] + 'X', 'adt-a01')).toBe(true);
    expect(isOwnText(SAMPLES['oru-r01'], 'adt-a01')).toBe(true);
    // The page forgets the sample after an edit, an opened file or masking.
    expect(isOwnText(SAMPLES['adt-a01'], null)).toBe(true);
  });

  it('knows the sample ids', () => {
    for (const id of SAMPLE_IDS) expect(isSampleId(id)).toBe(true);
    for (const id of ['', 'constructor', 'adt', 'v30-adt-a01']) expect(isSampleId(id), id).toBe(false);
  });
});
