// SPDX-License-Identifier: MPL-2.0
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// A small random HL7 message builder for tests. It uses a seed, so each
// run makes the same messages. A failing seed can be run again on its own.
// All text is made up. The builder also returns the structure it used,
// so a test can compare the parser result with it.

/** A fast random number generator with a seed (mulberry32). */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** A number from 0 (included) to 1 (not included). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** A whole number from min to max, both included. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(list: readonly T[]): T {
    const item = list[Math.floor(this.next() * list.length)];
    if (item === undefined) throw new Error('pick from an empty list');
    return item;
  }

  /** True with the chance p (0 to 1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  shuffle<T>(list: readonly T[]): T[] {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }
    return copy;
  }
}

/** The delimiters of one message. */
export interface RandomDelimiters {
  field: string;
  component: string;
  repetition: string;
  escape: string;
  subComponent: string;
  /** Empty, or the fifth character of MSH-2. */
  truncation: string;
}

/**
 * A field as a tree: repetitions, then components, then sub-components.
 * An empty field is [[['']]], the same shape the parser gives.
 */
export type FieldTree = string[][][];

export interface RandomSegment {
  name: string;
  /** Field trees. Index 0 is field 1. For MSH, fields 1 and 2 are the delimiters. */
  fields: FieldTree[];
  /** True for MSH, BHS and FHS lines (they hold their own delimiters). */
  header: boolean;
  /** The segment text without its ending. */
  raw: string;
  /** The text after the segment: its ending and any blank lines. */
  after: string;
  /** 1-based count of this segment name so far. */
  occurrence: number;
}

export interface RandomMessage {
  text: string;
  delimiters: RandomDelimiters;
  /** MSH-2 as written. */
  encoding: string;
  /** Blank lines before the first segment. */
  leading: string;
  segments: RandomSegment[];
  /**
   * Secret values put in the fields that maskMessage() replaces. A test
   * checks that none of them is left after masking.
   */
  secrets: string[];
}

export interface BuildOptions {
  /** Number of segments after MSH. Default: 1 to 12. */
  segments?: number;
  /** Use only the standard delimiters |^~\& . */
  standardDelimiters?: boolean;
  /** Add PID and NK1 segments with secret values in the masked fields. Default: true. */
  patientData?: boolean;
}

// Characters that may be delimiters. Letters, digits, spaces, "-" and the
// double quote are left out: the mask values use them, and "" is the HL7
// null value.
const DELIMITER_POOL = ['|', '^', '~', '\\', '&', '#', '!', '$', '%', '*', '+', ':', ';', '@', '?', '/', '=', '<', '>', ',', '`', '{', '}', '[', ']', '_'];

// Text pieces. None of them holds CR, LF or a delimiter character.
const WORDS = [
  'TEST',
  'DOE',
  'JANE',
  'JOHN',
  'DEMO',
  'EXAMPLE',
  'Sample text',
  'x',
  '42',
  '3.14',
  '20261108093000',
  'mg per dL',
  'ok',
  'éàü',
  'Ñandú',
  'مريض تجريبي',
  'اختبار',
  '测试',
  'テスト',
  'тест',
  'Ελληνικά',
  '😀',
  '𝔘𝔫𝔦',
  'a b  c',
  ' leading',
  'trailing ',
  '\t',
  '""',
];

const SEGMENT_NAMES = ['EVN', 'PID', 'PV1', 'NK1', 'ORC', 'OBR', 'OBX', 'NTE', 'AL1', 'DG1', 'PD1', 'ZZ1', 'Z01', 'ZPI', 'IN1', 'GT1'];

// Fields that maskMessage() replaces. Keep in sync with MASK_RULES in mask.ts.
export const MASKED_POSITIONS: Readonly<Record<string, readonly number[]>> = {
  PID: [3, 5, 7, 11, 13, 14, 19, 40],
  NK1: [2, 4, 5],
};

function pickDelimiters(rng: Rng, standard: boolean): RandomDelimiters {
  const truncation = rng.chance(0.3);
  if (standard) {
    return { field: '|', component: '^', repetition: '~', escape: '\\', subComponent: '&', truncation: truncation ? '#' : '' };
  }
  const [field, component, repetition, escape, subComponent, trunc] = rng.shuffle(DELIMITER_POOL);
  return {
    field: field!,
    component: component!,
    repetition: repetition!,
    escape: escape!,
    subComponent: subComponent!,
    truncation: truncation ? trunc! : '',
  };
}

function usedChars(d: RandomDelimiters): Set<string> {
  return new Set([d.field, d.component, d.repetition, d.escape, d.subComponent, d.truncation].filter((c) => c !== ''));
}

/** Random text that holds no delimiter, CR or LF. Can be empty. */
function text(rng: Rng, d: RandomDelimiters): string {
  const used = usedChars(d);
  const pieces: string[] = [];
  const count = rng.int(0, 3);
  for (let i = 0; i < count; i++) {
    const roll = rng.next();
    if (roll < 0.12) {
      // An escape sequence, for example \F\ or \E\.
      pieces.push(d.escape + rng.pick(['F', 'S', 'T', 'R', 'E', 'H', 'N', '.br', 'X0D0A']) + d.escape);
    } else if (roll < 0.2) {
      // A punctuation character that is not a delimiter in this message.
      const free = DELIMITER_POOL.filter((c) => !used.has(c));
      pieces.push(rng.pick(free));
    } else if (roll < 0.21) {
      // A very long piece.
      pieces.push('LONG'.repeat(rng.int(500, 3000)));
    } else {
      pieces.push(rng.pick(WORDS));
    }
  }
  return pieces.join('');
}

