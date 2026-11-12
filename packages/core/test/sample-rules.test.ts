// SPDX-License-Identifier: MPL-2.0
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// Every sample message must follow the rules of its own HL7 version, and
// all its data must be clearly made up.

import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DOCUMENTED_SEGMENTS,
  getFieldDoc,
  getSegmentDoc,
  hasFieldFacts,
  HISTORY_VERSIONS,
  messageVersion,
  parseMessage,
  versionSupport,
  type HL7Segment,
} from '../src/index.js';
import { readSample } from './helpers.js';

const files = readdirSync(new URL('../../../samples/', import.meta.url)).filter((f) => f.endsWith('.hl7'));

// Fields that a sample fills on purpose although its version does not have
// them. The page shows a warning for them.
const ON_PURPOSE: Record<string, string[]> = {
  'v23-adt-a01.hl7': ['EVN-7'],
};

// Required fields that a sample leaves empty on purpose. The message checks
// show a finding for them.
const EMPTY_ON_PURPOSE: Record<string, string[]> = {
  'v29-adt-a04.hl7': ['PV1-2'],
};

/** The version whose rules apply: the message version, or v2.3 for older ones. */
function rulesVersion(version: string): string {
  return HISTORY_VERSIONS.includes(version) ? version : '2.3';
}

function filled(seg: HL7Segment): { position: number; value: string; reps: number }[] {
  return seg.fields
    .filter((f) => f.value !== '' && !(seg.name === 'MSH' && f.position <= 2))
    .map((f) => ({ position: f.position, value: f.value, reps: f.repetitions.filter((r) => r.value !== '').length }));
}

