// SPDX-License-Identifier: MPL-2.0
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// Message checks: one made-up message that triggers each check, and one
// that does not, in the versions where the rule changes.
//
// The field checks (F and D) run only for a version that the tool has
// field facts for (hasFieldFacts). The tests below that name a field use
// v2.9, the version of the field list, so they hold with and without the
// field history. Tests for other versions find their fields in the data.

import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CHECK_IDS,
  checkMessage,
  checkValueFormat,
  DOCUMENTED_SEGMENTS,
  FIELD_CHECKS,
  getFieldDoc,
  HAS_FIELD_HISTORY,
  hasFieldFacts,
  HISTORY_VERSIONS,
  LATEST_VERSION,
  messageVersion,
  parseMessage,
  STATUS_CHECKS,
  VERSION_CHECKS,
  type CheckFinding,
  type CheckId,
  type CheckResult,
  type FieldDoc,
} from '../src/index.js';
import { cleanSegment, fieldsOf, isRequired, messageOf } from './check-messages.js';
import { readSample } from './helpers.js';

function check(text: string, version?: string): CheckResult {
  return checkMessage(parseMessage(text), version);
}

function only(result: CheckResult, id: CheckId): CheckFinding[] {
  return result.findings.filter((f) => f.id === id);
}

function ids(result: CheckResult): string[] {
  return result.findings.map((f) => f.id);
}

/** The checks that a version skips (see CheckResult.skipped). */
function skippedFor(version: string): CheckId[] {
  if (!hasFieldFacts(version)) return [...FIELD_CHECKS];
  return HAS_FIELD_HISTORY ? [] : [...STATUS_CHECKS];
}

/** The first field of an explained segment, in a version, whose doc passes the test. */
function findField(test: (doc: FieldDoc, version: string) => boolean): { segment: string; field: number; version: string } | undefined {
  for (const version of HISTORY_VERSIONS) {
    for (const segment of DOCUMENTED_SEGMENTS) {
      const field = fieldsOf(segment, version).findIndex((doc) => test(doc, version)) + 1;
      if (field > 0) return { segment, field, version };
    }
  }
  return undefined;
}

const PID = (version: string, set: Record<number, string | null> = {}) => cleanSegment('PID', version, set);

/** The version of the field list. The tool always has its field facts. */
const V = LATEST_VERSION;

describe('a clean message', () => {
  for (const version of HISTORY_VERSIONS) {
    it(`gives no findings in v${version}`, () => {
      const r = check(messageOf(version, cleanSegment('EVN', version), PID(version), cleanSegment('PV1', version)), version);
      expect(r.findings).toEqual([]);
      expect(r.version).toBe(version);
      expect(r.skipped).toEqual(skippedFor(version));
      expect(r.counts).toEqual({ problem: 0, differs: 0, note: 0 });
    });
  }

  it('without a version skips the version checks', () => {
    const r = check(messageOf('2.5', PID('2.5')));
    expect(r.version).toBeUndefined();
    expect(r.skipped).toEqual([...VERSION_CHECKS]);
    expect(r.findings).toEqual([]);
  });

  it('treats a version without data as no version', () => {
    for (const v of ['2.2', 'abc', '', '2.10']) expect(check(messageOf('2.5'), v).version).toBeUndefined();
    expect(check(messageOf('2.5'), ' 2.5 ').version).toBe('2.5');
  });
});

