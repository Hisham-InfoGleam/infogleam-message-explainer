// SPDX-License-Identifier: MPL-2.0
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// Look up what a segment or field means. Two sources are merged:
// - dictionary/hl7-fields.json: field name, data type and repeat rule
//   (HL7 v2.9, Apache-2.0 data from HL7, see the NOTICE file)
// - dictionary/explanations/<SEG>.json: our own English and Arabic text
// For an older version, the name, data type, optionality and repeat rule
// come from the field history (history.ts) when it has them. Otherwise the
// v2.9 facts are used, and the doc says so (factsVersion).

import fieldList from './dictionary/hl7-fields.json' with { type: 'json' };
import { getFieldVersion, HISTORY_VERSIONS, LATEST_VERSION, type FieldOpt } from './history.js';
import { compareVersions } from './version.js';
import AL1 from './dictionary/explanations/AL1.json' with { type: 'json' };
import DG1 from './dictionary/explanations/DG1.json' with { type: 'json' };
import EVN from './dictionary/explanations/EVN.json' with { type: 'json' };
import MSH from './dictionary/explanations/MSH.json' with { type: 'json' };
import NK1 from './dictionary/explanations/NK1.json' with { type: 'json' };
import OBR from './dictionary/explanations/OBR.json' with { type: 'json' };
import OBX from './dictionary/explanations/OBX.json' with { type: 'json' };
import ORC from './dictionary/explanations/ORC.json' with { type: 'json' };
import PID from './dictionary/explanations/PID.json' with { type: 'json' };
import PV1 from './dictionary/explanations/PV1.json' with { type: 'json' };

/** The same text in English and Arabic. */
export interface LocalText {
  en: string;
  ar: string;
}

/** How often a field is filled in real messages. */
export type Usage = 'common' | 'sometimes' | 'rare' | 'legacy';

/** One code from an HL7 table, with its meaning. */
export interface CodeValue {
  code: string;
  en: string;
  ar: string;
  /** First HL7 version with this code, for example "2.4". */
  since?: string;
  /** Last HL7 version with this code, for example "2.5.1". Later versions do not have it. */
  until?: string;
}

export interface FieldDoc {
  /** Position, for example "PID-8". */
  id: string;
  segment: string;
  /** 1-based field number. */
  field: number;
  /** Field name in HL7 v2.9, or in `factsVersion` when that is set. */
  name: string;
  /** Other names of the same field, if the field list has any. */
  otherNames?: string[];
  /**
   * Data type in HL7 v2.9 (or in `factsVersion`), for example "CWE". Empty
   * when the field list has none.
   */
  dataType: string;
  /** Least number of times the field appears. 0 means optional. */
  min: number;
  /** Most times the field may appear. "*" means no limit. */
  max: number | '*';
  /** True when the field may repeat. */
  repeats: boolean;
  /** The HL7 version that getFieldDoc() was asked for. Only set with a version. */
  version?: string;
  /**
   * The HL7 version that name, dataType, min, max, repeats and opt describe.
   * Only set together with `version`. It is `version` when the tool has the
   * field facts of that version (see hasFieldFacts), and otherwise v2.9,
   * the version of the field list. Compare it with `version` before you say
   * that a name or data type belongs to `version`.
   */
  factsVersion?: string;
  /**
   * Optionality in `factsVersion`: R, O, C, B (backward compatibility
   * only), W (withdrawn) or X. Not set when the tool does not know it: the
   * field list has only the least and most number of times.
   */
  opt?: FieldOpt;
  /**
   * False when the field does not exist yet in `version`. Only set together
   * with `version`. When the field history has the field, the name and data
   * type are then those of the first version that has the field.
   */
  exists?: boolean;
  /** Field name in HL7 v2.9. Only set together with `version`. */
  latestName?: string;
  /** Field name in Arabic. */
  nameAr?: string;
  usage?: Usage;
  /** First HL7 version with this field, for example "2.6". Not set for fields that exist in 2.3. */
  since?: string;
  summary?: LocalText;
  details?: LocalText;
  /** How the field differs between versions. */
  versionNote?: LocalText;
  /** Advice from practice. Not part of the standard. */
  tip?: LocalText;
  example?: string;
  /** HL7 table number, for example "0001". */
  table?: string;
  /** Common codes from that table. */
  values?: CodeValue[];
}

export interface SegmentDoc {
  segment: string;
  /** Segment name in the HL7 field list, for example "Patient Identification". */
  name: string;
  title: LocalText;
  summary: LocalText;
  details: LocalText;
  /** The most important fields, for example "PID-3". */
  keyFields: string[];
  /** Number of fields in the HL7 v2.9 field list. */
  fieldCount: number;
}

interface RawField {
  id: string;
  name: string;
  dataType: string;
  min: number | string;
  max: number | string;
  otherNames?: string[];
}

interface RawFieldText {
  nameAr?: string;
  usage?: string;
  since?: string;
  summary?: LocalText;
  details?: LocalText;
  versionNote?: LocalText;
  tip?: LocalText;
  example?: string;
  table?: string;
  values?: CodeValue[];
}

