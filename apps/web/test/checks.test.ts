// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// The message check texts (lib/checks.ts): sentences in English and
// Arabic, the folding rule, the version rule, the marks, the copied list,
// and what the page says when the field checks did not run.
//
// Tests that name a field use v2.9, the version of the field list, so they
// hold with and without the field history (see hasFieldFacts in core).

import {
  CHECK_IDS,
  checkMessage,
  FIELD_CHECKS,
  HAS_FIELD_HISTORY,
  hasFieldFacts,
  HISTORY_VERSIONS,
  messageVersion,
  parseMessage,
  STATUS_CHECKS,
  type CheckFinding,
  type CheckResult,
  type ParsedMessage,
} from '@infogleam/message-explainer-core';
import { describe, expect, it } from 'vitest';
import { format, messagesFor, type Lang } from '../src/i18n';
import {
  checkItems,
  checkVersion,
  copyText,
  countsText,
  fieldChecksSkipped,
  fieldMarks,
  fieldsHint,
  startsOpen,
  statusChecksSkipped,
  statusHint,
  summaryText,
  viewMarks,
  withoutTextBoxEnds,
} from '../src/lib/checks';
import { AUTO, versionView } from '../src/lib/versions';
import { parsedSamples, randomMessage } from './helpers';

const LANGS: Lang[] = ['en', 'ar'];

/** Made-up messages that trigger every check. Each field value has the marker "QX" so a test can look for it. */
const MSH = (version: string, enc = '^~\\&') => `MSH|${enc}|QXAPP|QXFAC|||20261108093000||ADT^A01|QX0001|P|${version}`;
/** A segment line with the given fields filled, for example seg('EVN', { 1: 'A01', 7: 'QX' }). */
function seg(name: string, fields: Record<number, string>): string {
  const last = Math.max(...Object.keys(fields).map(Number));
  const values = Array.from({ length: last }, (_, i) => fields[i + 1] ?? '');
  return [name, ...values].join('|');
}

/** v2.9 with 5 encoding characters: no S2 note. */
const MSH29 = MSH('2.9', '^~\\&#');

const MESSAGES: { text: string; version?: string }[] = [
  { text: 'PID|1||QX1\rMSH|^~\\&|QXAPP||||||ADT^A01|QX2|P|2.5' },
  { text: '' },
  { text: 'FHS|^~\\&|QXAPP' },
  { text: `${MSH('2.5', '^')}`, version: '2.5' },
  { text: `${MSH('2.7', '^~')}`, version: '2.7' },
  { text: `${MSH('2.8')}`, version: '2.8' },
  { text: `${MSH('2.5', '^~\\&#')}`, version: '2.5' },
  { text: `${MSH('2.9', '^~\\&#!')}`, version: '2.9' },
  { text: [MSH('2.5'), 'QXLONGNAME|1', 'pid|QX', 'ZZ1|1', 'NTE|1|QX'].join('\n'), version: '2.5' },
  { text: [MSH('2.5'), 'PID|1||QX1||QX^QX'].join('\r') + '\n' + 'PV1|1|QX', version: '2.5' },
  { text: [MSH('2.5'), 'PID|1||QX1||QX\\F^QX\\Q\\^QX\\X0\\~QX\\.br\\'].join('\r\n'), version: '2.5' },
  { text: [MSH('2.7'), 'PID|1||QX1||QX\\P\\QX'].join('\r'), version: '2.7' },
  { text: [MSH('2.5'), 'OBX|1|TX|QX||QX\\.br\\QX'].join('\r'), version: '2.5' },
  { text: [MSH('2.5'), MSH('2.5')].join('\r'), version: '2.5' },
  { text: `MSH|^~\\&|QXAPP|||||ADT^A01|QX|P|` },
  { text: `MSH|^~\\&|QXAPP|||||ADT^A01|QX|P|QXVERSION` },
  { text: `MSH|^~\\&|QXAPP|||||ADT^A01|QX|P|QXVERSION`, version: '2.6' },
  { text: `${MSH('2.2')}` },
  { text: `${MSH('2.2')}`, version: '2.4' },
  { text: [MSH('2.3^QX'), 'PID|1||QX1||QX^QX|||F~M||||||||||||||||||||||||QX', seg('EVN', { 1: 'A01', 2: '20261108', 7: 'QX' })].join('\r'), version: '2.3' },
  { text: [MSH('2.3', '^~\\&#')].join('\r'), version: '2.3' },
  { text: [MSH('2.7'), 'PID|1||QX1||QX^QX|||||||QX', 'AL1|1||QX|||20261340|QX'].join('\r'), version: '2.7' },
  { text: [MSH('2.4'), 'AL1|1||QX|||20261108|QX'].join('\r'), version: '2.4' },
  { text: [MSH('2.5'), 'PID|1|||||||||||QX', 'PID|1'].join('\r'), version: '2.5' },
  { text: [MSH('2.8'), 'PID|1||QX1||QX^QX||||||||||||||||||||.5', seg('PV1', { 1: '1', 2: 'I', 45: '2026110825' })].join('\r'), version: '2.8' },
  { text: [MSH('2.5'), 'PID|10000||QX1||QX^QX', 'AL1|-1||QX'].join('\r'), version: '2.5' },
  { text: [MSH('2.3'), 'MSH|^~\\&|QX|||20261308||ADT^A01|QX|P|2.3'].join('\r'), version: '2.3' },
  // v2.9: the field checks run with and without the field history.
  { text: [MSH29, seg('PID', { 1: '10000', 5: 'QX^QX\\.br\\', 8: 'F~M', 25: '.5' }), 'AL1|-1||QX|||20261340|QX'].join('\r'), version: '2.9' },
  { text: [MSH29, seg('PV1', { 1: '1', 2: 'I', 45: '2026110825' }), 'OBX|1|TX|QX||QX\\.br\\QX'].join('\r'), version: '2.9' },
];

