// SPDX-License-Identifier: MPL-2.0
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// The hand-written explanations must agree with the field history, when
// the field history file has fields. Without it, only the version numbers
// in the notes are checked.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  getFieldHistory,
  getFieldVersion,
  HAS_FIELD_HISTORY,
  HISTORY_VERSIONS,
  type FieldState,
} from '../src/index.js';

const dictDir = fileURLToPath(new URL('../src/dictionary/', import.meta.url));

interface LocalText {
  en: string;
  ar: string;
}
interface FieldList {
  segments: Record<string, { fields: { id: string }[] }>;
}
interface ExplanationFile {
  fields: Record<string, { since?: string; versionNote?: LocalText }>;
}

const fieldList = JSON.parse(readFileSync(dictDir + 'hl7-fields.json', 'utf8')) as FieldList;
const segments = Object.keys(fieldList.segments);
const explanations = Object.fromEntries(
  segments.map((s) => [s, JSON.parse(readFileSync(`${dictDir}explanations/${s}.json`, 'utf8')) as ExplanationFile]),
);
const allFields = segments.flatMap((s) => fieldList.segments[s]!.fields.map((f, i) => ({ segment: s, field: i + 1, id: f.id })));

function statesOf(segment: string, field: number): readonly FieldState[] {
  return getFieldVersion(segment, field, '2.9')?.states ?? [];
}

function stateAt(states: readonly FieldState[], version: string): FieldState | undefined {
  return states.filter((s) => compareVersions(s.from, version) <= 0).at(-1);
}

describe('explanations and the field history', () => {
  it.runIf(HAS_FIELD_HISTORY)('give the same first version ("since")', () => {
    const problems: string[] = [];
    for (const f of allFields) {
      const since = explanations[f.segment]!.fields[f.id]?.since;
      const first = getFieldHistory(f.segment, f.field)?.[0]?.from;
      const expected = first === '2.3' ? undefined : first;
      if (since !== expected) problems.push(`${f.id}: since ${since ?? '(none)'}, history ${first ?? '(none)'}`);
    }
    expect(problems).toEqual([]);
  });

  it.runIf(HAS_FIELD_HISTORY)('quote only names that the field had in some version', () => {
    const problems: string[] = [];
    for (const f of allFields) {
      const note = explanations[f.segment]!.fields[f.id]?.versionNote;
      if (!note) continue;
      const names = new Set(statesOf(f.segment, f.field).map((s) => s.name.toLowerCase()));
      for (const text of [note.en, note.ar]) {
        for (const m of text.matchAll(/["«“]([^"»”]+)["»”]/g)) {
          if (!names.has(m[1]!.toLowerCase())) problems.push(`${f.id}: "${m[1]}" is not a name of this field`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it.runIf(HAS_FIELD_HISTORY)('agree on "kept only for backward compatibility" and "withdrawn"', () => {
    const problems: string[] = [];
    for (const f of allFields) {
      const note = explanations[f.segment]!.fields[f.id]?.versionNote?.en;
      if (!note) continue;
      const states = statesOf(f.segment, f.field);
      const kept = /^(?:Already kept|Kept) only for backward compatibility (from|since|in) v(\d+(?:\.\d+)+)/.exec(note);
      if (kept) {
        const at = kept[2]!;
        if (stateAt(states, at)?.opt !== 'B') problems.push(`${f.id}: not B in v${at}`);
        const before = HISTORY_VERSIONS[HISTORY_VERSIONS.indexOf(at) - 1];
        // "from" and "since" mean that it starts in that version.
        if (kept[1] !== 'in' && before && stateAt(states, before)?.opt === 'B') problems.push(`${f.id}: already B before v${at}`);
      }
      const withdrawn = /withdrawn in v(\d+(?:\.\d+)+)/.exec(note);
      if (withdrawn) {
        const at = withdrawn[1]!;
        const before = HISTORY_VERSIONS[HISTORY_VERSIONS.indexOf(at) - 1];
        if (stateAt(states, at)?.opt !== 'W') problems.push(`${f.id}: not W in v${at}`);
        if (before && stateAt(states, before)?.opt === 'W') problems.push(`${f.id}: already W before v${at}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('only mention versions that exist', () => {
    const problems: string[] = [];
    for (const f of allFields) {
      const note = explanations[f.segment]!.fields[f.id]?.versionNote;
      if (!note) continue;
      for (const text of [note.en, note.ar]) {
        for (const m of text.matchAll(/v(2(?:\.\d+)+)/g)) {
          if (!HISTORY_VERSIONS.includes(m[1]!)) problems.push(`${f.id}: v${m[1]}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
