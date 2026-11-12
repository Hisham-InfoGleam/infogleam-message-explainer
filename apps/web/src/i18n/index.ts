// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

import en from './en.json';
import ar from './ar.json';

export type Lang = 'en' | 'ar';
export type Messages = typeof en;

// Typing ar as Messages makes the build fail if a key is missing.
const arabic: Messages = ar;
const all: Record<Lang, Messages> = { en, ar: arabic };

export function messagesFor(lang: Lang): Messages {
  return all[lang];
}

export function dirFor(lang: Lang): 'ltr' | 'rtl' {
  return lang === 'ar' ? 'rtl' : 'ltr';
}

/** Replace {name} placeholders. */
export function format(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}
