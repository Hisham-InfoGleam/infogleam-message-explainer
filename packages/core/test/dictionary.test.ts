// SPDX-License-Identifier: MPL-2.0
// Copyright 2026 Hisham Alrashdan (InfoGleam)

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DOCUMENTED_SEGMENTS, getFieldDoc, getSegmentDoc } from '../src/index.js';

const dictDir = fileURLToPath(new URL('../src/dictionary/', import.meta.url));

interface FieldInfo {
  id: string;
  name: string;
  dataType: string;
}
interface FieldList {
  segments: Record<string, { title: string; fields: FieldInfo[] }>;
}

const fieldList = JSON.parse(readFileSync(dictDir + 'hl7-fields.json', 'utf8')) as FieldList;

const USAGE = new Set(['common', 'sometimes', 'rare', 'legacy']);
const FIELD_KEYS = new Set([
  'nameAr',
  'usage',
  'summary',
  'details',
  'tip',
  'example',
  'table',
  'values',
  'since',
  'versionNote',
]);
const VERSIONS = new Set(['2.3.1', '2.4', '2.5', '2.5.1', '2.6', '2.7', '2.7.1', '2.8', '2.8.1', '2.8.2', '2.9']);
const SEGMENT_KEYS = new Set(['segment', 'title', 'summary', 'details', 'keyFields', 'fields']);
const ARABIC = /[؀-ۿ]/;