function run(text: string, version?: string): { m: ParsedMessage; r: CheckResult } {
  const m = parseMessage(text);
  return { m, r: checkMessage(m, version) };
}

/** Every finding kind (check id and reason) that the messages above trigger. */
function kinds(): Set<string> {
  const out = new Set<string>();
  for (const { text, version } of MESSAGES) for (const f of run(text, version).r.findings) out.add(`${f.id}:${f.facts.reason ?? ''}`);
  return out;
}

/** A check result made by hand, for the text rules. */
function result(version: string | undefined, skipped: CheckResult['skipped'], findings: CheckFinding[] = []): CheckResult {
  const counts = { problem: 0, differs: 0, note: 0 };
  for (const f of findings) counts[f.level]++;
  return { version, findings, skipped, counts };
}

describe('the test messages', () => {
  it('trigger every check that the field data allows', () => {
    const ids = new Set([...kinds()].map((k) => k.split(':')[0]));
    // F4 cannot fire: the field data has no "not used" (X) field. D3 cannot
    // fire: none of the explained fields is TM. Without the field history,
    // the field checks run for v2.9 only, where every field of the field
    // list exists (no F1), and withdrawn and backward compatible fields are
    // not known (no F3 and F5).
    expect(CHECK_IDS.filter((id) => !ids.has(id))).toEqual(HAS_FIELD_HISTORY ? ['F4', 'D3'] : ['F1', 'F3', 'F4', 'F5', 'D3']);
  });
});

