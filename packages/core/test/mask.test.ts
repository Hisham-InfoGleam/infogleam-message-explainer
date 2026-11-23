// SPDX-License-Identifier: MPL-2.0
// Copyright 2026 Hisham Alrashdan (InfoGleam)

import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MASK_RULES, MASKED_FIELDS, maskMessage, parseMessage, serializeMessage } from '../src/index.js';
import type { HL7Segment, ParsedMessage } from '../src/index.js';
import { readSample, withTerminator } from './helpers.js';

const adt = readSample('adt-a01.hl7');
const oru = readSample('oru-r01.hl7');

/** Map of "SEG#occurrence-field" to value, for comparing two messages. */
function fieldMap(m: ParsedMessage): Map<string, string> {
  const map = new Map<string, string>();
  for (const s of m.segments) {
    for (const f of s.fields) map.set(`${s.name}#${s.occurrence}-${f.position}`, f.value);
  }
  return map;
}

function value(seg: HL7Segment | undefined, field: number): string {
  return seg?.fields.find((f) => f.position === field)?.value ?? '';
}

/** A segment line with the given fields filled, and "KEEP" in field 1 when it is not given. */
function line(name: string, fields: [number, string][]): string {
  const last = Math.max(1, ...fields.map(([f]) => f));
  const values = Array.from({ length: last }, (_, i) => fields.find(([f]) => f === i + 1)?.[1] ?? '');
  if (!fields.some(([f]) => f === 1)) values[0] = 'KEEP';
  return [name, ...values].join('|');
}

const MSH = 'MSH|^~\\&|DEMO_APP|DEMO HOSPITAL|DEMO_RECEIVER|DEMO HOSPITAL|20261108093000||ADT^A40|MSG90001|P|2.9';

describe('maskMessage', () => {
  it('changes only the listed fields', () => {
    const before = parseMessage(adt);
    const { message: after, changes } = maskMessage(before);

    expect(changes.map((c) => c.label)).toEqual([
      'PID-3',
      'PID-5',
      'PID-7',
      'PID-11',
      'PID-13',
      'PID-14',
      'PID-18',
      'PID-19',
      'NK1-2',
      'NK1-4',
      'NK1-5',
      'PV1-19',
    ]);
    for (const c of changes) expect(MASKED_FIELDS).toContain(c.label);

    const a = fieldMap(before);
    const b = fieldMap(after);
    expect([...b.keys()]).toEqual([...a.keys()]);
    const changedKeys = [...a.keys()].filter((k) => a.get(k) !== b.get(k));
    expect(changedKeys).toEqual(
      changes.map((c) => `${c.segment}#${c.occurrence}-${c.field}`),
    );
  });

  it('uses fixed fake values', () => {
    const { message } = maskMessage(parseMessage(adt));
    const pid = message.segments[2]!;
    const nk1 = message.segments[3]!;
    const pv1 = message.segments[4]!;
    expect(pid.fields[2]?.value).toBe(
      'MASK0001^^^DEMOHOSP&DEMO HOSPITAL&L^MR~MASK0002^^^DEMOHOSP&DEMO HOSPITAL&L^PI',
    );
    expect(pid.fields[4]?.value).toBe('MASKED^PATIENT');
    expect(pid.fields[6]?.value).toBe('19000101');
    expect(pid.fields[10]?.value).toBe('1 MASKED ST^^MASKED CITY');
    expect(pid.fields[12]?.value).toBe('555-0100~555-0100');
    expect(value(pid, 18)).toBe('MASK0001');
    expect(pid.fields[18]?.value).toBe('000-00-0000');
    expect(nk1.fields[1]?.value).toBe('MASKED^RELATIVE');
    expect(value(pv1, 19)).toBe('MASK0001');
  });

  it('does not change the input', () => {
    const before = parseMessage(adt);
    maskMessage(before);
    expect(serializeMessage(before)).toBe(adt);
  });

  it('keeps the terminator and other segments byte-exact', () => {
    const input = withTerminator(oru, '\r\n');
    const { message, changes } = maskMessage(parseMessage(input));
    const out = serializeMessage(message);
    expect(changes.map((c) => c.label)).toEqual(['PID-3', 'PID-5', 'PID-7', 'PID-11', 'PID-13']);
    const inLines = input.split('\r\n');
    const outLines = out.split('\r\n');
    expect(outLines).toHaveLength(inLines.length);
    inLines.forEach((line, i) => {
      if (!line.startsWith('PID')) expect(outLines[i]).toBe(line);
    });
  });

  it('does not mask free text such as OBX-5 or NTE-3', () => {
    const { message } = maskMessage(parseMessage(oru));
    const out = serializeMessage(message);
    expect(out).toContain('OBX|1|NM|GLU^Glucose^L||95|');
    expect(out).toContain('NTE|1||Made-up result for testing only.');
  });

  it('does not mask other segments, for example PD1, GT1, IN1 and Z-segments', () => {
    const others = ['PD1|||QX DEMO CLINIC', 'GT1|1||QXGUARANTOR^ONE', 'IN1|1|QXPLAN|QXINSURER', 'ZPI|1|QXLOCAL'];
    const text = [MSH, line('PID', [[5, 'QXFAMILY^QXGIVEN']]), ...others].join('\r');
    const { message, changes } = maskMessage(parseMessage(text));
    expect(changes.map((c) => c.label)).toEqual(['PID-5']);
    const out = serializeMessage(message);
    for (const seg of others) expect(out).toContain(seg);
  });

  it('masks phone and email in PID-40 (v2.7 and later)', () => {
    const input = readSample('v28-adt-a08.hl7');
    const { message, changes } = maskMessage(parseMessage(input));
    expect(changes.map((c) => c.label)).toEqual(['PID-3', 'PID-5', 'PID-7', 'PID-11', 'PID-40']);
    const out = serializeMessage(message);
    expect(out).not.toContain('example.com');
    expect(out).not.toContain('5550100');
    expect(message.segments[2]?.fields[39]?.value).toBe('555-0100~555-0100');
  });

  it('leaves empty and null fields alone', () => {
    const { changes } = maskMessage(parseMessage('MSH|^~\\&|A\rPID|1||||""\r'));
    expect(changes).toEqual([]);
  });
});

