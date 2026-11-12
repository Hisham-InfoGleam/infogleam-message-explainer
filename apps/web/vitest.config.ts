// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

import { defineConfig } from 'vitest/config';

// Unit tests for the page logic in src/lib and the text in src/i18n.
// They run in Node. The browser tests are in e2e/ and use Playwright
// (npm run test:e2e), so they are left out here.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