describe('sentences', () => {
  for (const lang of LANGS) {
    it(`fill every placeholder and say no message value (${lang})`, () => {
      const t = messagesFor(lang);
      const problems: string[] = [];
      for (const { text, version } of MESSAGES) {
        const { m, r } = run(text, version);
        for (const item of checkItems(r, m, t, lang)) {
          const all = [item.sentence, item.rule, item.source, item.lineText, item.label, item.fieldName].join(' ');
          if (item.sentence === '') problems.push(`${item.finding.id}: no sentence`);
          if (item.rule === '') problems.push(`${item.finding.id}: no rule`);
          if (item.source === '') problems.push(`${item.finding.id}: no source`);
          if (/\{\w+\}/.test(all)) problems.push(`${item.finding.id}: placeholder left in "${all}"`);
          if (all.includes('QX')) problems.push(`${item.finding.id}: holds a message value`);
          if (/undefined|NaN/.test(all)) problems.push(`${item.finding.id}: "${all}"`);
        }
        for (const text of [summaryText(r, t), fieldsHint(r, checkItems(r, m, t, lang), t), statusHint(r, t)]) {
          if (/\{\w+\}|undefined|NaN/.test(text)) problems.push(`hint or summary: "${text}"`);
        }
      }
      expect(problems).toEqual([]);
    });
  }

  it('give each finding kind its own sentence', () => {
    const t = messagesFor('en');
    const seen = new Map<string, string>();
    for (const { text, version } of MESSAGES) {
      const { m, r } = run(text, version);
      for (const item of checkItems(r, m, t, 'en')) {
        const kind = `${item.finding.id}:${item.finding.facts.reason ?? ''}:${item.finding.facts.localAllowed ?? ''}`;
        const start = item.sentence.slice(0, 30);
        if (!seen.has(kind)) seen.set(kind, start);
      }
    }
    // Different kinds of the same check do not share a sentence.
    const byId = new Map<string, Set<string>>();
    for (const [kind, start] of seen) {
      const id = kind.split(':')[0]!;
      if (!byId.has(id)) byId.set(id, new Set());
      byId.get(id)!.add(start);
    }
    expect(byId.get('S6')?.size).toBe(5);
    expect(byId.get('S2')?.size).toBe(5);
  });

  it('say the facts: version, field name, counts', () => {
    const t = messagesFor('en');
    const { m, r } = run([MSH29, 'PID|1||||QX^QX|||F~M'].join('\r'), '2.9');
    const items = checkItems(r, m, t, 'en');
    const f6 = items.find((i) => i.finding.id === 'F6')!;
    expect(f6.sentence).toBe('Required in HL7 v2.9, but it is empty.');
    expect([f6.lineText, f6.label, f6.fieldName]).toEqual(['Line 2', 'PID-3', 'Patient Identifier List']);
    expect(f6.source).toBe('HL7 v2.9, chapter 3, PID attribute table');
    const f7 = items.find((i) => i.finding.id === 'F7')!;
    expect(f7.sentence).toContain('Repeats 2 times. In HL7 v2.9 this field does not repeat.');
    expect([f7.label, f7.fieldName]).toEqual(['PID-8', 'Administrative Sex']);
  });

  it('say which fields are of a later version (V3), with and without the field history', () => {
    const t = messagesFor('en');
    const { m, r } = run([MSH('2.3'), seg('EVN', { 1: 'A01', 2: '20261108', 7: 'QX' })].join('\r'), '2.3');
    const v3 = checkItems(r, m, t, 'en').find((i) => i.finding.id === 'V3')!;
    expect(v3.sentence).toBe('The message says v2.3, but it fills fields of a later version (EVN-7). It may follow v2.4.');
    expect(v3.source).toBe(t.checks.toolRule);
  });

  it('name the source chapter of the data types per version', () => {
    const t = messagesFor('en');
    const m = parseMessage(MSH('2.5'));
    const d1: CheckFinding = { id: 'D1', level: 'differs', line: 0, facts: { dataType: 'DT', reason: 'calendar' } };
    const source = (version: string) => checkItems(result(version, [], [d1]), m, t, 'en')[0]!.source;
    expect(source('2.4')).toBe('HL7 v2.4, chapter 2, data type DT');
    expect(source('2.5')).toBe('HL7 v2.5, chapter 2A, data type DT');
    const s1 = run('PID|1');
    expect(checkItems(s1.r, s1.m, t, 'en')[0]!.source).toBe('HL7 v2.3 to v2.9, chapter 2, message header and batch rules');
  });

  it('use the Arabic field name on the Arabic page', () => {
    const { m, r } = run([MSH29, 'PID|1||||QX^QX|||F~M'].join('\r'), '2.9');
    const ar = checkItems(r, m, messagesFor('ar'), 'ar');
    const f6 = ar.find((i) => i.finding.id === 'F6')!;
    expect(/[؀-ۿ]/.test(f6.fieldName)).toBe(true);
    expect(f6.label).toBe('PID-3');
    expect(f6.sentence).toBe('مطلوب في معيار HL7 v2.9، لكنه فارغ.');
  });

  it('tell how to run the field checks when there is no version', () => {
    const t = messagesFor('en');
    const { m, r } = run(MSH('2.2'));
    const pick = HAS_FIELD_HISTORY ? 'a version' : 'v2.9';
    expect(checkItems(r, m, t, 'en')[0]!.sentence).toContain(`Pick ${pick} in "Explain as version" to check the fields too.`);
    const picked = run(MSH('2.2'), '2.4');
    const after = hasFieldFacts('2.4') ? 'The fields were checked against HL7 v2.4, the version you picked.' : 'Field checks are available only for HL7 v2.9.';
    expect(checkItems(picked.r, picked.m, t, 'en')[0]!.sentence).toContain(after);
  });
});