describe('the masked fields', () => {
  // A made-up message with a value in every masked field: [field, value,
  // value after masking]. Each value that the mask replaces holds "QX", a
  // date or a 555 phone number, so a test can look for it. An ID keeps its
  // other components, for example the assigning authority (DEMOHOSP).
  const CASES: Record<string, [number, string, string][]> = {
    PID: [
      [2, 'QX02^^^DEMOHOSP', 'MASK0001^^^DEMOHOSP'],
      [3, 'QX03^^^DEMOHOSP^MR', 'MASK0001^^^DEMOHOSP^MR'],
      [4, 'QX04^^^DEMOHOSP', 'MASK0001^^^DEMOHOSP'],
      [5, 'QXFAMILY^QXGIVEN', 'MASKED^PATIENT'],
      [6, 'QXMAIDEN', 'MASKED^RELATIVE'],
      [7, '19800101', '19000101'],
      [9, 'QXALIAS^QXGIVEN', 'MASKED^PATIENT'],
      [11, '1 QX ST^^QX CITY^DS^00000', '1 MASKED ST^^MASKED CITY'],
      [13, '555-0101^PRN^PH', '555-0100'],
      [14, '555-0102^WPN^PH', '555-0100'],
      [18, 'QX18^^^DEMOHOSP', 'MASK0001^^^DEMOHOSP'],
      [19, 'QX19', '000-00-0000'],
      [20, 'QX20^DS^20301231', 'MASK0001^DS^20301231'],
      [21, 'QX21^^^DEMOHOSP', 'MASK0001^^^DEMOHOSP'],
      [23, 'QX TOWN', 'MASKED'],
      [29, '20261107120000', '19000101'],
      [40, '^NET^Internet^QX@example.com~^PRN^PH^^^^5550103', '555-0100~555-0100'],
    ],
    NK1: [
      [2, 'QXRELATIVE^QXGIVEN', 'MASKED^RELATIVE'],
      [4, '2 QX ST^^QX CITY', '1 MASKED ST^^MASKED CITY'],
      [5, '555-0104', '555-0100'],
      [6, '555-0105^WPN^PH', '555-0100'],
      [12, 'QX12^^^DEMOCORP', 'MASK0001^^^DEMOCORP'],
      [16, '19820202', '19000101'],
      [26, 'QXMAIDEN', 'MASKED^RELATIVE'],
      [30, 'QXCONTACT^QXGIVEN', 'MASKED^RELATIVE'],
      [31, '555-0106', '555-0100'],
      [32, '3 QX ST^^QX CITY', '1 MASKED ST^^MASKED CITY'],
      [33, 'QX33^^^DEMOHOSP', 'MASK0001^^^DEMOHOSP'],
      [37, 'QX37', '000-00-0000'],
      [38, 'QX VILLAGE', 'MASKED'],
      [40, '^PRN^PH^^^^5550107', '555-0100'],
      [41, '^NET^Internet^QX@example.com', '555-0100'],
    ],
    PV1: [
      [19, 'QX19^^^DEMOHOSP', 'MASK0001^^^DEMOHOSP'],
      [50, 'QX50^^^DEMOHOSP', 'MASK0001^^^DEMOHOSP'],
    ],
    MRG: [
      [1, 'QX01^^^DEMOHOSP^MR~QX01B^^^DEMOHOSP^PI', 'MASK0001^^^DEMOHOSP^MR~MASK0002^^^DEMOHOSP^PI'],
      [2, 'QX02^^^DEMOHOSP', 'MASK0001^^^DEMOHOSP'],
      [3, 'QX03^^^DEMOHOSP', 'MASK0001^^^DEMOHOSP'],
      [4, 'QX04^^^DEMOHOSP', 'MASK0001^^^DEMOHOSP'],
      [5, 'QX05^^^DEMOHOSP', 'MASK0001^^^DEMOHOSP'],
      [6, 'QX06^^^DEMOHOSP', 'MASK0001^^^DEMOHOSP'],
      [7, 'QXOLD^QXGIVEN', 'MASKED^PATIENT'],
    ],
  };
  const SEGMENTS = Object.keys(CASES);
  const text = [MSH, ...SEGMENTS.map((s) => line(s, CASES[s]!.map(([f, v]) => [f, v])))].join('\r') + '\r';

  it('the test cases are the masked fields', () => {
    const list = SEGMENTS.flatMap((s) => CASES[s]!.map(([f]) => `${s}-${f}`));
    expect(list).toEqual([...MASKED_FIELDS]);
    expect(Object.keys(MASK_RULES)).toEqual(['PID', 'NK1', 'PV1', 'MRG']);
  });

  it('masks every field in the list, with its fixed fake value', () => {
    const { message, changes } = maskMessage(parseMessage(text));
    expect(changes.map((c) => c.label)).toEqual([...MASKED_FIELDS]);
    for (const name of SEGMENTS) {
      const seg = message.segments.find((s) => s.name === name);
      for (const [field, , masked] of CASES[name]!) expect(value(seg, field), `${name}-${field}`).toBe(masked);
    }
    // Fields that are not in the list stay as they are.
    for (const name of ['PID', 'NK1', 'PV1']) expect(value(message.segments.find((s) => s.name === name), 1), name).toBe('KEEP');
    expect(serializeMessage(message).startsWith(MSH + '\r')).toBe(true);
  });

  it('leaves none of the replaced values in the text', () => {
    const out = serializeMessage(maskMessage(parseMessage(text)).message);
    expect(out).not.toContain('QX');
    for (const v of ['19800101', '19820202', '20261107120000', '555-0101', '555-0102', '555-0104', '555-0105', '555-0106', '5550103', '5550107']) {
      expect(out, v).not.toContain(v);
    }
    // The other parts of an ID stay, for example the assigning authority.
    expect(out).toContain('MASK0001^^^DEMOCORP');
    expect(out).toContain('MASK0001^DS^20301231');
  });

  it('reports each change with its segment, occurrence, field and label', () => {
    const { changes } = maskMessage(parseMessage(text));
    const mrg = changes.filter((c) => c.segment === 'MRG');
    expect(mrg.map((c) => c.label)).toEqual(['MRG-1', 'MRG-2', 'MRG-3', 'MRG-4', 'MRG-5', 'MRG-6', 'MRG-7']);
    expect(mrg.every((c) => c.segmentIndex === 4 && c.occurrence === 1)).toBe(true);
    const pv1 = changes.filter((c) => c.segment === 'PV1');
    expect(pv1.map((c) => [c.label, c.segmentIndex, c.field])).toEqual([
      ['PV1-19', 3, 19],
      ['PV1-50', 3, 50],
    ]);
  });

  it('keeps the count of the masked segments', () => {
    const two = [MSH, line('PV1', [[1, '1'], [19, 'QX19A']]), line('PV1', [[1, '2'], [19, 'QX19B']])].join('\r');
    const { message, changes } = maskMessage(parseMessage(two));
    expect(changes.map((c) => `${c.label}#${c.occurrence}`)).toEqual(['PV1-19#1', 'PV1-19#2']);
    expect(message.segments.map((s) => [s.name, s.occurrence, s.count])).toEqual([
      ['MSH', 1, 1],
      ['PV1', 1, 2],
      ['PV1', 2, 2],
    ]);
    expect(message.segments.map((s) => value(s, 19))).toEqual(['', 'MASK0001', 'MASK0001']);
  });

  it('skips empty and "" values, and keeps empty repetitions', () => {
    const empty = [
      MSH,
      line('NK1', [[1, '1'], [6, '""'], [12, '""'], [16, '~19820202']]),
      line('PV1', [[19, '""']]),
      line('MRG', [[1, '~QX01^^^DEMOHOSP'], [7, '""']]),
    ].join('\r');
    const { message, changes } = maskMessage(parseMessage(empty));
    expect(changes.map((c) => c.label)).toEqual(['NK1-16', 'MRG-1']);
    expect(value(message.segments[1], 6)).toBe('""');
    expect(value(message.segments[1], 12)).toBe('""');
    expect(value(message.segments[1], 16)).toBe('~19000101');
    expect(value(message.segments[2], 19)).toBe('""');
    expect(value(message.segments[3], 1)).toBe('~MASK0002^^^DEMOHOSP');
    expect(value(message.segments[3], 7)).toBe('""');
  });

  it('gives the same text when it masks twice', () => {
    const once = maskMessage(parseMessage(text));
    const twice = maskMessage(once.message);
    expect(twice.changes).toEqual([]);
    expect(serializeMessage(twice.message)).toBe(serializeMessage(once.message));
  });
});

