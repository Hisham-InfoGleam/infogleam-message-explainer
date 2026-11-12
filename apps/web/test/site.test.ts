// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// The header links to the InfoGleam website.

import { describe, expect, it } from 'vitest';
import { SITE_LINK, SITE_URL } from '../src/lib/site';

describe('SITE_LINK', () => {
  it('goes to the home page of the InfoGleam website, with a slash at the end', () => {
    expect(SITE_LINK.href).toBe('https://infogleam.com/');
    expect(SITE_LINK.href).toBe(`${SITE_URL}/`);
  });

  it('opens a new tab, and the website gets no access to the tool', () => {
    expect(SITE_LINK.target).toBe('_blank');
    expect(SITE_LINK.rel.split(' ')).toContain('noopener');
  });
});
