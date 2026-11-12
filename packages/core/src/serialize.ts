// SPDX-License-Identifier: MPL-2.0
// Copyright 2026 Hisham Alrashdan (InfoGleam)

import { HEADER_SEGMENTS } from './parse.js';
import type { Delimiters, ParsedMessage } from './types.js';

/** Rebuild the message text. For an unchanged parse result this is the exact input. */
export function serializeMessage(message: ParsedMessage): string {
  const body = message.leading + message.segments.map((s) => s.raw + s.after).join('');
  return message.frame.before + body + message.frame.after;
}

/**
 * Build a segment line from field values.
 * fieldValues[0] is field 1. For MSH, field 1 is the field separator and is
 * not written twice.
 */
export function buildSegmentRaw(name: string, fieldValues: string[], d: Delimiters): string {
  if (HEADER_SEGMENTS.has(name)) {
    return name + d.field + fieldValues.slice(1).join(d.field);
  }
  return [name, ...fieldValues].join(d.field);
}
