// SPDX-License-Identifier: MPL-2.0
// Copyright 2026 Hisham Alrashdan (InfoGleam)

import { readFileSync } from 'node:fs';

export function readSample(name: string): string {
  return readFileSync(new URL(`../../../samples/${name}`, import.meta.url), 'utf8');
}

/** Change the segment terminator of a CR-only message. */
export function withTerminator(crMessage: string, terminator: string): string {
  return crMessage.split('\r').join(terminator);
}
