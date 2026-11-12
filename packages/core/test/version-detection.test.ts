// SPDX-License-Identifier: MPL-2.0
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// The HL7 version in MSH-12, in many forms, and what the tool does with it.

import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  fieldVersionWarning,
  getFieldDoc,
  messageVersion,
  parseMessage,
  versionSupport,
  type VersionSupport,
} from '../src/index.js';

/** A short made-up message with the given MSH-12 text. */
function withVersion(msh12: string, delimiters = '|^~\\&'): string {
  const [f, c, r, e, s] = [...delimiters];
  return `MSH${f}${c}${r}${e}${s}${f}DEMO_APP${f}DEMO${f}DEMO_RECEIVER${f}DEMO${f}20261108093000${f}${f}ADT${c}A01${f}MSG00001${f}P${f}${msh12}\rPID${f}1\r`;
}

interface Case {
  msh12: string;
  version: string | undefined;
  support: VersionSupport;
}

const CASES: Case[] = [
  { msh12: '2.3', version: '2.3', support: 'supported' },
  { msh12: '2.3.1', version: '2.3.1', support: 'supported' },
  { msh12: '2.4', version: '2.4', support: 'supported' },
  { msh12: '2.5', version: '2.5', support: 'supported' },
  { msh12: '2.5.1', version: '2.5.1', support: 'supported' },
  { msh12: '2.6', version: '2.6', support: 'supported' },
  { msh12: '2.7', version: '2.7', support: 'supported' },
  { msh12: '2.7.1', version: '2.7.1', support: 'supported' },
  { msh12: '2.8', version: '2.8', support: 'supported' },
  { msh12: '2.8.1', version: '2.8.1', support: 'supported' },
  { msh12: '2.8.2', version: '2.8.2', support: 'supported' },
  { msh12: '2.9', version: '2.9', support: 'supported' },
  // VID has more components: the country and the international version.
  { msh12: '2.5.1^USA', version: '2.5.1', support: 'supported' },
  { msh12: '2.4^USA^2.4', version: '2.4', support: 'supported' },
  { msh12: '2.3~2.4', version: '2.3', support: 'supported' },
  { msh12: ' 2.4 ', version: '2.4', support: 'supported' },
  { msh12: '\t2.6', version: '2.6', support: 'supported' },
  { msh12: '2.2', version: '2.2', support: 'older' },
  { msh12: '2.1', version: '2.1', support: 'older' },
  { msh12: '2.0', version: '2.0', support: 'older' },
  { msh12: '', version: undefined, support: 'unknown' },
  { msh12: ' ', version: undefined, support: 'unknown' },
  { msh12: '^USA', version: undefined, support: 'unknown' },
  { msh12: '2.10', version: '2.10', support: 'unknown' },
  { msh12: '3.0', version: '3.0', support: 'unknown' },
  { msh12: '2.9.1', version: '2.9.1', support: 'unknown' },
  { msh12: '2.5.0', version: '2.5.0', support: 'unknown' },
  { msh12: 'v2.5', version: 'v2.5', support: 'unknown' },
  { msh12: 'V2.5', version: 'V2.5', support: 'unknown' },
  { msh12: '2,5', version: '2,5', support: 'unknown' },
  { msh12: '25', version: '25', support: 'unknown' },
  { msh12: 'abc', version: 'abc', support: 'unknown' },
  // The sub-component separator is not split in MSH-12.
  { msh12: '2.5.1&x', version: '2.5.1&x', support: 'unknown' },
];

describe('messageVersion and versionSupport', () => {
  for (const c of CASES) {
    it(`MSH-12 "${c.msh12}" is ${c.version ?? 'no version'} (${c.support})`, () => {
      const m = parseMessage(withVersion(c.msh12));
      expect(messageVersion(m)).toBe(c.version);
      expect(versionSupport(messageVersion(m))).toBe(c.support);
    });
  }

  it('reads MSH-12 with other delimiters', () => {
    const m = parseMessage(withVersion('2.5.1!USA', '#!@$%'));
    expect(messageVersion(m)).toBe('2.5.1');
  });

  it('has no version when MSH is missing or too short', () => {
    expect(messageVersion(parseMessage('PID|1|||||||||||2.5'))).toBeUndefined();
    expect(messageVersion(parseMessage('MSH|^~\\&|DEMO'))).toBeUndefined();
    expect(messageVersion(parseMessage(''))).toBeUndefined();
  });

  it('uses the first MSH when a message has more than one', () => {
    const text = withVersion('2.3') + withVersion('2.9');
    expect(messageVersion(parseMessage(text))).toBe('2.3');
  });

  it('versionSupport accepts undefined and spaces', () => {
    expect(versionSupport(undefined)).toBe('unknown');
    expect(versionSupport('  2.5.1  ')).toBe('supported');
    expect(versionSupport(' 2.2 ')).toBe('older');
  });
});

