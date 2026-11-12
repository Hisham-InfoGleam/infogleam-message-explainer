// SPDX-License-Identifier: MPL-2.0
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// Made-up messages for the message check tests. A "clean" segment fills
// every required field of a version with a value that fits its data type,
// so it gives no findings in that version.
//
// The field facts come from getFieldDoc(): the facts of the version when
// the tool has them, and otherwise the v2.9 facts of the field list.

import { getFieldDoc, type FieldDoc } from '../src/index.js';

/** A value that fits each checked data type. Other types get "X". */
const GOOD_VALUE: Record<string, string> = {
  DT: '20260101',
  TS: '20261108093000',
  DTM: '20261108093000',
  TM: '0930',
  NM: '1',
  SI: '1',
};

export function goodValue(dataType: string): string {
  return GOOD_VALUE[dataType] ?? 'X';
}

/** Field docs of a segment in a version, by field number (index 0 is field 1). */
export function fieldsOf(segment: string, version: string): FieldDoc[] {
  const out: FieldDoc[] = [];
  for (let field = 1; ; field++) {
    const doc = getFieldDoc(segment, field, version);
    if (!doc) return out;
    out.push(doc);
  }
}

/** True when the field is required in the doc's facts. */
export function isRequired(doc: FieldDoc): boolean {
  return doc.exists !== false && doc.min >= 1;
}

/** MSH-2 that gives no S2 finding in the version. */
export function encodingFor(version: string): string {
  return ['2.7', '2.7.1', '2.3', '2.3.1', '2.4', '2.5', '2.5.1', '2.6'].includes(version) ? '^~\\&' : '^~\\&#';
}

/**
 * One segment line with every required field of the version filled.
 * `set` changes fields: a text sets the field, null makes it empty.
 */
export function cleanSegment(segment: string, version: string, set: Record<number, string | null> = {}): string {
  const fields = fieldsOf(segment, version);
  const values: string[] = [];
  const last = Math.max(fields.length, ...Object.keys(set).map(Number));
  for (let field = 1; field <= last; field++) {
    const doc = fields[field - 1];
    let value = doc && isRequired(doc) ? goodValue(doc.dataType) : '';
    if (segment === 'MSH' && field === 12) value = version;
    if (segment === 'MSH' && field === 9) value = 'ADT^A01';
    if (Object.hasOwn(set, field)) value = set[field] ?? '';
    values.push(value);
  }
  if (segment === 'MSH') {
    const enc = Object.hasOwn(set, 2) ? (set[2] ?? '') : encodingFor(version);
    return `MSH|${enc}|${values.slice(2).join('|')}`.replace(/\|+$/, '');
  }
  return `${segment}|${values.join('|')}`.replace(/\|+$/, '');
}

/** A clean MSH and the given lines, joined with CR. */
export function messageOf(version: string, ...lines: string[]): string {
  return [cleanSegment('MSH', version), ...lines].join('\r');
}
