// SPDX-License-Identifier: MPL-2.0
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// Message checks: where a message does not follow the HL7 rules of its
// version, and why. The result holds codes and facts, never sentences, so a
// UI can show it in any language. A finding never holds a value from the
// message: only positions, rule facts and counts. So the list is safe to
// copy into a ticket.
//
// The field checks (F1 to F7, D1 to D5) need the field facts of the
// version: name, data type, required and repeat rules. They run only when
// the tool has these facts for that exact version (see hasFieldFacts in
// history.ts). Without the field history, that is v2.9 only, from the field
// list. The other checks need no field facts and run for every version.
// The format and syntax rules were read from the official HL7 v2 documents
// (v2.3 to v2.9). Each rule below is described in our own words.

import { getFieldDoc, type FieldDoc } from './dictionary.js';
import { getFieldVersion, HAS_FIELD_HISTORY, hasFieldFacts, HISTORY_VERSIONS, type FieldOpt } from './history.js';
import { HEADER_SEGMENTS } from './parse.js';
import type { HL7Field, HL7Segment, ParsedMessage } from './types.js';
import { compareVersions, messageVersion, versionSupport } from './version.js';

/** The checks, in the order a list shows them. */
export const CHECK_IDS = [
  'S1',
  'S2',
  'S3a',
  'S3b',
  'S4',
  'S5',
  'S6',
  'S7',
  'V1',
  'V2',
  'V3',
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'D1',
  'D2',
  'D3',
  'D4',
  'D5',
  'G1',
  'G2',
] as const;

export type CheckId = (typeof CHECK_IDS)[number];

/** Checks that need a version. Without one they are skipped. */
export const VERSION_CHECKS: readonly CheckId[] = [
  'V3',
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'D1',
  'D2',
  'D3',
  'D4',
  'D5',
];

/**
 * Checks that need the field facts of the version (name, data type,
 * required and repeat rules). They are skipped for a version when the tool
 * does not have these facts for it (see hasFieldFacts).
 */
export const FIELD_CHECKS: readonly CheckId[] = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'D1', 'D2', 'D3', 'D4', 'D5'];

/**
 * Checks that need to know whether a field is withdrawn (W), not used (X)
 * or kept only for backward compatibility (B). The field list of v2.9 does
 * not say this, so without the field history these checks are skipped.
 */
export const STATUS_CHECKS: readonly CheckId[] = ['F3', 'F4', 'F5'];

/**
 * - problem: the tool cannot read the message correctly
 * - differs: a rule of the version is broken
 * - note: allowed, or allowed with care, but worth knowing
 */
export type CheckLevel = 'problem' | 'differs' | 'note';

export const CHECK_LEVELS: readonly CheckLevel[] = ['problem', 'differs', 'note'];

/**
 * Why a check fired, when one check has more than one reason.
 * - S1: not-first (the first segment is not MSH, FHS or BHS), no-msh (no MSH at all)
 * - S2: too-short (fewer than 2 characters), short (2 or 3, from v2.7),
 *   no-truncation (4, from v2.8), long (5, up to v2.6), too-long (more than 5)
 * - S6: unclosed, unknown (code not defined), hex (bad hex digits),
 *   later (code defined only in a later version), formatting (a text
 *   formatting command outside an FT field)
 * - V1: empty, unknown
 * - V3: fields (fields of a later version), encoding (5 encoding
 *   characters), parts (MSH-12 with components)
 * - D1 to D5: format (wrong form), calendar (not a real date or time),
 *   point (no digit before the decimal point, from v2.8), range (SI above
 *   9999, from v2.5)
 */
export type CheckReason =
  | 'not-first'
  | 'no-msh'
  | 'too-short'
  | 'short'
  | 'no-truncation'
  | 'long'
  | 'too-long'
  | 'unclosed'
  | 'unknown'
  | 'hex'
  | 'later'
  | 'formatting'
  | 'empty'
  | 'fields'
  | 'encoding'
  | 'parts'
  | 'format'
  | 'calendar'
  | 'point'
  | 'range';

/** Where a finding is. Numbers are 1-based, like HL7 positions. */
export interface CheckPosition {
  /** Segment name. Left out when the name itself breaks a rule (S3a, S3b). */
  segment?: string;
  /** 0-based index of the segment in the message. */
  segmentIndex: number;
  field?: number;
  rep?: number;
  comp?: number;
  sub?: number;
}

