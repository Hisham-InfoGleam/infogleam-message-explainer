// SPDX-License-Identifier: MPL-2.0
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// Odd input for the parser, the serializer and the mask. The parser must
// never throw, and parse then rebuild must give back the exact input.

import { describe, expect, it } from 'vitest';
import {
  buildSegmentRaw,
  checkMessage,
  DEFAULT_DELIMITERS,
  fieldPath,
  maskMessage,
  messageVersion,
  parseMessage,
  readDelimiters,
  serializeMessage,
  terminatorName,
} from '../src/index.js';

const MSH = 'MSH|^~\\&|DEMO_APP|DEMO HOSPITAL|DEMO_RECEIVER|DEMO HOSPITAL|20261108093000||ADT^A01|MSG00001|P|2.5.1';
const PID = 'PID|1||TEST0001^^^DEMOHOSP^MR||DOE^JANE||19800101|F';

function roundTrip(text: string): void {
  expect(serializeMessage(parseMessage(text))).toBe(text);
}

describe('odd input', () => {
  const inputs: Record<string, string> = {
    empty: '',
    'one space': ' ',
    'only white space and endings': ' \r\n\t\r\n  \n\r',
    'only CR': '\r\r\r',
    'MSH alone': 'MSH',
    'MSH and the field separator only': 'MSH|',
    'MSH-2 with 2 characters': 'MSH|^~|DEMO_APP',
    'MSH-2 with 5 characters': 'MSH|^~\\&#|DEMO_APP',
    'MSH-2 with 6 characters': 'MSH|^~\\&#!|DEMO_APP',
    'MSH-2 with the same character twice': 'MSH|^^\\&|DEMO_APP|A^B~C',
    'a byte order mark (BOM) first': '﻿' + MSH + '\r' + PID + '\r',
    'MLLP framing characters': '\x0b' + MSH + '\r' + PID + '\r\x1c\r',
    'no MSH': PID + '\r',
    'a two-letter segment name': MSH + '\rPI|1|x\r',
    'a four-letter segment name': MSH + '\rPIDX|1|x\r',
    'a lower case segment name': MSH + '\rpid|1|x\r',
    'a segment name only': MSH + '\rNTE\r',
    'a field separator only': MSH + '\r|\r',
    'tabs inside fields': MSH + '\rNTE|1||a\tb\r',
    'NUL and other control characters': MSH + '\rNTE|1||a\x00b\x07c\x1bd\r',
    'Unicode line and paragraph separators': MSH + '\rNTE|1||a b c\r',
    'a lone surrogate': MSH + '\rNTE|1||a\uD800b\r',
    'a very long field': MSH + '\rNTE|1||' + 'X'.repeat(200_000) + '\r',
    'many empty fields': MSH + '\rPID' + '|'.repeat(5000) + '\r',
    'old Mac endings with blank lines': '\r\r' + MSH + '\r\r\r' + PID,
    'Windows endings with spaces on blank lines': MSH + '\r\n   \r\n' + PID + '\r\n',
  };

  for (const [name, text] of Object.entries(inputs)) {
    it(`does not throw and rebuilds exactly: ${name}`, () => {
      expect(() => parseMessage(text)).not.toThrow();
      roundTrip(text);
      expect(() => maskMessage(parseMessage(text))).not.toThrow();
      expect(() => messageVersion(parseMessage(text))).not.toThrow();
    });
  }
});

describe('empty and blank input', () => {
  it('has no segments and no warning about MSH', () => {
    for (const text of ['', ' ', '\r\n', ' \t \n \r']) {
      const m = parseMessage(text);
      expect(m.segments, JSON.stringify(text)).toEqual([]);
      // Line ending warnings may still come from the blank lines.
      expect(m.warnings, JSON.stringify(text)).not.toContain('no-msh');
      expect(m.warnings, JSON.stringify(text)).not.toContain('short-encoding');
      expect(m.leading).toBe(text);
      expect(m.delimiters).toEqual(DEFAULT_DELIMITERS);
      expect(messageVersion(m)).toBeUndefined();
    }
  });

  it('has no terminator when there is only one line', () => {
    expect(parseMessage(MSH).terminator).toBeNull();
    expect(terminatorName(parseMessage(MSH).terminator)).toBe('none');
    expect(terminatorName(parseMessage(MSH + '\r').terminator)).toBe('CR');
    expect(terminatorName(parseMessage(MSH + '\n').terminator)).toBe('LF');
    expect(terminatorName(parseMessage(MSH + '\r\n').terminator)).toBe('CRLF');
  });
});

