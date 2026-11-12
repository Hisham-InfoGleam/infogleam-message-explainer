// SPDX-License-Identifier: MPL-2.0
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// Random messages for the parser, the serializer, the mask and the paths.
// The messages come from a seed, so every run checks the same messages.
// When a check fails, the message names the seed.

import { describe, expect, it } from 'vitest';
import {
  fieldPath,
  MASKED_FIELDS,
  maskMessage,
  parseMessage,
  parsePositionQuery,
  serializeMessage,
  type HL7Segment,
  type ParsedMessage,
} from '../src/index.js';
import { joinTree, MASKED_POSITIONS, randomMessage, type RandomMessage, type RandomSegment } from './random-message.js';

const SEEDS = 2500;
const seeds = Array.from({ length: SEEDS }, (_, i) => i + 1);

// Built once and shared by the tests below.
const ALL: { seed: number; m: RandomMessage }[] = seeds.map((seed) => ({ seed, m: randomMessage(seed) }));

function messages(): { seed: number; m: RandomMessage }[] {
  return ALL;
}

// Some checks look at thousands of messages and need more time.
const SLOW = { timeout: 120_000 };

/** Compare the parser result with the structure the builder used. Returns the first problem. */
function structureProblem(parsed: ParsedMessage, m: RandomMessage): string | undefined {
  if (parsed.leading !== m.leading) return 'leading text differs';
  if (parsed.segments.length !== m.segments.length) {
    return `segment count ${parsed.segments.length}, expected ${m.segments.length}`;
  }
  for (let i = 0; i < m.segments.length; i++) {
    const want = m.segments[i]!;
    const got = parsed.segments[i]!;
    const where = `segment ${i} (${want.name})`;
    if (got.name !== want.name) return `${where}: name ${got.name}`;
    if (got.index !== i) return `${where}: index ${got.index}`;
    if (got.occurrence !== want.occurrence) return `${where}: occurrence ${got.occurrence}`;
    if (got.raw !== want.raw) return `${where}: raw text differs`;
    if (got.after !== want.after) return `${where}: text after the segment differs`;
    if (got.fields.length !== want.fields.length) {
      return `${where}: ${got.fields.length} fields, expected ${want.fields.length}`;
    }
    for (let f = 0; f < want.fields.length; f++) {
      const tree = want.fields[f]!;
      const field = got.fields[f]!;
      const fw = `${where} field ${f + 1}`;
      if (field.position !== f + 1) return `${fw}: position ${field.position}`;
      const plain = want.header && f < 2;
      const value = plain ? tree[0]![0]![0]! : joinTree(tree, m.delimiters);
      if (field.value !== value) return `${fw}: value differs`;
      if (plain) {
        if (field.repetitions.length !== 1) return `${fw}: a delimiter field must not be split`;
        continue;
      }
      if (field.repetitions.length !== tree.length) return `${fw}: ${field.repetitions.length} repetitions`;
      for (let r = 0; r < tree.length; r++) {
        const rep = field.repetitions[r]!;
        if (rep.index !== r + 1) return `${fw}: repetition index ${rep.index}`;
        if (rep.components.length !== tree[r]!.length) return `${fw} rep ${r + 1}: ${rep.components.length} components`;
        for (let c = 0; c < tree[r]!.length; c++) {
          const comp = rep.components[c]!;
          if (comp.position !== c + 1) return `${fw}: component position ${comp.position}`;
          if (comp.value !== tree[r]![c]!.join(m.delimiters.subComponent)) return `${fw}.${c + 1}: value differs`;
          if (JSON.stringify(comp.subComponents) !== JSON.stringify(tree[r]![c])) {
            return `${fw}.${c + 1}: sub-components differ`;
          }
        }
      }
    }
  }
  return undefined;
}

