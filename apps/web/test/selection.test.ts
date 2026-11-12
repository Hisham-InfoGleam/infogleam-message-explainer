// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// The part of the message that the explanation panel shows.

import {
  fieldPath,
  getComponentDoc,
  getFieldDoc,
  HAS_FIELD_HISTORY,
  hasFieldFacts,
  parseMessage,
  type HL7Segment,
  type ParsedMessage,
} from '@infogleam/message-explainer-core';
import { describe, expect, it } from 'vitest';
import { fieldCodes, fieldKeyOf, parsePartKey, partInfo, partKey, safePath, type Selection } from '../src/lib/selection';
import { parsedSamples, randomMessage, SOME_VERSIONS } from './helpers';

describe('partKey and parsePartKey', () => {
  const selections: Selection[] = [
    { seg: 0, field: 1, rep: 1 },
    { seg: 3, field: 5, rep: 1 },
    { seg: 3, field: 5, rep: 1, comp: 2 },
    { seg: 3, field: 5, rep: 3, comp: 2 },
    { seg: 12, field: 40, rep: 2, comp: 4, sub: 1 },
    { seg: 2999, field: 999, rep: 50, comp: 20, sub: 9 },
  ];

  it('write the documented format', () => {
    expect(partKey({ seg: 3, field: 5, rep: 1 })).toBe('3:5');
    expect(partKey({ seg: 3, field: 5, rep: 1, comp: 2 })).toBe('3:5:1:2');
    expect(partKey({ seg: 3, field: 5, rep: 1, comp: 2, sub: 1 })).toBe('3:5:1:2:1');
  });

  it('read back what they write', () => {
    for (const s of selections) {
      const back = parsePartKey(partKey(s));
      // A field key has no repetition: it reads back as repetition 1.
      const want = s.comp === undefined ? { ...s, rep: 1, comp: undefined, sub: undefined } : { ...s, sub: s.sub };
      expect(back).toEqual(want);
      expect(partKey(back!)).toBe(partKey(s));
    }
  });

  it('refuse keys that are not part keys', () => {
    for (const bad of [undefined, '', '1', '1:2:3', '1:2:3:4:5:6', 'a:b', '-1:2', '1.5:2', '1:2:x:4']) {
      expect(parsePartKey(bad), JSON.stringify(bad)).toBeUndefined();
    }
  });

  it('fieldKeyOf gives the key of the field', () => {
    expect(fieldKeyOf({ seg: 4, field: 3, rep: 2, comp: 1, sub: 2 })).toBe('4:3');
  });
});

describe('safePath', () => {
  const seg = (name: string, occurrence = 1): HL7Segment => ({ name, index: 0, occurrence, raw: name, after: '', fields: [] });

  it('gives the same result as fieldPath for good segment names', () => {
    expect(safePath(seg('OBX', 2), 5, 1, 1)).toEqual(fieldPath('OBX', 5, 1, 1, undefined, { segmentOccurrence: 2 }));
    expect(safePath(seg('PID'), 3, 2, 4, 1)).toEqual(fieldPath('PID', 3, 2, 4, 1));
  });

  it('never throws, and gives a label without a Mirth path for odd names', () => {
    for (const name of ['PI', 'PIDX', 'pid', '', 'Z-1', 'مري']) {
      const p = safePath(seg(name), 3, 2, 1, 4);
      expect(p).toEqual({ label: `${name}-3[2].1.4`, mirthPath: '' });
    }
    expect(safePath(seg('pid'), 3)).toEqual({ label: 'pid-3', mirthPath: '' });
  });
});

describe('fieldCodes', () => {
  it('gives component 1 of each filled repetition', () => {
    const m = parseMessage('MSH|^~\\&|A\rPID|1||A^x~~B&y^z~^only2');
    const f = m.segments[1]!.fields[2]!;
    expect(fieldCodes(f)).toEqual(['A', 'B&y']);
  });
});