describe('MSH-2', () => {
  it('reads the truncation character (v2.7 and later)', () => {
    const m = parseMessage('MSH|^~\\&#|DEMO_APP\rPID|1||A#B^C');
    expect(m.delimiters).toMatchObject({ component: '^', repetition: '~', escape: '\\', subComponent: '&', truncation: '#' });
    expect(m.delimiters.encodingCharacters).toBe('^~\\&#');
    expect(m.warnings).toEqual([]);
    // The truncation character is not a separator: it stays in the value.
    const pid3 = m.segments[1]?.fields[2];
    expect(pid3?.repetitions[0]?.components.map((c) => c.value)).toEqual(['A#B', 'C']);
  });

  it('keeps MSH-1 and MSH-2 as they are, without splitting', () => {
    const m = parseMessage('MSH|^~\\&#|DEMO_APP');
    const [f1, f2] = m.segments[0]!.fields;
    expect(f1).toMatchObject({ position: 1, value: '|' });
    expect(f2).toMatchObject({ position: 2, value: '^~\\&#' });
    expect(f2?.repetitions).toHaveLength(1);
    expect(f2?.repetitions[0]?.components).toHaveLength(1);
  });

  it('warns when MSH-2 is short', () => {
    expect(parseMessage('MSH|^~|DEMO_APP').warnings).toEqual(['short-encoding']);
    expect(parseMessage('MSH|').warnings).toEqual(['short-encoding']);
    expect(parseMessage('MSH|^~\\&|DEMO_APP').warnings).toEqual([]);
  });

  it('reads delimiters from BHS and FHS too', () => {
    expect(parseMessage('FHS|^~\\&|DEMO').delimiters.field).toBe('|');
    expect(parseMessage('BHS#^~\\&#DEMO').delimiters.field).toBe('#');
    expect(parseMessage('BHS#^~\\&#DEMO').segments[0]?.fields[2]?.value).toBe('DEMO');
  });

  it('readDelimiters reads a line without more fields', () => {
    expect(readDelimiters('MSH|^~\\&')).toMatchObject({ field: '|', encodingCharacters: '^~\\&', truncation: '' });
  });
});

describe('input that does not start with MSH', () => {
  it('uses the default delimiters and warns', () => {
    const m = parseMessage(PID + '\r');
    expect(m.warnings).toContain('no-msh');
    expect(m.delimiters).toEqual(DEFAULT_DELIMITERS);
    expect(m.segments[0]?.name).toBe('PID');
  });
});