describe('the field facts of the version', () => {
  it('the field checks run only for a version with field facts', () => {
    for (const v of HISTORY_VERSIONS) {
      // The first required field of PID in the facts the tool uses for v.
      const required = fieldsOf('PID', v).findIndex(isRequired) + 1;
      expect(required, v).toBeGreaterThan(0);
      const r = check(messageOf(v, PID(v, { [required]: null })), v);
      const fieldFindings = r.findings.filter((f) => FIELD_CHECKS.includes(f.id));
      if (hasFieldFacts(v)) expect(fieldFindings.map((f) => `${f.id} ${f.position?.field}`), v).toEqual([`F6 ${required}`]);
      else expect(fieldFindings, v).toEqual([]);
      expect(r.skipped, v).toEqual(skippedFor(v));
    }
  });

  it('v2.9 always has field facts; a version that the tool does not explain has none', () => {
    expect(hasFieldFacts(V)).toBe(true);
    expect(hasFieldFacts(` ${V} `)).toBe(true);
    for (const v of ['2.2', '2.10', '', 'abc', undefined]) expect(hasFieldFacts(v), String(v)).toBe(false);
  });

  it.runIf(HAS_FIELD_HISTORY)('with the field history, every version has field facts and nothing is skipped', () => {
    for (const v of HISTORY_VERSIONS) {
      expect(hasFieldFacts(v), v).toBe(true);
      expect(check(messageOf(v), v).skipped, v).toEqual([]);
    }
  });

  it.runIf(!HAS_FIELD_HISTORY)('without the field history, only v2.9 has field checks, and F3, F4 and F5 are skipped there', () => {
    for (const v of HISTORY_VERSIONS) {
      expect(hasFieldFacts(v), v).toBe(v === V);
      expect(check(messageOf(v), v).skipped, v).toEqual(v === V ? [...STATUS_CHECKS] : [...FIELD_CHECKS]);
    }
  });

  it.runIf(!HAS_FIELD_HISTORY)('without the field history, no field in v2.9 is reported as withdrawn, not used or backward compatible', () => {
    for (const segment of DOCUMENTED_SEGMENTS) {
      // Every field of the segment filled with a value (in MSH, not the
      // delimiters, the message type and the version).
      const fields = fieldsOf(segment, V)
        .map((_, i) => i + 1)
        .filter((f) => segment !== 'MSH' || ![1, 2, 9, 12].includes(f));
      const set = Object.fromEntries(fields.map((f) => [f, 'X']));
      const text = segment === 'MSH' ? cleanSegment('MSH', V, set) : messageOf(V, cleanSegment(segment, V, set));
      const r = check(text, V);
      expect(r.findings.filter((f) => STATUS_CHECKS.includes(f.id)), segment).toEqual([]);
      expect(r.findings.some((f) => f.position?.segment === segment), segment).toBe(true);
    }
  });

  it.runIf(!HAS_FIELD_HISTORY)('without the field history, other versions still get the checks that need no field facts', () => {
    // A v2.3 message with an empty required field (v2.9 list), a repeating
    // field, a bad date and 5 encoding characters.
    const msh = cleanSegment('MSH', '2.3', { 2: '^~\\&#', 7: '20261340' });
    const r = check([msh, PID('2.3', { 3: null, 8: 'F~M' }), 'ZZ1|1'].join('\r'), '2.3');
    expect(r.findings.filter((f) => FIELD_CHECKS.includes(f.id))).toEqual([]);
    expect(ids(r).sort()).toEqual(['G1', 'S2', 'V3']);
    expect(only(r, 'S2')[0]?.facts).toMatchObject({ version: '2.3', reason: 'long' });
    expect(only(r, 'V3')[0]?.facts).toMatchObject({ reason: 'encoding', since: '2.7' });
  });
});

describe('S1: the message starts with MSH, FHS or BHS', () => {
  it('fires when the first segment is not a header', () => {
    const r = check('PID|1||TEST0001\rMSH|^~\\&|A||||||ADT^A01|1|P|2.5');
    expect(only(r, 'S1')).toEqual([{ id: 'S1', level: 'problem', line: 1, facts: { reason: 'not-first' } }]);
  });

  it('fires for an empty message and for a batch without MSH', () => {
    expect(only(check(''), 'S1')[0]?.facts.reason).toBe('no-msh');
    expect(only(check('FHS|^~\\&|A\rBHS|^~\\&|A'), 'S1')[0]?.facts.reason).toBe('no-msh');
  });

  it('does not fire for MSH or for a batch with MSH', () => {
    expect(only(check(messageOf('2.5')), 'S1')).toEqual([]);
    const batch = ['FHS|^~\\&|A', 'BHS|^~\\&|A', cleanSegment('MSH', '2.5'), 'BTS|1', 'FTS|1'].join('\r');
    const r = check(batch, '2.5');
    expect(only(r, 'S1')).toEqual([]);
    // The batch segments are noted once per name: the tool does not explain them.
    expect(only(r, 'G2').map((f) => f.position?.segment)).toEqual(['FHS', 'BHS', 'BTS', 'FTS']);
  });
});

describe('S2: MSH-2 per version', () => {
  const s2 = (enc: string, version?: string) => only(check(cleanSegment('MSH', version ?? '2.5', { 2: enc }), version), 'S2');

  it('is a problem with fewer than 2 characters, in every version and without one', () => {
    for (const v of [...HISTORY_VERSIONS, undefined]) {
      expect(s2('^', v).map((f) => [f.level, f.facts.reason, f.facts.length]), String(v)).toEqual([['problem', 'too-short', 1]]);
    }
  });

  it('allows 2 or 3 characters up to v2.6 and differs from v2.7', () => {
    for (const enc of ['^~', '^~\\']) {
      expect(s2(enc, '2.6')).toEqual([]);
      expect(s2(enc, '2.5.1')).toEqual([]);
      expect(s2(enc, '2.7').map((f) => [f.level, f.facts.reason])).toEqual([['differs', 'short']]);
      expect(s2(enc, '2.9').map((f) => f.level)).toEqual(['differs']);
    }
  });

  it('notes 4 characters from v2.8 only', () => {
    expect(s2('^~\\&', '2.7.1')).toEqual([]);
    expect(s2('^~\\&', '2.8').map((f) => [f.level, f.facts.reason])).toEqual([['note', 'no-truncation']]);
    expect(s2('^~\\&', '2.9').map((f) => f.level)).toEqual(['note']);
  });

  it('differs with 5 characters up to v2.6, and is fine from v2.7', () => {
    expect(s2('^~\\&#', '2.6').map((f) => [f.level, f.facts.reason])).toEqual([['differs', 'long']]);
    expect(s2('^~\\&#', '2.3').map((f) => f.level)).toEqual(['differs']);
    for (const v of ['2.7', '2.7.1', '2.8', '2.9']) expect(s2('^~\\&#', v), v).toEqual([]);
  });

  it('differs with more than 5 characters', () => {
    expect(s2('^~\\&#!', '2.9').map((f) => f.facts.reason)).toEqual(['too-long']);
  });

  it('without a version checks only the length below 2', () => {
    for (const enc of ['^~', '^~\\&', '^~\\&#', '^~\\&#!']) expect(s2(enc, undefined)).toEqual([]);
  });
});

