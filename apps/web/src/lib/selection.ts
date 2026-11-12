// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

import {
  fieldPath,
  getComponentDoc,
  getFieldDoc,
  type ComponentDoc,
  type FieldDoc,
  type FieldPath,
  type HL7Field,
  type HL7Segment,
  type ParsedMessage,
} from '@infogleam/message-explainer-core';

/** One part of the message: a field, a component or a sub-component. */
export interface Selection {
  /** 0-based index of the segment in the message. */
  seg: number;
  /** 1-based field number. */
  field: number;
  /** 1-based repetition. */
  rep: number;
  /** 1-based component number, for a component or a sub-component. */
  comp?: number | undefined;
  /** 1-based sub-component number. */
  sub?: number | undefined;
}

/**
 * Short text key of a part, also used in data-k attributes:
 * "3:5" (field), "3:5:1:2" (component), "3:5:1:2:1" (sub-component).
 */
export function partKey(s: Selection): string {
  if (s.comp === undefined) return `${s.seg}:${s.field}`;
  if (s.sub === undefined) return `${s.seg}:${s.field}:${s.rep}:${s.comp}`;
  return `${s.seg}:${s.field}:${s.rep}:${s.comp}:${s.sub}`;
}

export function parsePartKey(key: string | undefined): Selection | undefined {
  if (!key) return undefined;
  const n = key.split(':').map(Number);
  if (n.length !== 2 && n.length !== 4 && n.length !== 5) return undefined;
  if (n.some((x) => !Number.isInteger(x) || x < 0)) return undefined;
  const [seg = 0, field = 0, rep = 1, comp, sub] = n;
  return { seg, field, rep, comp, sub };
}

/** Field key of a part ("3:5"), the same format as maskKey(). */
export function fieldKeyOf(s: Selection): string {
  return `${s.seg}:${s.field}`;
}

/** Position label and Mirth path. Never throws, also for odd segment names. */
export function safePath(segment: HL7Segment, field: number, rep?: number, comp?: number, sub?: number): FieldPath {
  try {
    return fieldPath(segment.name, field, rep, comp, sub, { segmentOccurrence: segment.occurrence });
  } catch {
    let label = `${segment.name}-${field}`;
    if (rep !== undefined && rep > 1) label += `[${rep}]`;
    if (comp !== undefined) label += `.${comp}`;
    if (comp !== undefined && sub !== undefined) label += `.${sub}`;
    return { label, mirthPath: '' };
  }
}

/** Component 1 of each repetition, to find the codes of a field in its code table. */
export function fieldCodes(field: HL7Field): string[] {
  return field.repetitions.map((r) => r.components[0]?.value ?? '').filter((c) => c !== '');
}

export interface PartInfo {
  sel: Selection;
  segment: HL7Segment;
  field: HL7Field;
  /** The exact text at this position. */
  value: string;
  path: FieldPath;
  fieldDoc: FieldDoc | undefined;
  /** Label of the field, for example "PID-5". */
  fieldLabel: string;
  /** Name of the component, for a component or a sub-component. */
  compDoc: ComponentDoc | undefined;
  /** Label of the component, for a sub-component, for example "PID-3.4". */
  compLabel: string;
  /** Name of the sub-component. */
  subDoc: ComponentDoc | undefined;
  codes: string[];
}

/**
 * Everything the page shows about one part, with names and data types of
 * the given HL7 version. Undefined when the part does not exist.
 *
 * With emptyField, a field past the end of its segment is shown as an
 * empty field when HL7 defines it (for example a required field that a
 * message check reports as empty).
 */
export function partInfo(
  message: ParsedMessage,
  sel: Selection,
  version: string,
  options: { emptyField?: boolean } = {},
): PartInfo | undefined {
  const segment = message.segments[sel.seg];
  let field = segment?.fields.find((f) => f.position === sel.field);
  if (segment && !field && options.emptyField && sel.comp === undefined && getFieldDoc(segment.name, sel.field)) {
    field = { position: sel.field, value: '', repetitions: [{ index: 1, value: '', components: [{ position: 1, value: '', subComponents: [''] }] }] };
  }
  if (!segment || !field) return undefined;

  let value = field.value;
  if (sel.comp !== undefined) {
    const comp = field.repetitions[sel.rep - 1]?.components[sel.comp - 1];
    if (!comp) return undefined;
    value = comp.value;
    if (sel.sub !== undefined) {
      const sub = comp.subComponents[sel.sub - 1];
      if (sub === undefined) return undefined;
      value = sub;
    }
  }

  const name = segment.name;
  return {
    sel,
    segment,
    field,
    value,
    path: safePath(segment, sel.field, sel.rep, sel.comp, sel.sub),
    fieldDoc: getFieldDoc(name, sel.field, version),
    fieldLabel: safePath(segment, sel.field).label,
    compDoc: sel.comp !== undefined ? getComponentDoc(name, sel.field, sel.comp, undefined, version) : undefined,
    compLabel: sel.comp !== undefined ? safePath(segment, sel.field, sel.rep, sel.comp).label : '',
    subDoc:
      sel.comp !== undefined && sel.sub !== undefined
        ? getComponentDoc(name, sel.field, sel.comp, sel.sub, version)
        : undefined,
    codes: fieldCodes(field),
  };
}
