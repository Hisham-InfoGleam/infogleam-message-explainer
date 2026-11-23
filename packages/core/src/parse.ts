// SPDX-License-Identifier: MPL-2.0
// Copyright 2026 Hisham Alrashdan (InfoGleam)

import type {
  Delimiters,
  HL7Component,
  HL7Field,
  HL7Repetition,
  HL7Segment,
  MessageFrame,
  ParsedMessage,
  ParseWarning,
  Terminator,
} from './types.js';

/** Segments that carry their own delimiters, like MSH. */
export const HEADER_SEGMENTS: ReadonlySet<string> = new Set(['MSH', 'BHS', 'FHS']);

export const DEFAULT_DELIMITERS: Delimiters = {
  field: '|',
  component: '^',
  repetition: '~',
  escape: '\\',
  subComponent: '&',
  truncation: '',
  encodingCharacters: '^~\\&',
};

function split(text: string, separator: string): string[] {
  return separator ? text.split(separator) : [text];
}

function isHeader(raw: string, d: Delimiters): boolean {
  return HEADER_SEGMENTS.has(raw.slice(0, 3)) && raw.charAt(3) === d.field;
}

/** Field that is not split any further (MSH-1 and MSH-2). */
function plainField(position: number, value: string): HL7Field {
  return {
    position,
    value,
    repetitions: [{ index: 1, value, components: [{ position: 1, value, subComponents: [value] }] }],
  };
}

export function parseField(position: number, value: string, d: Delimiters): HL7Field {
  const repetitions: HL7Repetition[] = split(value, d.repetition).map((repValue, r) => {
    const components: HL7Component[] = split(repValue, d.component).map((compValue, c) => ({
      position: c + 1,
      value: compValue,
      subComponents: split(compValue, d.subComponent),
    }));
    return { index: r + 1, value: repValue, components };
  });
  return { position, value, repetitions };
}

/**
 * Parse one segment line (without its terminator).
 *
 * Field numbers follow the HL7 standard. In MSH (and BHS/FHS) the field
 * separator itself is field 1 and the encoding characters are field 2, so
 * the text after the second "|" is MSH-3. In all other segments the text
 * after the first "|" is field 1.
 */
export function parseSegment(
  raw: string,
  d: Delimiters,
  index = 0,
  occurrence = 1,
  after = '',
): HL7Segment {
  let name: string;
  let fields: HL7Field[];

  if (isHeader(raw, d)) {
    name = raw.slice(0, 3);
    const parts = split(raw.slice(4), d.field);
    fields = [plainField(1, d.field), plainField(2, parts[0] ?? '')];
    parts.slice(1).forEach((value, i) => fields.push(parseField(i + 3, value, d)));
  } else {
    const parts = split(raw, d.field);
    name = parts[0] ?? '';
    fields = parts.slice(1).map((value, i) => parseField(i + 1, value, d));
  }

  return { name, index, occurrence, raw, after, fields };
}

/** Read delimiters from an MSH, BHS or FHS line. */
export function readDelimiters(headerLine: string): Delimiters {
  const field = headerLine.charAt(3);
  const end = headerLine.indexOf(field, 4);
  const enc = end === -1 ? headerLine.slice(4) : headerLine.slice(4, end);
  return {
    field,
    component: enc.charAt(0),
    repetition: enc.charAt(1),
    escape: enc.charAt(2),
    subComponent: enc.charAt(3),
    truncation: enc.charAt(4),
    encodingCharacters: enc,
  };
}

// At the start: any number of BOMs (U+FEFF) and MLLP start characters (U+000B).
const FRAME_START = /^[\uFEFF\u000B]+/;
// At the end: the MLLP end character (U+001C), then only line endings, spaces or tabs.
const FRAME_END = /\u001C[\r\n \t]*$/;

/** Split off the BOM and MLLP characters around the message. */
function splitFrame(raw: string): { body: string; frame: MessageFrame } {
  const before = FRAME_START.exec(raw)?.[0] ?? '';
  const rest = raw.slice(before.length);
  const after = FRAME_END.exec(rest)?.[0] ?? '';
  return {
    body: rest.slice(0, rest.length - after.length),
    frame: {
      before,
      after,
      bom: before.includes('\uFEFF'),
      mllp: before.includes('\u000B') || after !== '',
    },
  };
}

// Characters that the parser skips at the start of a line: spaces and tabs
// (a message copied from an email can have them), and the BOM and MLLP
// characters (when one text holds several framed messages).
const LINE_START = /^[ \t\uFEFF\u000B\u001C]+/;
// The BOM and MLLP characters, which the parser also skips at the end of a line.
const FRAME_CHARS: ReadonlySet<string> = new Set(['\uFEFF', '\u000B', '\u001C']);
const MLLP_CHAR = /[\u000B\u001C]/;
// A line with only white space, BOM or MLLP characters is a blank line.
const BLANK = /^[\s\u001C]*$/;

function isBlank(text: string): boolean {
  return BLANK.test(text);
}

