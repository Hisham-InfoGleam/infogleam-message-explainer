// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SEGMENT_COLORS, segmentColor } from '../src/lib/segcolor';

describe('segmentColor', () => {
  it('gives a whole number from 0 to 7 for any name', () => {
    const names = ['MSH', 'PID', 'ZZ1', 'Z01', 'ZPI', 'IN1', 'GT1', '', 'X', 'pid', 'مريض', '😀😀😀', '__proto__', 'constructor', 'toString'];
    for (let i = 0; i < 2000; i++) names.push(String.fromCharCode(65 + (i % 26), 65 + ((i / 26) % 26), 48 + (i % 10)));
    for (const name of names) {
      const c = segmentColor(name);
      expect(Number.isInteger(c) && c >= 0 && c < SEGMENT_COLORS, name).toBe(true);
    }
  });

  it('is stable', () => {
    for (const name of ['ZZ1', 'IN1', 'ABC']) expect(segmentColor(name)).toBe(segmentColor(name));
  });

  it('gives neighbour segments in common messages different colours', () => {
    const orders = [
      ['MSH', 'EVN', 'PID', 'NK1', 'PV1', 'AL1', 'DG1'],
      ['MSH', 'PID', 'PV1', 'ORC', 'OBR', 'OBX', 'NTE'],
      ['MSH', 'PID', 'PD1', 'PV1', 'PV2'],
    ];
    for (const order of orders) {
      for (let i = 1; i < order.length; i++) {
        // PD1 and PV2 share a colour with the segment they belong to, on purpose.
        if (order[i] === 'PD1' || order[i] === 'PV2') continue;
        expect(segmentColor(order[i]!), `${order[i - 1]} ${order[i]}`).not.toBe(segmentColor(order[i - 1]!));
      }
    }
  });

  it('has a colour in app.css for each number', () => {
    const css = readFileSync(new URL('../src/app.css', import.meta.url), 'utf8');
    for (let i = 0; i < SEGMENT_COLORS; i++) {
      expect(css, `--seg-${i}`).toContain(`--seg-${i}`);
      expect(css, `.sc-${i}`).toContain(`sc-${i}`);
    }
  });
});