describe('the random message builder', () => {
  it('makes every kind of input it should', SLOW, () => {
    const count = (test: (m: RandomMessage) => boolean) => messages().filter(({ m }) => test(m)).length;
    const fieldTexts = (m: RandomMessage) => m.segments.flatMap((s) => s.fields.map((f) => joinTree(f, m.delimiters)));
    const kinds: Record<string, number> = {
      'other delimiters': count((m) => m.delimiters.field !== '|'),
      'truncation character in MSH-2': count((m) => m.encoding.length === 5),
      'CR endings': count((m) => /\r(?!\n)/.test(m.text) && !m.text.includes('\n')),
      'LF endings': count((m) => m.text.includes('\n') && !m.text.includes('\r')),
      'CRLF endings': count((m) => m.text.includes('\r\n')),
      'no final ending': count((m) => !/[\r\n]$/.test(m.text)),
      'blank lines before MSH': count((m) => m.leading !== ''),
      'blank lines between segments': count((m) => m.segments.some((s) => /[\r\n][ \t]*[\r\n]/.test(s.after))),
      'escape sequences': count((m) => fieldTexts(m).some((t) => t.includes(m.delimiters.escape + 'F' + m.delimiters.escape))),
      'Arabic text': count((m) => /[؀-ۿ]/.test(m.text)),
      'characters outside the BMP': count((m) => /[\uD800-\uDBFF]/.test(m.text)),
      'fields over 2000 characters': count((m) => fieldTexts(m).some((t) => t.length > 2000)),
      repetitions: count((m) => m.segments.some((s) => s.fields.some((f) => f.length > 1))),
      'sub-components': count((m) => m.segments.some((s) => s.fields.some((f) => f.some((r) => r.some((c) => c.length > 1))))),
      'empty fields': count((m) => fieldTexts(m).includes('')),
      'header segments after MSH': count((m) => m.segments.slice(1).some((s) => s.header)),
      'segments without fields': count((m) => m.segments.some((s) => s.fields.length === 0)),
    };
    const missing = Object.entries(kinds).filter(([, n]) => n < 5).map(([k, n]) => `${k}: ${n}`);
    expect(missing).toEqual([]);
  });
});

describe('random messages: parse and rebuild', () => {
  it(`gives back exactly the same text (${SEEDS} messages)`, SLOW, () => {
    const bad: number[] = [];
    for (const { seed, m } of messages()) {
      if (serializeMessage(parseMessage(m.text)) !== m.text) bad.push(seed);
    }
    expect(bad, 'seeds that did not rebuild exactly').toEqual([]);
  });

  it('finds every segment, field, repetition, component and sub-component', SLOW, () => {
    const problems: string[] = [];
    for (const { seed, m } of messages()) {
      const problem = structureProblem(parseMessage(m.text), m);
      if (problem) problems.push(`seed ${seed}: ${problem}`);
      if (problems.length > 10) break;
    }
    expect(problems).toEqual([]);
  });

  it('reads the delimiters from MSH', SLOW, () => {
    for (const { seed, m } of messages()) {
      const d = parseMessage(m.text).delimiters;
      expect(d, `seed ${seed}`).toEqual({ ...m.delimiters, encodingCharacters: m.encoding });
    }
  });

  it('gives no warning about MSH, and warns only about the line endings', SLOW, () => {
    for (const { seed, m } of messages()) {
      const parsed = parseMessage(m.text);
      const endings = new Set([...m.text.matchAll(/\r\n|\r|\n/g)].map((x) => x[0]));
      const expected: string[] = [];
      if (endings.size > 1) expected.push('mixed-terminators');
      const first = m.text.match(/\r\n|\r|\n/)?.[0];
      if (first !== undefined && first !== '\r') expected.push('non-cr-terminator');
      expect(parsed.warnings, `seed ${seed}`).toEqual(expected);
      expect(parsed.mixedTerminators, `seed ${seed}`).toBe(endings.size > 1);
      expect(parsed.terminator, `seed ${seed}`).toBe(first ?? null);
    }
  });

  it('works the same with the standard delimiters', SLOW, () => {
    for (let seed = 1; seed <= 500; seed++) {
      const m = randomMessage(seed, { standardDelimiters: true });
      const parsed = parseMessage(m.text);
      expect(serializeMessage(parsed), `seed ${seed}`).toBe(m.text);
      expect(structureProblem(parsed, m), `seed ${seed}`).toBeUndefined();
    }
  });

  it('does not change when a parsed message is rebuilt and parsed again', SLOW, () => {
    for (const { seed, m } of messages().slice(0, 300)) {
      const once = parseMessage(m.text);
      const twice = parseMessage(serializeMessage(once));
      expect(twice, `seed ${seed}`).toEqual(once);
    }
  });
});

