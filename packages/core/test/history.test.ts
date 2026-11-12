// SPDX-License-Identifier: MPL-2.0
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// The field history file (hl7-field-history.json) is an optional data
// file. With the field facts in it, getFieldDoc() gives the facts of each
// version. When it is empty, getFieldDoc() gives the v2.9 facts of the field
// list for every version and says so (factsVersion). These tests hold in
// both cases: some run only when the file has fields, some only when it is
// empty.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  dataTypeKind,
  getComponentDoc,
  getFieldDoc,
  getFieldHistory,
  getFieldVersion,
  HAS_FIELD_HISTORY,
  hasFieldFacts,
  HISTORY_VERSIONS,
  LATEST_VERSION,
  partNamesType,
} from '../src/index.js';

const dictDir = fileURLToPath(new URL('../src/dictionary/', import.meta.url));

interface RawEntry {
  from: string;
  name?: string;
  dataType?: string;
  opt?: string;
  max?: number | string;
}
interface HistoryFile {
  about: string;
  versions: string[];
  sources: { version: string; source: string; pages?: string[] }[];
  fields: Record<string, RawEntry[]>;
}
interface FieldList {
  segments: Record<string, { fields: { id: string; name: string; dataType: string; min: number; max: number | string }[] }>;
}

const file = JSON.parse(readFileSync(dictDir + 'hl7-field-history.json', 'utf8')) as HistoryFile;
const fieldList = JSON.parse(readFileSync(dictDir + 'hl7-fields.json', 'utf8')) as FieldList;
const segments = Object.keys(fieldList.segments);
const allFields = segments.flatMap((s) => fieldList.segments[s]!.fields.map((f, i) => ({ segment: s, field: i + 1, ...f })));

const VERSIONS = ['2.3', '2.3.1', '2.4', '2.5', '2.5.1', '2.6', '2.7', '2.7.1', '2.8', '2.8.1', '2.8.2', '2.9'];
const OPTS = new Set(['R', 'O', 'C', 'B', 'W', 'X']);

