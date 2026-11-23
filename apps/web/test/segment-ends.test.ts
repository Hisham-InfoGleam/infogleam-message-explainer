// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// Segment ends written as text (lib/segmentEnds.ts): a message copied from
// JSON or a database log, where each segment ends with the two characters
// backslash and r (or n), so the whole message is one line.

import { parseMessage, serializeMessage } from '@infogleam/message-explainer-core';
import { describe, expect, it } from 'vitest';
import { textSegmentEnd, withRealSegmentEnds } from '../src/lib/segmentEnds';
import { parsedSamples } from './helpers';

const MSH = 'MSH|^~\\&|DEMO_APP|DEMO HOSPITAL|DEMO_RECEIVER|DEMO HOSPITAL|20261108093000||ADT^A01|MSG90001|P|2.5.1';
const EVN = 'EVN|A01|20261108093000';
const PID = 'PID|1||TEST0001^^^DEMOHOSP^MR||TEST^PATIENT^ONE||19800101|F';
const LINES = [MSH, EVN, PID];

/** The made-up message with the given text between the segments, and after the last one. */
function oneLine(end: string, last = end): string {
  return LINES.join(end) + last;
}

describe('textSegmentEnd', () => {
  it('finds \\r, \\n and \\r\\n written as text before a segment name', () => {
    expect(textSegmentEnd(parseMessage(oneLine('\\r')))).toBe('\\r');
    expect(textSegmentEnd(parseMessage(oneLine('\\n')))).toBe('\\n');
    expect(textSegmentEnd(parseMessage(oneLine('\\r\\n')))).toBe('\\r\\n');
    // With nothing after the last segment, and with a real line end after it.
    expect(textSegmentEnd(parseMessage(oneLine('\\r', '')))).toBe('\\r');
    expect(textSegmentEnd(parseMessage(oneLine('\\r', '\\r\n')))).toBe('\\r');
  });

  it('uses the field separator of the message', () => {
    const text = 'MSH*^~\\&*DEMO_APP\\rPID*1**TEST0001\\r';
    expect(textSegmentEnd(parseMessage(text))).toBe('\\r');
    // "\rPID|" is not a segment start when the field separator is "*".
    expect(textSegmentEnd(parseMessage('MSH*^~\\&*DEMO_APP\\rPID|1'))).toBe('');
  });

  it('finds nothing in a message with real segment ends', () => {
    for (const end of ['\r', '\n', '\r\n']) expect(textSegmentEnd(parseMessage(LINES.join(end)))).toBe('');
    for (const { id, message } of parsedSamples()) expect(textSegmentEnd(message), id).toBe('');
  });

  it('finds nothing when the text is not before a segment name and the field separator', () => {
    for (const text of [
      // A path or text inside a field.
      MSH + '\\rlow|case',
      'MSH|^~\\&|DEMO_APP|C:\\new\\results|C:\\reports',
      MSH + '\\rPI|1',
      MSH + '\\rPID',
      MSH + '\\RPID|1',
      '',
    ]) {
      expect(textSegmentEnd(parseMessage(text)), text).toBe('');
    }
  });

  it('finds nothing when the message has more than one line', () => {
    expect(textSegmentEnd(parseMessage(MSH + '\\rEVN|A01\r' + PID))).toBe('');
  });
});

describe('withRealSegmentEnds', () => {
  it('changes \\r into CR, \\n into LF and \\r\\n into CRLF', () => {
    expect(withRealSegmentEnds(oneLine('\\r'), '|')).toBe(oneLine('\r'));
    expect(withRealSegmentEnds(oneLine('\\n'), '|')).toBe(oneLine('\n'));
    expect(withRealSegmentEnds(oneLine('\\r\\n'), '|')).toBe(oneLine('\r\n'));
    expect(withRealSegmentEnds(oneLine('\\r', ''), '|')).toBe(oneLine('\r', ''));
  });

  it('gives a message that parses into its segments, with the same fields', () => {
    for (const end of ['\\r', '\\n', '\\r\\n']) {
      const fixed = withRealSegmentEnds(oneLine(end), '|');
      const m = parseMessage(fixed);
      expect(m.segments.map((s) => s.raw)).toEqual(LINES);
      expect(m.warnings.includes('no-msh')).toBe(false);
      expect(serializeMessage(m)).toBe(fixed);
      expect(textSegmentEnd(m)).toBe('');
    }
  });

  it('changes a blank line written as text, and keeps real line ends and spaces at the end', () => {
    expect(withRealSegmentEnds(MSH + '\\r\\r' + EVN + '\\r \n', '|')).toBe(MSH + '\r\r' + EVN + '\r \n');
  });

  it('keeps \\r and \\n inside fields', () => {
    const obx = 'OBX|1|TX|TEST^Test^L||Line one\\nline two\\r\\nEND of note|C:\\new\\results';
    const text = MSH + '\\r' + obx + '\\r';
    expect(withRealSegmentEnds(text, '|')).toBe(MSH + '\r' + obx + '\r');
  });

  it('keeps HL7 escape sequences', () => {
    const nte = 'NTE|1||A\\R\\B\\X0D0A\\C\\.br\\D';
    expect(withRealSegmentEnds(MSH + '\\r' + nte, '|')).toBe(MSH + '\r' + nte);
  });

  it('uses the field separator of the message', () => {
    expect(withRealSegmentEnds('MSH*^~\\&*A\\rPID*1\\rPV1|1', '*')).toBe('MSH*^~\\&*A\rPID*1\\rPV1|1');
  });

  it('gives back the same text when there is nothing to change', () => {
    for (const { id, text } of parsedSamples()) expect(withRealSegmentEnds(text, '|'), id).toBe(text);
    expect(withRealSegmentEnds('', '|')).toBe('');
  });
});
