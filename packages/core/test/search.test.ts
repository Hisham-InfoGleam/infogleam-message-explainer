// SPDX-License-Identifier: MPL-2.0
// Copyright 2026 Hisham Alrashdan (InfoGleam)

import { describe, expect, it } from 'vitest';
import { matchesSearch, normalizeSearchText, parsePositionQuery } from '../src/index.js';

const pid3 = { label: 'PID-3', names: ['Patient Identifier List', 'قائمة معرّفات المريض'] };
const pid5 = { label: 'PID-5', names: ['Patient Name', 'اسم المريض'] };
const pid30 = { label: 'PID-30', names: ['Patient Death Indicator'] };
const pid13 = { label: 'PID-13', names: ['Phone Number - Home'] };
const pid1 = { label: 'PID-1', names: ['Set ID - PID'] };
const msh7 = { label: 'MSH-7', names: ['Date/Time of Message', 'تاريخ ووقت الرسالة'] };

function filter(query: string, items: { label: string; names: string[] }[]): string[] {
  return items.filter((item) => matchesSearch(query, item)).map((item) => item.label);
}

describe('parsePositionQuery', () => {
  it('reads positions in many forms', () => {
    expect(parsePositionQuery('PID-3')).toBe('PID-3');
    expect(parsePositionQuery('pid 3')).toBe('PID-3');
    expect(parsePositionQuery('PID.3')).toBe('PID-3');
    expect(parsePositionQuery('pid3')).toBe('PID-3');
    expect(parsePositionQuery(' pid_03 ')).toBe('PID-3');
    expect(parsePositionQuery('PV1-3')).toBe('PV1-3');
    expect(parsePositionQuery('pv13')).toBe('PV1-3');
  });

  it('reads components, sub-components and segments', () => {
    expect(parsePositionQuery('pid-5.1')).toBe('PID-5.1');
    expect(parsePositionQuery('PID 3 4 1')).toBe('PID-3.4.1');
    expect(parsePositionQuery('PID-3[2].1')).toBe('PID-3.1');
    expect(parsePositionQuery('obx')).toBe('OBX');
    expect(parsePositionQuery('PID-')).toBe('PID');
    expect(parsePositionQuery('MSH-9.')).toBe('MSH-9');
  });

  it('returns undefined for other text', () => {
    expect(parsePositionQuery('')).toBeUndefined();
    expect(parsePositionQuery('patient name')).toBeUndefined();
    expect(parsePositionQuery('3')).toBeUndefined();
    expect(parsePositionQuery('PID-3-4-5-6')).toBeUndefined();
    expect(parsePositionQuery('اسم')).toBeUndefined();
  });

  it('reads Arabic-Indic digits as 0 to 9', () => {
    // ٠١٢٣٤٥٦٧٨٩ (U+0660 to U+0669) and ۰۱۲۳۴۵۶۷۸۹ (U+06F0 to U+06F9).
    expect(parsePositionQuery('PID-٣')).toBe('PID-3');
    expect(parsePositionQuery('pid ٣')).toBe('PID-3');
    expect(parsePositionQuery('PID-٥.١')).toBe('PID-5.1');
    expect(parsePositionQuery('PID-٣[٢].١')).toBe('PID-3.1');
    expect(parsePositionQuery('OBX-١٤')).toBe('OBX-14');
    expect(parsePositionQuery('PV١-٣')).toBe('PV1-3');
    expect(parsePositionQuery('PID-۳')).toBe('PID-3');
    expect(parsePositionQuery('PID-۱۳')).toBe('PID-13');
    expect(parsePositionQuery('PID-٠٣')).toBe('PID-3');
    // Every digit.
    expect(parsePositionQuery('ZZ1-١٢٣٤٥٦٧٨٩٠')).toBe('ZZ1-1234567890');
    expect(parsePositionQuery('ZZ1-۱۲۳۴۵۶۷۸۹۰')).toBe('ZZ1-1234567890');
    expect(parsePositionQuery('٣')).toBeUndefined();
  });
});

