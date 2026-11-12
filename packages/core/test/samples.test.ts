// SPDX-License-Identifier: MPL-2.0
// Copyright 2026 Hisham Alrashdan (InfoGleam)

import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  fieldVersionWarning,
  getFieldDoc,
  maskMessage,
  messageVersion,
  parseMessage,
  serializeMessage,
  versionSupport,
} from '../src/index.js';
import type { HL7Segment, ParsedMessage, VersionSupport } from '../src/index.js';
import { readSample, withTerminator } from './helpers.js';

interface SampleCase {
  file: string;
  version: string;
  support: VersionSupport;
  segments: string[];
}

const CASES: SampleCase[] = [
  { file: 'v22-adt-a01.hl7', version: '2.2', support: 'older', segments: ['MSH', 'EVN', 'PID', 'PV1'] },
  { file: 'v23-adt-a01.hl7', version: '2.3', support: 'supported', segments: ['MSH', 'EVN', 'PID', 'NK1', 'PV1'] },
  { file: 'v24-orm-o01.hl7', version: '2.4', support: 'supported', segments: ['MSH', 'PID', 'PV1', 'ORC', 'OBR'] },
  { file: 'adt-a01.hl7', version: '2.5.1', support: 'supported', segments: ['MSH', 'EVN', 'PID', 'NK1', 'PV1'] },
  { file: 'oru-r01.hl7', version: '2.5.1', support: 'supported', segments: ['MSH', 'PID', 'OBR', 'OBX', 'OBX', 'NTE'] },
  {
    file: 'v251-oru-r01.hl7',
    version: '2.5.1',
    support: 'supported',
    segments: ['MSH', 'PID', 'PV1', 'ORC', 'OBR', 'OBX', 'OBX', 'OBX'],
  },
  {
    file: 'v27-oru-r01.hl7',
    version: '2.7',
    support: 'supported',
    segments: ['MSH', 'PID', 'PV1', 'ORC', 'OBR', 'OBX', 'OBX'],
  },
  { file: 'v28-adt-a08.hl7', version: '2.8', support: 'supported', segments: ['MSH', 'EVN', 'PID', 'PV1'] },
  { file: 'v29-adt-a04.hl7', version: '2.9', support: 'supported', segments: ['MSH', 'EVN', 'PID', 'PV1'] },
];

function seg(m: ParsedMessage, name: string, occurrence = 1): HL7Segment {
  const s = m.segments.find((x) => x.name === name && x.occurrence === occurrence);
  if (!s) throw new Error(`missing ${name} #${occurrence}`);
  return s;
}

function value(s: HL7Segment, field: number): string {
  return s.fields.find((f) => f.position === field)?.value ?? '';
}

function component(s: HL7Segment, field: number, comp: number, rep = 1): string {
  const f = s.fields.find((x) => x.position === field);
  return f?.repetitions[rep - 1]?.components[comp - 1]?.value ?? '';
}

/** Filled fields that the dictionary says are newer than the message version. */
function newerFields(m: ParsedMessage): string[] {
  const version = messageVersion(m);
  return m.segments.flatMap((s) =>
    s.fields
      .filter((f) => f.value !== '' && fieldVersionWarning(getFieldDoc(s.name, f.position), version))
      .map((f) => `${s.name}-${f.position}`),
  );
}

describe('sample files', () => {
  it('every file in samples/ has a test case', () => {
    const files = readdirSync(new URL('../../../samples/', import.meta.url)).filter((f) => f.endsWith('.hl7'));
    expect(files.sort()).toEqual(CASES.map((c) => c.file).sort());
  });

  for (const c of CASES) {
    describe(c.file, () => {
      const raw = readSample(c.file);
      const m = parseMessage(raw);

      it('uses a single CR after each segment', () => {
        expect(raw).not.toContain('\n');
        expect(raw.split('\r')).toHaveLength(c.segments.length + 1);
        expect(raw.endsWith('\r')).toBe(true);
      });

      it('parses without warnings', () => {
        expect(m.warnings).toEqual([]);
        expect(m.segments.map((s) => s.name)).toEqual(c.segments);
      });

      it('rebuilds byte-exact with CR, LF and CRLF', () => {
        expect(serializeMessage(m)).toBe(raw);
        for (const term of ['\n', '\r\n']) {
          const input = withTerminator(raw, term);
          expect(serializeMessage(parseMessage(input))).toBe(input);
        }
      });

      it(`has version ${c.version} (${c.support})`, () => {
        expect(messageVersion(m)).toBe(c.version);
        expect(versionSupport(messageVersion(m))).toBe(c.support);
      });

      it('masking keeps the line count and the terminator', () => {
        const out = serializeMessage(maskMessage(m).message);
        expect(out.split('\r')).toHaveLength(c.segments.length + 1);
        expect(out).not.toContain('\n');
      });
    });
  }
});