describe('S3a and S3b: segment names', () => {
  it('S3a: a name that is not 3 characters is a problem, and its text is left out', () => {
    const r = check(messageOf('2.5', 'PIDX|1', 'PI|1', 'SECRET NAME|1'));
    expect(only(r, 'S3a').map((f) => [f.line, f.facts.length, f.position])).toEqual([
      [2, 4, { segmentIndex: 1 }],
      [3, 2, { segmentIndex: 2 }],
      [4, 11, { segmentIndex: 3 }],
    ]);
    expect(JSON.stringify(r)).not.toContain('SECRET');
    expect(JSON.stringify(r)).not.toContain('PIDX');
  });

  it('S3b: other characters than capital letters and digits are a note', () => {
    const r = check(messageOf('2.5', 'pid|1', 'P-D|1'));
    expect(only(r, 'S3b').map((f) => [f.level, f.line, f.position])).toEqual([
      ['note', 2, { segmentIndex: 1 }],
      ['note', 3, { segmentIndex: 2 }],
    ]);
    expect(JSON.stringify(r)).not.toContain('pid');
  });

  it('do not fire for good names', () => {
    const r = check(messageOf('2.5', PID('2.5'), 'ZP1|1', 'NTE|1'), '2.5');
    expect(only(r, 'S3a')).toEqual([]);
    expect(only(r, 'S3b')).toEqual([]);
  });
});

describe('S4 and S5: segment ends', () => {
  const lines = [cleanSegment('MSH', '2.5'), PID('2.5')];

  it('S4: LF or CRLF is a note for the whole message', () => {
    expect(only(check(lines.join('\n')), 'S4')).toEqual([{ id: 'S4', level: 'note', line: 0, facts: { terminator: 'LF' } }]);
    expect(only(check(lines.join('\r\n')), 'S4')[0]?.facts.terminator).toBe('CRLF');
  });

  it('S5: mixed ends are a note (and S4 is not added)', () => {
    const r = check(lines.join('\r') + '\n' + lines[1]);
    expect(ids(r)).toEqual(['S5']);
    expect(only(r, 'S5')[0]?.line).toBe(0);
  });

  it('CR gives neither', () => {
    expect(ids(check(lines.join('\r')))).toEqual([]);
    expect(ids(check(lines.join('\r') + '\r'))).toEqual([]);
  });
});

