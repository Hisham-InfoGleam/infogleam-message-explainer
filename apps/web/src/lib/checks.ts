// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// Turns the findings of checkMessage() (core) into sentences, marks and a
// plain text list. Every sentence comes from en.json or ar.json and is
// filled only with facts from the finding: positions, versions, counts and
// rule facts. A finding never holds a value from the message, so neither
// do the sentences or the copied list.

import {
  CHECK_LEVELS,
  compareVersions,
  FIELD_CHECKS,
  getFieldDoc,
  HAS_FIELD_HISTORY,
  LATEST_VERSION,
  STATUS_CHECKS,
  type CheckFinding,
  type CheckLevel,
  type CheckResult,
  type ParsedMessage,
} from '@infogleam/message-explainer-core';
import { format, type Lang, type Messages } from '../i18n';
import { partKey, safePath, type Selection } from './selection';
import type { VersionView } from './versions';

type CheckTexts = Messages['checks'];

/** One finding, ready to show. */
export interface CheckItem {
  finding: CheckFinding;
  /** Unique within one result. */
  key: string;
  level: CheckLevel;
  /** "Line 3", or "Whole message". */
  lineText: string;
  /** Position label, for example "PID-3" or "PID-7[2].1". Empty when there is none. */
  label: string;
  /** Field name in the page language. Empty when the finding is not about one field. */
  fieldName: string;
  sentence: string;
  /** The rule, in our own words. */
  rule: string;
  /** Where the rule is in the HL7 standard, or that it is the tool's own rule. */
  source: string;
  /** The part to explain when the item is clicked. */
  sel: Selection | undefined;
  /** 0-based segment index, for items about a whole segment. */
  segmentIndex: number | undefined;
}

/** A mark in the message view or the field list. */
export interface Mark {
  /** The most serious level at this place. */
  level: CheckLevel;
  /** "Differs from HL7: sentence", one per finding at this place. */
  text: string;
}

const RANK: Record<CheckLevel, number> = { problem: 0, differs: 1, note: 2 };

/** Chapter of the attribute table of each explained segment (the same in v2.3 to v2.9). */
const SEGMENT_CHAPTER: Record<string, string> = {
  MSH: '2',
  EVN: '3',
  PID: '3',
  PV1: '3',
  NK1: '3',
  AL1: '3',
  ORC: '4',
  OBR: '4',
  DG1: '6',
  OBX: '7',
};

/** Checks that are the tool's own rules, not rules of the HL7 standard. */
const TOOL_RULES: ReadonlySet<string> = new Set(['S3b', 'V3', 'G2']);

const DATA_TYPE_OF: Record<string, string> = { D1: 'DT', D3: 'TM', D4: 'NM', D5: 'SI' };

/**
 * The version to check against (plan decision 5): the version the user
 * picked, or MSH-12 when it is a version the tool has data for. Otherwise
 * none, and the version checks wait until the user picks one.
 */
export function checkVersion(ver: VersionView): string | undefined {
  return ver.chosen || ver.support === 'supported' ? ver.effective : undefined;
}

/**
 * Leave out S4 and S5 (segment ends) for a typed or pasted message. A text
 * box always turns CR into LF, so the ends there say nothing about the
 * message. The page shows a hint about text boxes instead. For a file or a
 * sample the characters are exact, and S4 and S5 stay.
 */
export function withoutTextBoxEnds(result: CheckResult): CheckResult {
  const findings = result.findings.filter((f) => f.id !== 'S4' && f.id !== 'S5');
  if (findings.length === result.findings.length) return result;
  const counts: Record<CheckLevel, number> = { problem: 0, differs: 0, note: 0 };
  for (const f of findings) counts[f.level]++;
  return { ...result, findings, counts };
}

/** The list starts open when there is a problem or a difference (plan decision 4). */
export function startsOpen(result: CheckResult): boolean {
  return result.counts.problem > 0 || result.counts.differs > 0;
}

/**
 * True when the checks had a version, but the tool has no field facts for
 * it, so the field checks (F and D) did not run.
 */
export function fieldChecksSkipped(result: CheckResult): boolean {
  return result.version !== undefined && FIELD_CHECKS.every((id) => result.skipped.includes(id));
}

/**
 * True when the field checks ran, but without knowing which fields are
 * withdrawn, not used or kept only for backward compatibility.
 */
export function statusChecksSkipped(result: CheckResult): boolean {
  return result.version !== undefined && !fieldChecksSkipped(result) && STATUS_CHECKS.some((id) => result.skipped.includes(id));
}

function text<T extends Record<string, string>>(group: T, key: string): string | undefined {
  return Object.hasOwn(group, key) ? group[key as keyof T] : undefined;
}

/** "HL7 v2.5", or "HL7" when there is no version. */
function versionName(c: CheckTexts, version: string | undefined): string {
  return version === undefined ? c.versionNameNone : format(c.versionName, { version });
}

/** What to pick for the field checks: "a version", or "v2.9" when only v2.9 has them. */
function pickWhat(c: CheckTexts): string {
  return HAS_FIELD_HISTORY ? c.pickAny : format(c.pickOne, { version: LATEST_VERSION });
}

