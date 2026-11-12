// SPDX-License-Identifier: MPL-2.0
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// Names of components and sub-components, for example PID-5.1 "Family Name".
// The data is in dictionary/hl7-datatypes.json: HL7 v2.9 names from the HL7
// Version 2 to FHIR project (Apache-2.0 data from HL7, see the NOTICE file).
// Rebuild it with scripts/build-datatypes.mjs.

import dataTypeList from './dictionary/hl7-datatypes.json' with { type: 'json' };
import { getFieldDoc } from './dictionary.js';
import { getFieldVersion, HISTORY_VERSIONS } from './history.js';

export interface ComponentDoc {
  /** Id inside its data type, for example "XPN.1". */
  id: string;
  /** Name in HL7 v2.9, for example "Family Name". */
  name: string;
  /**
   * Data type of this component, for example "FN". Empty when the source
   * has none, for example for a component that HL7 withdrew.
   */
  dataType: string;
  /** Least number of times the component appears. 0 means optional. */
  min: number;
  /** Most times the component may appear. "*" means no limit. */
  max: number | '*';
}

export interface DataTypeDoc {
  /** Data type code, for example "XPN". */
  code: string;
  components: readonly ComponentDoc[];
}

interface RawComponent {
  id: string;
  name: string;
  dataType: string;
  min: number;
  max: number | string;
}

const TYPES: Record<string, { components: RawComponent[] }> = dataTypeList.dataTypes;

/**
 * Data types that the fields use but the source does not describe, for
 * example "VID" (MSH-12). Their components have no names.
 */
export const MISSING_DATA_TYPES: readonly string[] = dataTypeList.missing;

// Data types without components.
const PRIMITIVES: ReadonlySet<string> = new Set([
  'DT',
  'DTM',
  'FT',
  'GTS',
  'ID',
  'IS',
  'NM',
  'SI',
  'SNM',
  'ST',
  'TM',
  'TX',
]);

/**
 * What the tool knows about the parts of a data type:
 * - composite: it has components, and the tool has their names
 * - primitive: it has no components, for example ST or IS
 * - unknown: it has components, but the tool has no names for them, for
 *   example the general data type CM, or VID
 */
export type DataTypeKind = 'composite' | 'primitive' | 'unknown';

/**
 * The kind of a data type code, for example dataTypeKind('XPN') is
 * "composite". Returns undefined for an empty code and for "varies"
 * (OBX-5, where OBX-2 gives the data type).
 */
export function dataTypeKind(code: string): DataTypeKind | undefined {
  if (typeof code !== 'string' || code === '' || code === 'varies') return undefined;
  if (PRIMITIVES.has(code)) return 'primitive';
  return own(TYPES, code) ? 'composite' : 'unknown';
}

function own<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

/** The data type whose component names the tool uses for a field. */
export interface PartNames {
  /** Data type code, for example "XPN" or "MSG". */
  dataType: string;
  /**
   * Only set when the names come from a later data type: the version where
   * the field gets that data type, for example "2.5".
   */
  from?: string;
}

/**
 * The data type whose component names the tool uses for a field, for
 * example partNamesType('PID', 5) is XPN. With a version, it is the field's
 * data type in getFieldDoc() for that version (the v2.9 data type when the
 * tool has no field facts for the version).
 *
 * In older versions, some fields have the general data type CM. Later
 * versions gave each of them a named data type with the same parts in the
 * same order. When the field history gives a field the data type CM, the
 * first later named data type that the tool has names for is used, and
 * `from` says where it starts. Returns undefined when the field or its
 * data type is not known.
 */
export function partNamesType(segment: string, field: number, version?: string): PartNames | undefined {
  const dataType = getFieldDoc(segment, field, version)?.dataType;
  if (!dataType) return undefined;
  if (dataType !== 'CM' || version === undefined) return { dataType };
  const at = HISTORY_VERSIONS.indexOf(version.trim());
  const later = getFieldVersion(segment, field, version)?.states.find(
    (s) => HISTORY_VERSIONS.indexOf(s.from) > at && dataTypeKind(s.dataType) === 'composite',
  );
  return later ? { dataType: later.dataType, from: later.from } : { dataType };
}

function toComponent(raw: RawComponent): ComponentDoc {
  const max = raw.max === '*' ? '*' : Number(raw.max);
  return {
    id: raw.id,
    name: raw.name,
    dataType: raw.dataType,
    min: raw.min,
    max: Number.isNaN(max) ? 1 : max,
  };
}

const cache = new Map<string, DataTypeDoc>();

/**
 * Components of a data type, for example getDataTypeDoc('XPN').
 * Returns undefined for primitive data types (such as ST or NM), which have
 * no components, and for data types the source does not have.
 * Do not change the returned object; it is shared.
 */
export function getDataTypeDoc(code: string): DataTypeDoc | undefined {
  const cached = cache.get(code);
  if (cached) return cached;
  const raw = own(TYPES, code);
  if (!raw) return undefined;
  const doc: DataTypeDoc = { code, components: raw.components.map(toComponent) };
  cache.set(code, doc);
  return doc;
}

function componentOf(code: string | undefined, n: number | undefined): ComponentDoc | undefined {
  if (!code || n === undefined || !Number.isInteger(n) || n < 1) return undefined;
  return getDataTypeDoc(code)?.components.find((c) => c.id === `${code}.${n}`);
}

/**
 * Name and data type of a component or sub-component, found through the
 * field's data type. Examples:
 * - getComponentDoc('PID', 5, 1): XPN.1 "Family Name"
 * - getComponentDoc('PID', 3, 4): CX.4 "Assigning Authority" (data type HD)
 * - getComponentDoc('PID', 3, 4, 1): HD.1 "Namespace ID"
 *
 * With a version, the field's data type in getFieldDoc() for that version
 * is used (see partNamesType). Component names still follow HL7 v2.9, or
 * the last version that has the data type (CE, TS, TQ and SPS). For a field
 * with the general data type CM, the names of the later named data type are
 * used (see partNamesType). When the tool has no names for the data type
 * (for example VID), there is no result.
 *
 * The repetition does not matter, so it is not a parameter. Returns
 * undefined when the field, the data type or the position is not known.
 * It never throws.
 */
export function getComponentDoc(
  segment: string,
  field: number,
  comp: number,
  sub?: number,
  version?: string,
): ComponentDoc | undefined {
  const component = componentOf(partNamesType(segment, field, version)?.dataType, comp);
  if (sub === undefined) return component;
  return componentOf(component?.dataType, sub);
}
