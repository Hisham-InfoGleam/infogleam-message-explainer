// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

import { mount } from 'svelte';
// Noto Sans Arabic, Arabic letters only, weights 400 and 600 (SIL OFL 1.1,
// see NOTICE). The files are bundled with the page; nothing is loaded from
// other sites.
import '@fontsource/noto-sans-arabic/arabic-400.css';
import '@fontsource/noto-sans-arabic/arabic-600.css';
import App from './App.svelte';
import './app.css';

// The build turns the tab icon link in index.html into a file next to the
// page. The dev server cannot serve that link from the brand folder, so in
// development the link gets the dev server's URL instead.
if (import.meta.env.DEV) {
  void import('../../../brand/infogleam-symbol-small.svg?url').then(({ default: url }) => {
    document.querySelector('link[rel="icon"]')?.setAttribute('href', url);
  });
}

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app element');

export default mount(App, { target });
