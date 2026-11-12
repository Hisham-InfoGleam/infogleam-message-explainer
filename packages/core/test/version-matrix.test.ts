// SPDX-License-Identifier: MPL-2.0
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// Every field in every version. getFieldDoc, getFieldVersion,
// getComponentDoc and partNamesType must agree, and must never throw. The
// tests hold with and without the field history (hl7-field-history.json);
// a few run only in one of the two cases.

import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  dataTypeKind,
  DOCUMENTED_SEGMENTS,
  getComponentDoc,
  getDataTypeDoc,
  getFieldDoc,
  getFieldVersion,
  getSegmentDoc,
  HAS_FIELD_HISTORY,
  hasFieldFacts,
  HISTORY_VERSIONS,
  LATEST_VERSION,
  partNamesType,
} from '../src/index.js';

const fields = DOCUMENTED_SEGMENTS.flatMap((segment) => {
  const count = getSegmentDoc(segment)?.fieldCount ?? 0;
  return Array.from({ length: count }, (_, i) => ({ segment, field: i + 1, id: `${segment}-${i + 1}` }));
});

const BAD_VERSIONS = ['2.2', '2.1', '2.0', '2.10', '3.0', '', 'abc', '2', '2.', '.5', '2.5.1.x', 'v2.5', '2,5', '2.5.1^USA'];
const SPACED = [' 2.5 ', '2.5 ', '\t2.3.1', ' 2.9\n'];

