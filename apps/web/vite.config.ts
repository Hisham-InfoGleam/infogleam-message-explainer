// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// The page may only load its own files and may not send data anywhere.
// Keep this in sync with the Nginx header in docs/development.md.
export const CSP = [
  "default-src 'self'",
  "connect-src 'none'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

// Added only to the production build. The dev server needs a websocket for
// hot reload, which connect-src 'none' would block.
function cspMeta(): Plugin {
  return {
    name: 'csp-meta',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

export default defineConfig({
  base: '/tools/message-explainer/',
  plugins: [svelte(), cspMeta()],
  build: {
    target: 'es2022',
    // The whole field dictionary is bundled on purpose, so the page needs no
    // requests after it loads. See "Field dictionary" in docs/development.md.
    chunkSizeWarningLimit: 1000,
    // The page is one script file and loads nothing else later. Without the
    // preload helper, the built code has no network call at all.
    modulePreload: { polyfill: false },
  },
});
