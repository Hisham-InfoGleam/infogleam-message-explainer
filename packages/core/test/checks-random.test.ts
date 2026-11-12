// SPDX-License-Identifier: MPL-2.0
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// The message checks on the 2,500 random messages of the fuzz test, and on
// a message with 3,000 segments. The checks must never throw, every finding
// must point to a position that exists, and no finding may hold a value
// from the message.

import { describe, expect, it } from 'vitest';
import {
  CHECK_IDS,
  CHECK_LEVELS,
  checkMessage,
  getFieldDoc,
  HISTORY_VERSIONS,
  LATEST_VERSION,
  messageVersion,
  parseMessage,
  type CheckFinding,
  type ParsedMessage,
} from '../src/index.js';
import { cleanSegment } from './check-messages.js';
import { randomMessage } from './random-message.js';

const SEEDS = 2500;
const SLOW = { timeout: 120_000 };

/** The first problem with a finding's position, or undefined. */
function positionProblem(m: ParsedMessage, f: CheckFinding): string | undefined {
  if (!CHECK_IDS.includes(f.id) || !CHECK_LEVELS.includes(f.level)) return 'unknown id or level';
  if (!f.position) return f.line === 0 || f.id === 'S1' ? undefined : 'no position';
  const p = f.position;
  const seg = m.segments[p.segmentIndex];
  if (!seg) return 'no such segment';
  if (f.line !== p.segmentIndex + 1) return `line ${f.line} for segment ${p.segmentIndex}`;
  if (p.segment !== undefined && p.segment !== seg.name) return 'segment name differs';
  if (p.field === undefined) return undefined;
  const field = seg.fields.find((x) => x.position === p.field);
  if (!field) {
    // An empty required field (F6) or an empty MSH-12 (V1) may be past the end of the line.
    const known = p.segment !== undefined && HISTORY_VERSIONS.some((v) => getFieldDoc(p.segment!, p.field!, v)?.exists);
    return (f.id === 'F6' || f.id === 'V1') && known ? undefined : `no field ${p.field}`;
  }
  if (p.rep === undefined) return p.comp === undefined && p.sub === undefined ? undefined : 'part without repetition';
  const rep = field.repetitions[p.rep - 1];
  if (!rep) return `no repetition ${p.rep}`;
  if (p.comp === undefined) return undefined;
  const comp = rep.components[p.comp - 1];
  if (!comp) return `no component ${p.comp}`;
  if (p.sub !== undefined && comp.subComponents[p.sub - 1] === undefined) return `no sub-component ${p.sub}`;
  return undefined;
}

describe('random messages', () => {
  it('never throw, point to positions that exist, and hold no message values', SLOW, () => {
    const problems: string[] = [];
    let findings = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const rm = randomMessage(seed);
      const m = parseMessage(rm.text);
      const own = messageVersion(m);
      for (const version of [undefined, own, '2.3', '2.9']) {
        let result;
        try {
          result = checkMessage(m, version);
        } catch (e) {
          problems.push(`seed ${seed} v${version}: threw ${String(e)}`);
          continue;
        }
        findings += result.findings.length;
        const text = JSON.stringify(result);
        for (const s of rm.secrets) if (text.includes(s)) problems.push(`seed ${seed} v${version}: holds a secret value`);
        for (const f of result.findings) {
          const problem = positionProblem(m, f);
          if (problem) problems.push(`seed ${seed} v${version} ${f.id}: ${problem}`);
        }
        const total = result.counts.problem + result.counts.differs + result.counts.note;
        if (total !== result.findings.length) problems.push(`seed ${seed}: counts do not add up`);
      }
      if (problems.length > 20) break;
    }
    expect(problems).toEqual([]);
    expect(findings).toBeGreaterThan(SEEDS);
  });

  it('never throw on odd input', () => {
    for (const text of ['', '\r\r', 'MSH', 'MSH|', 'MSH|^', '|||', 'MSH|^~\\&|\\', 'PID', 'ZZZ|\\X1\\', 'MSH|^~\\&' + '|'.repeat(40)]) {
      for (const v of [undefined, '2.3', '2.9']) expect(() => checkMessage(parseMessage(text), v), text).not.toThrow();
    }
  });
});

describe('speed', () => {
  it('checks a message with 3,000 segments quickly', SLOW, () => {
    // v2.9: the tool always has its field facts, so the field checks run.
    const v = LATEST_VERSION;
    const lines = [cleanSegment('MSH', v), cleanSegment('PID', v, { 8: 'F~M' }), cleanSegment('PV1', v)];
    for (let i = 0; i < 2997; i++) {
      lines.push(cleanSegment('OBX', v, { 1: String(i + 1), 2: 'NM', 3: 'GLU^Glucose^L', 5: '5.5', 14: '20261108095500' }));
    }
    const m = parseMessage(lines.join('\r'));
    expect(m.segments).toHaveLength(3000);
    checkMessage(m, v); // warm up
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      const r = checkMessage(m, v);
      times.push(performance.now() - start);
      expect(r.findings.length).toBeGreaterThan(0);
    }
    const best = Math.min(...times);
    console.log(`checkMessage, 3,000 segments: best ${best.toFixed(1)} ms, all ${times.map((t) => t.toFixed(1)).join(', ')} ms`);
    expect(best).toBeLessThan(200);
  });
});