describe('S6: escape sequences', () => {
  const s6 = (value: string, version?: string, enc?: string) => {
    const msh = cleanSegment('MSH', version ?? '2.5', enc === undefined ? {} : { 2: enc });
    return only(check([msh, PID(version ?? '2.5', { 5: value })].join('\r'), version), 'S6');
  };

  it('accepts the codes of every version', () => {
    for (const v of HISTORY_VERSIONS) {
      expect(s6('DOE\\F\\\\S\\\\T\\\\R\\\\E\\^JANE', v), v).toEqual([]);
      expect(s6('A\\H\\B\\N\\', v)).toEqual([]);
      expect(s6('A\\X0D0A\\B\\Zlocal\\C\\C2842\\D\\M2842\\E\\M284200\\', v)).toEqual([]);
    }
  });

  it('finds an escape that is not closed', () => {
    const found = s6('DOE\\F^JANE', '2.5');
    expect(found.map((f) => [f.level, f.facts.reason, f.position])).toEqual([
      ['differs', 'unclosed', { segment: 'PID', segmentIndex: 1, field: 5, rep: 1, comp: 1 }],
    ]);
    // Also without a version.
    expect(s6('DOE\\F', undefined).map((f) => f.facts.reason)).toEqual(['unclosed']);
  });

  it('finds an unknown code without naming it', () => {
    const found = s6('DOE\\Q\\^\\\\', '2.5');
    expect(found.map((f) => f.facts.reason)).toEqual(['unknown']);
    expect(found[0]?.facts.code).toBeUndefined();
  });

  it('finds hex escapes without pairs of hex digits', () => {
    for (const bad of ['\\X0\\', '\\X\\', '\\XZZ\\', '\\C12\\', '\\M12345\\']) {
      expect(s6(`A${bad}B`, '2.5').map((f) => f.facts.reason), bad).toEqual(['hex']);
    }
  });

  it('\\P\\ differs before v2.8 and is fine from v2.8', () => {
    for (const v of ['2.3', '2.5.1', '2.7', '2.7.1']) {
      expect(s6('A\\P\\B', v).map((f) => [f.facts.reason, f.facts.code, f.facts.since]), v).toEqual([['later', 'P', '2.8']]);
    }
    for (const v of ['2.8', '2.8.1', '2.8.2', '2.9']) expect(s6('A\\P\\B', v), v).toEqual([]);
    // Without a version it is not reported.
    expect(s6('A\\P\\B', undefined)).toEqual([]);
  });

  it('notes text formatting outside FT, and accepts it in FT', () => {
    expect(s6('A\\.br\\B', V).map((f) => [f.level, f.facts.reason, f.facts.code, f.facts.dataType, f.facts.fieldName])).toEqual([
      ['note', 'formatting', '.br', 'XPN', 'Patient Name'],
    ]);
    const obx = (type: string) =>
      only(check(messageOf(V, cleanSegment('OBX', V, { 2: type, 5: 'Line\\.br\\Line\\.sp 2\\\\.in+4\\' })), V), 'S6');
    expect(obx('FT')).toEqual([]);
    expect(obx('TX').map((f) => [f.facts.reason, f.facts.dataType])).toEqual([['formatting', 'TX']]);
    // Without a version the data type is not known, so nothing is said.
    expect(s6('A\\.br\\B', undefined)).toEqual([]);
    // A formatting command that does not exist is unknown.
    expect(s6('A\\.xx\\B', V).map((f) => f.facts.reason)).toEqual(['unknown']);
  });

  it('says nothing about text formatting, and names no field, in a version without field facts', () => {
    for (const v of HISTORY_VERSIONS.filter((x) => !hasFieldFacts(x))) {
      expect(s6('A\\.br\\B', v), v).toEqual([]);
      expect(s6('A\\Q\\B', v).map((f) => [f.facts.reason, f.facts.fieldName]), v).toEqual([['unknown', undefined]]);
    }
  });

  it('uses the escape character of MSH-2, and skips S6 when there is none', () => {
    expect(s6('DOE\\Q\\', '2.5', '^~!&')).toEqual([]);
    expect(s6('DOE!Q!', '2.5', '^~!&').map((f) => f.facts.reason)).toEqual(['unknown']);
    expect(s6('DOE\\Q', '2.5', '^~')).toEqual([]);
  });

  it('gives one finding per field and reason', () => {
    expect(s6('\\Q\\\\Q\\~\\W\\', '2.5').map((f) => f.facts.reason)).toEqual(['unknown']);
  });
});

describe('S7: more than one message', () => {
  it('notes a second MSH, with the count', () => {
    const r = check([cleanSegment('MSH', '2.5'), PID('2.5'), cleanSegment('MSH', '2.5'), cleanSegment('MSH', '2.5')].join('\r'), '2.5');
    expect(only(r, 'S7')).toEqual([{ id: 'S7', level: 'note', line: 3, position: { segment: 'MSH', segmentIndex: 2 }, facts: { count: 3 } }]);
  });

  it('does not fire for one message', () => {
    expect(only(check(messageOf('2.5', PID('2.5'))), 'S7')).toEqual([]);
  });
});

describe('V1 and V2: the version in MSH-12', () => {
  it('V1: an empty MSH-12 is a problem, and F6 does not repeat it', () => {
    const text = cleanSegment('MSH', V, { 12: null });
    expect(only(check(text), 'V1').map((f) => [f.level, f.facts.reason, f.position?.field])).toEqual([['problem', 'empty', 12]]);
    const picked = check(text, V);
    expect(only(picked, 'V1').map((f) => [f.facts.reason, f.facts.version])).toEqual([['empty', V]]);
    expect(only(picked, 'F6')).toEqual([]);
  });

  it('V1: an unknown version is a problem, and its text is left out', () => {
    for (const bad of ['2.10', 'SECRETVER', '3.0']) {
      const r = check(cleanSegment('MSH', '2.5', { 12: bad }));
      expect(only(r, 'V1').map((f) => f.facts.reason), bad).toEqual(['unknown']);
      expect(JSON.stringify(r)).not.toContain(bad);
    }
  });

  it('V2: a version older than 2.3 is a note, with that version', () => {
    for (const old of ['2.0', '2.0D', '2.1', '2.2']) {
      const r = check(cleanSegment('MSH', '2.5', { 12: old }));
      expect(r.findings.map((f) => [f.id, f.level, f.facts.messageVersion])).toEqual([['V2', 'note', old]]);
    }
  });

  it('do not fire for a supported version, also with parts', () => {
    expect(ids(check(cleanSegment('MSH', '2.5', { 12: '2.5^USA' })))).toEqual([]);
  });
});