describe('the samples after masking', () => {
  const files = readdirSync(new URL('../../../samples/', import.meta.url)).filter((f) => f.endsWith('.hl7'));

  /** Component 1 of the first repetition of a field, or ''. */
  function idNumber(seg: HL7Segment | undefined, field: number): string {
    return seg?.fields.find((f) => f.position === field)?.repetitions[0]?.components[0]?.value ?? '';
  }

  // Fields that some samples fill and that masking must replace.
  const FIELDS: [string, number][] = [
    ['PID', 2],
    ['PID', 18],
    ['PV1', 19],
  ];

  it('no longer keep the values of PID-2, PID-18 and PV1-19', () => {
    const filled = new Set<string>();
    for (const file of files) {
      const before = parseMessage(readSample(file));
      const out = serializeMessage(maskMessage(before).message);
      const after = parseMessage(out);
      for (const [name, field] of FIELDS) {
        const was = idNumber(before.segments.find((s) => s.name === name), field);
        if (was === '') continue;
        filled.add(`${name}-${field}`);
        expect(idNumber(after.segments.find((s) => s.name === name), field), `${file} ${name}-${field}`).toBe('MASK0001');
        expect(out, `${file} ${name}-${field}`).not.toContain(was);
      }
    }
    // The samples fill each of these fields at least once, so the test checks something.
    expect([...filled].sort()).toEqual(['PID-18', 'PID-2', 'PV1-19']);
  });
});