/** Check partInfo for every part of a message. Returns the problems. */
function checkAllParts(m: ParsedMessage, version: string, where: string): string[] {
  const problems: string[] = [];
  for (const seg of m.segments) {
    for (const f of seg.fields) {
      const fieldSel = { seg: seg.index, field: f.position, rep: 1 };
      const info = partInfo(m, fieldSel, version);
      if (info?.value !== f.value) problems.push(`${where} ${partKey(fieldSel)}: field value`);
      if (info && info.fieldDoc !== getFieldDoc(seg.name, f.position, version)) problems.push(`${where} ${partKey(fieldSel)}: field doc`);
      if (info && info.compDoc !== undefined) problems.push(`${where} ${partKey(fieldSel)}: a field has no component doc`);
      for (const rep of f.repetitions) {
        for (const comp of rep.components) {
          const sel = { seg: seg.index, field: f.position, rep: rep.index, comp: comp.position };
          const ci = partInfo(m, sel, version);
          const key = `${where} ${partKey(sel)}`;
          if (!ci) {
            problems.push(`${key}: no info`);
            continue;
          }
          if (ci.value !== comp.value) problems.push(`${key}: value`);
          if (ci.path.label !== safePath(seg, f.position, rep.index, comp.position).label) problems.push(`${key}: label`);
          if (ci.compDoc !== getComponentDoc(seg.name, f.position, comp.position, undefined, version)) problems.push(`${key}: comp doc`);
          if (ci.fieldLabel !== safePath(seg, f.position).label) problems.push(`${key}: field label`);
          comp.subComponents.forEach((sub, s) => {
            const ssel = { ...sel, sub: s + 1 };
            const si = partInfo(m, ssel, version);
            if (si?.value !== sub) problems.push(`${key}.${s + 1}: value`);
            if (si && si.subDoc !== getComponentDoc(seg.name, f.position, comp.position, s + 1, version)) problems.push(`${key}.${s + 1}: sub doc`);
            if (si && si.compLabel !== ci.path.label) problems.push(`${key}.${s + 1}: component label`);
          });
          // One past the last sub-component does not exist.
          if (partInfo(m, { ...sel, sub: comp.subComponents.length + 1 }, version)) problems.push(`${key}: sub past the end`);
        }
        const last = rep.components.length + 1;
        if (partInfo(m, { seg: seg.index, field: f.position, rep: rep.index, comp: last }, version)) problems.push(`${where}: comp past the end`);
      }
      if (partInfo(m, { seg: seg.index, field: f.position, rep: f.repetitions.length + 1, comp: 1 }, version)) {
        problems.push(`${where}: repetition past the end`);
      }
    }
    if (partInfo(m, { seg: seg.index, field: seg.fields.length + 1, rep: 1 }, version)) problems.push(`${where}: field past the end`);
  }
  if (partInfo(m, { seg: m.segments.length, field: 1, rep: 1 }, version)) problems.push(`${where}: segment past the end`);
  return problems;
}

describe('partInfo', () => {
  it('describes every part of every sample, in several versions', () => {
    const problems: string[] = [];
    for (const { id, message } of parsedSamples()) {
      for (const v of SOME_VERSIONS) problems.push(...checkAllParts(message, v, `${id} v${v}`));
    }
    expect(problems).toEqual([]);
  });

  it('describes every part of random messages', () => {
    const problems: string[] = [];
    for (let seed = 1; seed <= 150; seed++) {
      const m = parseMessage(randomMessage(seed).text);
      problems.push(...checkAllParts(m, SOME_VERSIONS[seed % 3]!, `seed ${seed}`));
      if (problems.length > 10) break;
    }
    expect(problems).toEqual([]);
  });

  it('uses the doc of the version asked for, which says which version its facts are from', () => {
    const m = parsedSamples().find((s) => s.id === 'v23-adt-a01')!.message;
    const pid = m.segments.findIndex((s) => s.name === 'PID');
    for (const v of SOME_VERSIONS) {
      const doc = partInfo(m, { seg: pid, field: 8, rep: 1 }, v)?.fieldDoc;
      expect(doc, v).toBe(getFieldDoc('PID', 8, v));
      expect(doc?.version, v).toBe(v);
      expect(doc?.factsVersion, v).toBe(hasFieldFacts(v) ? v : '2.9');
    }
    expect(partInfo(m, { seg: pid, field: 8, rep: 1 }, '2.9')?.fieldDoc).toMatchObject({ name: 'Administrative Sex', dataType: 'CWE' });
    // The second OBX gets a Mirth path with index 1.
    const oru = parsedSamples().find((s) => s.id === 'oru-r01')!.message;
    const obx2 = oru.segments.findIndex((s) => s.name === 'OBX' && s.occurrence === 2);
    expect(partInfo(oru, { seg: obx2, field: 5, rep: 1, comp: 1 }, '2.5.1')?.path.mirthPath).toBe("msg['OBX'][1]['OBX.5']['OBX.5.1']");
  });

  it.runIf(!HAS_FIELD_HISTORY)('without the field history, shows the v2.9 names and component names in every version', () => {
    const m = parsedSamples().find((s) => s.id === 'v23-adt-a01')!.message;
    const pid = m.segments.findIndex((s) => s.name === 'PID');
    for (const v of SOME_VERSIONS) {
      expect(partInfo(m, { seg: pid, field: 8, rep: 1 }, v)?.fieldDoc).toMatchObject({ name: 'Administrative Sex', dataType: 'CWE', factsVersion: '2.9' });
      // MSH-9.1 gets the names of the v2.9 data type MSG.
      expect(partInfo(m, { seg: 0, field: 9, rep: 1, comp: 1 }, v)?.compDoc).toMatchObject({ id: 'MSG.1', name: 'Message Code' });
    }
  });

  it('works for a segment without explanations and with an odd name', () => {
    const m = parseMessage('MSH|^~\\&|A\rZZ1|x^y\rpi|z');
    expect(partInfo(m, { seg: 1, field: 1, rep: 1, comp: 2 }, '2.9')).toMatchObject({ value: 'y', fieldDoc: undefined, compDoc: undefined });
    expect(partInfo(m, { seg: 2, field: 1, rep: 1 }, '2.9')?.path).toEqual({ label: 'pi-1', mirthPath: '' });
  });
});