describe('the version for the checks (decision 5)', () => {
  it('is the picked version, or MSH-12 when the tool explains it', () => {
    expect(checkVersion(versionView('2.3', AUTO))).toBe('2.3');
    expect(checkVersion(versionView('2.3', '2.9'))).toBe('2.9');
    expect(checkVersion(versionView('2.2', '2.4'))).toBe('2.4');
    for (const v of HISTORY_VERSIONS) expect(checkVersion(versionView(v, AUTO))).toBe(v);
  });

  it('is none for older, unknown or empty versions with Auto', () => {
    for (const v of ['2.2', '2.1', '2.0', '2.10', 'abc', undefined]) expect(checkVersion(versionView(v, AUTO)), String(v)).toBeUndefined();
  });
});

describe('the folding rule (decision 4)', () => {
  const folding = (problem: number, differs: number, note: number): CheckResult => ({
    version: '2.5',
    findings: [],
    skipped: [],
    counts: { problem, differs, note },
  });

  it('opens the list for a problem or a difference only', () => {
    expect(startsOpen(folding(1, 0, 0))).toBe(true);
    expect(startsOpen(folding(0, 1, 3))).toBe(true);
    expect(startsOpen(folding(0, 0, 3))).toBe(false);
    expect(startsOpen(folding(0, 0, 0))).toBe(false);
  });

  it('opens the list for the samples only when they have a difference', () => {
    // The v2.3 sample fills a field of a later version on purpose. That is a
    // difference (F1) when the tool has the field facts of v2.3. The v2.9
    // sample has two mistakes on purpose, so its list always opens.
    for (const { id, message } of parsedSamples()) {
      const r = checkMessage(message, checkVersion(versionView(messageVersion(message), AUTO)));
      expect(startsOpen(r), id).toBe((id === 'v23-adt-a01' && hasFieldFacts('2.3')) || id === 'v29-adt-a04');
    }
  });

  it('shows the two mistakes of the v2.9 sample, in English and Arabic', () => {
    const { message } = parsedSamples().find((s) => s.id === 'v29-adt-a04')!;
    const r = checkMessage(message, checkVersion(versionView(messageVersion(message), AUTO)));
    const en = checkItems(r, message, messagesFor('en'), 'en');
    expect(en.map((i) => [i.finding.id, i.level, i.lineText, i.label, i.fieldName, i.sentence])).toEqual([
      ['D2', 'differs', 'Line 3', 'PID-7', 'Date/Time of Birth', 'The value is not a real date and time (data type DTM).'],
      ['F6', 'differs', 'Line 4', 'PV1-2', 'Patient Class', 'Required in HL7 v2.9, but it is empty.'],
    ]);
    expect(summaryText(r, messagesFor('en'))).toBe('Checked against HL7 v2.9: 2 differences');
    const ar = checkItems(r, message, messagesFor('ar'), 'ar');
    expect(ar.map((i) => i.sentence)).toEqual(['القيمة ليست تاريخًا ووقتًا حقيقيين (نوع البيانات DTM).', 'مطلوب في معيار HL7 v2.9، لكنه فارغ.']);
    expect(summaryText(r, messagesFor('ar'))).toBe('نتيجة الفحص حسب HL7 v2.9: المخالفات: 2');
  });
});