describe('a byte order mark (BOM) and MLLP frame characters', () => {
  // MLLP is how HL7 network connections send messages: a vertical tab
  // (U+000B) before the message, and U+001C plus CR after it. People copy
  // messages from logs with them. A BOM (U+FEFF) starts some text files.
  // The parser skips these characters and keeps them in `frame`.
  const BOM = '\uFEFF';
  const START = '\u000B';
  const END = '\u001C';
  const ENDINGS: Record<string, string> = { CR: '\r', LF: '\n', CRLF: '\r\n' };

  /** The same message without the frame gives the same result. */
  function expectSameAsPlain(framed: string, plain: string): void {
    const a = parseMessage(framed);
    const b = parseMessage(plain);
    expect(serializeMessage(a)).toBe(framed);
    expect(a.segments).toEqual(b.segments);
    expect(a.delimiters).toEqual(b.delimiters);
    expect(a.terminator).toEqual(b.terminator);
    expect(a.mixedTerminators).toBe(b.mixedTerminators);
    expect(a.leading).toBe(b.leading);
    expect(a.warnings).toEqual(b.warnings);
    expect(a.warnings).not.toContain('no-msh');
    expect(messageVersion(a)).toBe('2.5.1');
    const checks = checkMessage(a, '2.5.1');
    expect(checks.findings.filter((x) => x.id === 'S1')).toEqual([]);
    expect(checks).toEqual(checkMessage(b, '2.5.1'));
  }

  for (const [endingName, e] of Object.entries(ENDINGS)) {
    const plain = MSH + e + PID + e;

    it(`skips a BOM only, with ${endingName}`, () => {
      const text = BOM + plain;
      expectSameAsPlain(text, plain);
      expect(parseMessage(text).frame).toEqual({ before: BOM, after: '', bom: true, mllp: false });
    });

    it(`skips the MLLP start and end characters, with ${endingName}`, () => {
      const text = START + plain + END + e;
      expectSameAsPlain(text, plain);
      expect(parseMessage(text).frame).toEqual({ before: START, after: END + e, bom: false, mllp: true });
    });

    it(`skips a BOM and the MLLP characters together, with ${endingName}`, () => {
      for (const before of [BOM + START, START + BOM]) {
        const text = before + plain + END + e;
        expectSameAsPlain(text, plain);
        expect(parseMessage(text).frame).toEqual({ before, after: END + e, bom: true, mllp: true });
      }
    });
  }

  it('skips the MLLP start character only, or the end character only', () => {
    const plain = MSH + '\r' + PID + '\r';
    expectSameAsPlain(START + plain, plain);
    expect(parseMessage(START + plain).frame.mllp).toBe(true);
    expectSameAsPlain(plain + END + '\r', plain);
    expect(parseMessage(plain + END + '\r').frame).toEqual({ before: '', after: END + '\r', bom: false, mllp: true });
    // The end character with nothing after it.
    expectSameAsPlain(START + plain + END, plain);
  });

  it('skips the end character right after the last segment, with no segment end before it', () => {
    const plain = MSH + '\r' + PID;
    const text = START + plain + END + '\r';
    expectSameAsPlain(text, plain);
    const m = parseMessage(text);
    expect(m.segments[1]?.raw).toBe(PID);
    expect(m.segments[1]?.after).toBe('');
  });

  it('does not show or count the characters in the segments and fields', () => {
    const text = BOM + START + MSH + '\r' + PID + '\r' + END + '\r';
    const m = parseMessage(text);
    expect(m.segments.map((x) => x.name)).toEqual(['MSH', 'PID']);
    expect(m.segments[0]?.raw).toBe(MSH);
    expect(m.segments[0]?.fields.map((x) => x.position).slice(0, 3)).toEqual([1, 2, 3]);
    expect(m.segments[0]?.fields[0]?.value).toBe('|');
    expect(m.segments[0]?.fields[2]?.value).toBe('DEMO_APP');
    expect(m.segments[1]?.after).toBe('\r');
    expect(m.leading).toBe('');
    for (const seg of m.segments) expect(seg.raw + seg.after).not.toMatch(/[\uFEFF\u000B\u001C]/);
  });

  it('keeps blank lines inside the frame as blank lines', () => {
    const plain = '\r\n' + MSH + '\r\n\r\n' + PID + '\r\n';
    expectSameAsPlain(START + plain + END + '\r\n', plain);
  });

  it('rebuilds the exact text after masking', () => {
    const text = START + MSH + '\r' + PID + '\r' + END + '\r';
    const out = serializeMessage(maskMessage(parseMessage(text)).message);
    expect(out.startsWith(START + 'MSH|')).toBe(true);
    expect(out.endsWith('\r' + END + '\r')).toBe(true);
    expect(out).not.toContain('DOE');
  });

  it('keeps the characters inside the message as they are', () => {
    // Only the start and the end of the text count as the frame.
    const text = MSH + '\rNTE|1||a' + END + 'b' + START + 'c' + BOM + 'd\r';
    const m = parseMessage(text);
    expect(m.frame).toEqual({ before: '', after: '', bom: false, mllp: false });
    expect(m.segments[1]?.fields[2]?.value).toBe('a' + END + 'b' + START + 'c' + BOM + 'd');
    roundTrip(text);
  });

  it('has no frame for a normal message', () => {
    expect(parseMessage(MSH + '\r' + PID + '\r').frame).toEqual({ before: '', after: '', bom: false, mllp: false });
  });

  it('handles a frame with no message inside', () => {
    for (const text of [BOM, START, END, START + END + '\r', BOM + START + '\r\n' + END + '\r\n']) {
      const m = parseMessage(text);
      expect(m.segments, JSON.stringify(text)).toEqual([]);
      expect(m.warnings, JSON.stringify(text)).not.toContain('no-msh');
      roundTrip(text);
    }
  });
});