/** The facts a UI needs for the sentence. None of them is a message value. */
export interface CheckFacts {
  /** The version the message was checked against. */
  version?: string;
  /** MSH-12, only when it is a known HL7 version (V2, V3). */
  messageVersion?: string;
  /** Field name in the version checked against (or the first version that has it). */
  fieldName?: string;
  /** First version with the field or the feature. */
  since?: string;
  /** Most repetitions allowed. */
  max?: number;
  /** A count: repetitions (F7), segments (G1, G2), messages (S7). */
  count?: number;
  /** A length: MSH-2 (S2) or the segment name (S3a). */
  length?: number;
  /** Data type in the version checked against (D1 to D5). */
  dataType?: string;
  /** The form the value should have (D1 to D3). */
  expected?: string;
  reason?: CheckReason;
  /** S6: the escape code, only for codes from the fixed HL7 list (for example "P" or ".br"). */
  code?: string;
  /** S4: the segment end found. */
  terminator?: 'LF' | 'CRLF';
  /** V3: positions of fields that are newer than MSH-12, for example "PID-31". */
  fields?: string[];
  /** F2: the last field number HL7 defines for this segment in the version. */
  lastField?: number;
  /** F2: true from v2.5, where HL7 allows local fields at the end of a segment. */
  localAllowed?: boolean;
}

export interface CheckFinding {
  id: CheckId;
  level: CheckLevel;
  /** 1-based segment line as the message view shows it. 0 for the whole message. */
  line: number;
  /** Missing for findings about the whole message. */
  position?: CheckPosition;
  facts: CheckFacts;
}

export interface CheckResult {
  /** The version checked against, or undefined when none was given. */
  version: string | undefined;
  findings: CheckFinding[];
  /**
   * Checks that did not run: all of VERSION_CHECKS without a version;
   * FIELD_CHECKS when the tool has no field facts for the version; and
   * STATUS_CHECKS when the field facts come from the v2.9 field list only.
   */
  skipped: CheckId[];
  counts: Record<CheckLevel, number>;
}

/** The segments the tool explains, and so checks field by field. */
const EXPLAINED: ReadonlySet<string> = new Set(['MSH', 'EVN', 'PID', 'PV1', 'NK1', 'ORC', 'OBR', 'OBX', 'AL1', 'DG1']);

/** Real HL7 versions older than 2.3 (HL7 table 0104). */
const OLDER: ReadonlySet<string> = new Set(['2.0', '2.0D', '2.1', '2.2']);

/** The form of each checked data type. */
export const DATA_TYPE_FORMS: Readonly<Record<string, string>> = {
  DT: 'YYYY[MM[DD]]',
  TS: 'YYYY[MM[DD[HH[MM[SS[.S[S[S[S]]]]]]]]][+/-ZZZZ]',
  DTM: 'YYYY[MM[DD[HH[MM[SS[.S[S[S[S]]]]]]]]][+/-ZZZZ]',
  TM: 'HH[MM[SS[.S[S[S[S]]]]]][+/-ZZZZ]',
};

const FORMAT_CHECK: Readonly<Record<string, CheckId>> = {
  DT: 'D1',
  TS: 'D2',
  DTM: 'D2',
  TM: 'D3',
  NM: 'D4',
  SI: 'D5',
};

const at = (version: string, other: string): boolean => compareVersions(version, other) >= 0;

// ----- formats -------------------------------------------------------------

