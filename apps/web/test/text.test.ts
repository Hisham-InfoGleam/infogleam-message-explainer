// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

import { getFieldDoc, parseMessage } from '@infogleam/message-explainer-core';
import { describe, expect, it } from 'vitest';
import { format, messagesFor } from '../src/i18n';
import { fieldName, messageTypeText, pathPieces, pick, repeatText, splitTemplate, typeInfo } from '../src/lib/text';
import { parsedSamples } from './helpers';

const en = messagesFor('en');
const ar = messagesFor('ar');

describe('pick and fieldName', () => {
  it('pick the text of the language', () => {
    expect(pick({ en: 'one', ar: 'واحد' }, 'en')).toBe('one');
    expect(pick({ en: 'one', ar: 'واحد' }, 'ar')).toBe('واحد');
  });

  it('use the Arabic name, and the HL7 name when there is none', () => {
    const doc = getFieldDoc('PID', 5)!;
    expect(fieldName(doc, 'en')).toBe('Patient Name');
    expect(fieldName(doc, 'ar')).toBe(doc.nameAr);
    expect(fieldName({ ...doc, nameAr: undefined }, 'ar')).toBe('Patient Name');
    expect(fieldName({ ...doc, nameAr: '' }, 'ar')).toBe('Patient Name');
  });
});

describe('repeatText and typeInfo', () => {
  it('describe the repeat rule', () => {
    expect(repeatText('*', en)).toBe(en.repeats);
    expect(repeatText(1, en)).toBe('');
    expect(repeatText(2, en)).toBe(format(en.repeatsMax, { max: 2 }));
    expect(repeatText(2, ar)).toContain('2');
  });

  it('join the data type and the repeat rule', () => {
    expect(typeInfo(getFieldDoc('PID', 5)!, en)).toBe(`XPN · ${en.repeats}`);
    expect(typeInfo(getFieldDoc('PID', 8)!, en)).toBe('CWE');
    expect(typeInfo({ ...getFieldDoc('PID', 8)!, dataType: '' }, en)).toBe('');
    expect(typeInfo(getFieldDoc('OBR', 17)!, en)).toBe(`${getFieldDoc('OBR', 17)!.dataType} · ${format(en.repeatsMax, { max: 2 })}`);
  });
});

describe('splitTemplate', () => {
  it('splits around a placeholder', () => {
    expect(splitTemplate('Called {name} from v{version}', 'name')).toEqual(['Called ', ' from v{version}']);
    expect(splitTemplate('{name}', 'name')).toEqual(['', '']);
    expect(splitTemplate('no placeholder', 'name')).toEqual(['no placeholder', '']);
  });

  it('works for every template the panel splits, in both languages', () => {
    for (const t of [en, ar]) {
      for (const [template, slot] of [
        [t.calledFrom, 'name'],
        [t.calledThen, 'name'],
        [t.typeFrom, 'type'],
      ] as const) {
        const [before, after] = splitTemplate(template, slot);
        expect(before + `{${slot}}` + after).toBe(template);
      }
    }
  });
});

describe('messageTypeText', () => {
  it('explains the trigger event first, then the message code', () => {
    const msh = (type: string) => parseMessage(`MSH|^~\\&|A|B|C|D|20261108||${type}|1|P|2.5`).segments[0];
    const a01 = getFieldDoc('EVN', 1)!.values!.find((v) => v.code === 'A01')!;
    expect(messageTypeText(msh('ADT^A01'), 'en')).toBe(a01.en);
    expect(messageTypeText(msh('ADT^A01'), 'ar')).toBe(a01.ar);
    const oru = getFieldDoc('MSH', 9)!.values!.find((v) => v.code === 'ORU')!;
    expect(messageTypeText(msh('ORU^R01'), 'en')).toBe(oru.en);
    expect(messageTypeText(msh('ZZZ^Z99'), 'en')).toBe('');
    expect(messageTypeText(msh(''), 'en')).toBe('');
    expect(messageTypeText(undefined, 'en')).toBe('');
  });

  it('gives a text in both languages for the samples it knows', () => {
    for (const { id, message } of parsedSamples()) {
      const msh = message.segments.find((s) => s.name === 'MSH');
      const enText = messageTypeText(msh, 'en');
      const arText = messageTypeText(msh, 'ar');
      expect(enText === '', id).toBe(arText === '');
    }
  });
});

describe('pathPieces', () => {
  it('splits before each "[" and joins back to the same path', () => {
    const path = "msg['OBX'][1]['OBX.5'][2]['OBX.5.1']['OBX.5.1.2']";
    const pieces = pathPieces(path);
    expect(pieces.join('')).toBe(path);
    expect(pieces[0]).toBe('msg');
    expect(pieces.slice(1).every((p) => p.startsWith('['))).toBe(true);
    expect(pathPieces('')).toEqual(['']);
  });
});
