// SPDX-License-Identifier: MPL-2.0
// Copyright 2026 Hisham Alrashdan (InfoGleam)

import { parseSegment } from './parse.js';
import { fieldPath } from './path.js';
import { buildSegmentRaw } from './serialize.js';
import type { Delimiters, HL7Repetition, HL7Segment, ParsedMessage } from './types.js';

/*
 * IMPORTANT: masking is NOT complete.
 *
 * Only the fields listed in MASK_RULES are replaced. Patient data can also
 * be in many other places, for example free text in OBX-5, NTE-3, notes,
 * Z-segments, insurance (IN1), guarantor (GT1), visit numbers, or embedded
 * documents. Always check the result yourself before you share it.
 */

type RepMasker = (rep: HL7Repetition, repNumber: number, d: Delimiters) => string;

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

/** Fields that maskMessage() replaces, by segment and field number. */
export const MASK_RULES: Readonly<Record<string, Readonly<Record<number, RepMasker>>>> = {
  PID: {
    3: maskId, // patient identifiers (only the ID number is replaced)
    5: maskPatientName,
    7: maskDate, // birth date
    11: maskAddress,
    13: maskPhone, // home phone
    14: maskPhone, // business phone
    19: maskSsn,
    40: maskPhone, // phone numbers and email (v2.7 and later)
  },
  NK1: {
    2: maskRelativeName,
    4: maskAddress,
    5: maskPhone,
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
    return parseSegment(raw, d, seg.index, seg.occurrence, seg.after);
  });

  return { message: { ...message, segments, warnings: [...message.warnings] }, changes };
}
