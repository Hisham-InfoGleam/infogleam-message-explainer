// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// The English and Arabic page text.

import {
  dataTypeKind,
  getDataTypeDoc,
  getFieldDoc,
  getFieldVersion,
  getSegmentDoc,
  DOCUMENTED_SEGMENTS,
  CHECK_LEVELS,
  HAS_FIELD_HISTORY,
  type Usage,
  type VersionSupport,
} from '@infogleam/message-explainer-core';
import { describe, expect, it } from 'vitest';
import ar from '../src/i18n/ar.json';
import en from '../src/i18n/en.json';
import { dirFor, format, messagesFor } from '../src/i18n';
import { SAMPLE_IDS } from '../src/lib/samples';

type Tree = { [key: string]: string | Tree };

/** Every text in a tree, by its dotted key. */
function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(path, value);
    else for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
}

const EN = flatten(en as Tree);
const AR = flatten(ar as Tree);
const ARABIC = /[؀-ۿ]/;

// Texts that may be empty on purpose. legalEnglishOnly is the note that
// the legal pages are in English; the English page needs no such note.
const MAY_BE_EMPTY = new Set(['en:legalEnglishOnly']);

// Texts that are not in Arabic on the Arabic page: the product name, and
// the language button, which names the other language (English).
const SAME_IN_BOTH = new Set(['appName', 'language']);

