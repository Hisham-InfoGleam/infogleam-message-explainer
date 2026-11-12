// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

import { defineConfig } from '@playwright/test';

// Browser tests for the built page. Run them from the project root with
// "npm run test:e2e": it builds the page first, because only the build
// has the Content Security Policy.
//
// Settings from the environment:
// - E2E_BROWSER_CHANNEL: an installed browser. Default "msedge" (Microsoft
//   Edge). Other values: "chrome", or "chromium" for the browser that
//   "npx playwright install chromium" downloads (for example on Linux CI).
// - E2E_PORT: the port of the preview server. Default 4175.
const PORT = Number(process.env.E2E_PORT ?? 4175);
const CHANNEL = process.env.E2E_BROWSER_CHANNEL ?? 'msedge';
const BASE = `http://127.0.0.1:${PORT}/tools/message-explainer/`;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: 2,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: BASE,
    channel: CHANNEL === 'chromium' ? undefined : CHANNEL,
    headless: true,
    viewport: { width: 1280, height: 800 },
    trace: 'off',
  },
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort --host 127.0.0.1`,
    url: BASE,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