function words(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function checkPair(where: string, value: unknown, maxWords: number): string[] {
  const problems: string[] = [];
  if (typeof value !== 'object' || value === null) return [`${where}: missing`];
  const pair = value as Record<string, unknown>;
  for (const lang of ['en', 'ar']) {
    const text = pair[lang];
    if (typeof text !== 'string' || text.trim() === '') problems.push(`${where}.${lang}: empty`);
  }
  if (typeof pair.ar === 'string' && pair.ar !== '' && !ARABIC.test(pair.ar)) {
    problems.push(`${where}.ar: no Arabic text`);
  }
  // Allow about 10% over the writing limit.
  if (typeof pair.en === 'string' && words(pair.en) > Math.ceil(maxWords * 1.1)) {
    problems.push(`${where}.en: ${words(pair.en)} words (limit ${maxWords})`);
  }
  return problems;
}

describe('field explanations', () => {
  for (const [seg, info] of Object.entries(fieldList.segments)) {
    it(`${seg} has a complete explanation file`, () => {
      const file = `${dictDir}explanations/${seg}.json`;
      expect(existsSync(file), `${seg}.json is missing`).toBe(true);
      const doc = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
      const problems: string[] = [];

      for (const key of Object.keys(doc)) {
        if (!SEGMENT_KEYS.has(key)) problems.push(`${seg}: unknown key "${key}"`);
      }
      if (doc.segment !== seg) problems.push(`${seg}: segment is "${String(doc.segment)}"`);
      problems.push(...checkPair(`${seg}.title`, doc.title, 8));
      problems.push(...checkPair(`${seg}.summary`, doc.summary, 25));
      problems.push(...checkPair(`${seg}.details`, doc.details, 90));

      const fields = (doc.fields ?? {}) as Record<string, Record<string, unknown>>;
      const expectedIds = info.fields.map((f) => f.id);
      expect(Object.keys(fields), `${seg}: field ids or order differ`).toEqual(expectedIds);

      const keyFields = doc.keyFields as unknown;
      if (!Array.isArray(keyFields) || keyFields.length < 3 || keyFields.length > 6) {
        problems.push(`${seg}.keyFields: need 3 to 6 ids`);
      } else {
        for (const id of keyFields) {
          if (!expectedIds.includes(String(id))) problems.push(`${seg}.keyFields: unknown id ${String(id)}`);
        }
      }

      for (const [id, field] of Object.entries(fields)) {
        for (const key of Object.keys(field)) {
          if (!FIELD_KEYS.has(key)) problems.push(`${id}: unknown key "${key}"`);
        }
        if (typeof field.nameAr !== 'string' || !ARABIC.test(field.nameAr)) problems.push(`${id}.nameAr: missing`);
        const usage = String(field.usage);
        if (!USAGE.has(usage)) problems.push(`${id}.usage: "${usage}"`);
        problems.push(...checkPair(`${id}.summary`, field.summary, 20));
        if (field.details !== undefined || usage === 'common' || usage === 'sometimes') {
          problems.push(...checkPair(`${id}.details`, field.details, 45));
        }
        if (field.tip !== undefined) problems.push(...checkPair(`${id}.tip`, field.tip, 30));
        if (field.versionNote !== undefined) problems.push(...checkPair(`${id}.versionNote`, field.versionNote, 25));
        if (field.since !== undefined && !VERSIONS.has(String(field.since))) {
          problems.push(`${id}.since: "${String(field.since)}"`);
        }
        if (field.example !== undefined && typeof field.example !== 'string') problems.push(`${id}.example: not text`);
        if (field.table !== undefined && !/^\d{4}$/.test(String(field.table))) problems.push(`${id}.table: "${String(field.table)}"`);
        if (field.values !== undefined) {
          const values = field.values as unknown;
          if (!Array.isArray(values) || values.length === 0 || values.length > 12) {
            problems.push(`${id}.values: need 1 to 12 entries`);
          } else {
            for (const v of values as Record<string, unknown>[]) {
              if (typeof v.code !== 'string' || v.code === '') problems.push(`${id}.values: empty code`);
              if (typeof v.en !== 'string' || v.en === '') problems.push(`${id}.values ${String(v.code)}: no English`);
              if (typeof v.ar !== 'string' || !ARABIC.test(v.ar)) problems.push(`${id}.values ${String(v.code)}: no Arabic`);
              if (v.since !== undefined && !/^2\.\d+(\.\d+)?$/.test(String(v.since))) {
                problems.push(`${id}.values ${String(v.code)}: since "${String(v.since)}"`);
              }
              if (v.until !== undefined && !/^2\.\d+(\.\d+)?$/.test(String(v.until))) {
                problems.push(`${id}.values ${String(v.code)}: until "${String(v.until)}"`);
              }
              for (const k of Object.keys(v)) {
                if (!['code', 'en', 'ar', 'since', 'until'].includes(k)) problems.push(`${id}.values: unknown key "${k}"`);
              }
            }
          }
        }
      }

      expect(problems).toEqual([]);
    });
  }
});

describe('getFieldDoc', () => {
  it('merges the field list and the explanation', () => {
    const doc = getFieldDoc('PID', 5);
    expect(doc).toMatchObject({
      id: 'PID-5',
      segment: 'PID',
      field: 5,
      name: 'Patient Name',
      dataType: 'XPN',
      min: 1,
      max: '*',
      repeats: true,
      nameAr: 'اسم المريض',
      usage: 'common',
      example: 'TEST^PATIENT^ONE^^^^L',
    });
    expect(doc?.summary?.en).toMatch(/name/i);
    expect(doc?.summary?.ar).toMatch(ARABIC);
    expect(doc?.since).toBeUndefined();
  });

  it('includes version notes, tips and table codes', () => {
    const doc = getFieldDoc('PID', 8);
    expect(doc).toMatchObject({ name: 'Administrative Sex', dataType: 'CWE', max: 1, repeats: false, table: '0001' });
    expect(doc?.versionNote?.en).toContain('v2.3');
    expect(doc?.tip?.ar).toMatch(ARABIC);
    expect(doc?.values?.map((v) => v.code)).toEqual(['F', 'M', 'O', 'U', 'A', 'N']);
  });

  it('keeps since and other names', () => {
    expect(getFieldDoc('OBX', 20)?.since).toBe('2.6');
    expect(getFieldDoc('PID', 40)?.since).toBe('2.7');
    expect(getFieldDoc('ORC', 9)?.otherNames).toEqual(['Date/Time of Transaction']);
  });

  it('has the corrections from the HL7 v2.9 tables', () => {
    expect(getFieldDoc('ORC', 9)?.name).toBe('Date/Time of Order Event');
    expect(getFieldDoc('ORC', 4)).toMatchObject({ name: 'Placer Order Group Number', dataType: 'EI' });
    expect(getFieldDoc('OBR', 29)?.name).toBe('Parent Results Observation Identifier');
    expect(getFieldDoc('OBX', 7)?.name).toBe('Reference Range');
    expect(getFieldDoc('DG1', 1)?.name).toBe('Set ID - DG1');
    expect(getFieldDoc('DG1', 3)?.name).toBe('Diagnosis Code - DG1');
    expect(getFieldDoc('MSH', 6)).toMatchObject({ max: '*', repeats: true });
    expect(getFieldDoc('AL1', 3)?.min).toBe(0);
    expect(getFieldDoc('PID', 20)?.dataType).toBe('DLN');
    expect(getFieldDoc('OBR', 15)?.dataType).toBe('SPS');
  });

  it('has no footnote marks or extra spaces in field names', () => {
    for (const info of Object.values(fieldList.segments)) {
      for (const f of info.fields) {
        expect(f.name, f.id).toBe(f.name.trim());
        expect(f.name, f.id).not.toMatch(/[*+#]$|\s{2}/);
      }
    }
  });

  it('turns repeat limits into numbers', () => {
    expect(getFieldDoc('ORC', 14)).toMatchObject({ max: 2, repeats: true });
    expect(getFieldDoc('OBR', 17)).toMatchObject({ min: 0, max: 2, repeats: true });
  });

  it('numbers MSH fields like the standard', () => {
    expect(getFieldDoc('MSH', 1)?.name).toBe('Field Separator');
    expect(getFieldDoc('MSH', 3)?.name).toBe('Sending Application');
    expect(getFieldDoc('MSH', 12)?.name).toBe('Version ID');
  });

  it('returns undefined for unknown segments and fields', () => {
    expect(getFieldDoc('ZZZ', 1)).toBeUndefined();
    expect(getFieldDoc('NTE', 3)).toBeUndefined();
    expect(getFieldDoc('OBR', 56)).toBeUndefined();
    expect(getFieldDoc('PID', 0)).toBeUndefined();
    expect(getFieldDoc('PID', 1.5)).toBeUndefined();
    expect(getFieldDoc('constructor', 1)).toBeUndefined();
    expect(getFieldDoc('pid', 5)).toBeUndefined();
  });

  it('has a doc for every field in the list', () => {
    for (const [seg, info] of Object.entries(fieldList.segments)) {
      info.fields.forEach((f, i) => {
        const doc = getFieldDoc(seg, i + 1);
        expect(doc?.id, f.id).toBe(f.id);
        expect(doc?.summary, f.id).toBeDefined();
      });
    }
  });
});

describe('getSegmentDoc', () => {
  it('merges the segment name and the explanation', () => {
    const doc = getSegmentDoc('OBX');
    expect(doc).toMatchObject({ segment: 'OBX', name: 'Observation/Result', fieldCount: 33 });
    expect(doc?.title.ar).toMatch(ARABIC);
    expect(doc?.summary.en).not.toBe('');
    expect(doc?.details.en).not.toBe('');
    expect(doc?.keyFields).toContain('OBX-5');
  });

  it('knows the documented segments', () => {
    expect([...DOCUMENTED_SEGMENTS].sort()).toEqual(Object.keys(fieldList.segments).sort());
    for (const seg of DOCUMENTED_SEGMENTS) expect(getSegmentDoc(seg)?.segment).toBe(seg);
  });

  it('returns undefined for other segments', () => {
    expect(getSegmentDoc('NTE')).toBeUndefined();
    expect(getSegmentDoc('ZPI')).toBeUndefined();
    expect(getSegmentDoc('__proto__')).toBeUndefined();
  });
});
