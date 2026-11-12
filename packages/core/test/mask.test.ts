// SPDX-License-Identifier: MPL-2.0
// Copyright 2026 Hisham Alrashdan (InfoGleam)

import { describe, expect, it } from 'vitest';
import { MASKED_FIELDS, maskMessage, parseMessage, serializeMessage } from '../src/index.js';
import type { ParsedMessage } from '../src/index.js';
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
      'PID-19',
      'NK1-2',
      'NK1-4',
      'NK1-5',
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
    expect(pid.fields[2]?.value).toBe(
      'MASK0001^^^DEMOHOSP&DEMO HOSPITAL&L^MR~MASK0002^^^DEMOHOSP&DEMO HOSPITAL&L^PI',
    );
    expect(pid.fields[4]?.value).toBe('MASKED^PATIENT');
    expect(pid.fields[6]?.value).toBe('19000101');
    expect(pid.fields[10]?.value).toBe('1 MASKED ST^^MASKED CITY');
    expect(pid.fields[12]?.value).toBe('555-0100~555-0100');
    expect(pid.fields[18]?.value).toBe('000-00-0000');
    expect(nk1.fields[1]?.value).toBe('MASKED^RELATIVE');
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