interface RawSegmentText {
  segment: string;
  title: LocalText;
  summary: LocalText;
  details: LocalText;
  keyFields: string[];
  fields: Record<string, RawFieldText>;
}

const FIELD_LIST: Record<string, { title: string; fields: RawField[] }> = fieldList.segments;

const TEXTS: Record<string, RawSegmentText> = { AL1, DG1, EVN, MSH, NK1, OBR, OBX, ORC, PID, PV1 };

const USAGES: readonly Usage[] = ['common', 'sometimes', 'rare', 'legacy'];

/** Segments that have a field list. */
export const DOCUMENTED_SEGMENTS: readonly string[] = Object.keys(FIELD_LIST);

function own<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

// A few values in the field list are text, for example "0..2".
function toCount(value: number | string): number {
  if (typeof value === 'number') return value;
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? 0 : n;
}

function mergeField(segment: string, field: number, raw: RawField, text: RawFieldText | undefined): FieldDoc {
  const max = raw.max === '*' ? '*' : toCount(raw.max);
  const doc: FieldDoc = {
    id: raw.id,
    segment,
    field,
    name: raw.name,
    dataType: raw.dataType,
    min: toCount(raw.min),
    max,
    repeats: max === '*' || max > 1,
  };
  if (raw.otherNames?.length) doc.otherNames = raw.otherNames;
  if (!text) return doc;

  const usage = USAGES.find((u) => u === text.usage);
  if (text.nameAr !== undefined) doc.nameAr = text.nameAr;
  if (usage) doc.usage = usage;
  if (text.since !== undefined) doc.since = text.since;
  if (text.summary) doc.summary = text.summary;
  if (text.details) doc.details = text.details;
  if (text.versionNote) doc.versionNote = text.versionNote;
  if (text.tip) doc.tip = text.tip;
  if (text.example !== undefined) doc.example = text.example;
  if (text.table !== undefined) doc.table = text.table;
  if (text.values?.length) doc.values = text.values;
  return doc;
}

const fieldCache = new Map<string, FieldDoc | null>();

function baseFieldDoc(segment: string, field: number): FieldDoc | undefined {
  const id = `${segment}-${field}`;
  const cached = fieldCache.get(id);
  if (cached !== undefined) return cached ?? undefined;

  const raw = own(FIELD_LIST, segment)?.fields.find((f) => f.id === id);
  const text = own(TEXTS, segment);
  const doc = raw ? mergeField(segment, field, raw, text && own(text.fields, id)) : null;
  fieldCache.set(id, doc);
  return doc ?? undefined;
}

const versionDocCache = new Map<string, FieldDoc | null>();

/**
 * Name, data type and explanation of one field, for example
 * getFieldDoc('PID', 8). Returns undefined for segments without a field
 * list (such as Z-segments) and for field numbers past the end of the list.
 *
 * With a version (one of HISTORY_VERSIONS, 2.3 to 2.9), the doc is for
 * that version. When the field history has the field, the name, data type,
 * optionality and repeat rule are those of that version, and factsVersion
 * is that version. Otherwise they are the v2.9 facts of the field list:
 * factsVersion is "2.9", opt is not set, and `exists` comes from the
 * explanation (`since`). The explanation stays the same. Returns undefined
 * for a version that is not in the list. Do not change the returned
 * object; it is shared.
 */
export function getFieldDoc(segment: string, field: number, version?: string): FieldDoc | undefined {
  if (typeof segment !== 'string' || !Number.isInteger(field) || field < 1) return undefined;
  const base = baseFieldDoc(segment, field);
  if (!base || version === undefined) return base;
  if (typeof version !== 'string') return undefined;

  const key = `${base.id}@${version}`;
  const cached = versionDocCache.get(key);
  if (cached !== undefined) return cached ?? undefined;
  const v = version.trim();
  const facts = getFieldVersion(segment, field, v);
  let doc: FieldDoc | null = null;
  if (facts) {
    doc = {
      ...base,
      name: facts.name,
      dataType: facts.dataType,
      min: facts.opt === 'R' ? 1 : 0,
      max: facts.max,
      repeats: facts.repeats,
      version: facts.version,
      factsVersion: facts.version,
      opt: facts.opt,
      exists: facts.exists,
      latestName: base.name,
    };
  } else if (HISTORY_VERSIONS.includes(v)) {
    // No field history for this field: the v2.9 facts of the field list.
    doc = {
      ...base,
      version: v,
      factsVersion: LATEST_VERSION,
      exists: base.since === undefined || compareVersions(base.since, v) <= 0,
      latestName: base.name,
    };
  }
  versionDocCache.set(key, doc);
  return doc ?? undefined;
}

/** Title and explanation of a segment, or undefined if there is none. */
export function getSegmentDoc(segment: string): SegmentDoc | undefined {
  const list = own(FIELD_LIST, segment);
  const text = own(TEXTS, segment);
  if (!list || !text) return undefined;
  return {
    segment,
    name: list.title,
    title: text.title,
    summary: text.summary,
    details: text.details,
    keyFields: text.keyFields,
    fieldCount: list.fields.length,
  };
}