function isFrameOrSpace(char: string): boolean {
  return FRAME_CHARS.has(char) || char === ' ' || char === '\t';
}

interface LineParts {
  /** Skipped text at the start: spaces, tabs, BOM and MLLP characters. */
  before: string;
  /** The segment text. */
  text: string;
  /** Skipped text at the end: a BOM or MLLP character, then only these, spaces or tabs. */
  end: string;
}

/** Split a line into the segment text and the skipped text around it. */
function lineParts(line: string): LineParts {
  const before = LINE_START.exec(line)?.[0] ?? '';
  const rest = line.slice(before.length);
  // The end part starts at the first BOM or MLLP character of the last run
  // of these characters, spaces and tabs. Spaces and tabs before it stay in
  // the segment: they can be part of the last field. This is a loop, not a
  // regular expression, so a long run of such characters stays fast.
  let start = rest.length;
  while (start > 0 && isFrameOrSpace(rest.charAt(start - 1))) start--;
  while (start < rest.length && !FRAME_CHARS.has(rest.charAt(start))) start++;
  return { before, text: rest.slice(0, start), end: rest.slice(start) };
}

interface Line {
  text: string;
  sep: string;
}

function splitLines(raw: string): Line[] {
  const lines: Line[] = [];
  let last = 0;
  for (const m of raw.matchAll(/\r\n|\r|\n/g)) {
    lines.push({ text: raw.slice(last, m.index), sep: m[0] });
    last = m.index + m[0].length;
  }
  if (last < raw.length) lines.push({ text: raw.slice(last), sep: '' });
  return lines;
}

/**
 * Parse an HL7 v2 message.
 *
 * Segments may end with CR (the HL7 rule), LF or CRLF. The terminator and
 * any blank lines are kept, so serializeMessage() gives back the exact input.
 * A BOM or MLLP frame characters around the message are skipped, and kept
 * in `frame` (see MessageFrame).
 *
 * Spaces and tabs at the start of a line, and BOM or MLLP characters at the
 * start or the end of a line, are skipped too: the segment is read without
 * them. They are kept in the segment (`before` and `after`), so the rebuild
 * is still exact. So a line "  PID|1" is the segment PID, and a text with
 * several MLLP-framed messages shows each MSH as MSH.
 */
export function parseMessage(raw: string): ParsedMessage {
  const warnings: ParseWarning[] = [];
  const { body, frame } = splitFrame(raw);
  const lines = splitLines(body);

  const seps = new Set(lines.map((l) => l.sep).filter((s) => s !== ''));
  const firstSep = lines.find((l) => l.sep !== '')?.sep;
  const terminator = (firstSep ?? null) as Terminator | null;

  const firstLine = lines.find((l) => !isBlank(l.text));
  const firstText = firstLine ? lineParts(firstLine.text).text : '';
  let delimiters: Delimiters;
  if (HEADER_SEGMENTS.has(firstText.slice(0, 3)) && firstText.length >= 4) {
    delimiters = readDelimiters(firstText);
    if (delimiters.encodingCharacters.length < 4) warnings.push('short-encoding');
  } else {
    delimiters = { ...DEFAULT_DELIMITERS };
    if (firstText !== '') warnings.push('no-msh');
  }

  if (seps.size > 1) warnings.push('mixed-terminators');
  if (terminator !== null && terminator !== '\r') warnings.push('non-cr-terminator');

  const segments: HL7Segment[] = [];
  const counts = new Map<string, number>();
  let leading = '';
  // MLLP characters inside the text, at the start or the end of a line.
  let mllpInside = false;

  for (const line of lines) {
    if (isBlank(line.text)) {
      if (MLLP_CHAR.test(line.text)) mllpInside = true;
      const prev = segments[segments.length - 1];
      if (prev) prev.after += line.text + line.sep;
      else leading += line.text + line.sep;
      continue;
    }
    const part = lineParts(line.text);
    if (MLLP_CHAR.test(part.before) || MLLP_CHAR.test(part.end)) mllpInside = true;
    const seg = parseSegment(part.text, delimiters, segments.length, 1, part.end + line.sep);
    if (part.before !== '') seg.before = part.before;
    const occurrence = (counts.get(seg.name) ?? 0) + 1;
    counts.set(seg.name, occurrence);
    seg.occurrence = occurrence;
    segments.push(seg);
  }
  for (const seg of segments) seg.count = counts.get(seg.name) ?? 1;

  return {
    segments,
    delimiters,
    terminator,
    mixedTerminators: seps.size > 1,
    leading,
    frame: mllpInside ? { ...frame, mllp: true } : frame,
    warnings,
  };
}

/** Short name of a terminator, for display. */
export function terminatorName(t: Terminator | null): 'CR' | 'LF' | 'CRLF' | 'none' {
  if (t === '\r') return 'CR';
  if (t === '\n') return 'LF';
  if (t === '\r\n') return 'CRLF';
  return 'none';
}
