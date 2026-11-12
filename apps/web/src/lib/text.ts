// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

import { getFieldDoc, type FieldDoc, type HL7Segment, type LocalText } from '@infogleam/message-explainer-core';
import { format, type Lang, type Messages } from '../i18n';

export function pick(text: LocalText, lang: Lang): string {
  return text[lang];
}

/** Field name in the page language. Arabic falls back to the HL7 name. */
export function fieldName(doc: FieldDoc, lang: Lang): string {
  return lang === 'ar' && doc.nameAr ? doc.nameAr : doc.name;
}

/** Data type and repeat rule, for example "CWE · repeats". */
export function typeInfo(doc: FieldDoc, t: Messages): string {
  const parts: string[] = [];
  if (doc.dataType) parts.push(doc.dataType);
  const repeat = repeatText(doc.max, t);
  if (repeat) parts.push(repeat);
  return parts.join(' · ');
}

/** "repeats" or "repeats, up to 5 times"; empty when the field does not repeat. */
export function repeatText(max: number | '*', t: Messages): string {
  if (max === '*') return t.repeats;
  return max > 1 ? format(t.repeatsMax, { max }) : '';
}

/** The parts of a text template around one placeholder, for example {name}. */
export function splitTemplate(template: string, placeholder: string): [string, string] {
  const at = template.indexOf(`{${placeholder}}`);
  if (at === -1) return [template, ''];
  return [template.slice(0, at), template.slice(at + placeholder.length + 2)];
}

/**
 * Short meaning of MSH-9, for example "Admit/visit notification".
 * MSH-9.2 uses the same event table (0003) as EVN-1, so its codes are
 * looked up there first, then MSH-9.1 in the message code table (0076).
 */
export function messageTypeText(msh: HL7Segment | undefined, lang: Lang): string {
  const msh9 = msh?.fields.find((f) => f.position === 9)?.repetitions[0];
  const code = msh9?.components[0]?.value ?? '';
  const event = msh9?.components[1]?.value ?? '';
  const eventValue = event ? getFieldDoc('EVN', 1)?.values?.find((v) => v.code === event) : undefined;
  const codeValue = code ? getFieldDoc('MSH', 9)?.values?.find((v) => v.code === code) : undefined;
  const found = eventValue ?? codeValue;
  return found ? found[lang] : '';
}

/** A Mirth path in pieces, so it can wrap before each "[". Joined, the pieces are the path. */
export function pathPieces(path: string): string[] {
  return path.split(/(?=\[)/);
}
