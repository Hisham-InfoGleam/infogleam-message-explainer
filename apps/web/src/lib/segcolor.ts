// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

/** Number of segment colours in app.css (--seg-0 to --seg-7). */
export const SEGMENT_COLORS = 8;

// Common segments get fixed colours, so neighbours look different.
const FIXED: Record<string, number> = {
  MSH: 0,
  EVN: 5,
  PID: 1,
  PD1: 1,
  NK1: 6,
  PV1: 2,
  PV2: 2,
  ORC: 3,
  OBR: 4,
  OBX: 7,
  NTE: 5,
  AL1: 6,
  DG1: 3,
};

/** A stable colour number (0 to 7) for a segment name. */
export function segmentColor(name: string): number {
  const fixed = Object.hasOwn(FIXED, name) ? FIXED[name] : undefined;
  if (fixed !== undefined) return fixed;
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return hash % SEGMENT_COLORS;
}
