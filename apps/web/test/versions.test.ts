// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// "Explain as version": which version the page uses, for every choice and
// many message versions, and when the page shows the v2.9 field facts
// for another version (without the field history).

import {
  getFieldDoc,
  getFieldVersion,
  getSegmentDoc,
  DOCUMENTED_SEGMENTS,
  HAS_FIELD_HISTORY,
  hasFieldFacts,
  HISTORY_VERSIONS,
  versionSupport,
} from '@infogleam/message-explainer-core';
import { describe, expect, it } from 'vitest';
import { format, messagesFor } from '../src/i18n';
import {
  AUTO,
  codeNotes,
  codeRemoved,
  codeUntilTag,
  fieldStates,
  LATEST,
  laterValues,
  showsLatestFacts,
  stateIndex,
  versionView,
} from '../src/lib/versions';

const MESSAGE_VERSIONS = [
  undefined,
  '2.3',
  '2.3.1',
  '2.4',
  '2.5.1',
  '2.7',
  '2.9',
  ' 2.4 ',
  '2.2',
  '2.1',
  '2.0',
  '2.10',
  '3.0',
  'abc',
  'v2.5',
  '',
];
const CHOICES = [AUTO, ...HISTORY_VERSIONS, '2.2', '2.10', '', 'bogus', ' 2.5 '];

const allFields = DOCUMENTED_SEGMENTS.flatMap((segment) =>
  Array.from({ length: getSegmentDoc(segment)?.fieldCount ?? 0 }, (_, i) => ({ segment, field: i + 1 })),
);

describe('versionView', () => {
  it('Auto is "auto" and the latest version is 2.9', () => {
    expect(AUTO).toBe('auto');
    expect(LATEST).toBe('2.9');
    expect(HISTORY_VERSIONS.at(-1)).toBe(LATEST);
  });

  for (const message of MESSAGE_VERSIONS) {
    for (const choice of CHOICES) {
      it(`message ${JSON.stringify(message)}, choice ${JSON.stringify(choice)}`, () => {
        const view = versionView(message, choice);
        const support = versionSupport(message);
        const chosen = HISTORY_VERSIONS.includes(choice);
        const auto = support === 'supported' ? message!.trim() : LATEST;
        expect(view.message).toBe(message);
        expect(view.support).toBe(support);
        expect(view.chosen).toBe(chosen);
        expect(view.effective).toBe(chosen ? choice : auto);
        // The page can always explain as the effective version.
        expect(HISTORY_VERSIONS).toContain(view.effective);
        // The field facts are those of the effective version when the tool has them, otherwise v2.9.
        expect(view.factsVersion).toBe(hasFieldFacts(view.effective) ? view.effective : LATEST);
        expect(showsLatestFacts(view)).toBe(view.factsVersion !== view.effective);
        if (chosen) expect(view.warn).toBe(choice);
        else if (support === 'older') expect(view.warn).toBe(message);
        else expect(view.warn).toBe(view.effective);
      });
    }
  }
});

describe('the note about the v2.9 field facts', () => {
  it('shows only when the effective version has no field facts', () => {
    for (const v of HISTORY_VERSIONS) {
      for (const view of [versionView(v, AUTO), versionView('2.9', v), versionView(undefined, v)]) {
        expect(showsLatestFacts(view), `${view.message} ${v}`).toBe(!HAS_FIELD_HISTORY && view.effective !== '2.9');
      }
    }
    // Auto for an old, unknown or empty version uses v2.9: no note.
    for (const message of ['2.2', '2.10', undefined, '']) expect(showsLatestFacts(versionView(message, AUTO)), String(message)).toBe(false);
  });

  it.runIf(!HAS_FIELD_HISTORY)('shows for every version but v2.9 when there is no field history', () => {
    expect(showsLatestFacts(versionView('2.3', AUTO))).toBe(true);
    expect(showsLatestFacts(versionView('2.9', '2.5.1'))).toBe(true);
    expect(showsLatestFacts(versionView('2.3', '2.9'))).toBe(false);
    expect(versionView('2.3', AUTO).factsVersion).toBe('2.9');
  });

  it.runIf(HAS_FIELD_HISTORY)('never shows with the field history', () => {
    for (const v of HISTORY_VERSIONS) expect(showsLatestFacts(versionView(v, AUTO)), v).toBe(false);
  });

  it('names v2.9 in English and Arabic', () => {
    expect(format(messagesFor('en').factsNote, { version: LATEST })).toBe(
      'Field names, data types and repeat rules are shown as in HL7 v2.9. Older versions can differ. Many fields have a version note that says how.',
    );
    expect(format(messagesFor('ar').factsNote, { version: LATEST })).toBe(
      'تُعرض أسماء الحقول وأنواع البيانات وقواعد التكرار كما هي في HL7 v2.9. قد تختلف في الإصدارات الأقدم. لكثير من الحقول ملاحظة إصدار توضّح ذلك.',
    );
  });
});

