// SPDX-License-Identifier: MPL-2.0
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// Rules that must hold for all the data in src/dictionary. Other tests
// check single facts; these check that the files fit together. The
// explanation texts change often, so these tests never check wording.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  dataTypeKind,
  DOCUMENTED_SEGMENTS,
  getDataTypeDoc,
  getFieldDoc,
  getFieldHistory,
  getFieldVersion,
  getSegmentDoc,
  HAS_FIELD_HISTORY,
  HISTORY_VERSIONS,
  MISSING_DATA_TYPES,
} from '../src/index.js';

const dictDir = fileURLToPath(new URL('../src/dictionary/', import.meta.url));

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(dictDir + name, 'utf8')) as T;
}

interface RawField {
  id: string;
  name: string;
  dataType: string;
  min: number | string;
  max: number | string;
  otherNames?: string[];
}
interface RawEntry {
  from: string;
  name?: string;
  dataType?: string;
  opt?: string;
  max?: number | string;
}
interface RawValue {
  code: string;
  en: string;
  ar: string;
  since?: string;
  until?: string;
}
interface RawFieldText {
  since?: string;
  example?: string;
  table?: string;
  values?: RawValue[];
}
interface RawSegmentText {
  segment: string;
  keyFields: string[];
  fields: Record<string, RawFieldText>;
}

const fieldList = readJson<{ segments: Record<string, { title: string; fields: RawField[] }> }>('hl7-fields.json');
const dataTypes = readJson<{
  dataTypes: Record<string, { components: { id: string; dataType: string }[] }>;
  missing: string[];
}>('hl7-datatypes.json');
const history = readJson<{ versions: string[]; fields: Record<string, RawEntry[]> }>('hl7-field-history.json');

const explanationFiles = readdirSync(dictDir + 'explanations').filter((f) => f.endsWith('.json'));
const explanations: Record<string, RawSegmentText> = Object.fromEntries(
  explanationFiles.map((f) => [f.replace(/\.json$/, ''), readJson<RawSegmentText>('explanations/' + f)]),
);

const allFields = Object.entries(fieldList.segments).flatMap(([segment, info]) =>
  info.fields.map((f, i) => ({ segment, field: i + 1, raw: f })),
);

// Data types without components (the same list as in datatypes.ts).
const PRIMITIVES = new Set(['DT', 'DTM', 'FT', 'GTS', 'ID', 'IS', 'NM', 'SI', 'SNM', 'ST', 'TM', 'TX']);

// "varies" is OBX-5 (OBX-2 gives the type). CM is the general composite
// type of older versions; the tool has no names for its parts (see
// partNamesType in datatypes.ts).
const SPECIAL_TYPES = new Set(['varies', 'CM']);

function isKnownType(code: string): boolean {
  return (
    Object.hasOwn(dataTypes.dataTypes, code) ||
    dataTypes.missing.includes(code) ||
    PRIMITIVES.has(code) ||
    SPECIAL_TYPES.has(code)
  );
}

/** Every data type that some field has in some version. */
function fieldTypes(): Map<string, string[]> {
  const used = new Map<string, string[]>();
  const add = (code: string, where: string) => used.set(code, [...(used.get(code) ?? []), where]);
  for (const f of allFields) add(f.raw.dataType, `${f.raw.id} (v2.9 list)`);
  for (const [id, entries] of Object.entries(history.fields)) {
    for (const e of entries) if (e.dataType !== undefined) add(e.dataType, `${id} v${e.from}`);
  }
  return used;
}

