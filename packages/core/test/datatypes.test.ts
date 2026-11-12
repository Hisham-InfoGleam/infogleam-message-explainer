// SPDX-License-Identifier: MPL-2.0
// Copyright 2026 Hisham Alrashdan (InfoGleam)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getComponentDoc, getDataTypeDoc, MISSING_DATA_TYPES } from '../src/index.js';

const dictDir = fileURLToPath(new URL('../src/dictionary/', import.meta.url));

interface RawComponent {
  id: string;
  name: string;
  dataType: string;
  min: number;
  max: number | string;
}
interface DataTypeList {
  about: string;
  source: string;
  license: string;
  copyright: string;
  dataTypes: Record<string, { components: RawComponent[] }>;
  missing: string[];
}
interface FieldList {
  segments: Record<string, { fields: { id: string; dataType: string }[] }>;
}

const list = JSON.parse(readFileSync(dictDir + 'hl7-datatypes.json', 'utf8')) as DataTypeList;
const fields = JSON.parse(readFileSync(dictDir + 'hl7-fields.json', 'utf8')) as FieldList;

// Primitive data types have no components.
const PRIMITIVES = new Set(['DT', 'DTM', 'FT', 'GTS', 'ID', 'IS', 'NM', 'SI', 'SNM', 'ST', 'TM', 'TX']);

