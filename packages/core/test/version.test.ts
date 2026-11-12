// SPDX-License-Identifier: MPL-2.0
// Copyright 2026 Hisham Alrashdan (InfoGleam)

import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  fieldVersionWarning,
  getFieldDoc,
  messageVersion,
  parseMessage,
  versionSupport,
} from '../src/index.js';

describe('compareVersions', () => {
  it('compares each part as a number', () => {
    expect(compareVersions('2.3', '2.4')).toBe(-1);
    expect(compareVersions('2.4', '2.3')).toBe(1);
    expect(compareVersions('2.5.1', '2.5.1')).toBe(0);
    expect(compareVersions('2.8.2', '2.9')).toBe(-1);
    expect(compareVersions('2.10', '2.9')).toBe(1);
  });

  it('puts a point release after its base version', () => {
    expect(compareVersions('2.3', '2.3.1')).toBe(-1);
    expect(compareVersions('2.3.1', '2.4')).toBe(-1);
    expect(compareVersions('2.5.1', '2.5')).toBe(1);
    expect(compareVersions('2.7.1', '2.8')).toBe(-1);
    expect(compareVersions('2.8.1', '2.8.2')).toBe(-1);
  });

  it('treats a missing part as 0', () => {
    expect(compareVersions('2.5', '2.5.0')).toBe(0);
    expect(compareVersions(' 2.6 ', '2.6')).toBe(0);
  });

  it('sorts a list of versions', () => {
    const list = ['2.9', '2.3.1', '2.5', '2.8.2', '2.3', '2.5.1', '2.7.1', '2.10'];
    expect([...list].sort(compareVersions)).toEqual(['2.3', '2.3.1', '2.5', '2.5.1', '2.7.1', '2.8.2', '2.9', '2.10']);
  });
});

describe('versionSupport', () => {
  it('supports 2.3 to 2.9', () => {
    for (const v of ['2.3', '2.3.1', '2.4', '2.5', '2.5.1', '2.6', '2.7', '2.7.1', '2.8', '2.8.1', '2.8.2', '2.9']) {
      expect(versionSupport(v), v).toBe('supported');
    }
  });

  it('calls 2.0, 2.1 and 2.2 older', () => {
    for (const v of ['2.0', '2.1', '2.2']) expect(versionSupport(v), v).toBe('older');
  });

  it('does not know other values', () => {
    for (const v of ['', '3', '2', '2.10', '2.5.2', 'abc', '2.5.1.x']) expect(versionSupport(v), v).toBe('unknown');
    expect(versionSupport(undefined)).toBe('unknown');
  });

  it('ignores spaces around the version', () => {
    expect(versionSupport(' 2.4 ')).toBe('supported');
  });
});

describe('messageVersion', () => {
  it('reads component 1 of MSH-12', () => {
    expect(messageVersion(parseMessage('MSH|^~\\&|A|B|C|D|20261108||ADT^A01|1|P|2.3\r'))).toBe('2.3');
    expect(messageVersion(parseMessage('MSH|^~\\&|A|B|C|D|20261108||ADT^A01|1|P|2.5.1^DEMO^1\r'))).toBe('2.5.1');
  });

  it('returns undefined when there is no version', () => {
    expect(messageVersion(parseMessage('MSH|^~\\&|A|B|C|D|20261108||ADT^A01|1|P\r'))).toBeUndefined();
    expect(messageVersion(parseMessage('MSH|^~\\&|A|B|C|D|20261108||ADT^A01|1|P||\r'))).toBeUndefined();
    expect(messageVersion(parseMessage('PID|1||TEST0001\r'))).toBeUndefined();
  });

  it('uses the delimiters from MSH', () => {
    expect(messageVersion(parseMessage('MSH*:!/$*A*B*C*D*20261108**ADT:A01*1*P*2.4:X\r'))).toBe('2.4');
  });
});

describe('fieldVersionWarning', () => {
  const obx20 = getFieldDoc('OBX', 20);

  it('uses a field that was added in v2.6', () => {
    expect(obx20?.since).toBe('2.6');
  });

  it('warns when the message version is older than the field', () => {
    expect(fieldVersionWarning(obx20, '2.3')).toBe('added-later');
    expect(fieldVersionWarning(obx20, '2.5.1')).toBe('added-later');
    expect(fieldVersionWarning(obx20, '2.2')).toBe('added-later');
  });

  it('does not warn for the same or a newer version', () => {
    expect(fieldVersionWarning(obx20, '2.6')).toBeUndefined();
    expect(fieldVersionWarning(obx20, '2.7')).toBeUndefined();
    expect(fieldVersionWarning(obx20, '2.9')).toBeUndefined();
  });

  it('does not warn when there is nothing to compare', () => {
    expect(fieldVersionWarning(getFieldDoc('OBX', 5), '2.3')).toBeUndefined();
    expect(fieldVersionWarning(undefined, '2.3')).toBeUndefined();
    expect(fieldVersionWarning(obx20, undefined)).toBeUndefined();
    expect(fieldVersionWarning(obx20, '')).toBeUndefined();
    expect(fieldVersionWarning(obx20, 'abc')).toBeUndefined();
  });

  it('also works for table codes', () => {
    const ambiguous = getFieldDoc('PID', 8)?.values?.find((v) => v.code === 'A');
    expect(ambiguous?.since).toBe('2.4');
    expect(fieldVersionWarning(ambiguous, '2.3')).toBe('added-later');
    expect(fieldVersionWarning(ambiguous, '2.4')).toBeUndefined();
  });

  it('warns when a table code was removed before the message version', () => {
    // OBX-2 (HL7 table 0125): CE and TS are in v2.3 to v2.5.1 only.
    const values = getFieldDoc('OBX', 2)?.values ?? [];
    for (const code of ['CE', 'TS']) {
      const value = values.find((v) => v.code === code);
      expect(value?.until, code).toBe('2.5.1');
      for (const v of ['2.3', '2.4', '2.5', '2.5.1', '2.2']) expect(fieldVersionWarning(value, v), `${code} ${v}`).toBeUndefined();
      for (const v of ['2.6', '2.7', '2.8.2', '2.9', ' 2.6 ']) expect(fieldVersionWarning(value, v), `${code} ${v}`).toBe('removed');
      expect(fieldVersionWarning(value, undefined)).toBeUndefined();
      expect(fieldVersionWarning(value, 'abc')).toBeUndefined();
    }
    // A code with no "until" never gets this warning.
    const nm = values.find((v) => v.code === 'NM');
    for (const v of ['2.3', '2.6', '2.9']) expect(fieldVersionWarning(nm, v)).toBeUndefined();
  });

  it('uses both ends of a code that has "since" and "until"', () => {
    const value = { since: '2.4', until: '2.6' };
    expect(fieldVersionWarning(value, '2.3')).toBe('added-later');
    expect(fieldVersionWarning(value, '2.4')).toBeUndefined();
    expect(fieldVersionWarning(value, '2.6')).toBeUndefined();
    expect(fieldVersionWarning(value, '2.7')).toBe('removed');
    expect(fieldVersionWarning({ until: '' }, '2.9')).toBeUndefined();
  });
});
