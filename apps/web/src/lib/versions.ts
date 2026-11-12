// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

import {
  fieldVersionWarning,
  getFieldVersion,
  hasFieldFacts,
  HISTORY_VERSIONS,
  LATEST_VERSION,
  versionSupport,
  type CodeValue,
  type FieldDoc,
  type FieldFact,
  type FieldState,
  type VersionSupport,
} from '@infogleam/message-explainer-core';
import { format, type Messages } from '../i18n';

/** The "Explain as version" choice that follows MSH-12. */
export const AUTO = 'auto';

/** The version the page uses when MSH-12 has no version it knows. */
export const LATEST = LATEST_VERSION;

/** Which HL7 version the page explains a message as. */
export interface VersionView {
  /** The version in MSH-12, if any. */
  message: string | undefined;
  support: VersionSupport;
  /** True when the user picked a version, false for Auto. */
  chosen: boolean;
  /** The version the page explains the message as. */
  effective: string;
  /**
   * The version whose field names, data types and rules the page shows:
   * `effective` when the tool has the field facts of that version, and
   * otherwise v2.9. When it is not `effective`, the page says so.
   */
  factsVersion: string;
  /** The version that the "added in a later version" warnings compare with. */
  warn: string | undefined;
}

/**
 * Auto uses MSH-12 for versions 2.3 to 2.9, and v2.9 for any other value.
 * For an old version (2.0 to 2.2) the warnings still compare with the
 * message version, as before.
 */
export function versionView(message: string | undefined, choice: string): VersionView {
  const support = versionSupport(message);
  const chosen = choice !== AUTO && HISTORY_VERSIONS.includes(choice);
  const auto = support === 'supported' && message ? message.trim() : LATEST;
  const effective = chosen ? choice : auto;
  const factsVersion = hasFieldFacts(effective) ? effective : LATEST;
  const warn = chosen ? choice : support === 'older' ? message : effective;
  return { message, support, chosen, effective, factsVersion, warn };
}

/**
 * True when the page shows the v2.9 field names, data types and rules for
 * an older version, because the tool has no field facts for it. The page
 * then shows a note near the version bar.
 */
export function showsLatestFacts(ver: VersionView): boolean {
  return ver.factsVersion !== ver.effective;
}

/**
 * The history entries of a field, oldest first. Empty when there is none,
 * for example when the field history file is empty.
 */
export function fieldStates(doc: FieldDoc): readonly FieldState[] {
  return getFieldVersion(doc.segment, doc.field, LATEST)?.states ?? [];
}

/**
 * Index of the history entry that applies to the doc's version, or -1
 * when the field does not exist yet in that version.
 */
export function stateIndex(doc: FieldDoc, states: readonly FieldState[]): number {
  if (doc.exists === false) return -1;
  const at = HISTORY_VERSIONS.indexOf(doc.version ?? LATEST);
  let index = -1;
  states.forEach((s, i) => {
    if (HISTORY_VERSIONS.indexOf(s.from) <= at) index = i;
  });
  return index;
}

export interface LaterValue {
  from: string;
  value: string;
}

/**
 * The later values of a fact after the entry in use, for example the later
 * names of a field that HL7 renamed. Empty when there is no history.
 */
export function laterValues(doc: FieldDoc, fact: Extract<FieldFact, 'name' | 'dataType'>): LaterValue[] {
  const states = fieldStates(doc);
  const start = Math.max(stateIndex(doc, states), 0);
  return states
    .slice(start + 1)
    .filter((s) => s.changed.includes(fact))
    .map((s) => ({ from: s.from, value: s[fact] }));
}

/** True when the code no longer exists in the version that the warnings compare with. */
export function codeRemoved(value: CodeValue, ver: VersionView): boolean {
  return fieldVersionWarning(value, ver.warn) === 'removed';
}

/** The tag of a code that later versions removed, for example "Until v2.5.1". Empty when the code has no end. */
export function codeUntilTag(value: CodeValue, t: Messages): string {
  return value.until ? format(t.codeUntil, { until: value.until }) : '';
}

/**
 * The notes about codes in the message that do not exist in the version
 * that the warnings compare with: added in a later version, or removed in
 * an earlier one. One note per code, in the order of the code table.
 * When MSH-12 has no version the page knows, the page compares with v2.9.
 * Then the note names the version the page uses, not the message version.
 */
export function codeNotes(values: readonly CodeValue[], codes: readonly string[], ver: VersionView, t: Messages): string[] {
  const notes: string[] = [];
  for (const value of values) {
    if (!codes.includes(value.code)) continue;
    const warning = fieldVersionWarning(value, ver.warn);
    const version = ver.warn ?? '';
    if (warning === 'added-later') {
      notes.push(format(ver.chosen ? t.codeAddedLaterChosen : t.codeAddedLater, { code: value.code, since: value.since ?? '', version }));
    } else if (warning === 'removed') {
      const fromMessage = ver.message !== undefined && ver.message.trim() === version.trim();
      const text = ver.chosen ? t.codeRemovedChosen : fromMessage ? t.codeRemoved : t.codeRemovedAuto;
      notes.push(format(text, { code: value.code, until: value.until ?? '', version }));
    }
  }
  return notes;
}