/** The parsed field of a segment, by field number. */
function fieldValue(seg: HL7Segment, position: number): string {
  return seg.fields.find((f) => f.position === position)?.value ?? '';
}

function isMaskedPosition(name: string, field: number): boolean {
  return (MASKED_POSITIONS[name] ?? []).includes(field);
}

describe('random messages: mask', () => {
  it('the test list of masked fields matches MASKED_FIELDS', SLOW, () => {
    const list = Object.entries(MASKED_POSITIONS).flatMap(([s, fs]) => fs.map((f) => `${s}-${f}`));
    expect([...list].sort()).toEqual([...MASKED_FIELDS].sort());
  });

  it('changes only the masked fields and leaves every other character the same', SLOW, () => {
    const problems: string[] = [];
    for (const { seed, m } of messages()) {
      const parsed = parseMessage(m.text);
      const { message, changes } = maskMessage(parsed);
      const out = serializeMessage(message);
      const again = parseMessage(out);
      if (again.segments.length !== parsed.segments.length) {
        problems.push(`seed ${seed}: segment count changed`);
        continue;
      }
      if (again.leading !== parsed.leading) problems.push(`seed ${seed}: leading text changed`);
      const changed = new Set(changes.map((c) => `${c.segmentIndex}:${c.field}`));
      parsed.segments.forEach((before, i) => {
        const after = again.segments[i]!;
        if (after.name !== before.name || after.after !== before.after) {
          problems.push(`seed ${seed} segment ${i}: name or ending changed`);
          return;
        }
        if (after.fields.length !== before.fields.length) {
          problems.push(`seed ${seed} segment ${i}: field count changed`);
          return;
        }
        for (const f of before.fields) {
          const key = `${i}:${f.position}`;
          const now = fieldValue(after, f.position);
          if (changed.has(key)) {
            if (!isMaskedPosition(before.name, f.position)) problems.push(`seed ${seed}: ${before.name}-${f.position} is not a masked field`);
            if (now === f.value) problems.push(`seed ${seed}: ${key} is listed as changed but is the same`);
            if (after.fields.find((x) => x.position === f.position)!.repetitions.length !== f.repetitions.length) {
              problems.push(`seed ${seed}: ${before.name}-${f.position} repetition count changed`);
            }
          } else if (now !== f.value) {
            problems.push(`seed ${seed}: ${before.name}-${f.position} changed but is not listed`);
          }
        }
        if (![...changed].some((k) => k.startsWith(`${i}:`)) && after.raw !== before.raw) {
          problems.push(`seed ${seed} segment ${i}: raw text changed`);
        }
      });
      if (problems.length > 10) break;
    }
    expect(problems).toEqual([]);
  });

  it('leaves none of the original masked values in the output', SLOW, () => {
    const problems: string[] = [];
    let checked = 0;
    for (const { seed, m } of messages()) {
      const out = serializeMessage(maskMessage(parseMessage(m.text)).message);
      for (const s of m.secrets) {
        checked++;
        if (out.includes(s)) problems.push(`seed ${seed}: ${s} is still there`);
      }
      if (problems.length > 10) break;
    }
    expect(checked).toBeGreaterThan(10000);
    expect(problems).toEqual([]);
  });

  it('gives the same result when it masks twice', SLOW, () => {
    for (const { seed, m } of messages()) {
      const once = maskMessage(parseMessage(m.text));
      const twice = maskMessage(once.message);
      expect(serializeMessage(twice.message), `seed ${seed}`).toBe(serializeMessage(once.message));
      expect(twice.changes, `seed ${seed}`).toEqual([]);
    }
  });

  it('gives the same result when it masks the rebuilt text again', SLOW, () => {
    for (const { seed, m } of messages().slice(0, 500)) {
      const once = serializeMessage(maskMessage(parseMessage(m.text)).message);
      const twice = serializeMessage(maskMessage(parseMessage(once)).message);
      expect(twice, `seed ${seed}`).toBe(once);
    }
  });

  it('does not change the input message', SLOW, () => {
    for (const { seed, m } of messages().slice(0, 300)) {
      const parsed = parseMessage(m.text);
      const copy = structuredClone(parsed);
      maskMessage(parsed);
      expect(parsed, `seed ${seed}`).toEqual(copy);
    }
  });

  it('reports each change with the right label and occurrence', SLOW, () => {
    for (const { seed, m } of messages().slice(0, 500)) {
      const parsed = parseMessage(m.text);
      for (const c of maskMessage(parsed).changes) {
        const seg = parsed.segments[c.segmentIndex]!;
        expect(c.segment, `seed ${seed}`).toBe(seg.name);
        expect(c.occurrence, `seed ${seed}`).toBe(seg.occurrence);
        expect(c.label, `seed ${seed}`).toBe(`${seg.name}-${c.field}`);
      }
    }
  });
});

