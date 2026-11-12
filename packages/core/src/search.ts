// SPDX-License-Identifier: MPL-2.0
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// Find fields by position ("PID-3", "pid 3", "PID.3") or by name, in
// English or Arabic. Pure functions, so a page can filter its own list.

export interface SearchItem {
  /** Position label, for example "PID-3", "PID-3[2].1" or "PID-5.1". */
  label: string;
  /** Names to search in, for example the English and Arabic field names. */
  names: readonly (string | undefined)[];
}

const POSITION =
  /^([A-Z][A-Z0-9]{2})(?:\s*[-._\s]?\s*(\d+)(?:\s*[-._\s]\s*(\d+))?(?:\s*[-._\s]\s*(\d+))?)?$/;

/**
 * Read a position, for example "pid 3", "PID.3", "pid-5.1" or "OBX".
 * Returns it in label form ("PID-3", "PID-5.1", "OBX"), or undefined when
 * the text is not a position. Repetitions such as "[2]" are ignored.
 */
export function parsePositionQuery(query: string): string | undefined {
  const text = query
    .toUpperCase()
    .replace(/\[\d*\]?/g, '')
    .replace(/[-._\s]+$/, '')
    .trim();
  const m = POSITION.exec(text);
  if (!m) return undefined;
  const [, segment, field, comp, sub] = m;
  if (field === undefined) return segment;
  let label = `${segment}-${Number(field)}`;
  if (comp !== undefined) label += `.${Number(comp)}`;
  if (sub !== undefined) label += `.${Number(sub)}`;
  return label;
}

/**
 * Text for comparing names: lower case, no accents or Arabic diacritics,
 * one form of alef, ya and ta marbuta, and single spaces instead of
 * punctuation. "Date/Time" becomes "date time".
 */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ًͯ-ٰٟـ]/g, '')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function labelKey(label: string): string {
  return label.toUpperCase().replace(/\[\d+\]/g, '');
}

/**
 * True when the item matches the query. An empty query matches everything.
 * - A position matches itself and its parts: "PID-3" matches PID-3,
 *   PID-3.1 and PID-3[2].1, but not PID-30. "PID" matches all PID fields.
 * - Otherwise every word of the query must appear in one of the names.
 *   Both checks are made, so "set" finds "Set ID - PID" even though it
 *   also looks like a segment name.
 */
export function matchesSearch(query: string, item: SearchItem): boolean {
  if (query.trim() === '') return true;

  const position = parsePositionQuery(query);
  if (position) {
    const key = labelKey(item.label);
    const next = position.includes('-') ? '.' : '-';
    if (key === position || key.startsWith(position + next)) return true;
  }

  const words = normalizeSearchText(query).split(' ').filter((w) => w !== '');
  if (words.length === 0) return position === undefined;
  return item.names.some((name) => {
    if (!name) return false;
    const text = normalizeSearchText(name);
    return words.every((w) => text.includes(w));
  });
}