describe('hl7-field-history.json', () => {
  it('has the same keys and versions with or without fields', () => {
    expect(Object.keys(file)).toEqual(['about', 'versions', 'sources', 'fields']);
    expect(file.about.trim()).not.toBe('');
    expect(file.versions).toEqual(VERSIONS);
    expect(HISTORY_VERSIONS).toEqual(VERSIONS);
    expect(LATEST_VERSION).toBe('2.9');
    expect(HISTORY_VERSIONS.at(-1)).toBe(LATEST_VERSION);
    expect(Array.isArray(file.sources)).toBe(true);
    expect(typeof file.fields).toBe('object');
  });

  it('HAS_FIELD_HISTORY says whether the file has fields', () => {
    expect(HAS_FIELD_HISTORY).toBe(Object.keys(file.fields).length > 0);
  });

  it.runIf(HAS_FIELD_HISTORY)('names a source for each version', () => {
    expect(file.sources.map((s) => s.version).sort(compareVersions)).toEqual(VERSIONS);
    for (const s of file.sources) {
      expect(s.source.trim(), s.version).not.toBe('');
      for (const page of s.pages ?? []) expect(page).toMatch(/^https:\/\//);
    }
  });

  it.runIf(HAS_FIELD_HISTORY)('has a well-formed history for every field in the field list, and nothing else', () => {
    expect(Object.keys(file.fields)).toEqual(allFields.map((f) => f.id));
    const problems: string[] = [];
    for (const [id, entries] of Object.entries(file.fields)) {
      if (entries.length === 0) problems.push(`${id}: no entries`);
      entries.forEach((e, i) => {
        if (!VERSIONS.includes(e.from)) problems.push(`${id}: version "${e.from}"`);
        if (i > 0 && compareVersions(entries[i - 1]!.from, e.from) >= 0) problems.push(`${id}: ${e.from} out of order`);
        const keys = Object.keys(e).filter((k) => k !== 'from');
        if (i === 0 && keys.length !== 4) problems.push(`${id}: the first entry needs name, dataType, opt and max`);
        if (i > 0 && keys.length === 0) problems.push(`${id} ${e.from}: nothing changed`);
        for (const k of keys) if (!['name', 'dataType', 'opt', 'max'].includes(k)) problems.push(`${id}: key "${k}"`);
        if (e.name !== undefined && (e.name === '' || e.name !== e.name.trim() || /[*+#]$|\s{2}/.test(e.name))) {
          problems.push(`${id}: name "${e.name}"`);
        }
        if (e.dataType !== undefined && !/^([A-Z][A-Z0-9]{1,3}|varies)$/.test(e.dataType)) problems.push(`${id}: data type "${e.dataType}"`);
        if (e.opt !== undefined && !OPTS.has(e.opt)) problems.push(`${id}: opt "${e.opt}"`);
        if (e.max !== undefined && e.max !== '*' && !(Number.isInteger(e.max) && Number(e.max) >= 1)) problems.push(`${id}: max "${e.max}"`);
      });
    }
    expect(problems).toEqual([]);
  });

  it.runIf(!HAS_FIELD_HISTORY)('is empty: no sources and no fields', () => {
    expect(file.sources).toEqual([]);
    expect(file.fields).toEqual({});
  });
});

describe('getFieldVersion', () => {
  it.runIf(HAS_FIELD_HISTORY)('matches hl7-fields.json in v2.9', () => {
    const problems: string[] = [];
    for (const f of allFields) {
      const v = getFieldVersion(f.segment, f.field, '2.9');
      const max = f.max === '*' ? '*' : Number(f.max);
      if (!v) problems.push(`${f.id}: missing`);
      else {
        if (v.name !== f.name) problems.push(`${f.id}: name "${v.name}" / "${f.name}"`);
        if (v.dataType !== f.dataType) problems.push(`${f.id}: data type ${v.dataType} / ${f.dataType}`);
        if (String(v.max) !== String(max)) problems.push(`${f.id}: max ${v.max} / ${max}`);
        if ((v.opt === 'R') !== f.min >= 1) problems.push(`${f.id}: opt ${v.opt} / min ${f.min}`);
        if (!v.exists) problems.push(`${f.id}: does not exist in v2.9`);
      }
    }
    expect(problems).toEqual([]);
  });

  it.runIf(HAS_FIELD_HISTORY)('gives full facts for each entry, and lists what changed', () => {
    const problems: string[] = [];
    for (const f of allFields) {
      const raw = getFieldHistory(f.segment, f.field) ?? [];
      const states = getFieldVersion(f.segment, f.field, '2.9')?.states ?? [];
      if (states.length !== raw.length) problems.push(`${f.id}: ${states.length} states, ${raw.length} entries`);
      states.forEach((s, i) => {
        if (s.from !== raw[i]?.from) problems.push(`${f.id}: state ${i}`);
        if (s.name === '' || s.dataType === '') problems.push(`${f.id} v${s.from}: empty fact`);
        const changed = i === 0 ? [] : (['name', 'dataType', 'opt', 'max'] as const).filter((k) => raw[i]?.[k] !== undefined);
        if (s.changed.join() !== changed.join()) problems.push(`${f.id} v${s.from}: changed ${s.changed.join()}`);
      });
    }
    expect(problems).toEqual([]);
  });

  it.runIf(!HAS_FIELD_HISTORY)('has nothing without the field history', () => {
    for (const f of allFields) {
      expect(getFieldHistory(f.segment, f.field), f.id).toBeUndefined();
      for (const v of VERSIONS) expect(getFieldVersion(f.segment, f.field, v), `${f.id} v${v}`).toBeUndefined();
    }
  });

  it('returns nothing for unknown input, without throwing', () => {
    expect(getFieldVersion('ZZZ', 1, '2.5')).toBeUndefined();
    expect(getFieldVersion('NTE', 3, '2.5')).toBeUndefined();
    expect(getFieldVersion('PID', 41, '2.9')).toBeUndefined();
    expect(getFieldVersion('PID', 0, '2.5')).toBeUndefined();
    expect(getFieldVersion('PID', 1.5, '2.5')).toBeUndefined();
    expect(getFieldVersion('PID', Number.NaN, '2.5')).toBeUndefined();
    expect(getFieldVersion('PID', 8, '2.2')).toBeUndefined();
    expect(getFieldVersion('PID', 8, '2.10')).toBeUndefined();
    expect(getFieldVersion('PID', 8, 'abc')).toBeUndefined();
    expect(getFieldVersion('PID', 8, '')).toBeUndefined();
    expect(getFieldVersion('PID', 8, undefined as unknown as string)).toBeUndefined();
    expect(getFieldVersion('pid', 8, '2.5')).toBeUndefined();
    expect(getFieldVersion('__proto__', 1, '2.5')).toBeUndefined();
    expect(getFieldVersion('constructor', 1, '2.5')).toBeUndefined();
    expect(getFieldHistory('ZZZ', 1)).toBeUndefined();
    expect(getFieldHistory('PID', 0)).toBeUndefined();
    expect(getFieldHistory('hasOwnProperty', 1)).toBeUndefined();
  });

  it('accepts spaces around the version', () => {
    expect(getFieldVersion('PID', 8, ' 2.3 ')).toBe(getFieldVersion('PID', 8, '2.3'));
  });
});

describe('hasFieldFacts', () => {
  it('is true for v2.9 in both cases, and for every version with the field history', () => {
    for (const v of VERSIONS) expect(hasFieldFacts(v), v).toBe(HAS_FIELD_HISTORY || v === '2.9');
    expect(hasFieldFacts(' 2.9 ')).toBe(true);
  });

  it('is false for versions the tool does not explain, without throwing', () => {
    for (const v of ['2.2', '2.10', '', 'abc', '2.9.1', undefined, null as unknown as string, 2.9 as unknown as string]) {
      expect(hasFieldFacts(v), String(v)).toBe(false);
    }
  });
});

describe('getFieldDoc with a version', () => {
  it('keeps the field list values without a version', () => {
    const doc = getFieldDoc('PID', 8);
    expect(doc?.name).toBe('Administrative Sex');
    expect(doc?.version).toBeUndefined();
    expect(doc?.factsVersion).toBeUndefined();
    expect(doc?.exists).toBeUndefined();
  });

  it('keeps the explanation in every version, and says which version the facts are from', () => {
    const base = getFieldDoc('PID', 8)!;
    for (const v of VERSIONS) {
      const doc = getFieldDoc('PID', 8, v)!;
      expect(doc.version, v).toBe(v);
      expect(doc.factsVersion, v).toBe(hasFieldFacts(v) ? v : '2.9');
      expect(doc.summary, v).toEqual(base.summary);
      expect(doc.versionNote, v).toEqual(base.versionNote);
      expect(doc.latestName, v).toBe(base.name);
      expect(getFieldDoc('PID', 8, v), v).toBe(doc);
    }
  });

  it('gives the v2.9 facts for v2.9, with and without the field history', () => {
    const doc = getFieldDoc('PID', 3, '2.9');
    expect(doc).toMatchObject({ name: 'Patient Identifier List', dataType: 'CX', min: 1, max: '*', repeats: true, version: '2.9', factsVersion: '2.9', exists: true });
  });

  it.runIf(!HAS_FIELD_HISTORY)('without the field history, gives the v2.9 facts for every version, and no optionality', () => {
    const problems: string[] = [];
    for (const f of allFields) {
      const base = getFieldDoc(f.segment, f.field)!;
      for (const v of VERSIONS) {
        const doc = getFieldDoc(f.segment, f.field, v);
        const where = `${f.id} v${v}`;
        if (!doc) {
          problems.push(`${where}: missing`);
          continue;
        }
        for (const key of ['name', 'dataType', 'min', 'max', 'repeats', 'since', 'nameAr', 'summary'] as const) {
          if (JSON.stringify(doc[key]) !== JSON.stringify(base[key])) problems.push(`${where}: ${key}`);
        }
        if (doc.factsVersion !== '2.9') problems.push(`${where}: factsVersion ${doc.factsVersion}`);
        if (doc.opt !== undefined) problems.push(`${where}: opt ${doc.opt}`);
        // Whether the field exists comes from the explanation's "since".
        const exists = base.since === undefined || compareVersions(base.since, v) <= 0;
        if (doc.exists !== exists) problems.push(`${where}: exists ${doc.exists}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it.runIf(HAS_FIELD_HISTORY)('with the field history, gives the facts of that version', () => {
    const problems: string[] = [];
    for (const f of allFields) {
      for (const v of VERSIONS) {
        const doc = getFieldDoc(f.segment, f.field, v)!;
        const fv = getFieldVersion(f.segment, f.field, v)!;
        if (doc.factsVersion !== v || doc.name !== fv.name || doc.dataType !== fv.dataType || doc.opt !== fv.opt || doc.max !== fv.max) {
          problems.push(`${f.id} v${v}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('returns undefined for a version the tool does not explain', () => {
    expect(getFieldDoc('PID', 8, '2.2')).toBeUndefined();
    expect(getFieldDoc('PID', 8, 'x')).toBeUndefined();
    expect(getFieldDoc('PID', 8, '')).toBeUndefined();
    expect(getFieldDoc('PID', 8, null as unknown as string)).toBeUndefined();
    expect(getFieldDoc('ZZZ', 1, '2.3')).toBeUndefined();
  });
});

describe('getComponentDoc with a version', () => {
  it('uses the data type of the doc for that version', () => {
    expect(getComponentDoc('MSH', 7, 1, undefined, '2.9')).toBeUndefined(); // DTM has no components
    expect(getComponentDoc('MSH', 12, 1, undefined, '2.9')).toBeUndefined(); // VID: no names
    for (const v of VERSIONS) {
      const type = getFieldDoc('PID', 5, v)!.dataType;
      const names = partNamesType('PID', 5, v);
      if (type !== 'CM') expect(names, v).toEqual({ dataType: type });
    }
  });

  it.runIf(!HAS_FIELD_HISTORY)('without the field history, gives the v2.9 component names for every version', () => {
    for (const f of allFields.filter((_, i) => i % 3 === 0)) {
      for (const v of VERSIONS) {
        expect(partNamesType(f.segment, f.field, v), `${f.id} v${v}`).toEqual(partNamesType(f.segment, f.field));
        for (const comp of [1, 2, 4]) {
          expect(getComponentDoc(f.segment, f.field, comp, undefined, v), `${f.id}.${comp} v${v}`).toEqual(getComponentDoc(f.segment, f.field, comp));
        }
      }
    }
  });

  it('keeps the names without a version', () => {
    expect(partNamesType('PID', 5)).toEqual({ dataType: 'XPN' });
    expect(partNamesType('PID', 5, '9.9')).toBeUndefined();
  });
});

describe('dataTypeKind', () => {
  it('tells composite, primitive and unknown data types apart', () => {
    expect(dataTypeKind('XPN')).toBe('composite');
    expect(dataTypeKind('TS')).toBe('composite');
    expect(dataTypeKind('IS')).toBe('primitive');
    expect(dataTypeKind('DTM')).toBe('primitive');
    expect(dataTypeKind('CM')).toBe('unknown');
    expect(dataTypeKind('VID')).toBe('unknown');
    expect(dataTypeKind('varies')).toBeUndefined();
    expect(dataTypeKind('')).toBeUndefined();
    expect(dataTypeKind('constructor')).toBe('unknown');
  });
});