describe('V3: the message uses things of a later version', () => {
  // The field part uses only whether a field exists in the MSH-12 version
  // (the "since" of the explanations), so it runs with and without the
  // field history.
  it('names the earliest version in which all filled fields exist', () => {
    const r = check(messageOf('2.3', PID('2.3', { 31: 'Y' }), cleanSegment('EVN', '2.3', { 7: 'X' })), '2.3');
    expect(only(r, 'V3').map((f) => f.facts)).toEqual([
      { version: '2.3', messageVersion: '2.3', reason: 'fields', since: '2.4', fields: ['PID-31', 'EVN-7'] },
    ]);
    // Compared with MSH-12, also when another version was picked.
    expect(only(check(messageOf('2.3', PID('2.3', { 31: 'Y' })), '2.9'), 'V3')[0]?.facts.since).toBe('2.4');
  });

  it('agrees with the "since" of every filled field', () => {
    for (const v of HISTORY_VERSIONS) {
      const later = fieldsOf('PID', v)
        .map((doc, i) => ({ doc, field: i + 1 }))
        .filter(({ doc }) => doc.exists === false);
      const set = Object.fromEntries(later.map(({ field }) => [field, 'Y']));
      const facts = only(check(messageOf(v, PID(v, set)), v), 'V3')[0]?.facts;
      if (later.length === 0) expect(facts, v).toBeUndefined();
      else expect(facts?.fields, v).toEqual(later.slice(0, 5).map(({ doc }) => doc.id));
    }
  });

  it('hints at v2.7 for 5 encoding characters', () => {
    const r = check(cleanSegment('MSH', '2.5', { 2: '^~\\&#' }), '2.5');
    expect(only(r, 'V3').map((f) => [f.facts.reason, f.facts.since])).toEqual([['encoding', '2.7']]);
    expect(only(check(cleanSegment('MSH', '2.7', { 2: '^~\\&#' }), '2.7'), 'V3')).toEqual([]);
  });

  it('hints at v2.3.1 for MSH-12 with parts in a v2.3 message', () => {
    const r = check(cleanSegment('MSH', '2.3', { 12: '2.3^USA' }), '2.3');
    expect(only(r, 'V3').map((f) => [f.facts.reason, f.facts.since])).toEqual([['parts', '2.3.1']]);
    expect(only(check(cleanSegment('MSH', '2.4', { 12: '2.4^USA' }), '2.4'), 'V3')).toEqual([]);
  });

  it('does not run without a version, or for an unknown MSH-12', () => {
    expect(only(check(messageOf('2.3', PID('2.3', { 31: 'Y' }))), 'V3')).toEqual([]);
    expect(only(check(cleanSegment('MSH', '2.5', { 12: '2.2' }) + '\r' + PID('2.3', { 31: 'Y' }), '2.3'), 'V3')).toEqual([]);
  });
});

