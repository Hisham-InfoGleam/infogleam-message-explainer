// SPDX-License-Identifier: MPL-2.0
// Copyright 2026 Hisham Alrashdan (InfoGleam)

import type { ParsedMessage } from './types.js';

/**
 * How well the explanations fit a message version.
 * - supported: 2.3 to 2.9; the version notes cover these versions
 * - older: 2.0, 2.1 and 2.2; the message can be read, but the notes start at 2.3
 * - unknown: anything else, including an empty version
 */
export type VersionSupport = 'supported' | 'older' | 'unknown';

/**
 * Codes, not sentences, so a UI can show them in any language.
 * - added-later: the field (or code) was added in a newer version than the message version
 * - removed: the code was removed before the message version (its last version is older)
 */
export type VersionWarning = 'added-later' | 'removed';

const SUPPORTED: ReadonlySet<string> = new Set([
  '2.3',
  '2.3.1',
  '2.4',
  '2.5',
  '2.5.1',
  '2.6',
  '2.7',
  '2.7.1',
  '2.8',
  '2.8.1',
  '2.8.2',
  '2.9',
]);

// Real HL7 versions older than 2.3 (HL7 table 0104; 2.0D is the 1988 demo).
const OLDER: ReadonlySet<string> = new Set(['2.0', '2.0D', '2.1', '2.2']);

const VERSION_TEXT = /^\d+(\.\d+)*$/;

/** The HL7 version in MSH-12 (component 1), for example "2.5.1". */
export function messageVersion(message: ParsedMessage): string | undefined {
  const msh = message.segments.find((s) => s.name === 'MSH');
  const field = msh?.fields.find((f) => f.position === 12);
  const value = field?.repetitions[0]?.components[0]?.value.trim() ?? '';
  return value === '' ? undefined : value;
}

function versionParts(version: string): number[] {
  return version
    .trim()
    .split('.')
    .map((part) => {
      const n = Number.parseInt(part, 10);
      return Number.isNaN(n) ? 0 : n;
    });
}

/**
 * Compare two versions part by part, as numbers: "2.3" < "2.3.1" < "2.4"
 * and "2.8.2" < "2.9". A missing part counts as 0, so "2.5" equals "2.5.0".
 * Returns -1, 0 or 1, so it can be used to sort.
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const x = versionParts(a);
  const y = versionParts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

export function versionSupport(version: string | undefined): VersionSupport {
  const v = version?.trim() ?? '';
  if (SUPPORTED.has(v)) return 'supported';
  if (OLDER.has(v)) return 'older';
  return 'unknown';
}

/**
 * Warn when a field (or a table code) is newer than the message version,
 * for example OBX-20 (added in 2.6) in a message that says 2.3. Also warn
 * when a table code no longer exists in the message version, for example
 * the OBX-2 code CE (until 2.5.1) in a message that says 2.6.
 * Accepts a FieldDoc or a CodeValue. Returns undefined when there is
 * nothing to warn about or the version is not a version number.
 */
export function fieldVersionWarning(
  item: { since?: string | undefined; until?: string | undefined } | undefined,
  version: string | undefined,
): VersionWarning | undefined {
  const since = item?.since;
  const until = item?.until;
  const v = version?.trim() ?? '';
  if (!VERSION_TEXT.test(v)) return undefined;
  if (since && compareVersions(since, v) > 0) return 'added-later';
  if (until && compareVersions(until, v) < 0) return 'removed';
  return undefined;
}
