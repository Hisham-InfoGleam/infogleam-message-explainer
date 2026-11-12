// SPDX-License-Identifier: MPL-2.0
// Copyright 2026 Hisham Alrashdan (InfoGleam)

/** Segment terminator found in the input. */
export type Terminator = '\r' | '\n' | '\r\n';

export interface Delimiters {
  /** MSH-1, usually "|". */
  field: string;
  /** First character of MSH-2, usually "^". */
  component: string;
  /** Second character of MSH-2, usually "~". */
  repetition: string;
  /** Third character of MSH-2, usually "\". */
  escape: string;
  /** Fourth character of MSH-2, usually "&". */
  subComponent: string;
  /** Fifth character of MSH-2 (v2.7 and later), usually "#". Empty if not present. */
  truncation: string;
  /** MSH-2 exactly as written in the message. */
  encodingCharacters: string;
}

export interface HL7Component {
  /** 1-based component number. */
  position: number;
  /** Raw component text, including sub-component separators. */
  value: string;
  subComponents: string[];
}

export interface HL7Repetition {
  /** 1-based repetition number. */
  index: number;
  /** Raw repetition text, including component separators. */
  value: string;
  components: HL7Component[];
}

export interface HL7Field {
  /** 1-based HL7 field number (MSH-1 is the field separator itself). */
  position: number;
  /** Raw field text, including repetition separators. */
  value: string;
  repetitions: HL7Repetition[];
}

export interface HL7Segment {
  /** Segment name, for example "PID". */
  name: string;
  /** 0-based index of this segment in the message. */
  index: number;
  /** 1-based count of this segment name so far (second OBX = 2). */
  occurrence: number;
  /** Original segment text, without the terminator. */
  raw: string;
  /** Text that followed this segment: its terminator plus any blank lines. */
  after: string;
  fields: HL7Field[];
}

/**
 * Problems found while parsing. Codes, not sentences, so a UI can show
 * them in any language.
 * - no-msh: the message does not start with MSH; default delimiters are used
 * - short-encoding: MSH-2 has fewer than 4 characters
 * - mixed-terminators: segments end with different terminators
 * - non-cr-terminator: segments end with LF or CRLF, not the standard CR
 */
export type ParseWarning = 'no-msh' | 'short-encoding' | 'mixed-terminators' | 'non-cr-terminator';

/**
 * Characters around the message that are not part of it. People often copy
 * messages from logs with them. The parser skips them and keeps them here,
 * so serializeMessage() gives back the exact input.
 * - A byte order mark (BOM, U+FEFF) at the start of a text file.
 * - The MLLP frame. MLLP is how HL7 network connections send messages: a
 *   start character (U+000B, vertical tab) before the message, and an end
 *   character (U+001C, file separator) after it, usually followed by CR.
 */
export interface MessageFrame {
  /** Skipped text before the message: BOM and MLLP start characters. */
  before: string;
  /** Skipped text after the message: the MLLP end character and the line endings after it. */
  after: string;
  /** True when a BOM was found at the start. */
  bom: boolean;
  /** True when an MLLP start or end character was found. */
  mllp: boolean;
}

export interface ParsedMessage {
  segments: HL7Segment[];
  delimiters: Delimiters;
  /** Main segment terminator, or null if the input has only one line. */
  terminator: Terminator | null;
  /** True when more than one kind of terminator was found. */
  mixedTerminators: boolean;
  /** Blank lines before the first segment, kept for an exact rebuild. */
  leading: string;
  /** BOM and MLLP characters around the message, kept for an exact rebuild. */
  frame: MessageFrame;
  warnings: ParseWarning[];
}
