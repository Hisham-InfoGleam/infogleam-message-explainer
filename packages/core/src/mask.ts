// SPDX-License-Identifier: MPL-2.0
// Copyright 2026 Hisham Alrashdan (InfoGleam)

import { parseSegment } from './parse.js';
import { fieldPath } from './path.js';
import { buildSegmentRaw } from './serialize.js';
import type { Delimiters, HL7Repetition, HL7Segment, ParsedMessage } from './types.js';

/*
 * IMPORTANT: masking is NOT complete.
 *
 * Only the fields listed in MASK_RULES are replaced: fields of PID, NK1, PV1
 * and MRG. Patient data can also be in many other places, for example free
 * text in OBX-5, NTE-3 or notes, other segments such as PD1, insurance
 * (IN1), guarantor (GT1) or Z-segments, or embedded documents. Always check
 * the result yourself before you share it.
 */

type RepMasker = (rep: HL7Repetition, repNumber: number, d: Delimiters) => string;

/** An ID (CX, or the number of a driver's license): only component 1, the ID number, is replaced. */
const maskId: RepMasker = (rep, n, d) => {
  const parts = rep.components.map((c) => c.value);
  parts[0] = 'MASK' + String(n).padStart(4, '0');
  return parts.join(d.component);
};
const maskPatientName: RepMasker = (_r, _n, d) => ['MASKED', 'PATIENT'].join(d.component);
const maskRelativeName: RepMasker = (_r, _n, d) => ['MASKED', 'RELATIVE'].join(d.component);
const maskDate: RepMasker = () => '19000101';
const maskAddress: RepMasker = (_r, _n, d) =>
  ['1 MASKED ST', '', 'MASKED CITY'].join(d.component);
const maskPhone: RepMasker = () => '555-0100';
const maskSsn: RepMasker = () => '000-00-0000';
/** Plain text, for example a birth place: the whole value is replaced. */
const maskText: RepMasker = () => 'MASKED';

/** Fields that maskMessage() replaces, by segment and field number. */
export const MASK_RULES: Readonly<Record<string, Readonly<Record<number, RepMasker>>>> = {
  PID: {
    2: maskId, // patient ID
    3: maskId, // patient identifiers (only the ID number is replaced)
    4: maskId, // alternate patient ID
    5: maskPatientName,
    6: maskRelativeName, // mother's maiden name
    7: maskDate, // birth date
    9: maskPatientName, // patient alias
    11: maskAddress,
    13: maskPhone, // home phone
    14: maskPhone, // business phone
    18: maskId, // patient account number
    19: maskSsn,
    20: maskId, // driver's license (only the license number is replaced)
    21: maskId, // mother's identifier
    23: maskText, // birth place
    29: maskDate, // death date and time
    40: maskPhone, // phone numbers and email (v2.7 and later)
  },
  NK1: {
    2: maskRelativeName,
    4: maskAddress,
    5: maskPhone,
    6: maskPhone, // business phone
    12: maskId, // employee number
    16: maskDate, // birth date
    26: maskRelativeName, // mother's maiden name
    30: maskRelativeName, // contact person's name
    31: maskPhone, // contact person's phone
    32: maskAddress, // contact person's address
    33: maskId, // identifiers
    37: maskSsn, // contact person's SSN
    38: maskText, // birth place
    40: maskPhone, // phone numbers and email (v2.7 and later)
    41: maskPhone, // contact person's phone numbers and email (v2.7 and later)
  },
  PV1: {
    19: maskId, // visit number
    50: maskId, // alternate visit ID
  },
  MRG: {
    1: maskId, // prior patient identifiers
    2: maskId, // prior alternate patient ID
    3: maskId, // prior patient account number
    4: maskId, // prior patient ID
    5: maskId, // prior visit number
    6: maskId, // prior alternate visit ID
    7: maskPatientName, // prior patient name
  },
};

/** A list of the masked positions, in a short readable form. */
export const MASKED_FIELDS: readonly string[] = Object.entries(MASK_RULES).flatMap(
  ([seg, rules]) => Object.keys(rules).map((f) => `${seg}-${f}`),
);

export interface MaskChange {
  /** 0-based index of the segment in the message. */
  segmentIndex: number;
  segment: string;
  occurrence: number;
  field: number;
  /** Position label, for example "PID-5". */
  label: string;
}

export interface MaskResult {
  message: ParsedMessage;
  changes: MaskChange[];
}

/**
 * Replace common patient identifiers with fixed fake values.
 *
 * Returns a new message; the input is not changed. Empty fields and the
 * HL7 null value "" are left as they are. See the note at the top of this
 * file: this does not remove all patient data.
 */
export function maskMessage(message: ParsedMessage): MaskResult {
  const d = message.delimiters;
  const changes: MaskChange[] = [];

  const segments = message.segments.map((seg): HL7Segment => {
    const rules = MASK_RULES[seg.name];
    if (!rules) return seg;

    const values = seg.fields.map((f) => f.value);
    let changed = false;

    for (const field of seg.fields) {
      const rule = rules[field.position];
      if (!rule || field.value === '' || field.value === '""') continue;

      const next = field.repetitions
        .map((rep) => (rep.value === '' ? '' : rule(rep, rep.index, d)))
        .join(d.repetition);
      if (next === field.value) continue;

      values[field.position - 1] = next;
      changed = true;
      changes.push({
        segmentIndex: seg.index,
        segment: seg.name,
        occurrence: seg.occurrence,
        field: field.position,
        label: fieldPath(seg.name, field.position).label,
      });
    }

    if (!changed) return seg;
    const raw = buildSegmentRaw(seg.name, values, d);
    const masked = parseSegment(raw, d, seg.index, seg.occurrence, seg.after);
    if (seg.before !== undefined) masked.before = seg.before;
    if (seg.count !== undefined) masked.count = seg.count;
    return masked;
  });

  return { message: { ...message, segments, warnings: [...message.warnings] }, changes };
}
