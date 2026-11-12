// SPDX-License-Identifier: MPL-2.0
// Copyright 2026 Hisham Alrashdan (InfoGleam)

import { describe, expect, it } from 'vitest';
import { fieldPath } from '../src/index.js';

describe('fieldPath', () => {
  it('builds a field path', () => {
    expect(fieldPath('PID', 5)).toEqual({
      label: 'PID-5',
      mirthPath: "msg['PID']['PID.5']",
    });
  });

  it('builds a component path', () => {
    expect(fieldPath('PID', 5, undefined, 1)).toEqual({
      label: 'PID-5.1',
      mirthPath: "msg['PID']['PID.5']['PID.5.1']",
    });
  });

  it('builds a sub-component path', () => {
    expect(fieldPath('PID', 3, 1, 4, 1)).toEqual({
      label: 'PID-3.4.1',
      mirthPath: "msg['PID']['PID.3']['PID.3.4']['PID.3.4.1']",
    });
  });

  it('adds a 0-based index for the second repetition', () => {
    expect(fieldPath('PID', 3, 2, 1)).toEqual({
      label: 'PID-3[2].1',
      mirthPath: "msg['PID']['PID.3'][1]['PID.3.1']",
    });
  });

  it('adds a 0-based index for a repeated segment', () => {
    expect(fieldPath('OBX', 5, undefined, 1, undefined, { segmentOccurrence: 2 })).toEqual({
      label: 'OBX-5.1',
      mirthPath: "msg['OBX'][1]['OBX.5']['OBX.5.1']",
    });
  });

  it('uses standard HL7 numbers for MSH', () => {
    expect(fieldPath('MSH', 3, undefined, 1).mirthPath).toBe("msg['MSH']['MSH.3']['MSH.3.1']");
    expect(fieldPath('MSH', 9, undefined, 2)).toEqual({
      label: 'MSH-9.2',
      mirthPath: "msg['MSH']['MSH.9']['MSH.9.2']",
    });
  });

  it('ignores components for MSH-1 and MSH-2', () => {
    expect(fieldPath('MSH', 1, undefined, 1)).toEqual({
      label: 'MSH-1',
      mirthPath: "msg['MSH']['MSH.1']",
    });
    expect(fieldPath('MSH', 2, 2, 1, 1).mirthPath).toBe("msg['MSH']['MSH.2']");
  });

  it('accepts Z-segments', () => {
    expect(fieldPath('ZPI', 1).mirthPath).toBe("msg['ZPI']['ZPI.1']");
  });

  it('rejects bad input', () => {
    expect(() => fieldPath('pid', 1)).toThrow(RangeError);
    expect(() => fieldPath('PID', 0)).toThrow(RangeError);
    expect(() => fieldPath('PID', 1.5)).toThrow(RangeError);
    expect(() => fieldPath('PID', 1, undefined, undefined, 1)).toThrow(RangeError);
  });
});