describe('F1 to F7: fields', () => {
  it('F1: a filled field that was added later differs, with its name and first version', () => {
    // v2.9 has every field of the field list, so F1 needs older field facts.
    const found = findField((doc, version) => doc.exists === false && hasFieldFacts(version));
    if (!found) {
      expect(HAS_FIELD_HISTORY).toBe(false);
      return;
    }
    const { segment, field, version } = found;
    const doc = getFieldDoc(segment, field, version)!;
    const line = segment === 'MSH' ? cleanSegment('MSH', version, { [field]: 'X' }) : messageOf(version, cleanSegment(segment, version, { [field]: 'X' }));
    expect(only(check(line, version), 'F1').map((f) => [f.level, f.position?.field, f.facts])).toEqual([
      ['differs', field, { version, fieldName: doc.name, since: doc.since }],
    ]);
  });

  it('F2: a field past the last HL7 field is a note; local fields are allowed from v2.5', () => {
    const count = fieldsOf('AL1', V).length;
    const r = only(check(messageOf(V, cleanSegment('AL1', V, { [count + 2]: 'LOCAL' })), V), 'F2');
    expect(r.map((f) => [f.level, f.facts.localAllowed, f.facts.lastField, f.position?.field])).toEqual([['note', true, count, count + 2]]);
    expect(count).toBe(6);
    expect(only(check(messageOf(V, cleanSegment('AL1', V, { [count]: '20260101' })), V), 'F2')).toEqual([]);
  });

  it('F2: local fields are not allowed before v2.5', () => {
    for (const v of HISTORY_VERSIONS.filter((x) => hasFieldFacts(x))) {
      const docs = fieldsOf('AL1', v);
      // The last field that exists in the version.
      const last = docs.reduce((n, doc, i) => (doc.exists === false ? n : i + 1), 0);
      const r = only(check(messageOf(v, cleanSegment('AL1', v, { [docs.length + 1]: 'LOCAL' })), v), 'F2');
      expect(r.map((f) => [f.facts.localAllowed, f.facts.lastField]), v).toEqual([[!['2.3', '2.3.1', '2.4'].includes(v), last]]);
    }
  });

  it('F3, F4 and F5: every filled field with that rule gives one finding (see checks-matrix.test.ts)', () => {
    for (const id of ['F3', 'F4', 'F5'] as const) {
      const opt = { F3: 'W', F4: 'X', F5: 'B' }[id];
      const found = findField((doc, version) => doc.exists !== false && doc.opt === opt && hasFieldFacts(version));
      if (!found) continue;
      const { segment, field, version } = found;
      const text = segment === 'MSH' ? cleanSegment('MSH', version, { [field]: 'X' }) : messageOf(version, cleanSegment(segment, version, { [field]: 'X' }));
      expect(only(check(text, version), id).map((f) => f.position?.field), `${id} ${segment}-${field} v${version}`).toEqual([field]);
    }
  });

  it('F4: the field data has no "not used" (X) field, so F4 cannot fire today', () => {
    for (const v of HISTORY_VERSIONS) {
      for (const seg of ['MSH', 'EVN', 'PID', 'PV1', 'NK1', 'ORC', 'OBR', 'OBX', 'AL1', 'DG1']) {
        for (let field = 1; field <= 60; field++) {
          const r = check(messageOf(v, cleanSegment(seg, v, { [field]: 'X' })), v);
          expect(only(r, 'F4')).toEqual([]);
        }
      }
    }
  });

  it('F6: an empty required field differs; "" counts as filled', () => {
    const r = check(messageOf(V, PID(V, { 3: null })), V);
    expect(only(r, 'F6')).toEqual([
      {
        id: 'F6',
        level: 'differs',
        line: 2,
        position: { segment: 'PID', segmentIndex: 1, field: 3 },
        facts: { version: V, fieldName: 'Patient Identifier List' },
      },
    ]);
    expect(only(check(messageOf(V, PID(V, { 3: '""' })), V), 'F6')).toEqual([]);
    // A field past the end of the line is empty too.
    expect(only(check(messageOf(V, 'PID|1'), V), 'F6').map((f) => f.position?.field)).toEqual([3, 5]);
  });

  it('F7: a field that repeats too often differs', () => {
    const r = check(messageOf(V, PID(V, { 8: 'F~M' })), V);
    expect(only(r, 'F7').map((f) => [f.level, f.facts.count, f.facts.max, f.facts.fieldName])).toEqual([['differs', 2, 1, 'Administrative Sex']]);
    expect(only(check(messageOf(V, PID(V, { 3: 'A~B~C' })), V), 'F7')).toEqual([]);
  });
});

