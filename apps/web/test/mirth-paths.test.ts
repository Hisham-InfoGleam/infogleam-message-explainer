// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// The Mirth paths in the field list must be the paths that work in Mirth.
// fixtures/mirth-paths.json holds three made-up messages and, for every row
// of the field list, the path that was run in Mirth Connect 4.5.2 itself (its
// HL7 v2 converter and JavaScript engine). See "about" in that file.

import { LATEST_VERSION, parseMessage } from '@infogleam/message-explainer-core';
import { describe, expect, it } from 'vitest';
import { segmentGroups } from '../src/lib/rows';
import fixture from './fixtures/mirth-paths.json' with { type: 'json' };

interface FixtureRow {
  msg: string;
  label: string;
  value: string;
  path: string;
}

const rows = fixture.rows as FixtureRow[];
const messages = fixture.messages as Record<string, string>;

describe('Mirth paths checked in Mirth Connect', () => {
  for (const [id, text] of Object.entries(messages)) {
    it(`gives the Mirth-tested path for every row of message ${id}`, () => {
      const parsed = parseMessage(text);
      const got = parsed.segments.flatMap((seg) =>
        segmentGroups(seg, LATEST_VERSION).flatMap((g) =>
          [g.field, ...g.parts].map((r) => ({ label: r.label, value: r.value, path: r.mirthPath })),
        ),
      );
      const want = rows.filter((r) => r.msg === id).map(({ label, value, path }) => ({ label, value, path }));
      expect(got).toEqual(want);
    });
  }

  it('uses [0] for the first of several, and the component 1 of a plain field', () => {
    const find = (label: string, value: string) => rows.find((r) => r.label === label && r.value === value)?.path;
    expect(find('OBX-5', '13.2')).toBe("msg['OBX'][0]['OBX.5']['OBX.5.1']");
    expect(find('PID-8', 'F')).toBe("msg['PID']['PID.8']['PID.8.1']");
    expect(find('PID-3.1', 'TEST3001')).toBe("msg['PID']['PID.3'][0]['PID.3.1']");
    expect(find('PID-3[2].1', 'TEST3002')).toBe("msg['PID']['PID.3'][1]['PID.3.1']");
    expect(find('MSH-2', '^~\\&')).toBe("msg['MSH']['MSH.2']");
  });
});