describe('segment names', () => {
  it('keeps names of the wrong length as they are', () => {
    const m = parseMessage(MSH + '\rPI|1\rPIDX|2\rpid|3\r');
    expect(m.segments.map((s) => s.name)).toEqual(['MSH', 'PI', 'PIDX', 'pid']);
    expect(m.segments[1]?.fields[0]?.value).toBe('1');
  });

  it('fieldPath refuses names that are not 3 characters, A-Z and 0-9', () => {
    for (const name of ['PI', 'PIDX', 'pid', '1PI', '', 'P-D', 'ÄBC']) {
      expect(() => fieldPath(name, 1), name).toThrow(RangeError);
    }
    for (const name of ['PID', 'ZZ1', 'Z01', 'A99']) {
      expect(() => fieldPath(name, 1), name).not.toThrow();
    }
  });

  it('counts repeated segments', () => {
    const m = parseMessage(MSH + '\rOBX|1\rNTE|1\rOBX|2\rOBX|3\rNTE|2\r');
    expect(m.segments.map((s) => `${s.name}#${s.occurrence}`)).toEqual([
      'MSH#1',
      'OBX#1',
      'NTE#1',
      'OBX#2',
      'OBX#3',
      'NTE#2',
    ]);
    expect(m.segments.map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe('fieldPath input checks', () => {
  it('refuses numbers below 1 and numbers that are not whole', () => {
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => fieldPath('PID', bad), String(bad)).toThrow(RangeError);
      expect(() => fieldPath('PID', 3, bad), String(bad)).toThrow(RangeError);
      expect(() => fieldPath('PID', 3, 1, bad), String(bad)).toThrow(RangeError);
      expect(() => fieldPath('PID', 3, 1, 1, bad), String(bad)).toThrow(RangeError);
      expect(() => fieldPath('PID', 3, 1, 1, 1, { segmentOccurrence: bad }), String(bad)).toThrow(RangeError);
    }
  });

  it('refuses a sub-component without a component', () => {
    expect(() => fieldPath('PID', 3, 1, undefined, 1)).toThrow(RangeError);
  });

  it('handles large numbers', () => {
    expect(fieldPath('OBX', 999, 50, 20, 9, { segmentOccurrence: 3000 })).toEqual({
      label: 'OBX-999[50].20.9',
      mirthPath: "msg['OBX'][2999]['OBX.999'][49]['OBX.999.20']['OBX.999.20.9']",
    });
  });
});

describe('buildSegmentRaw', () => {
  it('builds MSH without writing the field separator twice', () => {
    expect(buildSegmentRaw('MSH', ['|', '^~\\&', 'APP'], DEFAULT_DELIMITERS)).toBe('MSH|^~\\&|APP');
  });

  it('builds other segments from field 1', () => {
    expect(buildSegmentRaw('PID', ['1', '', 'X'], DEFAULT_DELIMITERS)).toBe('PID|1||X');
    expect(buildSegmentRaw('NTE', [], DEFAULT_DELIMITERS)).toBe('NTE');
  });

  it('is the inverse of the parser for every sample-like line', () => {
    for (const line of [MSH, PID, 'NTE|1||text', 'OBX|1|NM|GLU^Glucose^L||95']) {
      const seg = parseMessage(line).segments[0]!;
      expect(buildSegmentRaw(seg.name, seg.fields.map((f) => f.value), DEFAULT_DELIMITERS)).toBe(line);
    }
  });
});

describe('mask edge cases', () => {
  it('masks with the delimiters of the message', () => {
    const text = 'MSH#!@$%#DEMO\rPID#1##ID1!!!AUTH!MR@ID2#$#DOE!JANE#$#19800101\r';
    const out = serializeMessage(maskMessage(parseMessage(text)).message);
    expect(out).toBe('MSH#!@$%#DEMO\rPID#1##MASK0001!!!AUTH!MR@MASK0002#$#MASKED!PATIENT#$#19000101\r');
  });

  it('leaves empty repetitions empty', () => {
    const out = serializeMessage(maskMessage(parseMessage(MSH + '\rPID|1||~ID2^^^A||~DOE^JANE\r')).message);
    expect(out).toBe(MSH + '\rPID|1||~MASK0002^^^A||~MASKED^PATIENT\r');
  });

  it('masks a repetition that holds the null value ""', () => {
    // Only a whole field with "" is left alone.
    const out = serializeMessage(maskMessage(parseMessage(MSH + '\rPID|1||||""~DOE\r')).message);
    expect(out).toBe(MSH + '\rPID|1||||MASKED^PATIENT~MASKED^PATIENT\r');
  });

  it('masks PID in a message without MSH, with the default delimiters', () => {
    const out = serializeMessage(maskMessage(parseMessage('PID|1||ID1||DOE^JANE\r')).message);
    expect(out).toBe('PID|1||MASK0001||MASKED^PATIENT\r');
  });

  it('masks every PID and NK1 segment, not only the first', () => {
    const text = MSH + '\rPID|1||||DOE^JANE\rNK1|1|DOE^JOHN\rNK1|2|DOE^JILL\rPID|2||||ROE^RICHARD\r';
    const result = maskMessage(parseMessage(text));
    expect(result.changes.map((c) => `${c.label}#${c.occurrence}`)).toEqual(['PID-5#1', 'NK1-2#1', 'NK1-2#2', 'PID-5#2']);
    const out = serializeMessage(result.message);
    for (const name of ['JANE', 'JOHN', 'JILL', 'RICHARD']) expect(out).not.toContain(name);
  });
});