describe('en.json and ar.json', () => {
  it('have the same keys at every level', () => {
    expect([...AR.keys()].sort()).toEqual([...EN.keys()].sort());
    // Also the same objects (a key cannot be text in one and a group in the other).
    const groups = (tree: Tree, prefix = ''): string[] =>
      Object.entries(tree).flatMap(([k, v]) => (typeof v === 'string' ? [] : [`${prefix}${k}`, ...groups(v, `${prefix}${k}.`)]));
    expect(groups(ar as Tree).sort()).toEqual(groups(en as Tree).sort());
  });

  it('have the same {placeholders} in each pair', () => {
    const problems: string[] = [];
    for (const [key, text] of EN) {
      const a = placeholders(text).join();
      const b = placeholders(AR.get(key) ?? '').join();
      if (a !== b) problems.push(`${key}: en {${a}} ar {${b}}`);
    }
    expect(problems).toEqual([]);
  });

  it('have no empty texts', () => {
    const problems: string[] = [];
    for (const [lang, map] of [['en', EN], ['ar', AR]] as const) {
      for (const [key, text] of map) if (text.trim() === '' && !MAY_BE_EMPTY.has(`${lang}:${key}`)) problems.push(`${lang}:${key}`);
    }
    expect(problems).toEqual([]);
  });

  it('have no spaces around texts and no double spaces', () => {
    const problems: string[] = [];
    for (const [lang, map] of [['en', EN], ['ar', AR]] as const) {
      for (const [key, text] of map) if (text !== text.trim() || /\s{2}/.test(text)) problems.push(`${lang}:${key}`);
    }
    expect(problems).toEqual([]);
  });

  it('use Arabic letters in the Arabic text and none in the English text', () => {
    const problems: string[] = [];
    for (const [key, text] of EN) if (ARABIC.test(text) && key !== 'language') problems.push(`en:${key}`);
    for (const [key, text] of AR) {
      if (text !== '' && !SAME_IN_BOTH.has(key) && !ARABIC.test(text)) problems.push(`ar:${key} has no Arabic letters`);
    }
    expect(problems).toEqual([]);
  });

  it('have no Latin word with a dot in front in the Arabic text', () => {
    // In right-to-left text, the dot of ".hl7" shows on the wrong side.
    const problems = [...AR].filter(([, text]) => /(^|[\s(])\.[A-Za-z]/.test(text)).map(([key]) => key);
    expect(problems).toEqual([]);
  });

  it('name the other language on the language button', () => {
    expect(ARABIC.test(en.language)).toBe(true);
    expect(ARABIC.test(ar.language)).toBe(false);
  });
});

describe('labels for every code the page shows', () => {
  it('has a label for each optionality code', () => {
    for (const t of [en, ar]) expect(Object.keys(t.opt).sort()).toEqual(['B', 'C', 'O', 'R', 'W', 'X']);
  });

  it('has a label for each usage, version support, check level and sample', () => {
    const usages: Usage[] = ['common', 'sometimes', 'rare', 'legacy'];
    const supports: VersionSupport[] = ['supported', 'older', 'unknown'];
    // The parse warnings are shown as message checks now (S1, S2, S4, S5).
    for (const t of [en, ar]) {
      expect(Object.keys(t.usage).sort()).toEqual([...usages].sort());
      expect(Object.keys(t.support).sort()).toEqual([...supports].sort());
      expect(Object.keys(t.checks.levels).sort()).toEqual([...CHECK_LEVELS].sort());
      expect(Object.keys(t.samples).sort()).toEqual([...SAMPLE_IDS].sort());
    }
  });
});

describe('typeGloss (the short meaning of a data type)', () => {
  /**
   * Every data type the panel can show: the field types of the v2.9 field
   * list and of the field history (when it has fields), and their
   * component types.
   */
  function shownTypes(): Set<string> {
    const types = new Set<string>();
    const add = (code: string) => {
      types.add(code);
      for (const c of getDataTypeDoc(code)?.components ?? []) if (c.dataType) types.add(c.dataType);
    };
    for (const segment of DOCUMENTED_SEGMENTS) {
      const count = getSegmentDoc(segment)?.fieldCount ?? 0;
      for (let field = 1; field <= count; field++) {
        add(getFieldDoc(segment, field)!.dataType);
        for (const s of getFieldVersion(segment, field, '2.9')?.states ?? []) add(s.dataType);
      }
    }
    types.delete('varies');
    return types;
  }

  // Data types with a meaning that only the field history can show: the
  // general data type CM is not a data type of the v2.9 field list.
  const HISTORY_ONLY = ['CM'];

  // Data types that the page can show but that have no short meaning yet.
  // This list is here so that a new data type is noticed. Add a meaning in
  // en.json and ar.json, or add the type here on purpose.
  const WITHOUT_GLOSS = [
    'CNN', 'CP', 'CQ', 'DLD', 'DLN', 'DR', 'FC', 'FN', 'JCC', 'MOC', 'MSG', 'NDL', 'OG', 'OSD', 'PL', 'PRL', 'PT', 'RI',
    'SAD', 'SNM', 'SPS', 'TQ', 'VID',
  ];

  it('has the same data types in English and Arabic', () => {
    expect(Object.keys(ar.typeGloss).sort()).toEqual(Object.keys(en.typeGloss).sort());
  });

  it('has a meaning only for data types the page can show', () => {
    const shown = shownTypes();
    const unused = Object.keys(en.typeGloss).filter((t) => !shown.has(t));
    expect(unused).toEqual(HAS_FIELD_HISTORY ? [] : HISTORY_ONLY);
  });

  it('lists the data types that have no meaning yet', () => {
    const missing = [...shownTypes()].filter((t) => !Object.hasOwn(en.typeGloss, t)).sort();
    expect(missing).toEqual([...WITHOUT_GLOSS].sort());
    // Each listed type is a real data type.
    for (const t of WITHOUT_GLOSS) expect(dataTypeKind(t), t).toBeDefined();
  });

  it('has the texts of the note and the check hints in both languages', () => {
    for (const t of [en, ar]) {
      for (const text of [t.factsNote, t.namesNote, t.namesPick]) expect(text.trim()).not.toBe('');
      for (const key of ['fieldsSkipped', 'statusSkipped', 'summaryNoFields', 'summaryNoneNoFields', 'pickAny', 'pickOne'] as const) {
        expect(t.checks[key].trim(), key).not.toBe('');
      }
    }
    expect(placeholders(en.factsNote)).toEqual(['version']);
    expect(placeholders(ar.checks.fieldsSkipped)).toEqual(['latest']);
    expect(placeholders(ar.checks.summaryNoFields)).toEqual(['counts', 'latest', 'version']);
  });
});

describe('the first screen', () => {
  it('has the texts of the samples line, the question and the box in both languages', () => {
    for (const t of [en, ar]) {
      const texts = [
        t.intro, t.placeholder, t.dropHint, t.shortcutHint, t.samplePrompt, t.samplePlaceholder,
        t.sampleGroups.admission, t.sampleGroups.lab, t.sampleReplace, t.sampleReplaceYes, t.sampleReplaceNo,
      ];
      for (const text of texts) expect(text.trim()).not.toBe('');
    }
    expect(en.samplePrompt).toBe('No message at hand? Try a sample:');
    expect(en.samplePlaceholder).toBe('Choose a sample…');
    expect(en.sampleReplace).toBe('This replaces the message in the box.');
    expect(en.placeholder).toBe('Paste an HL7 v2 message here');
  });

  it('has no texts of the old sample buttons', () => {
    for (const t of [en, ar]) {
      expect(Object.hasOwn(t, 'trySample')).toBe(false);
      expect(Object.hasOwn(t, 'loadSample')).toBe(false);
    }
  });

  it('keeps the tagline under the name', () => {
    expect(en.tagline).toBe('A tool that explains HL7® v2 messages');
    expect(ar.tagline).toBe('أداة لشرح رسائل HL7® v2');
  });
});

describe('format, dirFor and messagesFor', () => {
  it('replace placeholders and leave unknown ones', () => {
    expect(format('{a} and {b}', { a: 1, b: 'two' })).toBe('1 and two');
    expect(format('{a} {missing}', { a: 'x' })).toBe('x {missing}');
    expect(format('{a}{a}', { a: '$&' })).toBe('$&$&');
    expect(format('no placeholder', {})).toBe('no placeholder');
  });

  it('give the direction and the texts of each language', () => {
    expect(dirFor('ar')).toBe('rtl');
    expect(dirFor('en')).toBe('ltr');
    expect(messagesFor('en')).toBe(en);
    expect(messagesFor('ar')).toBe(ar);
  });
});