/** A random field tree: often empty, sometimes with repetitions, components and sub-components. */
function fieldTree(rng: Rng, d: RandomDelimiters, make: () => string = () => text(rng, d)): FieldTree {
  if (rng.chance(0.3)) return [[['']]];
  const reps = rng.chance(0.2) ? rng.int(2, 4) : 1;
  return Array.from({ length: reps }, () => {
    const comps = rng.chance(0.4) ? rng.int(2, 7) : 1;
    return Array.from({ length: comps }, () => {
      const subs = rng.chance(0.15) ? rng.int(2, 4) : 1;
      return Array.from({ length: subs }, () => make());
    });
  });
}

export function joinTree(tree: FieldTree, d: RandomDelimiters): string {
  return tree.map((rep) => rep.map((comp) => comp.join(d.subComponent)).join(d.component)).join(d.repetition);
}

let secretCount = 0;

/** A value that appears nowhere else, so a test can look for it after masking. */
function secret(rng: Rng): string {
  secretCount++;
  return `SECRET${secretCount}X${rng.int(100000, 999999)}`;
}

/**
 * A field of a masked position, filled with secret values. For PID-3 only
 * component 1 (the ID number) is masked, so only that part is secret.
 */
function maskedTree(rng: Rng, d: RandomDelimiters, seg: string, field: number, secrets: string[]): FieldTree {
  const reps = rng.chance(0.3) ? rng.int(2, 3) : 1;
  return Array.from({ length: reps }, () => {
    if (rng.chance(0.1)) return [['']]; // An empty repetition stays empty.
    const comps = rng.int(1, 6);
    return Array.from({ length: comps }, (_, c) => {
      const subs = rng.chance(0.15) ? rng.int(2, 3) : 1;
      return Array.from({ length: subs }, () => {
        if (seg === 'PID' && field === 3 && c > 0) return text(rng, d);
        const s = secret(rng);
        secrets.push(s);
        return s;
      });
    });
  });
}

function segmentLine(name: string, fields: FieldTree[], header: boolean, d: RandomDelimiters): string {
  const values = fields.map((f) => joinTree(f, d));
  if (header) return name + d.field + values.slice(1).join(d.field);
  return values.length === 0 ? name : name + d.field + values.join(d.field);
}

function ending(rng: Rng, mode: string): string {
  if (mode === 'mixed') return rng.pick(['\r', '\n', '\r\n']);
  return mode;
}

/** Blank lines that may follow a segment: spaces or tabs, then an ending. */
function blankLines(rng: Rng, mode: string): string {
  if (!rng.chance(0.1)) return '';
  let out = '';
  const count = rng.int(1, 2);
  for (let i = 0; i < count; i++) out += rng.pick(['', ' ', '  ', '\t']) + ending(rng, mode);
  return out;
}

/** Build one random message from a seed. */
export function randomMessage(seed: number, options: BuildOptions = {}): RandomMessage {
  const rng = new Rng(seed);
  const d = pickDelimiters(rng, options.standardDelimiters ?? false);
  const encoding = d.component + d.repetition + d.escape + d.subComponent + d.truncation;
  const mode = rng.pick(['\r', '\r', '\n', '\r\n', 'mixed']);
  const secrets: string[] = [];

  const plain = (v: string): FieldTree => [[[v]]];
  const mshFields: FieldTree[] = [plain(d.field), plain(encoding)];
  const mshCount = rng.int(1, 19);
  for (let i = 3; i <= mshCount + 2; i++) {
    if (i === 12) mshFields.push(plain(rng.pick(['2.3', '2.3.1', '2.4', '2.5', '2.5.1', '2.6', '2.7', '2.8', '2.9', '2.2', ''])));
    else mshFields.push(fieldTree(rng, d));
  }

  const specs: { name: string; fields: FieldTree[]; header: boolean }[] = [{ name: 'MSH', fields: mshFields, header: true }];
  const count = options.segments ?? rng.int(1, 12);
  const patient = options.patientData ?? true;
  for (let i = 0; i < count; i++) {
    let name = rng.pick(SEGMENT_NAMES);
    if (patient && i === 0) name = 'PID';
    if (patient && i === 1) name = 'NK1';
    // Now and then a batch header in the middle, with the same delimiters.
    if (rng.chance(0.03)) {
      const header = rng.pick(['BHS', 'FHS', 'MSH']);
      const fields: FieldTree[] = [plain(d.field), plain(encoding)];
      const n = rng.int(0, 6);
      for (let f = 0; f < n; f++) fields.push(fieldTree(rng, d));
      specs.push({ name: header, fields, header: true });
      continue;
    }
    const masked = MASKED_POSITIONS[name] ?? [];
    const max = masked.length > 0 ? Math.max(...masked) + rng.int(0, 3) : rng.int(0, 30);
    const fields: FieldTree[] = [];
    for (let f = 1; f <= max; f++) {
      if (masked.includes(f) && rng.chance(0.85)) fields.push(maskedTree(rng, d, name, f, secrets));
      else fields.push(fieldTree(rng, d));
    }
    specs.push({ name, fields, header: false });
  }

  const leading = rng.chance(0.1) ? blankLines(rng, mode) || ending(rng, mode) : '';
  const finalEnding = rng.chance(0.8);
  const counts = new Map<string, number>();
  const segments: RandomSegment[] = specs.map((s, i) => {
    const last = i === specs.length - 1;
    const after = last ? (finalEnding ? ending(rng, mode) : '') : ending(rng, mode) + blankLines(rng, mode);
    const occurrence = (counts.get(s.name) ?? 0) + 1;
    counts.set(s.name, occurrence);
    return { ...s, raw: segmentLine(s.name, s.fields, s.header, d), after, occurrence };
  });

  const textOut = leading + segments.map((s) => s.raw + s.after).join('');
  return { text: textOut, delimiters: d, encoding, leading, segments, secrets };
}