describe('summary', () => {
  it('counts each level, in both languages', () => {
    const r: CheckResult = { version: '2.3', findings: [], skipped: [], counts: { problem: 1, differs: 2, note: 3 } };
    expect(summaryText(r, messagesFor('en'))).toBe('Checked against HL7 v2.3: 1 problem, 2 differences, 3 notes');
    expect(countsText(r, messagesFor('ar'))).toBe('مشكلة واحدة، المخالفات: 2، الملاحظات: 3');
    const none: CheckResult = { ...r, counts: { problem: 0, differs: 0, note: 0 } };
    expect(summaryText(none, messagesFor('en'))).toBe('No differences from HL7 v2.3 found.');
    const pick = HAS_FIELD_HISTORY ? 'a version' : 'v2.9';
    expect(summaryText({ ...none, version: undefined }, messagesFor('en'))).toBe(
      `No problems found. The field checks wait until you pick ${pick} in "Explain as version".`,
    );
  });
});

describe('field checks that did not run', () => {
  const en = messagesFor('en');
  const ar = messagesFor('ar');
  const s2: CheckFinding = { id: 'S2', level: 'differs', line: 1, position: { segment: 'MSH', segmentIndex: 0, field: 2 }, facts: { version: '2.3', reason: 'long', length: 5 } };

  it('tell the three cases apart: all ran, the status checks were skipped, all were skipped', () => {
    expect([fieldChecksSkipped(result('2.9', [])), statusChecksSkipped(result('2.9', []))]).toEqual([false, false]);
    expect([fieldChecksSkipped(result('2.9', [...STATUS_CHECKS])), statusChecksSkipped(result('2.9', [...STATUS_CHECKS]))]).toEqual([false, true]);
    expect([fieldChecksSkipped(result('2.3', [...FIELD_CHECKS])), statusChecksSkipped(result('2.3', [...FIELD_CHECKS]))]).toEqual([true, false]);
    // Without a version, the page asks for one instead.
    expect([fieldChecksSkipped(result(undefined, ['V3', ...FIELD_CHECKS])), statusChecksSkipped(result(undefined, ['V3', ...FIELD_CHECKS]))]).toEqual([false, false]);
  });

  it('say so in the summary line, in English and Arabic', () => {
    const none = result('2.3', [...FIELD_CHECKS]);
    expect(summaryText(none, en)).toBe('No problems found. Field checks are available only for HL7 v2.9.');
    expect(summaryText(none, ar)).toBe('لم يُعثر على مشكلات. فحص الحقول متاح فقط حسب HL7 v2.9.');
    const some = result('2.3', [...FIELD_CHECKS], [s2]);
    expect(summaryText(some, en)).toBe('Checked against HL7 v2.3: 1 difference. Field checks are available only for HL7 v2.9.');
    expect(summaryText(some, ar)).toBe('نتيجة الفحص حسب HL7 v2.3: مخالفة واحدة. فحص الحقول متاح فقط حسب HL7 v2.9.');
  });

  it('say so in one sentence in the list, in English and Arabic', () => {
    const m = parseMessage(MSH('2.3', '^~\\&#'));
    const r = result('2.3', [...FIELD_CHECKS], [s2]);
    expect(fieldsHint(r, checkItems(r, m, en, 'en'), en)).toBe('Field checks are available only for HL7 v2.9. The other checks still ran.');
    expect(fieldsHint(r, checkItems(r, m, ar, 'ar'), ar)).toBe('فحص الحقول متاح فقط حسب HL7 v2.9. وقد أُجريت الفحوص الأخرى.');
    // When the field checks ran, there is no such sentence.
    expect(fieldsHint(result('2.3', [], [s2]), [], en)).toBe('');
    expect(fieldsHint(result('2.9', [...STATUS_CHECKS]), [], en)).toBe('');
  });

  it('name the fields whose status was not checked', () => {
    const r = result('2.9', [...STATUS_CHECKS]);
    expect(statusHint(r, en)).toBe('Not checked for HL7 v2.9: fields that are withdrawn, not used or kept only for backward compatibility.');
    expect(statusHint(r, ar)).toBe('لم يُفحص حسب HL7 v2.9: الحقول المسحوبة، أو غير المستخدمة، أو المُبقاة فقط للتوافق مع الإصدارات السابقة.');
    expect(statusHint(result('2.9', []), en)).toBe('');
    expect(statusHint(result('2.3', [...FIELD_CHECKS]), en)).toBe('');
  });

  it('end V1 and V2 with the same sentence, and do not repeat it in the list', () => {
    const { m } = run(MSH('2.2'), '2.4');
    const r = result('2.4', [...FIELD_CHECKS], [{ id: 'V2', level: 'note', line: 1, position: { segment: 'MSH', segmentIndex: 0, field: 12 }, facts: { version: '2.4', messageVersion: '2.2' } }]);
    const items = checkItems(r, m, en, 'en');
    expect(items[0]!.sentence).toBe(
      'The message says v2.2. This is a real HL7 version, but older than 2.3. The tool explains versions 2.3 to 2.9. Field checks are available only for HL7 v2.9. The other checks still ran.',
    );
    expect(fieldsHint(r, items, en)).toBe('');
  });

  it('put the sentence in the copied list', () => {
    const m = parseMessage(MSH('2.3', '^~\\&#'));
    const some = result('2.3', [...FIELD_CHECKS], [s2]);
    const items = checkItems(some, m, en, 'en');
    const lines = copyText(some, items, en).split('\n');
    expect(lines).toEqual([
      'Message checks against HL7 v2.3',
      `Differs from HL7 | Line 1 | MSH-2 | ${items[0]!.sentence}`,
      'Field checks are available only for HL7 v2.9. The other checks still ran.',
      en.checks.notChecked,
    ]);
    const none = result('2.3', [...FIELD_CHECKS]);
    expect(copyText(none, [], en).split('\n')).toEqual([
      'Message checks against HL7 v2.3',
      'No problems found. Field checks are available only for HL7 v2.9.',
      en.checks.notChecked,
    ]);
    const status = result('2.9', [...STATUS_CHECKS]);
    expect(copyText(status, [], en).split('\n')).toEqual([
      'Message checks against HL7 v2.9',
      'No differences from HL7 v2.9 found.',
      statusHint(status, en),
      en.checks.notChecked,
    ]);
  });

  it('match what checkMessage skips for each version', () => {
    const m = parseMessage(MSH('2.5'));
    for (const v of HISTORY_VERSIONS) {
      const r = checkMessage(m, v);
      expect(fieldChecksSkipped(r), v).toBe(!hasFieldFacts(v));
      expect(statusChecksSkipped(r), v).toBe(hasFieldFacts(v) && !HAS_FIELD_HISTORY);
    }
  });
});