describe('version samples', () => {
  it('v2.2 is an older version', () => {
    const m = parseMessage(readSample('v22-adt-a01.hl7'));
    expect(value(seg(m, 'MSH'), 9)).toBe('ADT^A01');
    expect(newerFields(m)).toEqual([]);
  });

  it('v2.3 has a two-part MSH-9, EVN-1, PID-2 and PID-13', () => {
    const m = parseMessage(readSample('v23-adt-a01.hl7'));
    const msh9 = seg(m, 'MSH').fields.find((f) => f.position === 9);
    expect(msh9?.value).toBe('ADT^A01');
    expect(msh9?.repetitions[0]?.components).toHaveLength(2);
    expect(value(seg(m, 'EVN'), 1)).toBe('A01');
    expect(value(seg(m, 'PID'), 2)).toBe('TEST0002^^^DEMOHOSP');
    expect(value(seg(m, 'PID'), 13)).toBe('555-0100^PRN^PH');
  });

  it('v2.3 has one field from a later version, on purpose (EVN-7)', () => {
    const m = parseMessage(readSample('v23-adt-a01.hl7'));
    expect(newerFields(m)).toEqual(['EVN-7']);
  });

  it('v2.4 sends the priority in ORC-7 and OBR-27', () => {
    const m = parseMessage(readSample('v24-orm-o01.hl7'));
    const orc = seg(m, 'ORC');
    const obr = seg(m, 'OBR');
    expect(value(orc, 1)).toBe('NW');
    expect(component(orc, 7, 6)).toBe('S');
    expect(component(obr, 27, 6)).toBe('S');
    expect(value(orc, 7)).toBe(value(obr, 27));
    expect(component(orc, 2, 1)).toBe(component(obr, 2, 1));
  });

  it('v2.5.1 has OBR-14, OBR-15 and OBX-8 flags', () => {
    const m = parseMessage(readSample('v251-oru-r01.hl7'));
    const obr = seg(m, 'OBR');
    expect(value(obr, 14)).toBe('20261108083000');
    expect(value(obr, 15)).toBe('SER&Serum&HL70070');
    const obr15 = obr.fields.find((f) => f.position === 15);
    expect(obr15?.repetitions[0]?.components[0]?.subComponents).toEqual(['SER', 'Serum', 'HL70070']);
    expect([1, 2, 3].map((n) => value(seg(m, 'OBX', n), 8))).toEqual(['H', 'N', 'LL']);
  });

  it('v2.7 has a truncation character and coded values with text', () => {
    const m = parseMessage(readSample('v27-oru-r01.hl7'));
    expect(m.delimiters.encodingCharacters).toBe('^~\\&#');
    expect(m.delimiters.truncation).toBe('#');
    expect(value(seg(m, 'MSH'), 2)).toBe('^~\\&#');
    const pid = seg(m, 'PID');
    expect([1, 2, 3].map((n) => component(pid, 8, n))).toEqual(['F', 'Female', 'HL70001']);
    expect(component(seg(m, 'OBX'), 8, 1)).toBe('H');
    expect(component(seg(m, 'OBX'), 8, 2)).toBe('High');
    expect(value(seg(m, 'OBX', 2), 2)).toBe('CWE');
  });

  it('v2.8 sends phone and email in PID-40', () => {
    const m = parseMessage(readSample('v28-adt-a08.hl7'));
    const pid = seg(m, 'PID');
    expect(value(pid, 13)).toBe('');
    const pid40 = pid.fields.find((f) => f.position === 40);
    expect(pid40?.repetitions).toHaveLength(2);
    expect(component(pid, 40, 2, 1)).toBe('PRN');
    expect(component(pid, 40, 7, 1)).toBe('5550100');
    expect(component(pid, 40, 2, 2)).toBe('NET');
    expect(component(pid, 40, 4, 2)).toBe('test.patient@example.com');
    expect(value(seg(m, 'EVN'), 1)).toBe('');
  });

  it('v2.9 registers a patient, with two mistakes on purpose: PID-7 is not a real date, PV1-2 is empty', () => {
    const m = parseMessage(readSample('v29-adt-a04.hl7'));
    const msh = seg(m, 'MSH');
    expect(value(msh, 2)).toBe('^~\\&#');
    expect(value(msh, 9)).toBe('ADT^A04^ADT_A01');
    expect(value(seg(m, 'EVN'), 1)).toBe('');
    const pid = seg(m, 'PID');
    expect(value(pid, 7)).toBe('20010231');
    expect(value(pid, 8)).toBe('F^Female^HL70001^^^^2.9');
    expect([2, 7].map((n) => component(pid, 40, n))).toEqual(['PRN', '5550104']);
    expect(value(seg(m, 'PV1'), 2)).toBe('');
    expect(value(seg(m, 'PV1'), 44)).toBe('20261108135500');
  });

  it('only the v2.3 sample has fields newer than its version', () => {
    for (const c of CASES) {
      if (c.file === 'v23-adt-a01.hl7') continue;
      expect(newerFields(parseMessage(readSample(c.file))), c.file).toEqual([]);
    }
  });
});
