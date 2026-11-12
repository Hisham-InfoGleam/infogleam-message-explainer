// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

import { parseMessage, type ParsedMessage } from '@infogleam/message-explainer-core';
import { SAMPLE_IDS, SAMPLES, type SampleId } from '../src/lib/samples';

export { randomMessage } from '../../../packages/core/test/random-message.js';

/** Every sample, parsed. */
export function parsedSamples(): { id: SampleId; text: string; message: ParsedMessage }[] {
  return SAMPLE_IDS.map((id) => ({ id, text: SAMPLES[id], message: parseMessage(SAMPLES[id]) }));
}

/** Versions to test with: the oldest, a middle one and the newest. */
export const SOME_VERSIONS = ['2.3', '2.5.1', '2.9'];
