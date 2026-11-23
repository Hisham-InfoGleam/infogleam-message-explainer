// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// A message copied from JSON or from a database log can have its segment
// ends written as text: a backslash and the letter r (or n). Then the whole
// message is one line. The page finds this and offers to change these
// texts into real segment ends. It never changes the text on its own.

import type { ParsedMessage } from '@infogleam/message-explainer-core';

/** A segment end written as text: \r\n, \r or \n (a backslash and a letter). */
const TEXT_END = String.raw`\\r\\n|\\r|\\n`;
/** A segment name: a capital letter, then 2 capital letters or digits. */
const NAME = '[A-Z][A-Z0-9]{2}';

/** The real segment end for each text form. */
const REAL: Readonly<Record<string, string>> = { '\\r\\n': '\r\n', '\\r': '\r', '\\n': '\n' };

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The segment end that a one-line message writes as text, for example "\r"
 * in "MSH|...\rPID|...": a backslash and r or n, right before a segment
 * name and the field separator. Returns the first one found ("\r", "\n" or
 * "\r\n"), or '' when the message has more than one line or no such text.
 */
export function textSegmentEnd(message: ParsedMessage): string {
  const [seg, ...others] = message.segments;
  if (!seg || others.length > 0) return '';
  const found = new RegExp(`(${TEXT_END})${NAME}${escapeRegExp(message.delimiters.field)}`).exec(seg.raw);
  return found?.[1] ?? '';
}

/**
 * The text with real segment ends where the ends are written as text:
 * "\r\n" becomes CRLF, "\r" becomes CR and "\n" becomes LF. Only right
 * before a segment name and the field separator, or at the end of the
 * text. All other text stays as it is, for example "\n" inside a field.
 */
export function withRealSegmentEnds(text: string, field: string): string {
  const ends = new RegExp(`(?:${TEXT_END})+(?=${NAME}${escapeRegExp(field)}|\\s*$)`, 'g');
  const one = new RegExp(TEXT_END, 'g');
  return text.replace(ends, (run) => run.replace(one, (end) => REAL[end] ?? end));
}