describe('marks', () => {
  it('point to filled fields or parts, or to a row', () => {
    const t = messagesFor('en');
    for (const { text, version } of MESSAGES) {
      const { m, r } = run(text, version);
      const items = checkItems(r, m, t, 'en');
      for (const [key, mark] of viewMarks(items, m, t)) {
        expect(mark.text).not.toContain('QX');
        if (key.startsWith('row:')) {
          expect(m.segments[Number(key.slice(4))], key).toBeDefined();
          continue;
        }
        const [segment, field] = key.split(':').map(Number);
        expect(m.segments[segment!]?.fields.find((f) => f.position === field)?.value, key).not.toBe('');
      }
    }
  });

  it('use the most serious level at one place', () => {
    const t = messagesFor('en');
    // PID-25 (a number, NM, in v2.9) holds an unknown escape: D4 and S6 both differ.
    const { m, r } = run([MSH29, 'PID|1||QX1||QX^QX||||||||||||||||||||\\Q\\'].join('\r'), '2.9');
    const view = viewMarks(checkItems(r, m, t, 'en'), m, t);
    expect(view.get('1:25')?.level).toBe('differs');
    expect(view.get('1:25')?.text.split('Differs from HL7:').length).toBe(3);
  });

  it('leave F1 and F3 to the existing tags in the field list', () => {
    const t = messagesFor('en');
    // Made-up findings, only to test the rule for the marks.
    const m = parseMessage([MSH('2.5'), seg('ZZ1', { 1: 'QX', 2: 'QX', 3: 'QX' })].join('\r'));
    const at = (id: CheckFinding['id'], field: number): CheckFinding => ({
      id,
      level: 'differs',
      line: 2,
      position: { segment: 'ZZ1', segmentIndex: 1, field },
      facts: { version: '2.5' },
    });
    const r = result('2.5', [], [at('F7', 1), at('F3', 2), at('F1', 3)]);
    const list = fieldMarks(checkItems(r, m, t, 'en'), t);
    expect([...list.keys()]).toEqual(['1:1']);
  });
});