/** "Pick a version ... to check the fields too." */
function pickText(c: CheckTexts): string {
  return format(c.pickVersion, { pick: pickWhat(c) });
}

/** "Field checks are available only for HL7 v2.9. ..." */
function fieldsSkippedText(c: CheckTexts): string {
  return format(c.fieldsSkipped, { latest: LATEST_VERSION });
}

/** The key of a finding's sentence: the check id, and the reason when the check has more than one. */
function sentenceKey(f: CheckFinding): string {
  if (f.id === 'F2') return f.facts.localAllowed ? 'F2-local' : 'F2';
  if (f.id === 'F7') return f.facts.max === 1 ? 'F7-once' : 'F7';
  return f.facts.reason ? `${f.id}-${f.facts.reason}` : f.id;
}

function sentence(f: CheckFinding, c: CheckTexts, result: CheckResult): string {
  const facts = f.facts;
  const version = facts.version ?? result.version;
  const vars: Record<string, string | number> = {
    version: version ?? '',
    versionName: versionName(c, version),
    message: facts.messageVersion ?? '',
    since: facts.since ?? '',
    count: facts.count ?? 0,
    max: facts.max ?? 0,
    length: facts.length ?? 0,
    type: facts.dataType ?? DATA_TYPE_OF[f.id] ?? '',
    form: facts.expected ?? '',
    code: facts.code ?? '',
    terminator: facts.terminator ?? '',
    fields: (facts.fields ?? []).join(', '),
    last: facts.lastField ?? 0,
    defined: version !== undefined && compareVersions(version, '2.8') >= 0 ? 5 : 4,
  };
  const template = text(c.sentences, sentenceKey(f)) ?? text(c.sentences, f.id) ?? '';
  let out = format(template, vars);
  // V1 and V2: say which version the fields were checked against, or how to check them.
  if (f.id === 'V1' || f.id === 'V2') {
    let after: string;
    if (result.version === undefined) after = pickText(c);
    else if (fieldChecksSkipped(result)) after = fieldsSkippedText(c);
    else after = format(c.checkedPicked, { version: result.version });
    out += ' ' + after;
  }
  return out;
}

function source(f: CheckFinding, c: CheckTexts, version: string | undefined): string {
  if (TOOL_RULES.has(f.id)) return c.toolRule;
  const segment = f.position?.segment ?? '';
  let chapter = '2';
  let topic = text(c.topics, f.id) ?? '';
  if (f.id.startsWith('F')) {
    chapter = SEGMENT_CHAPTER[segment] ?? '2';
    topic = format(c.topics.fields, { segment });
  } else if (f.id.startsWith('D')) {
    const type = f.facts.dataType ?? DATA_TYPE_OF[f.id] ?? '';
    chapter = version !== undefined && compareVersions(version, '2.5') >= 0 ? '2A' : '2';
    topic = format(c.topics.dataType, { type });
  }
  return version === undefined ? format(c.sourceAll, { chapter, topic }) : format(c.sourceText, { version, chapter, topic });
}

function fieldNameOf(f: CheckFinding, lang: Lang): string {
  const p = f.position;
  if (!p?.segment || p.field === undefined || !f.facts.fieldName) return '';
  if (lang === 'ar') {
    const ar = getFieldDoc(p.segment, p.field)?.nameAr;
    if (ar) return ar;
  }
  return f.facts.fieldName;
}

/** Turn a check result into items, in the order of the result (by line). */
export function checkItems(result: CheckResult, message: ParsedMessage, t: Messages, lang: Lang): CheckItem[] {
  const c = t.checks;
  return result.findings.map((f, i) => {
    const p = f.position;
    const seg = p ? message.segments[p.segmentIndex] : undefined;
    let label = '';
    let sel: Selection | undefined;
    if (p && seg && p.field !== undefined && p.segment !== undefined) {
      label = safePath(seg, p.field, p.rep, p.comp, p.comp !== undefined ? p.sub : undefined).label;
      sel = { seg: p.segmentIndex, field: p.field, rep: p.rep ?? 1, comp: p.comp, sub: p.comp !== undefined ? p.sub : undefined };
    } else if (p?.segment !== undefined) {
      label = p.segment;
    }
    return {
      finding: f,
      key: `${i}:${f.id}`,
      level: f.level,
      lineText: f.line > 0 ? format(c.line, { line: f.line }) : c.wholeMessage,
      label,
      fieldName: fieldNameOf(f, lang),
      sentence: sentence(f, c, result),
      rule: text(c.rules, f.id) ?? '',
      source: source(f, c, result.version),
      sel,
      segmentIndex: p && !sel ? p.segmentIndex : undefined,
    };
  });
}