describe('normalizeSearchText', () => {
  it('ignores case, punctuation and Arabic spelling differences', () => {
    expect(normalizeSearchText('Date/Time of  Message')).toBe('date time of message');
    expect(normalizeSearchText('Café')).toBe('cafe');
    expect(normalizeSearchText('أَسْمَاء')).toBe(normalizeSearchText('اسماء'));
    expect(normalizeSearchText('إدخال')).toBe('ادخال');
    expect(normalizeSearchText('مستشفى')).toBe(normalizeSearchText('مستشفي'));
    expect(normalizeSearchText('حالة')).toBe(normalizeSearchText('حاله'));
  });

  it('turns Arabic-Indic digits into 0 to 9', () => {
    expect(normalizeSearchText('العنوان ٢')).toBe('العنوان 2');
    expect(normalizeSearchText('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
    expect(normalizeSearchText('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789');
    expect(normalizeSearchText('Line ٣')).toBe(normalizeSearchText('Line 3'));
  });
});

describe('matchesSearch', () => {
  const items = [pid1, pid3, pid5, pid13, pid30, msh7];

  it('matches everything when the query is empty', () => {
    expect(filter('', items)).toHaveLength(items.length);
    expect(filter('   ', items)).toHaveLength(items.length);
  });

  it('finds a field by position, in any form', () => {
    for (const q of ['PID-3', 'pid 3', 'PID.3', 'pid3']) expect(filter(q, items), q).toEqual(['PID-3']);
  });

  it('finds a field by position written with Arabic-Indic digits', () => {
    for (const q of ['PID-٣', 'pid ٣', 'PID.٣', 'PID-۳']) expect(filter(q, items), q).toEqual(['PID-3']);
    expect(filter('PID-١٣', items)).toEqual(['PID-13']);
    expect(filter('MSH-٧', items)).toEqual(['MSH-7']);
    // The same as with 0 to 9: PID-3 does not find PID-30.
    expect(filter('PID-٣', [pid3, pid30])).toEqual(['PID-3']);
  });

  it('finds names with digits, whichever digits the query uses', () => {
    const line2 = { label: 'XAD-2', names: ['Other Designation 2', 'السطر 2 من العنوان'] };
    expect(filter('designation ٢', [line2])).toEqual(['XAD-2']);
    expect(filter('السطر ٢', [line2])).toEqual(['XAD-2']);
    expect(filter('السطر ۲', [line2])).toEqual(['XAD-2']);
  });

  it('finds the parts of a field, but not other numbers', () => {
    const parts = [
      { label: 'PID-3', names: [] },
      { label: 'PID-3.1', names: [] },
      { label: 'PID-3[2].1', names: [] },
      { label: 'PID-3.4.1', names: [] },
      { label: 'PID-30', names: [] },
      { label: 'PID-13', names: [] },
    ];
    expect(filter('PID-3', parts)).toEqual(['PID-3', 'PID-3.1', 'PID-3[2].1', 'PID-3.4.1']);
    expect(filter('PID-3.4', parts)).toEqual(['PID-3.4.1']);
    expect(filter('pid 3.1', parts)).toEqual(['PID-3.1', 'PID-3[2].1']);
  });

  it('finds all fields of a segment', () => {
    expect(filter('pid', items)).toEqual(['PID-1', 'PID-3', 'PID-5', 'PID-13', 'PID-30']);
    expect(filter('MSH', items)).toEqual(['MSH-7']);
  });

  it('finds fields by English name', () => {
    expect(filter('patient name', items)).toEqual(['PID-5']);
    expect(filter('name patient', items)).toEqual(['PID-5']);
    expect(filter('PATIENT', items)).toEqual(['PID-3', 'PID-5', 'PID-30']);
    expect(filter('date time', items)).toEqual(['MSH-7']);
    expect(filter('date/time', items)).toEqual(['MSH-7']);
    expect(filter('phone', items)).toEqual(['PID-13']);
  });

  it('finds fields by Arabic name', () => {
    expect(filter('اسم', items)).toEqual(['PID-5']);
    expect(filter('المريض', items)).toEqual(['PID-3', 'PID-5']);
    expect(filter('تاريخ', items)).toEqual(['MSH-7']);
    expect(filter('معرفات', items)).toEqual(['PID-3']);
  });

  it('checks names too when the query looks like a segment', () => {
    expect(filter('set', items)).toEqual(['PID-1']);
  });

  it('returns no matches for unknown text', () => {
    expect(filter('zzz-99', items)).toEqual([]);
    expect(filter('allergy', items)).toEqual([]);
  });

  it('ignores empty names', () => {
    expect(matchesSearch('name', { label: 'ZPI-1', names: [undefined, ''] })).toBe(false);
  });
});