describe('the copied list', () => {
  function noValues(r: CheckResult, m: ParsedMessage, values: string[], lang: Lang): string[] {
    const t = messagesFor(lang);
    const out = copyText(r, checkItems(r, m, t, lang), t);
    return values.filter((v) => out.includes(v));
  }

  it('starts with the version and lists level, line, position, field name and sentence', () => {
    const t = messagesFor('en');
    const { m, r } = run([MSH29, 'PID|1||||QX^QX'].join('\r'), '2.9');
    const lines = copyText(r, checkItems(r, m, t, 'en'), t).split('\n');
    expect(lines[0]).toBe('Message checks against HL7 v2.9');
    expect(lines[1]).toBe('Differs from HL7 | Line 2 | PID-3 Patient Identifier List | Required in HL7 v2.9, but it is empty.');
    expect(lines.at(-1)).toBe(t.checks.notChecked);
    expect(lines.includes(statusHint(r, t))).toBe(!HAS_FIELD_HISTORY);
  });

  it('holds no message values, for the test messages and 500 random ones', () => {
    for (const lang of LANGS) {
      for (const { text, version } of MESSAGES) {
        const { m, r } = run(text, version);
        expect(noValues(r, m, ['QX'], lang)).toEqual([]);
      }
      for (let seed = 1; seed <= 500; seed++) {
        const rm = randomMessage(seed);
        const m = parseMessage(rm.text);
        for (const version of [undefined, '2.3', '2.9']) {
          expect(noValues(checkMessage(m, version), m, rm.secrets, lang), `seed ${seed}`).toEqual([]);
        }
      }
    }
  });

  it('says when nothing was found', () => {
    const t = messagesFor('en');
    const m = parseMessage(MSH29);
    const r = checkMessage(m, '2.9');
    const status = HAS_FIELD_HISTORY ? [] : [format(t.checks.statusSkipped, { version: '2.9' })];
    expect(copyText(r, [], t).split('\n')).toEqual(['Message checks against HL7 v2.9', 'No differences from HL7 v2.9 found.', ...status, t.checks.notChecked]);
  });
});

describe('segment ends of typed or pasted text', () => {
  it('leaves out S4 and S5 and counts again', () => {
    const text = ['MSH|^~\&|A|B|C|D|20260101||ADT^A01|1|P|2.5.1', 'EVN|A01|20260101', 'PID|1||X1^^^H^MR||DOE^JANE'].join('\n');
    const full = checkMessage(parseMessage(text), '2.5.1');
    expect(full.findings.some((f) => f.id === 'S4')).toBe(true);
    const typed = withoutTextBoxEnds(full);
    expect(typed.findings.some((f) => f.id === 'S4' || f.id === 'S5')).toBe(false);
    expect(typed.counts.note).toBe(full.counts.note - 1);
    // Nothing to leave out: the same result comes back.
    expect(withoutTextBoxEnds(typed)).toBe(typed);
  });
});
