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
 */
export function parseMessage(raw: string): ParsedMessage {
  const warnings: ParseWarning[] = [];
  const { body, frame } = splitFrame(raw);
  const lines = splitLines(body);

  const seps = new Set(lines.map((l) => l.sep).filter((s) => s !== ''));
  const firstSep = lines.find((l) => l.sep !== '')?.sep;
  const terminator = (firstSep ?? null) as Terminator | null;

  const firstText = lines.find((l) => l.text.trim() !== '')?.text ?? '';
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

  for (const line of lines) {
    if (line.text.trim() === '') {
      const prev = segments[segments.length - 1];
      if (prev) prev.after += line.text + line.sep;
      else leading += line.text + line.sep;
      continue;
    }
    const seg = parseSegment(line.text, delimiters, segments.length, 1, line.sep);
    const occurrence = (counts.get(seg.name) ?? 0) + 1;
    counts.set(seg.name, occurrence);
    seg.occurrence = occurrence;
    segments.push(seg);
  }

  return {
    segments,
    delimiters,
    terminator,
    mixedTerminators: seps.size > 1,
    leading,
    frame,
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