/** "1 problem, 2 differences, 3 notes" (levels with no findings are left out). */
export function countsText(result: CheckResult, t: Messages): string {
  const c = t.checks;
  const one: Record<CheckLevel, string> = { problem: c.problemOne, differs: c.differsOne, note: c.noteOne };
  const many: Record<CheckLevel, string> = { problem: c.problemMany, differs: c.differsMany, note: c.noteMany };
  return CHECK_LEVELS.filter((l) => result.counts[l] > 0)
    .map((l) => (result.counts[l] === 1 ? one[l] : format(many[l], { count: result.counts[l] })))
    .join(c.separator + ' ');
}

/** The summary line under the version bar. */
export function summaryText(result: CheckResult, t: Messages): string {
  const c = t.checks;
  const counts = countsText(result, t);
  if (result.version === undefined) {
    const pick = pickWhat(c);
    return counts === '' ? format(c.summaryNoneNoVersion, { pick }) : format(c.summaryNoVersion, { counts, pick });
  }
  if (fieldChecksSkipped(result)) {
    const latest = LATEST_VERSION;
    return counts === ''
      ? format(c.summaryNoneNoFields, { latest })
      : format(c.summaryNoFields, { version: result.version, counts, latest });
  }
  return counts === '' ? format(c.summaryNone, { version: result.version }) : format(c.summary, { version: result.version, counts });
}

/**
 * The line before "Not checked yet": how to run the field checks (no
 * version), or that they are not available for the version. Empty when
 * the field checks ran, or when a V1 or V2 item already says it.
 */
export function fieldsHint(result: CheckResult, items: CheckItem[], t: Messages): string {
  if (items.some((i) => i.finding.id === 'V1' || i.finding.id === 'V2')) return '';
  if (result.version === undefined) return pickText(t.checks);
  return fieldChecksSkipped(result) ? fieldsSkippedText(t.checks) : '';
}

/**
 * "Not checked for HL7 v2.9: withdrawn ... fields", when the field checks
 * ran without the optionality of the fields. Empty otherwise.
 */
export function statusHint(result: CheckResult, t: Messages): string {
  return statusChecksSkipped(result) ? format(t.checks.statusSkipped, { version: result.version ?? '' }) : '';
}

/** The mark text of one item: "Differs from HL7: sentence". */
export function markText(item: CheckItem, t: Messages): string {
  return `${t.checks.levels[item.level]}: ${item.sentence}`;
}

function addMark(map: Map<string, Mark>, key: string, item: CheckItem, t: Messages): void {
  const old = map.get(key);
  const line = markText(item, t);
  if (!old) map.set(key, { level: item.level, text: line });
  else map.set(key, { level: RANK[item.level] < RANK[old.level] ? item.level : old.level, text: `${old.text} ${line}` });
}

/**
 * Marks for the message view, by part key ("3:5", "3:5:1:2") or by row
 * ("row:3") when the place has no element of its own: a segment, or an
 * empty field. Items about the whole message get no mark.
 */
export function viewMarks(items: CheckItem[], message: ParsedMessage, t: Messages): Map<string, Mark> {
  const map = new Map<string, Mark>();
  for (const item of items) {
    const f = item.finding;
    const p = f.position;
    if (item.sel && p) {
      const seg = message.segments[p.segmentIndex];
      const filled = (seg?.fields.find((x) => x.position === p.field)?.value ?? '') !== '';
      addMark(map, filled ? partKey(item.sel) : `row:${p.segmentIndex}`, item, t);
    } else if (p) {
      addMark(map, `row:${p.segmentIndex}`, item, t);
    } else if (f.line > 0) {
      addMark(map, `row:${f.line - 1}`, item, t);
    }
  }
  return map;
}

/**
 * Marks for the field list, by field key ("3:5"). F1 and F3 are left out:
 * the list already shows "Added in v2.x" and "withdrawn" tags for them.
 */
export function fieldMarks(items: CheckItem[], t: Messages): Map<string, Mark> {
  const map = new Map<string, Mark>();
  for (const item of items) {
    if (!item.sel || item.finding.id === 'F1' || item.finding.id === 'F3') continue;
    addMark(map, `${item.sel.seg}:${item.sel.field}`, item, t);
  }
  return map;
}

/**
 * The list as plain text, for a ticket: the version, then one line per
 * finding (level, line, position, field name, sentence), then what was not
 * checked. When the field checks did not run for the version, a line says
 * so. It holds no values from the message.
 */
export function copyText(result: CheckResult, items: CheckItem[], t: Messages): string {
  const c = t.checks;
  const lines = [result.version === undefined ? c.copyTitleNoVersion : format(c.copyTitle, { version: result.version })];
  for (const item of items) {
    const parts = [c.levels[item.level], item.lineText];
    if (item.label) parts.push(item.fieldName ? `${item.label} ${item.fieldName}` : item.label);
    parts.push(item.sentence);
    lines.push(parts.join(' | '));
  }
  if (items.length === 0) lines.push(summaryText(result, t));
  else if (result.version !== undefined && fieldsHint(result, items, t) !== '') lines.push(fieldsHint(result, items, t));
  const status = statusHint(result, t);
  if (status !== '') lines.push(status);
  lines.push(c.notChecked);
  return lines.join('\n');
}