describe('D1 to D5: formats', () => {
  it('D1: DT', () => {
    for (const good of ['2026', '202611', '20261108', '20240229']) expect(checkValueFormat('DT', good, '2.5'), good).toBeUndefined();
    for (const bad of ['26', '2026-11-08', '2026110', '202611089']) expect(checkValueFormat('DT', bad, '2.5'), bad).toBe('format');
    for (const bad of ['202613', '20261131', '20230229', '20261100']) expect(checkValueFormat('DT', bad, '2.5'), bad).toBe('calendar');
    const r = check(messageOf(V, cleanSegment('AL1', V, { 6: '20261340' })), V);
    expect(only(r, 'D1').map((f) => [f.level, f.facts.dataType, f.facts.reason, f.facts.expected])).toEqual([
      ['differs', 'DT', 'calendar', 'YYYY[MM[DD]]'],
    ]);
  });

  it('D2: TS and DTM; an hour alone is allowed in every version', () => {
    for (const v of HISTORY_VERSIONS) {
      for (const good of ['2026', '20261108', '2026110809', '202611080930', '20261108093000.1234', '20261108093000+0100', '2026110809-0500']) {
        expect(checkValueFormat('TS', good, v), `${good} ${v}`).toBeUndefined();
        expect(checkValueFormat('DTM', good, v), `${good} ${v}`).toBeUndefined();
      }
    }
    for (const bad of ['202611080', '20261108093000.12345', '202611080930.5', '20261108+01', '2026-11-08T09:30']) {
      expect(checkValueFormat('TS', bad, '2.3'), bad).toBe('format');
    }
    for (const bad of ['2026110824', '202611080960', '20261108093060', '20261301']) expect(checkValueFormat('DTM', bad, '2.9'), bad).toBe('calendar');
    const dtm = check(cleanSegment('MSH', V, { 7: '2026110' }), V);
    expect(only(dtm, 'D2').map((f) => [f.facts.dataType, f.facts.reason, f.position])).toEqual([
      ['DTM', 'format', { segment: 'MSH', segmentIndex: 0, field: 7 }],
    ]);
  });

  it('D2: in a TS field only the first part (the time) is checked', () => {
    // TS is a data type of older versions, so this needs older field facts.
    const found = findField((doc, version) => doc.exists !== false && doc.dataType === 'TS' && hasFieldFacts(version));
    if (!found) {
      expect(HAS_FIELD_HISTORY).toBe(false);
      return;
    }
    const { segment, field, version } = found;
    const text = (value: string) =>
      segment === 'MSH' ? cleanSegment('MSH', version, { [field]: value }) : messageOf(version, cleanSegment(segment, version, { [field]: value }));
    const ts = only(check(text('2026110825^S'), version), 'D2');
    expect(ts.map((f) => [f.facts.dataType, f.facts.reason, f.position?.field, f.position?.comp])).toEqual([['TS', 'calendar', field, 1]]);
    expect(only(check(text('2026110809^H'), version), 'D2')).toEqual([]);
  });

  it('D3: TM', () => {
    for (const good of ['09', '0930', '093000', '093000.1', '0930+0100', '2359']) expect(checkValueFormat('TM', good, '2.5'), good).toBeUndefined();
    for (const bad of ['9', '930', '09:30', '0930.5', '093000.12345']) expect(checkValueFormat('TM', bad, '2.5'), bad).toBe('format');
    for (const bad of ['24', '0960', '093061']) expect(checkValueFormat('TM', bad, '2.5'), bad).toBe('calendar');
  });

  it('D4: NM; from v2.8 a digit must come before the decimal point', () => {
    for (const good of ['1', '-1', '+1.5', '0.5', '007', '5.']) expect(checkValueFormat('NM', good, '2.9'), good).toBeUndefined();
    for (const bad of ['abc', '1,5', '1.2.3', '<5', '', '-', '1e3']) expect(checkValueFormat('NM', bad, '2.5'), bad).toBe('format');
    for (const v of ['2.3', '2.7.1']) expect(checkValueFormat('NM', '.5', v), v).toBeUndefined();
    for (const v of ['2.8', '2.8.2', '2.9']) expect(checkValueFormat('NM', '-.5', v), v).toBe('point');
    const nm = only(check(messageOf(V, PID(V, { 25: '.5' })), V), 'D4');
    expect(nm.map((f) => [f.level, f.facts.reason, f.facts.dataType])).toEqual([['differs', 'point', 'NM']]);
  });

  it('D5: SI; 0 to 9999 from v2.5', () => {
    for (const v of ['2.3', '2.4']) expect(checkValueFormat('SI', '10000', v), v).toBeUndefined();
    for (const v of ['2.5', '2.9']) expect(checkValueFormat('SI', '10000', v), v).toBe('range');
    for (const bad of ['-1', '1.0', 'A', '1.']) expect(checkValueFormat('SI', bad, '2.3'), bad).toBe('format');
    expect(checkValueFormat('SI', '+9999', '2.9')).toBeUndefined();
    const si = only(check(messageOf(V, cleanSegment('AL1', V, { 1: '10000' })), V), 'D5');
    expect(si.map((f) => [f.facts.reason, f.facts.fieldName])).toEqual([['range', 'Set ID - AL1']]);
  });

  it('skip empty, "" and repeated values one by one', () => {
    expect(only(check(messageOf(V, cleanSegment('AL1', V, { 6: '""' })), V), 'D1')).toEqual([]);
    const r = check(messageOf(V, cleanSegment('PV1', V, { 45: '20261108~2026130' })), V);
    expect(only(r, 'D2').map((f) => f.position)).toEqual([{ segment: 'PV1', segmentIndex: 1, field: 45, rep: 2, comp: 1 }]);
    expect(checkValueFormat('CWE', 'anything', '2.5')).toBeUndefined();
  });
});

describe('G1 and G2: segments the tool does not check', () => {
  it('one note per segment name, with the count', () => {
    const r = check(messageOf('2.5', 'ZPI|1', 'NTE|1', 'ZPI|2', 'NTE|2', 'NTE|3', 'IN1|1'), '2.5');
    expect(r.findings.map((f) => [f.id, f.line, f.position?.segment, f.facts.count])).toEqual([
      ['G1', 2, 'ZPI', 2],
      ['G2', 3, 'NTE', 3],
      ['G2', 7, 'IN1', 1],
    ]);
  });

  it('no note for the explained segments', () => {
    expect(ids(check(messageOf('2.5', PID('2.5'), cleanSegment('PV1', '2.5')), '2.5'))).toEqual([]);
  });
});