describe('fieldStates and stateIndex', () => {
  it.runIf(HAS_FIELD_HISTORY)('give the history entry that applies, for every field and version', () => {
    const problems: string[] = [];
    for (const { segment, field } of allFields) {
      for (const v of HISTORY_VERSIONS) {
        const doc = getFieldDoc(segment, field, v)!;
        const states = fieldStates(doc);
        const fv = getFieldVersion(segment, field, v)!;
        if (states !== fv.states) problems.push(`${doc.id} v${v}: states differ`);
        const i = stateIndex(doc, states);
        if (!doc.exists) {
          if (i !== -1) problems.push(`${doc.id} v${v}: index ${i} for a field that does not exist`);
          continue;
        }
        const s = states[i];
        if (!s || s.name !== doc.name || s.dataType !== doc.dataType || s.opt !== doc.opt || s.max !== doc.max) {
          problems.push(`${doc.id} v${v}: index ${i} does not match the version`);
        }
        if (states[i + 1] && HISTORY_VERSIONS.indexOf(states[i + 1]!.from) <= HISTORY_VERSIONS.indexOf(v)) {
          problems.push(`${doc.id} v${v}: a later entry also applies`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('uses the latest entry for a doc without a version', () => {
    const doc = getFieldDoc('PID', 8)!;
    const states = fieldStates(doc);
    expect(stateIndex(doc, states)).toBe(states.length - 1);
  });

  it.runIf(!HAS_FIELD_HISTORY)('give no history without the field history file, so the page shows no history list', () => {
    for (const { segment, field } of allFields) {
      for (const v of HISTORY_VERSIONS) {
        const doc = getFieldDoc(segment, field, v)!;
        expect(fieldStates(doc), `${doc.id} v${v}`).toEqual([]);
        expect(laterValues(doc, 'name'), `${doc.id} v${v}`).toEqual([]);
        expect(laterValues(doc, 'dataType'), `${doc.id} v${v}`).toEqual([]);
      }
    }
  });
});

describe('laterValues', () => {
  it('has nothing later for v2.9', () => {
    for (const { segment, field } of allFields) {
      const doc = getFieldDoc(segment, field, '2.9')!;
      expect(laterValues(doc, 'name'), doc.id).toEqual([]);
      expect(laterValues(doc, 'dataType'), doc.id).toEqual([]);
    }
  });

  it('ends with the v2.9 name and data type, for every field and version', () => {
    const problems: string[] = [];
    for (const { segment, field } of allFields) {
      const latest = getFieldDoc(segment, field)!;
      for (const v of HISTORY_VERSIONS) {
        const doc = getFieldDoc(segment, field, v)!;
        const names = laterValues(doc, 'name');
        const types = laterValues(doc, 'dataType');
        if ((names.at(-1)?.value ?? doc.name) !== latest.name) problems.push(`${doc.id} v${v}: last name`);
        if ((types.at(-1)?.value ?? doc.dataType) !== latest.dataType) problems.push(`${doc.id} v${v}: last data type`);
        for (const later of [...names, ...types]) {
          if (HISTORY_VERSIONS.indexOf(later.from) <= HISTORY_VERSIONS.indexOf(v)) problems.push(`${doc.id} v${v}: ${later.from} is not later`);
        }
        const froms = names.map((n) => n.from);
        if (new Set(froms).size !== froms.length) problems.push(`${doc.id} v${v}: a version twice`);
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('codes with an end version (OBX-2 CE and TS, until v2.5.1)', () => {
  const en = messagesFor('en');
  const ar = messagesFor('ar');
  const values = getFieldDoc('OBX', 2)!.values!;
  const ce = values.find((v) => v.code === 'CE')!;
  const nm = values.find((v) => v.code === 'NM')!;
  const cwe = values.find((v) => v.code === 'CWE')!;

  it('shows "until" only for codes with an end', () => {
    expect(codeUntilTag(ce, en)).toBe('Until v2.5.1');
    expect(codeUntilTag(ce, ar)).toBe('حتى v2.5.1');
    expect(codeUntilTag(nm, en)).toBe('');
    expect(codeUntilTag(cwe, ar)).toBe('');
  });

  it('marks the code when the version in use is later than its end', () => {
    expect(codeRemoved(ce, versionView('2.5.1', AUTO))).toBe(false);
    expect(codeRemoved(ce, versionView('2.3', AUTO))).toBe(false);
    expect(codeRemoved(ce, versionView('2.6', AUTO))).toBe(true);
    expect(codeRemoved(ce, versionView('2.5.1', '2.9'))).toBe(true);
    expect(codeRemoved(ce, versionView('2.9', '2.4'))).toBe(false);
    // No version in MSH-12: the page uses v2.9.
    expect(codeRemoved(ce, versionView(undefined, AUTO))).toBe(true);
    expect(codeRemoved(nm, versionView('2.9', AUTO))).toBe(false);
  });

  it('says when the message holds such a code, in English and Arabic', () => {
    expect(codeNotes(values, ['CE'], versionView('2.6', AUTO), en)).toEqual([
      'Code CE was removed after v2.5.1, but the message says v2.6.',
    ]);
    expect(codeNotes(values, ['TS'], versionView('2.5.1', '2.7'), en)).toEqual([
      'Code TS was removed after v2.5.1. It does not exist in v2.7, the version you picked.',
    ]);
    expect(codeNotes(values, ['CE'], versionView('2.6', AUTO), ar)).toEqual([
      'حُذف الرمز CE بعد الإصدار v2.5.1، لكن الرسالة تذكر الإصدار v2.6.',
    ]);
    expect(codeNotes(values, ['TS'], versionView('2.5.1', '2.7'), ar)).toEqual([
      'حُذف الرمز TS بعد الإصدار v2.5.1. وهو غير موجود في الإصدار v2.7 الذي اخترته.',
    ]);
  });

  it('names the version the page uses when MSH-12 has no version it knows', () => {
    for (const message of [undefined, '', '2.10', 'abc']) {
      expect(codeNotes(values, ['CE'], versionView(message, AUTO), en), String(message)).toEqual([
        'Code CE was removed after v2.5.1. It does not exist in v2.9, the version the page uses.',
      ]);
      expect(codeNotes(values, ['CE'], versionView(message, AUTO), ar), String(message)).toEqual([
        'حُذف الرمز CE بعد الإصدار v2.5.1. وهو غير موجود في الإصدار v2.9 الذي تستخدمه الصفحة.',
      ]);
    }
    // A message version with spaces around it still counts as the message version.
    expect(codeNotes(values, ['CE'], versionView(' 2.6 ', AUTO), en)).toEqual([
      'Code CE was removed after v2.5.1, but the message says v2.6.',
    ]);
    // An old version (v2.2) still has CE and TS.
    expect(codeNotes(values, ['CE', 'TS'], versionView('2.2', AUTO), en)).toEqual([]);
  });

  it('says nothing when the code exists in the version in use, or is not in the message', () => {
    for (const v of ['2.3', '2.4', '2.5', '2.5.1']) {
      expect(codeNotes(values, ['CE', 'TS'], versionView(v, AUTO), en), v).toEqual([]);
    }
    expect(codeNotes(values, ['NM'], versionView('2.9', AUTO), en)).toEqual([]);
    expect(codeNotes(values, [], versionView('2.9', AUTO), en)).toEqual([]);
  });

  it('keeps the note for codes added later, in the order of the code table', () => {
    // A v2.5.1 message chosen as v2.3 cannot hold CWE (added in v2.6). And
    // a v2.6 message cannot hold CE, but can hold CWE.
    expect(codeNotes(values, ['CWE'], versionView('2.5.1', AUTO), en)).toEqual([
      format(en.codeAddedLater, { code: 'CWE', since: '2.6', version: '2.5.1' }),
    ]);
    expect(codeNotes(values, ['CWE', 'CE'], versionView('2.6', AUTO), en)).toEqual([
      format(en.codeRemoved, { code: 'CE', until: '2.5.1', version: '2.6' }),
    ]);
    expect(codeNotes(values, ['TS', 'CWE'], versionView('2.9', '2.5'), ar)).toEqual([
      format(ar.codeAddedLaterChosen, { code: 'CWE', since: '2.6', version: '2.5' }),
    ]);
  });
});