/** The label and the Mirth path, built here without fieldPath(), to compare. */
function expectedPath(seg: RandomSegment, field: number, rep?: number, comp?: number, sub?: number) {
  const n = seg.name;
  if (seg.header && field <= 2) {
    rep = undefined;
    comp = undefined;
    sub = undefined;
  }
  let label = `${n}-${field}`;
  let mirth = `msg['${n}']`;
  if (seg.occurrence > 1) mirth += `[${seg.occurrence - 1}]`;
  mirth += `['${n}.${field}']`;
  if (rep !== undefined && rep > 1) {
    label += `[${rep}]`;
    mirth += `[${rep - 1}]`;
  }
  if (comp !== undefined) {
    label += `.${comp}`;
    mirth += `['${n}.${field}.${comp}']`;
    if (sub !== undefined) {
      label += `.${sub}`;
      mirth += `['${n}.${field}.${comp}.${sub}']`;
    }
  }
  return { label, mirthPath: mirth };
}

describe('random messages: position labels and Mirth paths', () => {
  it('are right for every field, repetition, component and sub-component', SLOW, () => {
    let checked = 0;
    const problems: string[] = [];
    const same = (seed: number, got: { label: string; mirthPath: string }, want: { label: string; mirthPath: string }) => {
      checked++;
      if (got.label !== want.label || got.mirthPath !== want.mirthPath) {
        problems.push(`seed ${seed}: ${got.label} ${got.mirthPath}, expected ${want.label} ${want.mirthPath}`);
      }
    };
    for (const { seed, m } of messages().slice(0, 600)) {
      const parsed = parseMessage(m.text);
      m.segments.forEach((seg, i) => {
        if (parsed.segments[i]!.occurrence !== seg.occurrence) problems.push(`seed ${seed}: occurrence of segment ${i}`);
        const opts = { segmentOccurrence: parsed.segments[i]!.occurrence };
        seg.fields.forEach((tree, f) => {
          const field = f + 1;
          same(seed, fieldPath(seg.name, field, undefined, undefined, undefined, opts), expectedPath(seg, field));
          tree.forEach((rep, r) => {
            rep.forEach((comp, c) => {
              const got = fieldPath(seg.name, field, r + 1, c + 1, undefined, opts);
              same(seed, got, expectedPath(seg, field, r + 1, c + 1));
              // The search box reads the label back, without the repetition.
              if (!(seg.header && field <= 2) && parsePositionQuery(got.label) !== got.label.replace(/\[\d+\]/, '')) {
                problems.push(`seed ${seed}: search does not read ${got.label}`);
              }
              comp.forEach((_, s) => {
                same(seed, fieldPath(seg.name, field, r + 1, c + 1, s + 1, opts), expectedPath(seg, field, r + 1, c + 1, s + 1));
              });
            });
          });
        });
      });
      if (problems.length > 10) break;
    }
    expect(problems).toEqual([]);
    expect(checked).toBeGreaterThan(50000);
  });
});
