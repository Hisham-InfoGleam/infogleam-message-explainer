// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// The field list under each segment, and the search box that filters it.

import { getComponentDoc, getFieldDoc, HAS_FIELD_HISTORY, parseMessage, type ParsedMessage } from '@infogleam/message-explainer-core';
import { describe, expect, it } from 'vitest';
import { filterGroups, hasParts, maskKey, segmentGroups, type FieldGroup } from '../src/lib/rows';
import { parsedSamples, randomMessage, SOME_VERSIONS } from './helpers';

function groupsOf(m: ParsedMessage, version: string): FieldGroup[][] {
  return m.segments.map((s) => segmentGroups(s, version));
}

function sample(id: string): ParsedMessage {
  return parsedSamples().find((s) => s.id === id)!.message;
}

describe('segmentGroups', () => {
  it('has one group for each filled field, in order, with the right rows', () => {
    const problems: string[] = [];
    const check = (m: ParsedMessage, version: string, where: string) => {
      for (const seg of m.segments) {
        const groups = segmentGroups(seg, version);
        const filled = seg.fields.filter((f) => f.value !== '');
        if (groups.map((g) => g.field.field).join() !== filled.map((f) => f.position).join()) {
          problems.push(`${where} ${seg.name}: groups do not match the filled fields`);
          continue;
        }
        const keys = new Set<string>();
        groups.forEach((g, i) => {
          const f = filled[i]!;
          const row = g.field;
          if (row.value !== f.value || row.level !== 0) problems.push(`${where} ${row.label}: field row`);
          if (row.fieldKey !== maskKey(seg.index, f.position)) problems.push(`${where} ${row.label}: field key`);
          if (row.fieldDoc !== getFieldDoc(seg.name, f.position, version)) problems.push(`${where} ${row.label}: doc`);
          if (!hasParts(seg, f) && g.parts.length > 0) problems.push(`${where} ${row.label}: parts without parts`);
          for (const r of [row, ...g.parts]) {
            if (keys.has(r.key)) problems.push(`${where}: key ${r.key} twice`);
            keys.add(r.key);
            if (r.value === '') problems.push(`${where} ${r.label}: empty row`);
            if (new Set(r.names).size !== r.names.length || r.names.includes('')) problems.push(`${where} ${r.label}: names`);
          }
          for (const p of g.parts) {
            const comp = f.repetitions[p.sel.rep - 1]?.components[p.sel.comp! - 1];
            const value = p.level === 1 ? comp?.value : comp?.subComponents[p.sel.sub! - 1];
            if (p.value !== value) problems.push(`${where} ${p.label}: value`);
            if (p.level === 2 && (comp?.subComponents.length ?? 0) < 2) problems.push(`${where} ${p.label}: a sub row for one sub-component`);
            const doc = getComponentDoc(seg.name, f.position, p.sel.comp!, p.level === 2 ? p.sel.sub : undefined, version);
            if (p.compDoc !== doc) problems.push(`${where} ${p.label}: component doc`);
          }
        });
      }
    };
    for (const { id, message } of parsedSamples()) for (const v of SOME_VERSIONS) check(message, v, `${id} v${v}`);
    for (let seed = 1; seed <= 100; seed++) check(parseMessage(randomMessage(seed).text), '2.5', `seed ${seed}`);
    expect(problems).toEqual([]);
  });

  it('searches the field name of the version, the v2.9 name and the Arabic name', () => {
    const m = sample('v23-adt-a01');
    for (const v of SOME_VERSIONS) {
      for (const g of segmentGroups(m.segments.find((s) => s.name === 'PID')!, v)) {
        const doc = g.field.fieldDoc!;
        const want = [...new Set([doc.name, doc.latestName, doc.nameAr].filter((n) => n !== undefined && n !== ''))];
        expect(g.field.names, `${g.field.label} v${v}`).toEqual(want);
        // The v2.9 name is always one of them.
        expect(g.field.names, `${g.field.label} v${v}`).toContain(getFieldDoc('PID', g.field.field)!.name);
      }
    }
  });

  it.runIf(!HAS_FIELD_HISTORY)('without the field history, has only the v2.9 name and the Arabic name in every version', () => {
    const m = sample('v23-adt-a01');
    for (const v of SOME_VERSIONS) {
      for (const g of segmentGroups(m.segments.find((s) => s.name === 'PID')!, v)) {
        const latest = getFieldDoc('PID', g.field.field)!;
        expect(g.field.names, `${g.field.label} v${v}`).toEqual([latest.name, latest.nameAr]);
      }
    }
  });

  it('does not split MSH-1 and MSH-2', () => {
    const msh = sample('v27-oru-r01').segments[0]!;
    expect(hasParts(msh, msh.fields[0]!)).toBe(false);
    expect(hasParts(msh, msh.fields[1]!)).toBe(false);
    const groups = segmentGroups(msh, '2.7');
    expect(groups[1]?.field).toMatchObject({ label: 'MSH-2', value: '^~\\&#' });
    expect(groups[1]?.parts).toEqual([]);
  });
});

