// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// Made-up sample messages, bundled into the page at build time.
import adtA01 from '../../../../samples/adt-a01.hl7?raw';
import oruR01 from '../../../../samples/oru-r01.hl7?raw';
import v22AdtA01 from '../../../../samples/v22-adt-a01.hl7?raw';
import v23AdtA01 from '../../../../samples/v23-adt-a01.hl7?raw';
import v24OrmO01 from '../../../../samples/v24-orm-o01.hl7?raw';
import v251OruR01 from '../../../../samples/v251-oru-r01.hl7?raw';
import v27OruR01 from '../../../../samples/v27-oru-r01.hl7?raw';
import v28AdtA08 from '../../../../samples/v28-adt-a08.hl7?raw';
import v29AdtA04 from '../../../../samples/v29-adt-a04.hl7?raw';

// By HL7 version, oldest first.
export const SAMPLES = {
  'v22-adt-a01': v22AdtA01,
  'v23-adt-a01': v23AdtA01,
  'v24-orm-o01': v24OrmO01,
  'adt-a01': adtA01,
  'oru-r01': oruR01,
  'v251-oru-r01': v251OruR01,
  'v27-oru-r01': v27OruR01,
  'v28-adt-a08': v28AdtA08,
  'v29-adt-a04': v29AdtA04,
} as const;

export type SampleId = keyof typeof SAMPLES;

export const SAMPLE_IDS = Object.keys(SAMPLES) as SampleId[];

/** The groups of the sample list, by key of `sampleGroups` in the page texts. */
export type SampleGroupId = 'admission' | 'lab';

/**
 * The sample list on the page: two groups, and in each group the samples
 * by HL7 version, oldest first.
 */
export const SAMPLE_GROUPS: readonly { id: SampleGroupId; ids: readonly SampleId[] }[] = [
  { id: 'admission', ids: ['v22-adt-a01', 'v23-adt-a01', 'adt-a01', 'v28-adt-a08', 'v29-adt-a04'] },
  { id: 'lab', ids: ['v24-orm-o01', 'oru-r01', 'v251-oru-r01', 'v27-oru-r01'] },
];

/** True when the id is one of the samples. */
export function isSampleId(id: string): id is SampleId {
  return Object.hasOwn(SAMPLES, id);
}

/**
 * True when the text box holds the user's own text: it is not empty, and it
 * is not a sample that the user loaded and did not change. `loaded` is the
 * sample last loaded into the box, or null after the user typed, pasted,
 * opened a file or masked the text. Choosing a sample asks first when this
 * is true, so the page never replaces the user's text without a yes.
 */
export function isOwnText(text: string, loaded: SampleId | null): boolean {
  if (text.trim() === '') return false;
  return loaded === null || text !== SAMPLES[loaded];
}
