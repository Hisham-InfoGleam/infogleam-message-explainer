// SPDX-License-Identifier: MPL-2.0
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// The field facts of each HL7 version from 2.3 to 2.9: the name, data type,
// optionality (R, O, C, B, W or X) and repeat rule of each field. They are
// read from dictionary/hl7-field-history.json. That file is an optional
// data file: it can be empty (no fields). The code works in both cases.
// Without it, the tool has the field facts of v2.9 only, from
// dictionary/hl7-fields.json (see dictionary.ts).

import history from './dictionary/hl7-field-history.json' with { type: 'json' };

/**
 * Optionality in the HL7 tables (the OPT column):
 * R required, O optional, C conditional, B kept for backward compatibility
 * only, W withdrawn, X not used.
 */
export type FieldOpt = 'R' | 'O' | 'C' | 'B' | 'W' | 'X';

/** The facts that the history follows. */
export type FieldFact = 'name' | 'dataType' | 'opt' | 'max';

/** One entry of a field's history: the facts that changed in a version. */
export interface FieldChange {
  /** The version where the entry starts, for example "2.4". */
  from: string;
  name?: string;
  dataType?: string;
  opt?: FieldOpt;
  /** Most times the field may appear. "*" means no limit. */
  max?: number | '*';
}

/** All facts of a field from one version on, until the next entry. */
export interface FieldState {
  from: string;
  name: string;
  dataType: string;
  opt: FieldOpt;
  max: number | '*';
  /** The facts that changed in this version. Empty for the first entry. */
  changed: readonly FieldFact[];
}

/** A field as it is in one HL7 version. */
export interface FieldVersion {
  /** Position, for example "PID-8". */
  id: string;
  /** The version asked for. */
  version: string;
  /**
   * False when the field was added in a later version. The facts below are
   * then those of the first version that has it.
   */
  exists: boolean;
  /** First version with the field, for example "2.4". */
  since: string;
  name: string;
  dataType: string;
  opt: FieldOpt;
  max: number | '*';
  /** True when the field may repeat. */
  repeats: boolean;
  /** The history as stored: the first entry has all facts, later ones only what changed. */
  changes: readonly FieldChange[];
  /** The history with all facts in each entry, oldest first. */
  states: readonly FieldState[];
}

interface RawChange {
  from: string;
  name?: string;
  dataType?: string;
  opt?: string;
  max?: number | string;
}

const FIELDS: Record<string, RawChange[]> = history.fields;

/**
 * The HL7 versions that the tool explains, oldest first: 2.3 to 2.9. The
 * field history can cover these versions.
 */
export const HISTORY_VERSIONS: readonly string[] = history.versions;

/** The newest HL7 version. The field list (hl7-fields.json) follows it. */
export const LATEST_VERSION = '2.9';

/**
 * True when the field history file holds the facts of the fields. When it
 * is empty, the tool knows the field facts of v2.9 only (see hasFieldFacts).
 */
export const HAS_FIELD_HISTORY: boolean = Object.keys(FIELDS).length > 0;

/**
 * True when the tool has the name, data type, required rule and repeat rule
 * of every field in this version: every version of HISTORY_VERSIONS when the
 * field history is there, otherwise only v2.9 (from the field list).
 * Spaces around the version do not count. It never throws.
 */
export function hasFieldFacts(version: string | undefined): boolean {
  if (typeof version !== 'string') return false;
  const v = version.trim();
  return HAS_FIELD_HISTORY ? HISTORY_VERSIONS.includes(v) : v === LATEST_VERSION;
}

const OPTS: ReadonlySet<string> = new Set(['R', 'O', 'C', 'B', 'W', 'X']);
const FACTS: readonly FieldFact[] = ['name', 'dataType', 'opt', 'max'];

function own<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function toOpt(value: string | undefined): FieldOpt | undefined {
  return value !== undefined && OPTS.has(value) ? (value as FieldOpt) : undefined;
}

function toMax(value: number | string | undefined): number | '*' | undefined {
  if (value === undefined) return undefined;
  if (value === '*') return '*';
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : undefined;
}

interface Parsed {
  changes: FieldChange[];
  states: FieldState[];
}

const parsedCache = new Map<string, Parsed | null>();

function parse(id: string): Parsed | undefined {
  const cached = parsedCache.get(id);
  if (cached !== undefined) return cached ?? undefined;
  const raw = own(FIELDS, id);
  let result: Parsed | null = null;
  if (raw && raw.length > 0) {
    const changes: FieldChange[] = [];
    const states: FieldState[] = [];
    let name = '';
    let dataType = '';
    let opt: FieldOpt = 'O';
    let max: number | '*' = 1;
    for (const entry of raw) {
      const change: FieldChange = { from: entry.from };
      if (entry.name !== undefined) change.name = name = entry.name;
      if (entry.dataType !== undefined) change.dataType = dataType = entry.dataType;
      const newOpt = toOpt(entry.opt);
      if (newOpt) change.opt = opt = newOpt;
      const newMax = toMax(entry.max);
      if (newMax !== undefined) change.max = max = newMax;
      const changed = states.length === 0 ? [] : FACTS.filter((fact) => change[fact] !== undefined);
      changes.push(change);
      states.push({ from: entry.from, name, dataType, opt, max, changed });
    }
    result = { changes, states };
  }
  parsedCache.set(id, result);
  return result ?? undefined;
}

/**
 * The stored history of a field, oldest first, for example
 * getFieldHistory('PID', 8). Returns undefined for unknown segments and
 * fields, and when the field history file has no entry for the field.
 * Do not change the returned list; it is shared.
 */
export function getFieldHistory(segment: string, field: number): readonly FieldChange[] | undefined {
  if (typeof segment !== 'string' || !Number.isInteger(field) || field < 1) return undefined;
  return parse(`${segment}-${field}`)?.changes;
}

const versionCache = new Map<string, FieldVersion>();

/**
 * A field as it is in one version, for example getFieldVersion('PID', 8,
 * '2.5'), from the field history. The version must be one of
 * HISTORY_VERSIONS. Returns undefined for unknown segments, fields and
 * versions, and when the field history file has no entry for the field;
 * it never throws. Do not change the returned object; it is shared.
 */
export function getFieldVersion(segment: string, field: number, version: string): FieldVersion | undefined {
  if (typeof segment !== 'string' || typeof version !== 'string') return undefined;
  if (!Number.isInteger(field) || field < 1) return undefined;
  const v = version.trim();
  const index = HISTORY_VERSIONS.indexOf(v);
  if (index === -1) return undefined;
  const id = `${segment}-${field}`;
  const key = `${id}@${v}`;
  const cached = versionCache.get(key);
  if (cached) return cached;

  const parsed = parse(id);
  const first = parsed?.states[0];
  if (!parsed || !first) return undefined;
  let state: FieldState | undefined;
  for (const s of parsed.states) {
    if (HISTORY_VERSIONS.indexOf(s.from) <= index) state = s;
  }
  const facts = state ?? first;
  const result: FieldVersion = {
    id,
    version: v,
    exists: state !== undefined,
    since: first.from,
    name: facts.name,
    dataType: facts.dataType,
    opt: facts.opt,
    max: facts.max,
    repeats: facts.max !== 1,
    changes: parsed.changes,
    states: parsed.states,
  };
  versionCache.set(key, result);
  return result;
}