describe('filterGroups', () => {
  const m = sample('adt-a01');
  const all = groupsOf(m, '2.5.1');
  const run = (q: string) => all.map((g) => filterGroups(g, q));
  const labels = (q: string) => run(q).flatMap((r) => r.groups.flatMap((g) => [g.field.label, ...g.parts.map((p) => p.label)]));
  const total = (q: string) => run(q).reduce((n, r) => n + r.matches, 0);

  it('shows everything, folded, for an empty search', () => {
    for (const q of ['', '   ']) {
      const r = run(q);
      expect(r.map((x) => x.groups.length)).toEqual(all.map((g) => g.length));
      expect(r.every((x) => x.groups.every((g) => !g.open))).toBe(true);
      expect(total(q)).toBe(0);
    }
  });

  it('finds a field by position, with all its parts folded', () => {
    const r = run('PID-3');
    const shown = r.flatMap((x) => x.groups);
    expect(shown.map((g) => g.field.label)).toEqual(['PID-3']);
    expect(shown[0]!.open).toBe(true);
    expect(shown[0]!.parts.length).toBeGreaterThan(1);
  });

  it('finds a component in every repetition', () => {
    expect(labels('PID-3.1')).toEqual(['PID-3', 'PID-3.1', 'PID-3[2].1']);
    expect(total('PID-3.1')).toBe(2);
    expect(labels('pid 3 4 1')).toContain('PID-3.4.1');
  });

  it('finds the fields of a segment, but not every part', () => {
    const r = run('PID');
    const pidGroups = r[m.segments.findIndex((s) => s.name === 'PID')]!.groups;
    expect(pidGroups.length).toBe(all[m.segments.findIndex((s) => s.name === 'PID')]!.length);
    expect(pidGroups.every((g) => !g.open)).toBe(true);
    expect(labels('PID').every((l) => l.startsWith('PID-'))).toBe(true);
  });

  it('finds fields and components by English and Arabic name', () => {
    expect(labels('Patient Name')).toContain('PID-5');
    expect(labels('family name')).toEqual(expect.arrayContaining(['PID-5.1']));
    expect(labels(getFieldDoc('PID', 5)!.nameAr!)).toContain('PID-5');
  });

  it('finds the v2.9 name in every version', () => {
    const v23 = sample('v23-adt-a01');
    const find = (version: string, q: string) =>
      groupsOf(v23, version).flatMap((g) => filterGroups(g, q).groups.map((x) => x.field.label));
    for (const v of SOME_VERSIONS) {
      expect(find(v, 'Administrative Sex'), v).toContain('PID-8');
      expect(find(v, 'Patient Identifier List'), v).toContain('PID-3');
    }
  });

  it('finds nothing for unknown text', () => {
    expect(labels('zzqqxx')).toEqual([]);
    expect(total('zzqqxx')).toBe(0);
    expect(labels('PID-99')).toEqual([]);
  });
});