describe('compareVersions', () => {
  const ORDER = ['2.0', '2.1', '2.2', '2.3', '2.3.1', '2.4', '2.5', '2.5.1', '2.6', '2.7', '2.7.1', '2.8', '2.8.1', '2.8.2', '2.9', '2.10', '3.0'];

  it('puts the versions in the right order', () => {
    const shuffled = [...ORDER].reverse();
    expect(shuffled.sort(compareVersions)).toEqual(ORDER);
  });

  it('is a consistent order for every pair', () => {
    for (const a of ORDER) {
      for (const b of ORDER) {
        const ab = compareVersions(a, b);
        expect(ab + compareVersions(b, a), `${a} ${b}`).toBe(0);
        expect(ab === 0, `${a} ${b}`).toBe(a === b);
        expect(ab, `${a} ${b}`).toBe(Math.sign(ORDER.indexOf(a) - ORDER.indexOf(b)));
      }
    }
  });

  it('treats a missing part as 0, and text as 0', () => {
    expect(compareVersions('2.5', '2.5.0')).toBe(0);
    expect(compareVersions(' 2.5 ', '2.5')).toBe(0);
    expect(compareVersions('', '0')).toBe(0);
    expect(compareVersions('abc', '0')).toBe(0);
    expect(compareVersions('2.x', '2.0')).toBe(0);
    expect(compareVersions('2.10', '2.9')).toBe(1);
  });

  it('never throws', () => {
    for (const a of ['', ' ', '.', '..', 'v2', '2..5', '-1', '1e3', '9'.repeat(400)]) {
      expect(() => compareVersions(a, '2.5'), a).not.toThrow();
    }
  });
});

describe('fieldVersionWarning', () => {
  const obx20 = getFieldDoc('OBX', 20); // added in 2.6

  it('the test field is from v2.6', () => {
    expect(obx20?.since).toBe('2.6');
  });

  const cases: [string | undefined, 'added-later' | undefined][] = [
    ['2.3', 'added-later'],
    ['2.3.1', 'added-later'],
    ['2.5.1', 'added-later'],
    [' 2.5 ', 'added-later'],
    ['2.2', 'added-later'],
    ['2.1', 'added-later'],
    ['2.6', undefined],
    ['2.6.0', undefined],
    ['2.7', undefined],
    ['2.9', undefined],
    ['2.10', undefined],
    ['', undefined],
    [' ', undefined],
    [undefined, undefined],
    ['abc', undefined],
    ['v2.5', undefined],
    ['2.5.1^USA', undefined],
    ['2.5.1&x', undefined],
    ['2.', undefined],
  ];

  for (const [version, want] of cases) {
    it(`message version ${JSON.stringify(version)} gives ${want ?? 'no warning'}`, () => {
      expect(fieldVersionWarning(obx20, version)).toBe(want);
    });
  }

  it('gives no warning for fields that exist in v2.3, in any version', () => {
    for (const v of ['2.0', '2.2', '2.3', '2.9']) expect(fieldVersionWarning(getFieldDoc('PID', 5), v)).toBeUndefined();
  });

  it('works for table codes and for missing input', () => {
    expect(fieldVersionWarning({ since: '2.4' }, '2.3')).toBe('added-later');
    expect(fieldVersionWarning({ since: '2.4' }, '2.4')).toBeUndefined();
    expect(fieldVersionWarning({}, '2.3')).toBeUndefined();
    expect(fieldVersionWarning({ since: '' }, '2.3')).toBeUndefined();
    expect(fieldVersionWarning(undefined, '2.3')).toBeUndefined();
  });

  it('agrees with "exists" of getFieldDoc for every field and version', () => {
    const problems: string[] = [];
    for (const v of ['2.3', '2.3.1', '2.4', '2.5', '2.5.1', '2.6', '2.7', '2.7.1', '2.8', '2.8.1', '2.8.2', '2.9']) {
      for (const seg of ['MSH', 'EVN', 'PID', 'PV1', 'NK1', 'ORC', 'OBR', 'OBX', 'AL1', 'DG1']) {
        for (let f = 1; getFieldDoc(seg, f); f++) {
          const doc = getFieldDoc(seg, f, v)!;
          const warn = fieldVersionWarning(getFieldDoc(seg, f), v) === 'added-later';
          if (warn !== !doc.exists) problems.push(`${seg}-${f} v${v}: warning ${warn}, exists ${doc.exists}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
