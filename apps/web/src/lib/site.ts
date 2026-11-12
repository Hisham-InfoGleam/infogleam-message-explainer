// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

export const SITE_URL = 'https://infogleam.com';

/**
 * The header links to the InfoGleam website (the symbol and the text link).
 * They open a new tab, so the user's message stays in the tool: the Back
 * button brings the message back only when the browser kept the page in its
 * back/forward cache, and that is not always the case.
 */
export const SITE_LINK = {
  href: `${SITE_URL}/`,
  target: '_blank',
  rel: 'noopener',
} as const;

/** Public source code of this web page (required by the AGPL). */
export const SOURCE_URL = 'https://github.com/Hisham-InfoGleam/infogleam-message-explainer';

/** HL7's required trademark notice. Do not change or translate the wording. */
export const HL7_NOTICE =
  'HL7® is the registered trademark of Health Level Seven International and the use does not constitute endorsement by HL7.';
