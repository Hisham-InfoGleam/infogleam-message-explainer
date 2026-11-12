// SPDX-License-Identifier: MPL-2.0
// Copyright 2026 Hisham Alrashdan (InfoGleam)

import { describe, expect, it } from 'vitest';
import { parseMessage, serializeMessage, terminatorName } from '../src/index.js';
import { readSample, withTerminator } from './helpers.js';

const adt = readSample('adt-a01.hl7');
const oru = readSample('oru-r01.hl7');

describe('samples', () => {
  it('use a single CR between segments', () => {
    for (const s of [adt, oru]) {
      expect(s).toContain('\r');
      expect(s).not.toContain('\n');
    }
  });

  it('parses the ADT^A01 sample', () => {
    const m = parseMessage(adt);
    expect(m.segments.map((s) => s.name)).toEqual(['MSH', 'EVN', 'PID', 'NK1', 'PV1']);
    expect(m.terminator).toBe('\r');
    expect(m.warnings).toEqual([]);
    const msh = m.segments[0]!;
    expect(msh.fields.find((f) => f.position === 9)?.value).toBe('ADT^A01^ADT_A01');
    const pid = m.segments[2]!;
    expect(pid.fields[4]?.position).toBe(5);
    expect(pid.fields[4]?.value).toBe('TEST^PATIENT^ONE');
  });

  it('parses the ORU^R01 sample', () => {
    const m = parseMessage(oru);
    expect(m.segments.map((s) => s.name)).toEqual(['MSH', 'PID', 'OBR', 'OBX', 'OBX', 'NTE']);
    const obx = m.segments.filter((s) => s.name === 'OBX');
    expect(obx.map((s) => s.occurrence)).toEqual([1, 2]);
    expect(obx[1]?.fields[4]?.value).toBe('4.1');
    expect(obx[1]?.fields[5]?.value).toBe('mmol/L');
  });
});

describe('round trip', () => {
  const cases: [string, string][] = [
    ['CR', '\r'],
    ['LF', '\n'],
    ['CRLF', '\r\n'],
  ];

  for (const [name, term] of cases) {
    it(`is byte-exact for ${name}`, () => {
      for (const sample of [adt, oru]) {
        const input = withTerminator(sample, term);
        const m = parseMessage(input);
        expect(terminatorName(m.terminator)).toBe(name);
        expect(m.mixedTerminators).toBe(false);
        expect(serializeMessage(m)).toBe(input);
      }
    });
  }

  it('keeps a missing final terminator', () => {
    const input = adt.replace(/\r$/, '');
    expect(serializeMessage(parseMessage(input))).toBe(input);
  });

  it('keeps blank lines and mixed terminators', () => {
    const input = '\r\nMSH|^~\\&|A|B\r\n\r\nPID|1||X\nOBX|1|ST|C||D|';
    const m = parseMessage(input);
    expect(m.segments.map((s) => s.name)).toEqual(['MSH', 'PID', 'OBX']);
    expect(m.mixedTerminators).toBe(true);
    expect(m.warnings).toEqual(['mixed-terminators', 'non-cr-terminator']);
    expect(serializeMessage(m)).toBe(input);
  });

  it('keeps empty trailing fields', () => {
    const input = 'MSH|^~\\&|A||||\rPID|||||\r';
    expect(serializeMessage(parseMessage(input))).toBe(input);
  });
});

describe('MSH numbering', () => {
  const m = parseMessage(adt);
  const msh = m.segments[0]!;
  const field = (n: number) => msh.fields.find((f) => f.position === n);

  it('MSH-1 is the field separator', () => {
    expect(field(1)?.value).toBe('|');
  });

  it('MSH-2 holds the encoding characters as written', () => {
    expect(field(2)?.value).toBe('^~\\&');
    expect(field(2)?.repetitions).toHaveLength(1);
    expect(field(2)?.repetitions[0]?.components).toHaveLength(1);
  });

  it('MSH-3 is the sending application', () => {
    expect(field(3)?.value).toBe('DEMO_APP');
    expect(field(10)?.value).toBe('MSG00001');
    expect(field(12)?.value).toBe('2.5.1');
  });

  it('other segments start at field 1 after the name', () => {
    const evn = m.segments[1]!;
    expect(evn.fields[0]?.position).toBe(1);
    expect(evn.fields[0]?.value).toBe('A01');
  });

  it('reads delimiters from MSH', () => {
    expect(m.delimiters).toMatchObject({
      field: '|',
      component: '^',
      repetition: '~',
      escape: '\\',
      subComponent: '&',
      truncation: '',
      encodingCharacters: '^~\\&',
    });
  });

  it('keeps the v2.7 truncation character', () => {
    const t = parseMessage('MSH|^~\\&#|A|B\rPID|1\r');
    expect(t.delimiters.truncation).toBe('#');
    expect(t.delimiters.encodingCharacters).toBe('^~\\&#');
  });

  it('uses other delimiters when MSH says so', () => {
    const t = parseMessage('MSH*:!/$*APP*FAC\rPID*1**ID1:X!ID2:Y**A$B:C\r');
    const pid = t.segments[1]!;
    expect(t.delimiters.field).toBe('*');
    expect(pid.fields[2]?.repetitions.map((r) => r.components[0]?.value)).toEqual(['ID1', 'ID2']);
    expect(pid.fields[4]?.repetitions[0]?.components[0]?.subComponents).toEqual(['A', 'B']);
  });

  it('warns when MSH is missing', () => {
    const t = parseMessage('PID|1||X\r');
    expect(t.warnings).toEqual(['no-msh']);
    expect(t.segments[0]?.fields[2]?.value).toBe('X');
  });
});

describe('repetitions and sub-components', () => {
  const pid = parseMessage(adt).segments[2]!;
  const pid3 = pid.fields[2]!;

  it('splits repetitions', () => {
    expect(pid3.position).toBe(3);
    expect(pid3.repetitions).toHaveLength(2);
    expect(pid3.repetitions[0]?.components[0]?.value).toBe('TEST0001');
    expect(pid3.repetitions[1]?.components[0]?.value).toBe('TEST0002');
    expect(pid3.repetitions[1]?.index).toBe(2);
  });

  it('splits components', () => {
    const comps = pid3.repetitions[0]!.components;
    expect(comps.map((c) => c.value)).toEqual([
      'TEST0001',
      '',
      '',
      'DEMOHOSP&DEMO HOSPITAL&L',
      'MR',
    ]);
    expect(comps[4]?.position).toBe(5);
  });

  it('splits sub-components', () => {
    const comp4 = pid3.repetitions[0]!.components[3]!;
    expect(comp4.subComponents).toEqual(['DEMOHOSP', 'DEMO HOSPITAL', 'L']);
  });

  it('splits repeated phone numbers', () => {
    const pid13 = pid.fields[12]!;
    expect(pid13.repetitions.map((r) => r.components[0]?.value)).toEqual(['555-0100', '555-0101']);
  });
});