describe('hl7-fields.json', () => {
  it('numbers the fields of each segment 1, 2, 3, ... with no gaps', () => {
    for (const [segment, info] of Object.entries(fieldList.segments)) {
      expect(segment).toMatch(/^[A-Z][A-Z0-9]{2}$/);
      expect(info.title.trim(), segment).not.toBe('');
      expect(info.fields.map((f) => f.id)).toEqual(info.fields.map((_, i) => `${segment}-${i + 1}`));
    }
  });

  it('has a name, a data type and valid min and max for every field', () => {
    const problems: string[] = [];
    for (const { raw } of allFields) {
      if (raw.name.trim() === '') problems.push(`${raw.id}: no name`);
      if (raw.dataType === '') problems.push(`${raw.id}: no data type`);
      if (!Number.isInteger(raw.min) || Number(raw.min) < 0 || Number(raw.min) > 1) problems.push(`${raw.id}: min ${raw.min}`);
      if (raw.max !== '*' && !(Number.isInteger(raw.max) && Number(raw.max) >= 1)) problems.push(`${raw.id}: max ${raw.max}`);
      for (const other of raw.otherNames ?? []) {
        if (other.trim() === '' || other === raw.name) problems.push(`${raw.id}: other name "${other}"`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('has the same segments as the explanation files and DOCUMENTED_SEGMENTS', () => {
    const segments = Object.keys(fieldList.segments).sort();
    expect(Object.keys(explanations).sort()).toEqual(segments);
    expect([...DOCUMENTED_SEGMENTS].sort()).toEqual(segments);
    for (const s of segments) expect(getSegmentDoc(s)?.fieldCount, s).toBe(fieldList.segments[s]!.fields.length);
  });
});

describe('field history', () => {
  it('has an explanation for every field', () => {
    const problems: string[] = [];
    for (const { raw, segment } of allFields) {
      if (!Object.hasOwn(explanations[segment]?.fields ?? {}, raw.id)) problems.push(`${raw.id}: no explanation`);
    }
    expect(problems).toEqual([]);
  });

  it.runIf(HAS_FIELD_HISTORY)('has a history for every field, when the history file has fields', () => {
    const problems: string[] = [];
    for (const { segment, field, raw } of allFields) {
      if (!getFieldHistory(segment, field)?.length) problems.push(`${raw.id}: no history`);
    }
    expect(problems).toEqual([]);
  });

  it('only lists changes: each later entry changes at least one fact to a new value', () => {
    const problems: string[] = [];
    for (const [id, entries] of Object.entries(history.fields)) {
      const state: Record<string, unknown> = {};
      entries.forEach((e, i) => {
        let changed = false;
        for (const fact of ['name', 'dataType', 'opt', 'max'] as const) {
          if (e[fact] === undefined) continue;
          if (i > 0 && state[fact] === e[fact]) problems.push(`${id} v${e.from}: ${fact} is the same as before`);
          else changed = true;
          state[fact] = e[fact];
        }
        if (i > 0 && !changed) problems.push(`${id} v${e.from}: nothing changed`);
      });
    }
    expect(problems).toEqual([]);
  });

  it('starts each field in a known version and keeps the entries in version order', () => {
    const problems: string[] = [];
    for (const [id, entries] of Object.entries(history.fields)) {
      const versions = entries.map((e) => e.from);
      if (versions.some((v) => !HISTORY_VERSIONS.includes(v))) problems.push(`${id}: unknown version in ${versions.join(', ')}`);
      const sorted = [...versions].sort(compareVersions);
      if (sorted.join() !== versions.join()) problems.push(`${id}: not in version order`);
      if (new Set(versions).size !== versions.length) problems.push(`${id}: a version is listed twice`);
    }
    expect(problems).toEqual([]);
  });

  it('keeps a withdrawn field withdrawn (W is never followed by another rule)', () => {
    const problems: string[] = [];
    for (const { segment, field, raw } of allFields) {
      const states = getFieldVersion(segment, field, '2.9')?.states ?? [];
      const firstW = states.findIndex((s) => s.opt === 'W');
      if (firstW !== -1 && states.slice(firstW).some((s) => s.opt !== 'W')) problems.push(raw.id);
    }
    expect(problems).toEqual([]);
  });
});

describe('data types', () => {
  it('knows every data type that a field has in any version', () => {
    const unknown = [...fieldTypes()].filter(([code]) => !isKnownType(code)).map(([code, where]) => `${code}: ${where.slice(0, 5).join(', ')}`);
    expect(unknown).toEqual([]);
  });

  it('knows every data type that a component has', () => {
    const problems: string[] = [];
    for (const [code, type] of Object.entries(dataTypes.dataTypes)) {
      for (const c of type.components) {
        if (c.dataType !== '' && !isKnownType(c.dataType)) problems.push(`${c.id} (${code}): ${c.dataType}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('lists as missing only data types that are used and not described', () => {
    const used = fieldTypes();
    const componentTypes = new Set(Object.values(dataTypes.dataTypes).flatMap((t) => t.components.map((c) => c.dataType)));
    for (const code of MISSING_DATA_TYPES) {
      expect(Object.hasOwn(dataTypes.dataTypes, code), code).toBe(false);
      expect(PRIMITIVES.has(code), code).toBe(false);
      expect(used.has(code) || componentTypes.has(code), `${code} is not used`).toBe(true);
    }
    expect(new Set(MISSING_DATA_TYPES).size).toBe(MISSING_DATA_TYPES.length);
  });

  it('gives each kind of data type the right answer from dataTypeKind and getDataTypeDoc', () => {
    for (const code of fieldTypes().keys()) {
      const kind = dataTypeKind(code);
      if (code === 'varies') expect(kind).toBeUndefined();
      else if (PRIMITIVES.has(code)) expect(kind, code).toBe('primitive');
      else if (Object.hasOwn(dataTypes.dataTypes, code)) {
        expect(kind, code).toBe('composite');
        expect(getDataTypeDoc(code)?.components.length, code).toBeGreaterThan(0);
      } else expect(kind, code).toBe('unknown');
    }
  });

  it('has no primitive data type with components', () => {
    for (const code of PRIMITIVES) expect(Object.hasOwn(dataTypes.dataTypes, code), code).toBe(false);
  });
});

describe('the v2.9 view and the field list', () => {
  it('getFieldDoc with version 2.9 gives the same facts as without a version', () => {
    const problems: string[] = [];
    for (const { segment, field, raw } of allFields) {
      const base = getFieldDoc(segment, field);
      const v29 = getFieldDoc(segment, field, '2.9');
      if (!base || !v29) {
        problems.push(`${raw.id}: missing`);
        continue;
      }
      for (const key of ['id', 'name', 'dataType', 'min', 'max', 'repeats', 'summary', 'since', 'table'] as const) {
        if (JSON.stringify(base[key]) !== JSON.stringify(v29[key])) problems.push(`${raw.id}: ${key} differs`);
      }
      if (v29.exists !== true) problems.push(`${raw.id}: does not exist in v2.9`);
      if (v29.latestName !== base.name) problems.push(`${raw.id}: latestName`);
    }
    expect(problems).toEqual([]);
  });
});

describe('explanation files', () => {
  it('use only field ids of their own segment', () => {
    const problems: string[] = [];
    for (const [segment, doc] of Object.entries(explanations)) {
      if (doc.segment !== segment) problems.push(`${segment}.json: segment "${doc.segment}"`);
      for (const id of Object.keys(doc.fields)) {
        if (!id.startsWith(segment + '-') || !getFieldDoc(segment, Number(id.slice(4)))) problems.push(`${segment}.json: ${id}`);
      }
      if (new Set(doc.keyFields).size !== doc.keyFields.length) problems.push(`${segment}.json: a key field is listed twice`);
    }
    expect(problems).toEqual([]);
  });

  it('have unique codes in each list of values', () => {
    const problems: string[] = [];
    for (const doc of Object.values(explanations)) {
      for (const [id, f] of Object.entries(doc.fields)) {
        const codes = (f.values ?? []).map((v) => v.code);
        const twice = codes.filter((c, i) => codes.indexOf(c) !== i);
        if (twice.length > 0) problems.push(`${id}: ${twice.join(', ')}`);
        for (const c of codes) if (c !== c.trim()) problems.push(`${id}: code "${c}" has spaces around it`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('give each code a "since" that is a known version and not before the field exists', () => {
    const problems: string[] = [];
    for (const doc of Object.values(explanations)) {
      for (const [id, f] of Object.entries(doc.fields)) {
        // The first version of the field (its own "since"; the history agrees, see below).
        const first = f.since ?? '2.3';
        for (const v of f.values ?? []) {
          if (v.since === undefined) continue;
          if (!HISTORY_VERSIONS.includes(v.since)) problems.push(`${id} ${v.code}: since "${v.since}" is not a known version`);
          else if (compareVersions(v.since, first) < 0) problems.push(`${id} ${v.code}: since ${v.since}, but ${id} exists only from ${first}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('give each code an "until" that is a known version, not before its "since" and not before the field exists', () => {
    const problems: string[] = [];
    let count = 0;
    for (const doc of Object.values(explanations)) {
      for (const [id, f] of Object.entries(doc.fields)) {
        const first = f.since ?? '2.3';
        for (const v of f.values ?? []) {
          if (v.until === undefined) continue;
          count++;
          if (!HISTORY_VERSIONS.includes(v.until)) problems.push(`${id} ${v.code}: until "${v.until}" is not a known version`);
          else if (compareVersions(v.until, first) < 0) problems.push(`${id} ${v.code}: until ${v.until}, but ${id} exists only from ${first}`);
          else if (v.since !== undefined && compareVersions(v.until, v.since) < 0) problems.push(`${id} ${v.code}: until ${v.until} is before since ${v.since}`);
        }
      }
    }
    expect(problems).toEqual([]);
    // OBX-2: HL7 table 0125 has CE and TS up to v2.5.1.
    expect(count).toBe(2);
    const obx2 = explanations.OBX?.fields['OBX-2']?.values ?? [];
    expect(obx2.filter((v) => v.until !== undefined).map((v) => [v.code, v.until])).toEqual([
      ['CE', '2.5.1'],
      ['TS', '2.5.1'],
    ]);
  });

  it('give a field "since" that is a version after v2.3', () => {
    const problems: string[] = [];
    for (const doc of Object.values(explanations)) {
      for (const [id, f] of Object.entries(doc.fields)) {
        if (f.since === undefined) continue;
        if (!HISTORY_VERSIONS.includes(f.since) || f.since === HISTORY_VERSIONS[0]) problems.push(`${id}: since ${f.since}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it.runIf(HAS_FIELD_HISTORY)('give a field "since" only when the field is newer than v2.3, and then the same first version', () => {
    const problems: string[] = [];
    for (const [segment, doc] of Object.entries(explanations)) {
      for (const [id, f] of Object.entries(doc.fields)) {
        const first = getFieldVersion(segment, Number(id.slice(4)), '2.9')?.since;
        const expected = first === '2.3' ? undefined : first;
        if (f.since !== expected) problems.push(`${id}: since ${f.since ?? '(none)'}, history starts at ${first}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('have table numbers of 4 digits', () => {
    const problems: string[] = [];
    for (const doc of Object.values(explanations)) {
      for (const [id, f] of Object.entries(doc.fields)) {
        if (f.table !== undefined && !/^\d{4}$/.test(f.table)) problems.push(`${id}: table "${f.table}"`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('have examples that fit the field: one line, no field separator, no more parts than the data type has', () => {
    const problems: string[] = [];
    for (const [segment, doc] of Object.entries(explanations)) {
      for (const [id, f] of Object.entries(doc.fields)) {
        if (f.example === undefined) continue;
        const field = Number(id.slice(4));
        // MSH-1 and MSH-2 hold the delimiters themselves.
        if (segment === 'MSH' && field <= 2) continue;
        const ex = f.example;
        if (/[\r\n|]/.test(ex)) problems.push(`${id}: example has a line break or "|"`);
        // The facts of every version in the field history, or, without it,
        // the v2.9 facts of the field list.
        const latest = getFieldDoc(segment, field)!;
        const states = getFieldVersion(segment, field, '2.9')?.states ?? [{ max: latest.max, dataType: latest.dataType }];
        const reps = ex.split('~');
        if (reps.length > 1 && !states.some((s) => s.max !== 1)) problems.push(`${id}: example repeats, but the field never repeats`);
        const parts = Math.max(...reps.map((r) => r.split('^').length));
        const limit = Math.max(
          ...states.map((s) => {
            if (SPECIAL_TYPES.has(s.dataType) || dataTypes.missing.includes(s.dataType)) return Infinity;
            return getDataTypeDoc(s.dataType)?.components.length ?? 1;
          }),
        );
        if (parts > limit) problems.push(`${id}: example has ${parts} components, the data type has at most ${limit}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
