// SPDX-License-Identifier: MPL-2.0
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// Every field of every explained segment. Each case changes one field in a
// clean message and expects exactly one finding for it.
//
// With the field history, in every version from 2.3 to 2.9:
// - an empty required (R) field: one F6
// - a filled withdrawn (W) field: one F3
// - a filled "not used" (X) field: one F4
// - a filled "backward compatibility only" (B) field: one F5
// - a filled field that was added later: one F1 (plus the V3 hint)
//
// Without it, the tool has the field facts of v2.9 only (the field list):
// - in v2.9, an empty required field (least number of times 1): one F6
// - in the other versions, no field finding at all

import { describe, expect, it } from 'vitest';
import {
  checkMessage,
  DOCUMENTED_SEGMENTS,
  FIELD_CHECKS,
  HAS_FIELD_HISTORY,
  HISTORY_VERSIONS,
  LATEST_VERSION,
  parseMessage,
  type CheckFinding,
} from '../src/index.js';
import { cleanSegment, fieldsOf, goodValue, isRequired } from './check-messages.js';

function run(version: string, segment: string, set: Record<number, string | null>): CheckFinding[] {
  const lines = segment === 'MSH' ? [cleanSegment('MSH', version, set)] : [cleanSegment('MSH', version), cleanSegment(segment, version, set)];
  return checkMessage(parseMessage(lines.join('\r')), version).findings;
}

/** MSH-1 and MSH-2 are the delimiters; S2 checks MSH-2. An empty MSH-12 is V1, not F6. */
function skip(segment: string, field: number): boolean {
  return segment === 'MSH' && (field <= 2 || field === 12);
}

describe.runIf(HAS_FIELD_HISTORY)('one finding per field and rule, in every version', () => {
  let cases = 0;
  const counted = { F1: 0, F3: 0, F4: 0, F5: 0, F6: 0 };

  for (const version of HISTORY_VERSIONS) {
    for (const segment of DOCUMENTED_SEGMENTS) {
      it(`${segment} in v${version}`, () => {
        const problems: string[] = [];
        const line = segment === 'MSH' ? 1 : 2;
        const expectOne = (findings: CheckFinding[], id: keyof typeof counted, field: number, extra: string[] = []) => {
          cases++;
          const hits = findings.filter((f) => f.id === id);
          const rest = findings.filter((f) => f.id !== id && !extra.includes(f.id));
          const ok =
            hits.length === 1 &&
            hits[0]!.line === line &&
            hits[0]!.position?.segment === segment &&
            hits[0]!.position?.field === field &&
            rest.length === 0;
          if (ok) counted[id]++;
          else problems.push(`${segment}-${field} ${id}: ${findings.map((f) => `${f.id}@${f.position?.field}`).join(', ') || 'none'}`);
        };

        fieldsOf(segment, version).forEach((fv, i) => {
          const field = i + 1;
          if (skip(segment, field)) return;
          const value = goodValue(fv.dataType);
          if (!fv.exists) {
            expectOne(run(version, segment, { [field]: value }), 'F1', field, ['V3']);
            return;
          }
          if (fv.opt === 'R') expectOne(run(version, segment, { [field]: null }), 'F6', field);
          if (fv.opt === 'W') expectOne(run(version, segment, { [field]: value }), 'F3', field);
          if (fv.opt === 'X') expectOne(run(version, segment, { [field]: value }), 'F4', field);
          if (fv.opt === 'B') expectOne(run(version, segment, { [field]: value }), 'F5', field);
        });
        expect(problems).toEqual([]);
      });
    }
  }

  it('covered many cases of each kind', () => {
    // The field data has no "not used" (X) field, so F4 has no case.
    expect(counted.F4).toBe(0);
    for (const id of ['F1', 'F3', 'F5', 'F6'] as const) expect(counted[id], id).toBeGreaterThan(20);
    expect(cases).toBe(Object.values(counted).reduce((a, b) => a + b, 0));
  });
});

describe.runIf(!HAS_FIELD_HISTORY)('without the field history: F6 for each required field in v2.9 only', () => {
  let cases = 0;

  for (const segment of DOCUMENTED_SEGMENTS) {
    it(segment, () => {
      const problems: string[] = [];
      const line = segment === 'MSH' ? 1 : 2;
      fieldsOf(segment, LATEST_VERSION).forEach((doc, i) => {
        const field = i + 1;
        if (skip(segment, field) || !isRequired(doc)) return;
        cases++;
        // v2.9: exactly one F6, and nothing else.
        const findings = run(LATEST_VERSION, segment, { [field]: null });
        const one = findings.length === 1 && findings[0]!.id === 'F6' && findings[0]!.line === line && findings[0]!.position?.field === field;
        if (!one) problems.push(`${segment}-${field} v${LATEST_VERSION}: ${findings.map((f) => `${f.id}@${f.position?.field}`).join(', ') || 'none'}`);
        // The other versions: no field finding.
        for (const v of HISTORY_VERSIONS) {
          if (v === LATEST_VERSION) continue;
          const other = run(v, segment, { [field]: null }).filter((f) => FIELD_CHECKS.includes(f.id));
          if (other.length > 0) problems.push(`${segment}-${field} v${v}: ${other.map((f) => f.id).join(', ')}`);
        }
      });
      expect(problems).toEqual([]);
    });
  }

  it('covered the required fields of all segments', () => {
    // 17 fields of the v2.9 field list (MSH-1, MSH-2 and MSH-12 left out).
    expect(cases).toBeGreaterThanOrEqual(15);
  });
});
