// SPDX-License-Identifier: MPL-2.0
// Copyright 2026 Hisham Alrashdan (InfoGleam)

import { HEADER_SEGMENTS } from './parse.js';

export interface FieldPath {
  /** Position label, for example "PID-5.1" or "PID-3[2].1". */
  label: string;
  /** Mirth Connect / OIE E4X path, for example msg['PID']['PID.5']['PID.5.1']. */
  mirthPath: string;
}

export interface FieldPathOptions {
  /** 1-based count of the segment in the message (second OBX = 2). Default 1. */
  segmentOccurrence?: number;
  /**
   * How many segments with this name the message has. When it is 2 or more,
   * the first one also gets an index: msg['OBX'][0].
   */
  segmentCount?: number;
  /**
   * How many repetitions the field has in the message. When it is 2 or more,
   * the parts of the first repetition also get an index: msg['PID']['PID.3'][0].
   */
  repetitionCount?: number;
  /**
   * True when the field holds one plain value: one repetition, one component
   * and no sub-components. Mirth still stores it as component 1, so the path
   * of the whole field ends with that component: msg['PID']['PID.8']['PID.8.1'].
   */
  singleValue?: boolean;
}

function checkNumber(name: string, value: number | undefined): void {
  if (value === undefined) return;
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a whole number of 1 or more`);
  }
}

/**
 * Build a position label and a Mirth/OIE path.
 *
 * Rules used here:
 * - All numbers are 1-based, as in the HL7 standard. Field numbers are the
 *   standard ones, so MSH-3 is the sending application in both the label and
 *   the Mirth path (msg['MSH']['MSH.3']).
 * - MSH-1 and MSH-2 (also BHS/FHS) hold the delimiters and have no
 *   components, so rep/comp/sub are ignored for them.
 * - The label shows a repetition only when it is 2 or more: PID-3[2].1.
 * - In the Mirth path, repeated segments and repeated fields use a 0-based
 *   E4X index: second OBX, field 5, component 1 ->
 *   msg['OBX'][1]['OBX.5']['OBX.5.1']. The first one gets [0] when the
 *   message has more than one (options.segmentCount, options.repetitionCount).
 *   Without the index, E4X returns the parts of all of them together.
 * - Mirth stores every field value as component 1, also when the field has
 *   no component separator. With options.singleValue, the path of the whole
 *   field ends with it: msg['PID']['PID.8']['PID.8.1'].
 * - Sub-components use the name SEG.F.C.S, for example PID.3.4.1.
 * These rules were checked in Mirth Connect 4.5.2's own HL7 v2 converter
 * and JavaScript engine.
 */
export function fieldPath(
  segment: string,
  field: number,
  rep?: number,
  comp?: number,
  sub?: number,
  options: FieldPathOptions = {},
): FieldPath {
  if (!/^[A-Z][A-Z0-9]{2}$/.test(segment)) {
    throw new RangeError(`Invalid segment name: ${segment}`);
  }
  checkNumber('field', field);
  checkNumber('rep', rep);
  checkNumber('comp', comp);
  checkNumber('sub', sub);
  checkNumber('segmentOccurrence', options.segmentOccurrence);
  checkNumber('segmentCount', options.segmentCount);
  checkNumber('repetitionCount', options.repetitionCount);
  if (sub !== undefined && comp === undefined) {
    throw new RangeError('sub needs comp');
  }

  if (HEADER_SEGMENTS.has(segment) && field <= 2) {
    rep = undefined;
    comp = undefined;
    sub = undefined;
  }

  const f = `${segment}.${field}`;
  let label = `${segment}-${field}`;
  let mirthPath = `msg['${segment}']`;

  const occ = options.segmentOccurrence ?? 1;
  if (occ > 1 || (options.segmentCount ?? 1) > 1) mirthPath += `[${occ - 1}]`;
  mirthPath += `['${f}']`;

  const header = HEADER_SEGMENTS.has(segment) && field <= 2;
  if (rep !== undefined && rep > 1) {
    label += `[${rep}]`;
    mirthPath += `[${rep - 1}]`;
  } else if (comp !== undefined && (options.repetitionCount ?? 1) > 1) {
    mirthPath += '[0]';
  }
  if (comp === undefined && options.singleValue && !header && (rep === undefined || rep === 1)) {
    mirthPath += `['${f}.1']`;
  }
  if (comp !== undefined) {
    label += `.${comp}`;
    mirthPath += `['${f}.${comp}']`;
  }
  if (comp !== undefined && sub !== undefined) {
    label += `.${sub}`;
    mirthPath += `['${f}.${comp}.${sub}']`;
  }

  return { label, mirthPath };
}