describe('the result', () => {
  it('is sorted by line, then in check order, and counts the levels', () => {
    const r = check(['PID|1', cleanSegment('MSH', '2.3', { 12: '2.2' }), 'ZZ1|1', 'NTE|1'].join('\n'));
    expect(r.findings.map((f) => `${f.line}:${f.id}`)).toEqual(['0:S4', '1:S1', '2:V2', '3:G1', '4:G2']);
    expect(r.counts).toEqual({ problem: 1, differs: 0, note: 4 });
    const order = r.findings.map((f) => CHECK_IDS.indexOf(f.id));
    expect(order.every((i) => i >= 0)).toBe(true);
  });
});

describe('the samples', () => {
  const files = readdirSync(new URL('../../../samples/', import.meta.url)).filter((f) => f.endsWith('.hl7'));
  // The v2.3 sample fills EVN-7 (added in v2.4) on purpose, to show the
  // version warning. The checks report it as F1 when they have the field
  // facts of v2.3, with the V3 hint. The v2.9 sample has two mistakes on
  // purpose, to show the field checks: a birth date that is not a real date
  // (PID-7) and an empty required field (PV1-2).
  const ON_PURPOSE: Record<string, string[]> = {
    'v23-adt-a01.hl7': ['F1 EVN-7', 'V3 MSH-12'],
    'v29-adt-a04.hl7': ['D2 PID-7', 'F6 PV1-2'],
  };

  for (const file of files) {
    it(`${file}: no problem and no difference in its own version`, () => {
      const m = parseMessage(readSample(file));
      const version = messageVersion(m) ?? '';
      const r = checkMessage(m, HISTORY_VERSIONS.includes(version) ? version : undefined);
      const allowed = ON_PURPOSE[file] ?? [];
      const unexpected = r.findings
        .map((f) => ({ f, key: `${f.id} ${f.position?.segment}-${f.position?.field}` }))
        .filter(({ f, key }) => f.level !== 'note' && !allowed.includes(key));
      expect(unexpected.map((u) => u.key)).toEqual([]);
      expect(r.counts.problem).toBe(0);
    });
  }

  it('v22-adt-a01.hl7: only the V2 note, and no version checks', () => {
    const r = checkMessage(parseMessage(readSample('v22-adt-a01.hl7')));
    expect(r.findings.map((f) => [f.id, f.level, f.facts.messageVersion])).toEqual([['V2', 'note', '2.2']]);
    expect(r.skipped).toEqual([...VERSION_CHECKS]);
  });

  it('v23-adt-a01.hl7: the on-purpose field gives the V3 hint, and F1 when the field checks run', () => {
    const r = checkMessage(parseMessage(readSample('v23-adt-a01.hl7')), '2.3');
    const differs = r.findings.filter((f) => f.level !== 'note').map((f) => `${f.id} ${f.position?.segment}-${f.position?.field}`);
    expect(differs).toEqual(hasFieldFacts('2.3') ? ['F1 EVN-7'] : []);
    expect(only(r, 'V3').map((f) => [f.facts.reason, f.facts.fields])).toEqual([['fields', ['EVN-7']]]);
    expect(r.skipped).toEqual(skippedFor('2.3'));
  });

  it('v29-adt-a04.hl7: exactly the two mistakes on purpose, and nothing else', () => {
    const m = parseMessage(readSample('v29-adt-a04.hl7'));
    const expected: CheckFinding[] = [
      {
        id: 'D2',
        level: 'differs',
        line: 3,
        position: { segment: 'PID', segmentIndex: 2, field: 7 },
        facts: { version: V, fieldName: 'Date/Time of Birth', dataType: 'DTM', reason: 'calendar', expected: 'YYYY[MM[DD[HH[MM[SS[.S[S[S[S]]]]]]]]][+/-ZZZZ]' },
      },
      {
        id: 'F6',
        level: 'differs',
        line: 4,
        position: { segment: 'PV1', segmentIndex: 3, field: 2 },
        facts: { version: V, fieldName: 'Patient Class' },
      },
    ];
    // The same with v2.9 picked, and with Auto (MSH-12 is 2.9).
    for (const r of [checkMessage(m, V), checkMessage(m, messageVersion(m))]) {
      expect(r.version).toBe(V);
      expect(r.findings).toEqual(expected);
      expect(r.counts).toEqual({ problem: 0, differs: 2, note: 0 });
      expect(r.skipped).toEqual(skippedFor(V));
    }
    // Without the two mistakes, the message gives no finding at all.
    const fixed = readSample('v29-adt-a04.hl7').replace('|20010231|', '|20010228|').replace('PV1|1||', 'PV1|1|O^Outpatient^HL70004^^^^2.9|');
    expect(checkMessage(parseMessage(fixed), V).findings).toEqual([]);
  });
});