function daysIn(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** A date of 4, 6 or 8 digits. Returns a reason when it is not one. */
function checkDate(text: string): CheckReason | undefined {
  if (!/^\d{4}(\d{2}(\d{2})?)?$/.test(text)) return 'format';
  if (text.length >= 6) {
    const month = Number(text.slice(4, 6));
    if (month < 1 || month > 12) return 'calendar';
    if (text.length === 8) {
      const day = Number(text.slice(6, 8));
      if (day < 1 || day > daysIn(Number(text.slice(0, 4)), month)) return 'calendar';
    }
  }
  return undefined;
}

/** A time HH[MM[SS[.S{1,4}]]] without the zone. */
function checkClock(text: string): CheckReason | undefined {
  const m = /^(\d{2})(?:(\d{2})(?:(\d{2})(?:\.\d{1,4})?)?)?$/.exec(text);
  if (!m) return 'format';
  if (Number(m[1]) > 23) return 'calendar';
  if (m[2] !== undefined && Number(m[2]) > 59) return 'calendar';
  if (m[3] !== undefined && Number(m[3]) > 59) return 'calendar';
  return undefined;
}

/** Split off an optional +ZZZZ or -ZZZZ time zone. */
function splitZone(text: string): { main: string; bad: boolean } {
  const sign = Math.max(text.indexOf('+'), text.indexOf('-'));
  if (sign === -1) return { main: text, bad: false };
  return { main: text.slice(0, sign), bad: !/^[+-]\d{4}$/.test(text.slice(sign)) };
}

/** TS (part 1) and DTM: a date, then an optional time, then an optional zone. */
function checkDateTime(text: string): CheckReason | undefined {
  const { main, bad } = splitZone(text);
  if (bad || main.length < 4) return 'format';
  const date = main.slice(0, 8);
  const time = main.slice(8);
  if (time !== '' && date.length !== 8) return 'format';
  return checkDate(date) ?? (time === '' ? undefined : checkClock(time));
}

function checkTime(text: string): CheckReason | undefined {
  const { main, bad } = splitZone(text);
  if (bad) return 'format';
  return checkClock(main);
}

function checkNumber(text: string, version: string): CheckReason | undefined {
  if (/^[+-]?\d+(\.\d*)?$/.test(text)) return undefined;
  // ".5": allowed up to v2.7.1. From v2.8 a digit must come before the point.
  if (/^[+-]?\.\d+$/.test(text)) return at(version, '2.8') ? 'point' : undefined;
  return 'format';
}

function checkSequence(text: string, version: string): CheckReason | undefined {
  if (!/^\+?\d+$/.test(text)) return 'format';
  return at(version, '2.5') && Number(text) > 9999 ? 'range' : undefined;
}

/**
 * Check one value against the form of its data type in a version: DT, TS
 * (part 1 only), DTM, TM, NM or SI. Returns the reason when the value does
 * not fit, and undefined when it fits or the data type is not checked.
 */
export function checkValueFormat(dataType: string, text: string, version: string): CheckReason | undefined {
  switch (dataType) {
    case 'DT':
      return checkDate(text);
    case 'TS':
    case 'DTM':
      return checkDateTime(text);
    case 'TM':
      return checkTime(text);
    case 'NM':
      return checkNumber(text, version);
    case 'SI':
      return checkSequence(text, version);
    default:
      return undefined;
  }
}

// ----- escape sequences ----------------------------------------------------

const PLAIN_ESCAPES: ReadonlySet<string> = new Set(['H', 'N', 'F', 'S', 'T', 'R', 'E']);
const FORMATTING = /^\.(?:(?:sp|sk)(?:\s*\+?\d+)?|(?:in|ti)(?:\s*[+-]?\d+)?|br|fi|nf|ce)$/;
const HEX_PAIRS = /^(?:[0-9A-Fa-f]{2})+$/;

interface EscapeIssue {
  reason: CheckReason;
  code?: string;
  since?: string;
}

/** Check one escape code (the text between two escape characters). */
function escapeIssue(code: string, version: string | undefined): EscapeIssue | undefined {
  if (PLAIN_ESCAPES.has(code)) return undefined;
  if (code === 'P') {
    // The truncation character escape exists from v2.8.
    return version !== undefined && !at(version, '2.8') ? { reason: 'later', code: 'P', since: '2.8' } : undefined;
  }
  const kind = code.charAt(0);
  const rest = code.slice(1);
  if (kind === 'X') return HEX_PAIRS.test(rest) ? undefined : { reason: 'hex', code: 'X' };
  if (kind === 'Z') return undefined;
  if (kind === 'C') return /^[0-9A-Fa-f]{4}$/.test(rest) ? undefined : { reason: 'hex', code: 'C' };
  if (kind === 'M') return /^(?:[0-9A-Fa-f]{4}|[0-9A-Fa-f]{6})$/.test(rest) ? undefined : { reason: 'hex', code: 'M' };
  if (kind === '.') {
    const command = /^\.[a-z]{2}/.exec(code)?.[0];
    if (FORMATTING.test(code) && command) return { reason: 'formatting', code: command };
  }
  return { reason: 'unknown' };
}

/** All escape issues in one piece of text, in order. */
function escapeIssues(text: string, escape: string, version: string | undefined): EscapeIssue[] {
  const out: EscapeIssue[] = [];
  let i = text.indexOf(escape);
  while (i !== -1) {
    const end = text.indexOf(escape, i + 1);
    if (end === -1) {
      out.push({ reason: 'unclosed' });
      break;
    }
    const issue = escapeIssue(text.slice(i + 1, end), version);
    if (issue) out.push(issue);
    i = text.indexOf(escape, end + 1);
  }
  return out;
}

// ----- helpers -------------------------------------------------------------

/** Same rule as the field list of the page: does the field have parts to show? */
function hasParts(f: HL7Field): boolean {
  const first = f.repetitions[0];
  return (
    f.repetitions.length > 1 ||
    (first !== undefined && (first.components.length > 1 || (first.components[0]?.subComponents.length ?? 0) > 1))
  );
}

const VALID_NAME = /^[A-Z0-9]{3}$/;

/**
 * The start of a position. A segment name that breaks the naming rule may
 * be any text from the message, so it is left out.
 */
function segmentPosition(seg: HL7Segment): CheckPosition {
  return VALID_NAME.test(seg.name) ? { segment: seg.name, segmentIndex: seg.index } : { segmentIndex: seg.index };
}

/** The position of a part, as short as the field allows. */
function partPosition(seg: HL7Segment, f: HL7Field, rep: number, comp: number, sub: number): CheckPosition {
  const pos: CheckPosition = { ...segmentPosition(seg), field: f.position };
  if (!hasParts(f)) return pos;
  pos.rep = rep;
  pos.comp = comp;
  const c = f.repetitions[rep - 1]?.components[comp - 1];
  if ((c?.subComponents.length ?? 0) > 1) pos.sub = sub;
  return pos;
}

function fieldPosition(seg: HL7Segment, field: number): CheckPosition {
  return { ...segmentPosition(seg), field };
}

function isHeaderLine(seg: HL7Segment): boolean {
  return HEADER_SEGMENTS.has(seg.name) && seg.fields[1]?.position === 2 && seg.fields[0]?.position === 1;
}

/** What the field checks know about one field in one version. */
interface FieldRule {
  /** Position, for example "PID-8". */
  id: string;
  /** False when the field was added in a later version. */
  exists: boolean;
  /** First version with the field. */
  since: string;
  /** Field name in the version (or in the first version that has the field). */
  name: string;
  dataType: string;
  /** R, O, C, B, W or X. Undefined when the tool does not know it. */
  opt: FieldOpt | undefined;
  required: boolean;
  max: number | '*';
}

/**
 * The field rules of one segment in one version, by field number (index 0
 * is field 1). Undefined when the tool has no field facts for the version.
 * With the field history, the rules come from it. Without it, the version
 * is v2.9 and the rules come from the field list: a field is required when
 * its least number of times is 1 or more, and its optionality is not known.
 */
function segmentFields(cache: Map<string, FieldRule[] | null>, segment: string, version: string): FieldRule[] | undefined {
  const cached = cache.get(segment);
  if (cached !== undefined) return cached ?? undefined;
  let list: FieldRule[] | null = null;
  if (hasFieldFacts(version)) {
    list = [];
    for (let field = 1; ; field++) {
      if (HAS_FIELD_HISTORY) {
        const fv = getFieldVersion(segment, field, version);
        if (!fv) break;
        list.push({
          id: fv.id,
          exists: fv.exists,
          since: fv.since,
          name: fv.name,
          dataType: fv.dataType,
          opt: fv.opt,
          required: fv.opt === 'R',
          max: fv.max,
        });
      } else {
        const doc = getFieldDoc(segment, field);
        if (!doc) break;
        list.push({
          id: doc.id,
          exists: true,
          since: doc.since ?? HISTORY_VERSIONS[0] ?? '',
          name: doc.name,
          dataType: doc.dataType,
          opt: undefined,
          required: doc.min >= 1,
          max: doc.max,
        });
      }
    }
  }
  cache.set(segment, list);
  return list ?? undefined;
}

/** The last field that exists in the version (0 when none). */
function lastFieldIn(list: FieldRule[]): number {
  for (let i = list.length - 1; i >= 0; i--) if (list[i]?.exists) return i + 1;
  return 0;
}

/**
 * The docs of one segment's fields in one version (index 0 is field 1).
 * Whether a field exists in the version comes from the field history, or,
 * without it, from the first version in the explanation (`since`).
 */
function segmentDocs(cache: Map<string, FieldDoc[]>, segment: string, version: string): FieldDoc[] {
  const cached = cache.get(segment);
  if (cached) return cached;
  const list: FieldDoc[] = [];
  for (let field = 1; ; field++) {
    const doc = getFieldDoc(segment, field, version);
    if (!doc) break;
    list.push(doc);
  }
  cache.set(segment, list);
  return list;
}

/** The data type of OBX-5, which OBX-2 names. Undefined when unknown. */
function obxValueType(seg: HL7Segment): string | undefined {
  const code = seg.fields.find((f) => f.position === 2)?.repetitions[0]?.components[0]?.value.trim() ?? '';
  return /^[A-Z]{2,3}$/.test(code) ? code : undefined;
}

// ----- the checks ----------------------------------------------------------

/**
 * Check a parsed message against the HL7 rules of a version (one of
 * HISTORY_VERSIONS, 2.3 to 2.9). Without a version (or with a version the
 * tool does not explain), only the checks that do not need a version run:
 * S1 to S7, V1, V2, G1 and G2. S2 and S6 then run only their parts that are
 * the same in every version. The result lists the checks that were skipped.
 *
 * The field checks (F, D and the formatting part of S6) run only when the
 * tool has the field facts of the version (see hasFieldFacts), and only for
 * the segments the tool explains: MSH, EVN, PID, PV1, NK1, ORC, OBR, OBX,
 * AL1 and DG1. For another version they are skipped, and the other checks
 * still run with the rules of the version. Without the field history, the
 * field facts of v2.9 come from the field list, which does not say whether
 * a field is withdrawn, not used or kept for backward compatibility: F3, F4
 * and F5 are then skipped. Never throws.
 */
export function checkMessage(message: ParsedMessage, version?: string): CheckResult {
  const v = version !== undefined && HISTORY_VERSIONS.includes(version.trim()) ? version.trim() : undefined;
  const findings: CheckFinding[] = [];
  const add = (id: CheckId, level: CheckLevel, line: number, facts: CheckFacts, position?: CheckPosition) => {
    const finding: CheckFinding = { id, level, line, facts };
    if (position) finding.position = position;
    findings.push(finding);
  };
  const withVersion = (facts: CheckFacts): CheckFacts => (v === undefined ? facts : { version: v, ...facts });
  const segments = message.segments;
  const msh = segments.find((s) => s.name === 'MSH' && isHeaderLine(s));

  // S1: the message must start with MSH, or with FHS or BHS for a batch.
  const first = segments[0];
  if (!first) {
    add('S1', 'problem', 0, { reason: 'no-msh' });
  } else if (message.warnings.includes('no-msh') || !isHeaderLine(first)) {
    add('S1', 'problem', 1, { reason: 'not-first' });
  } else if (!msh) {
    add('S1', 'problem', 0, { reason: 'no-msh' });
  }

  // S2: the number of encoding characters in MSH-2.
  if (msh) {
    const length = msh.fields[1]?.value.length ?? 0;
    const pos = fieldPosition(msh, 2);
    const line = msh.index + 1;
    if (length < 2) add('S2', 'problem', line, withVersion({ reason: 'too-short', length }), pos);
    else if (v !== undefined) {
      if (length <= 3 && at(v, '2.7')) add('S2', 'differs', line, { version: v, reason: 'short', length }, pos);
      else if (length === 4 && at(v, '2.8')) add('S2', 'note', line, { version: v, reason: 'no-truncation', length }, pos);
      else if (length === 5 && !at(v, '2.7')) add('S2', 'differs', line, { version: v, reason: 'long', length }, pos);
      else if (length > 5) add('S2', 'differs', line, { version: v, reason: 'too-long', length }, pos);
    }
  }

  // S4 and S5: HL7 ends every segment with CR.
  if (message.mixedTerminators) add('S5', 'note', 0, {});
  else if (message.terminator === '\n' || message.terminator === '\r\n') {
    add('S4', 'note', 0, { terminator: message.terminator === '\n' ? 'LF' : 'CRLF' });
  }

  // S7: more than one message (a batch).
  const mshLines = segments.filter((s) => s.name === 'MSH');
  const second = mshLines[1];
  if (second) add('S7', 'note', second.index + 1, { count: mshLines.length }, { segment: 'MSH', segmentIndex: second.index });

  // V1 and V2: the version in MSH-12.
  const mshVersion = msh ? messageVersion(message) : undefined;
  const support = versionSupport(mshVersion);
  let msh12Empty = false;
  if (msh) {
    const pos = fieldPosition(msh, 12);
    const line = msh.index + 1;
    if (mshVersion === undefined) {
      msh12Empty = true;
      add('V1', 'problem', line, withVersion({ reason: 'empty' }), pos);
    } else if (OLDER.has(mshVersion)) {
      add('V2', 'note', line, withVersion({ messageVersion: mshVersion }), pos);
    } else if (support === 'unknown') {
      add('V1', 'problem', line, withVersion({ reason: 'unknown' }), pos);
    }
  }

  // S3a, S3b, G1, G2: segment names.
  const others = new Map<string, { id: 'G1' | 'G2'; count: number; index: number }>();
  for (const seg of segments) {
    const line = seg.index + 1;
    if (seg.name.length !== 3) {
      add('S3a', 'problem', line, { length: seg.name.length }, { segmentIndex: seg.index });
      continue;
    }
    if (!VALID_NAME.test(seg.name)) {
      add('S3b', 'note', line, {}, { segmentIndex: seg.index });
      continue;
    }
    if (EXPLAINED.has(seg.name)) continue;
    const entry = others.get(seg.name);
    if (entry) entry.count++;
    else others.set(seg.name, { id: seg.name.startsWith('Z') ? 'G1' : 'G2', count: 1, index: seg.index });
  }
  for (const [name, entry] of others) {
    add(entry.id, 'note', entry.index + 1, { count: entry.count }, { segment: name, segmentIndex: entry.index });
  }

  // Field checks: F1 to F7, D1 to D5, and S6 (escape sequences). Without
  // the field facts of the version, `list` is undefined: the F and D
  // checks and the formatting part of S6 do not run.
  const escape = message.delimiters.escape;
  const cache = new Map<string, FieldRule[] | null>();
  for (const seg of segments) {
    const explained = EXPLAINED.has(seg.name);
    const header = isHeaderLine(seg);
    const line = seg.index + 1;
    const list = v !== undefined && explained ? segmentFields(cache, seg.name, v) : undefined;
    const lastField = list ? lastFieldIn(list) : 0;
    const obxType = seg.name === 'OBX' ? obxValueType(seg) : undefined;

    for (const f of seg.fields) {
      if (header && f.position <= 2) continue;
      if (f.value === '') continue;
      const fv = list?.[f.position - 1];

      // S6: escape sequences. One finding per field and reason.
      if (escape !== '' && f.value.includes(escape)) {
        let dataType = fv?.exists ? fv.dataType : undefined;
        if (dataType === 'varies' && seg.name === 'OBX' && f.position === 5) dataType = obxType;
        const seen = new Set<CheckReason>();
        f.repetitions.forEach((rep) => {
          rep.components.forEach((comp) => {
            comp.subComponents.forEach((sub, s) => {
              if (!sub.includes(escape)) return;
              for (const issue of escapeIssues(sub, escape, v)) {
                if (issue.reason === 'formatting') {
                  // Formatting commands belong to FT. Elsewhere a note, when the data type is known.
                  if (v === undefined || dataType === undefined || dataType === 'FT' || dataType === 'varies') continue;
                }
                if (seen.has(issue.reason)) continue;
                seen.add(issue.reason);
                const facts: CheckFacts = withVersion({ reason: issue.reason });
                if (issue.code !== undefined) facts.code = issue.code;
                if (issue.since !== undefined) facts.since = issue.since;
                if (issue.reason === 'formatting' && dataType) facts.dataType = dataType;
                if (fv?.exists) facts.fieldName = fv.name;
                add('S6', issue.reason === 'formatting' ? 'note' : 'differs', line, facts, partPosition(seg, f, rep.index, comp.position, s + 1));
              }
            });
          });
        });
      }

      if (v === undefined || !list) continue;
      const pos = fieldPosition(seg, f.position);

      // F2: past the last field HL7 defines for the segment.
      if (!fv) {
        add('F2', 'note', line, { version: v, lastField, localAllowed: at(v, '2.5') }, pos);
        continue;
      }
      const facts = { version: v, fieldName: fv.name };
      // F1: the field was added in a later version.
      if (!fv.exists) {
        add('F1', 'differs', line, { ...facts, since: fv.since }, pos);
        continue;
      }
      // F3, F4, F5: withdrawn, not used, backward compatibility only. They
      // need the optionality, which is undefined when the tool does not know it.
      if (fv.opt === 'W') add('F3', 'differs', line, facts, pos);
      else if (fv.opt === 'X') add('F4', 'differs', line, facts, pos);
      else if (fv.opt === 'B') add('F5', 'note', line, facts, pos);

      // F7: more repetitions than allowed.
      const count = f.repetitions.length;
      if (fv.max !== '*' && count > fv.max && fv.opt !== 'W' && fv.opt !== 'X') {
        add('F7', 'differs', line, { ...facts, count, max: fv.max }, pos);
      }

      // D1 to D5: the form of dates, times and numbers.
      const check = FORMAT_CHECK[fv.dataType];
      if (check) {
        for (const rep of f.repetitions) {
          const comp = rep.components[0];
          const text = comp?.value ?? '';
          if (text === '' || text === '""') continue;
          const reason = checkValueFormat(fv.dataType, text, v);
          if (!reason) continue;
          const dfacts: CheckFacts = { ...facts, dataType: fv.dataType, reason };
          const form = DATA_TYPE_FORMS[fv.dataType];
          if (form) dfacts.expected = form;
          add(check, 'differs', line, dfacts, partPosition(seg, f, rep.index, 1, 1));
        }
      }
    }

    // F6: a required field is empty. "" (delete) counts as filled.
    if (v !== undefined && list) {
      list.forEach((fv, i) => {
        const field = i + 1;
        if (!fv.exists || !fv.required) return;
        if (header && field <= 2) return;
        if (seg.name === 'MSH' && field === 12 && msh12Empty && seg === msh) return;
        const value = seg.fields.find((x) => x.position === field)?.value ?? '';
        if (value === '') add('F6', 'differs', line, { version: v, fieldName: fv.name }, fieldPosition(seg, field));
      });
    }
  }

  // V3: the message says one version but uses things of a later one. The
  // field part needs only whether a field exists in the MSH-12 version and
  // its first version. These come from the field history, or without it
  // from the explanations (`since`), the same as the "Added in" warnings.
  if (v !== undefined && msh && mshVersion !== undefined && support === 'supported') {
    const line = msh.index + 1;
    const pos = fieldPosition(msh, 12);
    const own = new Map<string, FieldDoc[]>();
    let latest = '';
    const ids: string[] = [];
    for (const seg of segments) {
      if (!EXPLAINED.has(seg.name)) continue;
      const list = segmentDocs(own, seg.name, mshVersion);
      const header = isHeaderLine(seg);
      for (const f of seg.fields) {
        if (f.value === '' || (header && f.position <= 2)) continue;
        const fv = list[f.position - 1];
        if (!fv || fv.exists !== false || fv.since === undefined) continue;
        if (latest === '' || compareVersions(fv.since, latest) > 0) latest = fv.since;
        if (!ids.includes(fv.id)) ids.push(fv.id);
      }
    }
    const facts = { version: v, messageVersion: mshVersion };
    if (latest !== '') add('V3', 'note', line, { ...facts, reason: 'fields', since: latest, fields: ids.slice(0, 5) }, pos);
    const encoding = msh.fields[1]?.value.length ?? 0;
    if (encoding === 5 && !at(mshVersion, '2.7')) add('V3', 'note', line, { ...facts, reason: 'encoding', since: '2.7' }, fieldPosition(msh, 2));
    const msh12 = msh.fields.find((f) => f.position === 12);
    if (mshVersion === '2.3' && (msh12?.repetitions[0]?.components.length ?? 0) > 1) {
      add('V3', 'note', line, { ...facts, reason: 'parts', since: '2.3.1' }, pos);
    }
  }

  // By line, then by field number (so PID-3 comes before PID-31), then in
  // the order of CHECK_IDS.
  const order = (id: CheckId) => CHECK_IDS.indexOf(id);
  const field = (f: CheckFinding) => f.position?.field ?? 0;
  findings.sort((a, b) => a.line - b.line || field(a) - field(b) || order(a.id) - order(b.id));
  const counts: Record<CheckLevel, number> = { problem: 0, differs: 0, note: 0 };
  for (const f of findings) counts[f.level]++;
  return { version: v, findings, skipped: skippedChecks(v), counts };
}

/** The checks that do not run for a version (see CheckResult.skipped). */
function skippedChecks(version: string | undefined): CheckId[] {
  if (version === undefined) return [...VERSION_CHECKS];
  if (!hasFieldFacts(version)) return [...FIELD_CHECKS];
  return HAS_FIELD_HISTORY ? [] : [...STATUS_CHECKS];
}