describe('every field in every version', () => {
  it('has a doc with a version, the facts of the right version, and sound facts', () => {
    const problems: string[] = [];
    for (const { segment, field, id } of fields) {
      const latest = getFieldDoc(segment, field)!;
      for (const v of HISTORY_VERSIONS) {
        const doc = getFieldDoc(segment, field, v);
        const where = `${id} v${v}`;
        if (!doc) {
          problems.push(`${where}: missing`);
          continue;
        }
        if (doc.version !== v) problems.push(`${where}: version`);
        if (doc.factsVersion !== (hasFieldFacts(v) ? v : LATEST_VERSION)) problems.push(`${where}: factsVersion ${doc.factsVersion}`);
        if (doc.latestName !== latest.name) problems.push(`${where}: latestName`);
        // min is 0 or 1, and 1 exactly when the field is required (when the optionality is known).
        if (doc.min !== 0 && doc.min !== 1) problems.push(`${where}: min ${doc.min}`);
        if (doc.opt !== undefined && (doc.min === 1) !== (doc.opt === 'R')) problems.push(`${where}: min ${doc.min}, opt ${doc.opt}`);
        if (doc.repeats !== (doc.max === '*' || doc.max > 1)) problems.push(`${where}: repeats and max disagree`);
        if (doc.name.trim() === '' || doc.dataType === '') problems.push(`${where}: empty name or data type`);
      }
    }
    expect(problems).toEqual([]);
  });

  it.runIf(HAS_FIELD_HISTORY)('has the same facts in getFieldDoc and getFieldVersion', () => {
    const problems: string[] = [];
    for (const { segment, field, id } of fields) {
      for (const v of HISTORY_VERSIONS) {
        const fv = getFieldVersion(segment, field, v);
        const doc = getFieldDoc(segment, field, v);
        if (!fv || !doc) {
          problems.push(`${id} v${v}: missing`);
          continue;
        }
        const where = `${id} v${v}`;
        if (doc.version !== v || fv.version !== v) problems.push(`${where}: version`);
        if (doc.name !== fv.name) problems.push(`${where}: name`);
        if (doc.dataType !== fv.dataType) problems.push(`${where}: data type`);
        if (doc.max !== fv.max) problems.push(`${where}: max`);
        if (doc.repeats !== fv.repeats) problems.push(`${where}: repeats`);
        if (doc.opt !== fv.opt) problems.push(`${where}: opt`);
        if (doc.exists !== fv.exists) problems.push(`${where}: exists`);
        // min is 1 exactly when the field is required.
        if ((doc.min === 1) !== (doc.opt === 'R')) problems.push(`${where}: min ${doc.min}, opt ${doc.opt}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it.runIf(!HAS_FIELD_HISTORY)('without the field history, has the v2.9 facts in every version and no optionality', () => {
    const problems: string[] = [];
    for (const { segment, field, id } of fields) {
      const latest = getFieldDoc(segment, field)!;
      for (const v of HISTORY_VERSIONS) {
        const doc = getFieldDoc(segment, field, v)!;
        const where = `${id} v${v}`;
        if (doc.name !== latest.name || doc.dataType !== latest.dataType) problems.push(`${where}: name or data type`);
        if (doc.min !== latest.min || doc.max !== latest.max || doc.repeats !== latest.repeats) problems.push(`${where}: rules`);
        if (doc.opt !== undefined) problems.push(`${where}: opt`);
        if (getFieldVersion(segment, field, v) !== undefined) problems.push(`${where}: getFieldVersion`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('does not exist in versions before the field was added, and exists from then on', () => {
    const problems: string[] = [];
    for (const { segment, field, id } of fields) {
      // The first version: "since" of the explanation, or 2.3.
      const since = getFieldDoc(segment, field)!.since ?? HISTORY_VERSIONS[0]!;
      if (HAS_FIELD_HISTORY && getFieldVersion(segment, field, LATEST_VERSION)!.since !== since) problems.push(`${id}: since differs`);
      for (const v of HISTORY_VERSIONS) {
        const exists = getFieldDoc(segment, field, v)!.exists;
        const want = compareVersions(v, since) >= 0;
        if (exists !== want) problems.push(`${id} v${v}: exists ${exists}, added in ${since}`);
        if (HAS_FIELD_HISTORY && getFieldVersion(segment, field, v)!.since !== since) problems.push(`${id} v${v}: since differs`);
      }
    }
    expect(problems).toEqual([]);
  });

  it.runIf(HAS_FIELD_HISTORY)('uses the facts of the first version for a field that does not exist yet', () => {
    for (const { segment, field } of fields) {
      const first = getFieldVersion(segment, field, '2.9')!.states[0]!;
      for (const v of HISTORY_VERSIONS) {
        const fv = getFieldVersion(segment, field, v)!;
        if (fv.exists) continue;
        expect(fv).toMatchObject({ name: first.name, dataType: first.dataType, opt: first.opt, max: first.max });
      }
    }
  });

  it.runIf(HAS_FIELD_HISTORY)('gives the facts of the newest history entry at or before the version', () => {
    const problems: string[] = [];
    for (const { segment, field, id } of fields) {
      const states = getFieldVersion(segment, field, '2.9')!.states;
      for (const v of HISTORY_VERSIONS) {
        const state = [...states].reverse().find((s) => compareVersions(s.from, v) <= 0) ?? states[0]!;
        const fv = getFieldVersion(segment, field, v)!;
        if (fv.name !== state.name || fv.dataType !== state.dataType || fv.opt !== state.opt || fv.max !== state.max) {
          problems.push(`${id} v${v}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('agrees with partNamesType and getComponentDoc', () => {
    const problems: string[] = [];
    for (const { segment, field, id } of fields) {
      for (const v of HISTORY_VERSIONS) {
        const doc = getFieldDoc(segment, field, v)!;
        const names = partNamesType(segment, field, v);
        const where = `${id} v${v}`;
        if (!names) {
          problems.push(`${where}: no partNamesType`);
          continue;
        }
        if (doc.dataType !== 'CM') {
          if (names.dataType !== doc.dataType || names.from !== undefined) problems.push(`${where}: partNamesType ${names.dataType}`);
        } else if (names.from !== undefined) {
          // A CM field borrows names from a later named data type.
          if (compareVersions(names.from, v) <= 0) problems.push(`${where}: later type starts at ${names.from}`);
          if (dataTypeKind(names.dataType) !== 'composite') problems.push(`${where}: later type ${names.dataType} has no names`);
          const later = getFieldVersion(segment, field, names.from);
          if (later?.dataType !== names.dataType) problems.push(`${where}: v${names.from} has ${later?.dataType}`);
        }
        const typeDoc = getDataTypeDoc(names.dataType);
        const count = typeDoc?.components.length ?? 0;
        // Each component of the data type has a doc, and one past the end has none.
        for (let c = 1; c <= count; c++) {
          const comp = getComponentDoc(segment, field, c, undefined, v);
          if (comp?.id !== `${names.dataType}.${c}`) problems.push(`${where}.${c}: ${comp?.id}`);
        }
        if (getComponentDoc(segment, field, count + 1, undefined, v) !== undefined) problems.push(`${where}: component ${count + 1}`);
        // A sub-component name comes from the component's data type.
        for (const comp of typeDoc?.components ?? []) {
          const subType = getDataTypeDoc(comp.dataType);
          const n = Number(comp.id.split('.')[1]);
          const sub = getComponentDoc(segment, field, n, 1, v);
          if (subType && sub?.id !== `${comp.dataType}.1`) problems.push(`${where}.${n}.1: ${sub?.id}`);
          if (!subType && sub !== undefined) problems.push(`${where}.${n}.1: should have no name`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('gives the same component names with and without spaces around the version', () => {
    for (const { segment, field } of fields.filter((_, i) => i % 7 === 0)) {
      for (const v of HISTORY_VERSIONS) {
        expect(getFieldDoc(segment, field, ` ${v} `)?.name).toBe(getFieldDoc(segment, field, v)?.name);
        expect(partNamesType(segment, field, ` ${v} `)).toEqual(partNamesType(segment, field, v));
        expect(getComponentDoc(segment, field, 1, undefined, ` ${v} `)).toEqual(getComponentDoc(segment, field, 1, undefined, v));
      }
    }
  });
});

describe('bad versions', () => {
  it('give no result and never throw', () => {
    const problems: string[] = [];
    for (const { segment, field, id } of fields) {
      for (const v of BAD_VERSIONS) {
        try {
          if (getFieldVersion(segment, field, v) !== undefined) problems.push(`${id} "${v}": getFieldVersion`);
          if (getFieldDoc(segment, field, v) !== undefined) problems.push(`${id} "${v}": getFieldDoc`);
          if (partNamesType(segment, field, v) !== undefined) problems.push(`${id} "${v}": partNamesType`);
          if (getComponentDoc(segment, field, 1, undefined, v) !== undefined) problems.push(`${id} "${v}": getComponentDoc`);
          if (getComponentDoc(segment, field, 1, 1, v) !== undefined) problems.push(`${id} "${v}": getComponentDoc sub`);
        } catch (e) {
          problems.push(`${id} "${v}": threw ${String(e)}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('are read as the same version when there are only spaces around them', () => {
    for (const v of SPACED) {
      expect(getFieldDoc('PID', 8, v)?.version, JSON.stringify(v)).toBe(v.trim());
      if (HAS_FIELD_HISTORY) expect(getFieldVersion('PID', 8, v)?.version, JSON.stringify(v)).toBe(v.trim());
    }
  });

  it('do not throw for odd segment, field and component input', () => {
    const odd: [string, number, number, number | undefined][] = [
      ['PID', 0, 1, undefined],
      ['PID', -1, 1, undefined],
      ['PID', 1.5, 1, undefined],
      ['PID', Number.NaN, 1, undefined],
      ['PID', 5, 0, undefined],
      ['PID', 5, -1, undefined],
      ['PID', 5, 1.5, undefined],
      ['PID', 5, 1, 0],
      ['PID', 5, 1, Number.NaN],
      ['PID', 9999, 1, undefined],
      ['', 1, 1, undefined],
      ['toString', 1, 1, undefined],
      ['__proto__', 1, 1, undefined],
      ['ZZ1', 1, 1, 1],
    ];
    for (const [segment, field, comp, sub] of odd) {
      for (const v of [undefined, '2.5', '2.2', '']) {
        expect(() => getFieldDoc(segment, field, v)).not.toThrow();
        expect(() => getFieldVersion(segment, field, v ?? '2.9')).not.toThrow();
        expect(() => partNamesType(segment, field, v)).not.toThrow();
        expect(() => getComponentDoc(segment, field, comp, sub, v)).not.toThrow();
        expect(getComponentDoc(segment, field, comp, sub, v), `${segment} ${field} ${comp} ${sub} ${v}`).toBeUndefined();
      }
    }
  });
});