describe('hl7-datatypes.json', () => {
  it('names its source and license', () => {
    expect(list.source).toBe('https://github.com/HL7/v2-to-fhir (mappings/datatypes), commit 5e30516993');
    expect(list.license).toBe('Apache-2.0');
    expect(list.copyright).toBe('HL7 International');
    expect(list.about).not.toBe('');
  });

  it('has the corrections from the HL7 v2.9 data type tables', () => {
    expect(getDataTypeDoc('EIP')?.components.map((c) => c.dataType)).toEqual(['EI', 'EI']);
    expect(getDataTypeDoc('RI')?.components[0]).toMatchObject({ id: 'RI.1', dataType: 'CWE' });
    expect(getDataTypeDoc('CNN')?.components.slice(8).map((c) => c.name)).toEqual([
      'Assigning Authority - Namespace ID',
      'Assigning Authority - Universal ID',
      'Assigning Authority - Universal ID Type',
    ]);
    expect(getDataTypeDoc('DLN')?.components[0]?.name).toBe("Driver's License Number");
  });

  it('has well-formed components in order', () => {
    const problems: string[] = [];
    for (const [code, type] of Object.entries(list.dataTypes)) {
      if (type.components.length === 0) problems.push(`${code}: no components`);
      let last = 0;
      for (const c of type.components) {
        const m = /^([A-Z][A-Z0-9]{1,3})\.(\d+)$/.exec(c.id);
        if (!m || m[1] !== code) problems.push(`${code}: bad id ${c.id}`);
        const n = Number(m?.[2]);
        if (n <= last) problems.push(`${c.id}: out of order`);
        last = n;
        if (c.name.trim() === '' || c.name !== c.name.trim()) problems.push(`${c.id}: bad name`);
        if (c.dataType !== '' && !/^[A-Z][A-Z0-9]{1,3}$/.test(c.dataType)) problems.push(`${c.id}: data type "${c.dataType}"`);
        if (!Number.isInteger(c.min) || c.min < 0) problems.push(`${c.id}: min ${c.min}`);
        if (c.max !== '*' && (!Number.isInteger(c.max) || Number(c.max) < 1)) problems.push(`${c.id}: max ${c.max}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('covers every composite data type that the fields use', () => {
    const known = new Set([...Object.keys(list.dataTypes), ...list.missing, ...PRIMITIVES, '', 'varies']);
    const queue = Object.values(fields.segments).flatMap((s) => s.fields.map((f) => f.dataType));
    const unknown = new Set<string>();
    for (const code of queue) {
      if (!known.has(code)) unknown.add(code);
      for (const c of list.dataTypes[code]?.components ?? []) {
        if (!known.has(c.dataType)) unknown.add(c.dataType);
      }
    }
    expect([...unknown]).toEqual([]);
  });

  it('lists missing data types that it does not have', () => {
    expect(MISSING_DATA_TYPES).toEqual(list.missing);
    expect(MISSING_DATA_TYPES).toContain('VID');
    for (const code of MISSING_DATA_TYPES) expect(getDataTypeDoc(code), code).toBeUndefined();
  });
});

describe('getComponentDoc', () => {
  it('names the parts of a person name (XPN)', () => {
    expect(getComponentDoc('PID', 5, 1)).toEqual({ id: 'XPN.1', name: 'Family Name', dataType: 'FN', min: 0, max: 1 });
    expect(getComponentDoc('PID', 5, 2)).toMatchObject({ id: 'XPN.2', name: 'Given Name', dataType: 'ST' });
  });

  it('names the parts of an identifier (CX) and its assigning authority (HD)', () => {
    expect(getComponentDoc('PID', 3, 1)).toMatchObject({ id: 'CX.1', name: 'ID Number' });
    expect(getComponentDoc('PID', 3, 4)).toMatchObject({ id: 'CX.4', name: 'Assigning Authority', dataType: 'HD' });
    expect(getComponentDoc('PID', 3, 4, 1)).toMatchObject({ id: 'HD.1', name: 'Namespace ID', dataType: 'IS' });
    expect(getComponentDoc('PID', 3, 4, 3)).toMatchObject({ id: 'HD.3', name: 'Universal ID Type', dataType: 'ID' });
  });

  it('names the message type (MSG)', () => {
    expect(getComponentDoc('MSH', 9, 1)).toMatchObject({ id: 'MSG.1', name: 'Message Code' });
    expect(getComponentDoc('MSH', 9, 2)).toMatchObject({ id: 'MSG.2', name: 'Trigger Event' });
    expect(getComponentDoc('MSH', 9, 3)).toMatchObject({ id: 'MSG.3', name: 'Message Structure' });
  });

  it('names a location (PL) and coded values (CWE)', () => {
    expect(getComponentDoc('PV1', 3, 1)).toMatchObject({ id: 'PL.1', name: 'Point of Care', dataType: 'HD' });
    expect(getComponentDoc('OBX', 3, 1)).toMatchObject({ id: 'CWE.1', name: 'Identifier', dataType: 'ST' });
    expect(getComponentDoc('OBX', 3, 2)).toMatchObject({ id: 'CWE.2', name: 'Text', dataType: 'ST' });
  });

  it('names an address (XAD) and its street address (SAD)', () => {
    expect(getComponentDoc('PID', 11, 1)).toMatchObject({ id: 'XAD.1', name: 'Street Address', dataType: 'SAD' });
    expect(getComponentDoc('PID', 11, 1, 1)).toMatchObject({ id: 'SAD.1', name: 'Street or Mailing Address' });
    expect(getComponentDoc('PID', 11, 3)).toMatchObject({ id: 'XAD.3', name: 'City' });
  });

  it('keeps a withdrawn component without a data type', () => {
    expect(getComponentDoc('PID', 5, 6)).toMatchObject({ id: 'XPN.6', name: 'Degree (e.g., MD)', dataType: '' });
  });

  it('returns undefined for unknown data types and positions, without throwing', () => {
    expect(getComponentDoc('ZZZ', 1, 1)).toBeUndefined();
    expect(getComponentDoc('NTE', 3, 1)).toBeUndefined();
    expect(getComponentDoc('PID', 999, 1)).toBeUndefined();
    expect(getComponentDoc('PID', 5, 99)).toBeUndefined();
    expect(getComponentDoc('PID', 5, 0)).toBeUndefined();
    expect(getComponentDoc('PID', 5, 1.5)).toBeUndefined();
    expect(getComponentDoc('PID', 5, Number.NaN)).toBeUndefined();
    expect(getComponentDoc('PID', 5, 2, 1)).toBeUndefined(); // ST has no parts
    expect(getComponentDoc('PID', 3, 4, 99)).toBeUndefined();
    expect(getComponentDoc('MSH', 2, 1)).toBeUndefined(); // ST
    expect(getComponentDoc('MSH', 12, 1)).toBeUndefined(); // VID is missing in the source
    expect(getComponentDoc('OBX', 5, 1)).toBeUndefined(); // "varies"
    expect(getComponentDoc('__proto__', 1, 1)).toBeUndefined();
    expect(getComponentDoc('', 0, 0, 0)).toBeUndefined();
  });
});

describe('getDataTypeDoc', () => {
  it('returns the components of a data type', () => {
    const doc = getDataTypeDoc('HD');
    expect(doc?.code).toBe('HD');
    expect(doc?.components.map((c) => c.name)).toEqual(['Namespace ID', 'Universal ID', 'Universal ID Type']);
    expect(getDataTypeDoc('HD')).toBe(doc);
  });

  it('returns undefined for primitive and unknown types', () => {
    expect(getDataTypeDoc('ST')).toBeUndefined();
    expect(getDataTypeDoc('DTM')).toBeUndefined();
    expect(getDataTypeDoc('xpn')).toBeUndefined();
    expect(getDataTypeDoc('constructor')).toBeUndefined();
    expect(getDataTypeDoc('')).toBeUndefined();
  });
});