describe('sample messages follow the rules of their version', () => {
  it('there are samples to check', () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  for (const file of files) {
    describe(file, () => {
      const m = parseMessage(readSample(file));
      const version = messageVersion(m) ?? '';
      const rules = rulesVersion(version);

      it('parses without warnings and has a known version', () => {
        expect(m.warnings).toEqual([]);
        expect(versionSupport(version)).not.toBe('unknown');
      });

      it('has the version of its file name in MSH-12', () => {
        // v23-... is 2.3, v251-... is 2.5.1; files without a prefix are 2.5.1.
        const prefix = /^v(\d)(\d)(\d?)-/.exec(file);
        const expected = prefix ? [prefix[1], prefix[2], prefix[3]].filter(Boolean).join('.') : '2.5.1';
        expect(version).toBe(expected);
      });

      it('fills only fields that exist in its version', () => {
        const problems: string[] = [];
        for (const seg of m.segments) {
          if (!DOCUMENTED_SEGMENTS.includes(seg.name)) continue;
          for (const f of filled(seg)) {
            const id = `${seg.name}-${f.position}`;
            const doc = getFieldDoc(seg.name, f.position, rules);
            if (!doc) problems.push(`${id}: not in the field list`);
            else if (!doc.exists && !(ON_PURPOSE[file] ?? []).includes(id)) problems.push(`${id}: added in ${doc.since}`);
          }
        }
        expect(problems).toEqual([]);
      });

      // The repeat and required rules of the version: only when the tool has
      // the field facts of that version (see hasFieldFacts).
      it.runIf(hasFieldFacts(rules))('does not repeat a field more than its version allows', () => {
        const problems: string[] = [];
        for (const seg of m.segments) {
          for (const f of filled(seg)) {
            const doc = getFieldDoc(seg.name, f.position, rules);
            if (doc && doc.max !== '*' && f.reps > doc.max) problems.push(`${seg.name}-${f.position}: ${f.reps} repetitions, max ${doc.max}`);
          }
        }
        expect(problems).toEqual([]);
      });

      it.runIf(hasFieldFacts(rules))('fills every required field of its version', () => {
        const problems: string[] = [];
        for (const seg of m.segments) {
          const count = getSegmentDoc(seg.name)?.fieldCount ?? 0;
          for (let field = 1; field <= count; field++) {
            const doc = getFieldDoc(seg.name, field, rules);
            if (!doc?.exists || doc.min < 1) continue;
            const value = seg.fields.find((f) => f.position === field)?.value ?? '';
            if (value === '' && !(EMPTY_ON_PURPOSE[file] ?? []).includes(`${seg.name}-${field}`)) {
              problems.push(`${seg.name}-${field} (${doc.name}) is required in v${rules}`);
            }
          }
        }
        expect(problems).toEqual([]);
      });

      it.runIf((EMPTY_ON_PURPOSE[file] ?? []).length > 0)('leaves empty on purpose only fields that are required', () => {
        for (const id of EMPTY_ON_PURPOSE[file] ?? []) {
          const [name, field] = id.split('-');
          const seg = m.segments.find((s) => s.name === name)!;
          expect(seg.fields.find((f) => f.position === Number(field))?.value ?? '', id).toBe('');
          expect(getFieldDoc(name!, Number(field), rules)?.min, id).toBe(1);
        }
      });
    });
  }
});

// Words that may appear in names, places and organisations. All of them
// are clearly made up.
const MADE_UP_WORDS = new Set([
  'demo',
  'demohosp',
  'test',
  'example',
  'hospital',
  'patient',
  'one',
  'relative',
  'doctor',
  'city',
  'app',
  'receiver',
  'lab',
  'ward',
  'clinic',
  'internet',
  'com',
]);

// Fields that hold names, places, organisations or contact data.
const PERSON_FIELDS: Record<string, number[]> = {
  MSH: [3, 4, 5, 6],
  EVN: [5, 7],
  PID: [2, 3, 4, 5, 6, 9, 11, 12, 13, 14, 18, 19, 20, 40],
  NK1: [2, 4, 5, 6, 30, 31, 32, 33],
  PV1: [3, 7, 8, 9, 17, 19, 39],
  ORC: [10, 11, 12, 13, 17, 21, 22, 23, 24],
  OBR: [10, 16, 28, 32, 33, 34, 35],
  OBX: [16, 23, 24, 25],
};

describe('sample data is clearly made up', () => {
  for (const file of files) {
    it(file, () => {
      const m = parseMessage(readSample(file));
      const problems: string[] = [];
      for (const seg of m.segments) {
        for (const position of PERSON_FIELDS[seg.name] ?? []) {
          const value = seg.fields.find((f) => f.position === position)?.value ?? '';
          // Words of 4 letters or more must be made-up words. Short codes
          // such as MR, PRN or USA are fine.
          for (const word of value.split(/[^A-Za-z]+/)) {
            if (word.length >= 4 && !MADE_UP_WORDS.has(word.toLowerCase())) problems.push(`${seg.name}-${position}: "${word}"`);
          }
          // Phone numbers use the 555-0100 to 555-0199 range for fiction.
          for (const phone of value.match(/\d[\d-]{6,}\d/g) ?? []) {
            const digits = phone.replace(/-/g, '');
            const isDate = /^(19|20)\d{6}(\d{6})?$/.test(digits);
            const isZip = /^0+$/.test(digits);
            const isId = /^\d{4}$/.test(digits);
            if (!isDate && !isZip && !isId && !/^55501\d\d$/.test(digits) && !/^00000\d{4}$/.test(digits)) {
              problems.push(`${seg.name}-${position}: number "${phone}"`);
            }
          }
          for (const mail of value.match(/[^\s^~&@]+@[^\s^~&]+/g) ?? []) {
            if (!/@example\.(com|org|net)$/.test(mail)) problems.push(`${seg.name}-${position}: email "${mail}"`);
          }
        }
        // Family names in PID-5 and NK1-2 are TEST.
        if (seg.name === 'PID' || seg.name === 'NK1') {
          const nameField = seg.fields.find((f) => f.position === (seg.name === 'PID' ? 5 : 2));
          for (const rep of nameField?.repetitions ?? []) {
            if (rep.value !== '' && rep.components[0]?.value !== 'TEST') problems.push(`${seg.name} name "${rep.value}"`);
          }
        }
        // Social security numbers start with 000, which is never issued.
        if (seg.name === 'PID') {
          const ssn = seg.fields.find((f) => f.position === 19)?.value ?? '';
          if (ssn !== '' && !ssn.startsWith('000-')) problems.push(`PID-19 "${ssn}"`);
        }
      }
      expect(problems).toEqual([]);
    });
  }
});
