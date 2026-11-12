// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

import {
  getComponentDoc,
  getFieldDoc,
  HEADER_SEGMENTS,
  matchesSearch,
  parsePositionQuery,
  type ComponentDoc,
  type FieldDoc,
  type HL7Field,
  type HL7Segment,
} from '@infogleam/message-explainer-core';
import { fieldCodes, safePath, type Selection } from './selection';

export interface Row {
  key: string;
  label: string;
  mirthPath: string;
  value: string;
  /** 0 = field, 1 = component, 2 = sub-component */
  level: 0 | 1 | 2;
  /** 1-based field number. */
  field: number;
  /** The part this row shows. */
  sel: Selection;
  /** Same format as maskKey(), to find masked fields. */
  fieldKey: string;
  /** Component 1 of each repetition, to match table codes. Field rows only. */
  codes: string[];
  /** Field explanation. Field rows only. */
  fieldDoc?: FieldDoc | undefined;
  /** Component or sub-component name. Part rows only. */
  compDoc?: ComponentDoc | undefined;
  /**
   * Names to search in: the field name in the version shown and in v2.9,
   * and the Arabic name; or the component name.
   */
  names: string[];
}

/** A field row and the rows of its components and sub-components. */
export interface FieldGroup {
  field: Row;
  parts: Row[];
}

export function maskKey(segmentIndex: number, field: number): string {
  return `${segmentIndex}:${field}`;
}

/** True when the field has repetitions, components or sub-components to show. */
export function hasParts(seg: HL7Segment, f: HL7Field): boolean {
  if (HEADER_SEGMENTS.has(seg.name) && f.position <= 2) return false;
  const first = f.repetitions[0];
  return (
    f.repetitions.length > 1 ||
    (first !== undefined &&
      (first.components.length > 1 || (first.components[0]?.subComponents.length ?? 0) > 1))
  );
}

function names(...list: (string | undefined)[]): string[] {
  return [...new Set(list.filter((n): n is string => n !== undefined && n !== ''))];
}

/**
 * Rows for one segment, grouped by field. Empty values are skipped. Names,
 * data types and component names follow the given HL7 version.
 */
export function segmentGroups(seg: HL7Segment, version: string): FieldGroup[] {
  const groups: FieldGroup[] = [];

  for (const f of seg.fields) {
    if (f.value === '') continue;
    const field = f.position;
    const fieldKey = maskKey(seg.index, field);
    const p = safePath(seg, field);
    const fieldDoc = getFieldDoc(seg.name, field, version);
    const sel: Selection = { seg: seg.index, field, rep: 1 };
    const fieldRow: Row = {
      key: p.label,
      ...p,
      value: f.value,
      level: 0,
      field,
      sel,
      fieldKey,
      codes: fieldCodes(f),
      fieldDoc,
      names: names(fieldDoc?.name, fieldDoc?.latestName, fieldDoc?.nameAr),
    };
    const parts: Row[] = [];
    groups.push({ field: fieldRow, parts });
    if (!hasParts(seg, f)) continue;

    for (const rep of f.repetitions) {
      for (const comp of rep.components) {
        if (comp.value === '') continue;
        const cp = safePath(seg, field, rep.index, comp.position);
        const csel: Selection = { seg: seg.index, field, rep: rep.index, comp: comp.position };
        const compDoc = getComponentDoc(seg.name, field, comp.position, undefined, version);
        parts.push({
          key: cp.label,
          ...cp,
          value: comp.value,
          level: 1,
          field,
          sel: csel,
          fieldKey,
          codes: [],
          compDoc,
          names: names(compDoc?.name),
        });
        if (comp.subComponents.length < 2) continue;

        comp.subComponents.forEach((sub, i) => {
          if (sub === '') return;
          const sp = safePath(seg, field, rep.index, comp.position, i + 1);
          const subDoc = getComponentDoc(seg.name, field, comp.position, i + 1, version);
          parts.push({
            key: sp.label,
            ...sp,
            value: sub,
            level: 2,
            field,
            sel: { ...csel, sub: i + 1 },
            fieldKey,
            codes: [],
            compDoc: subDoc,
            names: names(subDoc?.name),
          });
        });
      }
    }
  }
  return groups;
}

/** A field group as the list shows it. */
export interface ShownGroup extends FieldGroup {
  /** True when a search found some of the parts: they are shown even if the field is folded. */
  open: boolean;
}

export interface FilterResult {
  groups: ShownGroup[];
  /** Number of rows that match the search (fields and parts). */
  matches: number;
}

/**
 * Filter field groups with a search text (see matchesSearch in core).
 * A field stays when it matches or one of its parts matches. When only
 * parts match, just those parts are shown. A segment name alone ("PID")
 * finds the fields of that segment, not every part of them.
 */
export function filterGroups(groups: FieldGroup[], query: string): FilterResult {
  const q = query.trim();
  if (q === '') return { groups: groups.map((g) => ({ ...g, open: false })), matches: 0 };

  const position = parsePositionQuery(q);
  const segmentOnly = position !== undefined && !position.includes('-');
  const shown: ShownGroup[] = [];
  let matches = 0;

  for (const g of groups) {
    const fieldHit = matchesSearch(q, g.field);
    const partHits = g.parts.filter((p) => matchesSearch(q, segmentOnly ? { label: '', names: p.names } : p));
    if (!fieldHit && partHits.length === 0) continue;
    matches += (fieldHit ? 1 : 0) + partHits.length;
    shown.push(partHits.length > 0 ? { field: g.field, parts: partHits, open: true } : { ...g, open: false });
  }
  return { groups: shown, matches };
}
