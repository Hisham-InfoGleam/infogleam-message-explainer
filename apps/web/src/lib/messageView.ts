// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// Builds the message view with plain DOM calls. A message can have hundreds
// of segments, so each part is one small element with a data-k attribute
// and the page listens for events on the view only (event delegation).
// Text is always set as text, never as HTML. The text of each row is
// exactly the text of its segment.

import { HEADER_SEGMENTS, type HL7Field, type HL7Segment, type ParsedMessage } from '@infogleam/message-explainer-core';
import { hasParts } from './rows';
import { segmentColor } from './segcolor';

/** A message check mark: the level and the text for screen readers. */
export interface ViewMark {
  level: 'problem' | 'differs' | 'note';
  text: string;
}

export interface ViewOptions {
  /** Accessible name of a field, for example "PID-8 Administrative Sex, value F". */
  cellLabel: (seg: HL7Segment, field: HL7Field) => string;
  isMasked: (segIndex: number, field: number) => boolean;
  /**
   * Message check marks, by part key ("3:5", "3:5:1:2") or by row
   * ("row:3"). A marked place gets the classes "chk chk-<level>"; its text
   * is added to the accessible name of the field or the segment name.
   */
  marks?: ReadonlyMap<string, ViewMark>;
}

function addMark(el: HTMLElement, mark: ViewMark | undefined): void {
  if (mark) el.classList.add('chk', 'chk-' + mark.level);
}

function span(className: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = className;
  return el;
}

/** A dimmed delimiter. Screen readers skip it; the field names say enough. */
function delimiter(char: string): HTMLSpanElement {
  const el = span('d');
  el.textContent = char;
  el.setAttribute('aria-hidden', 'true');
  return el;
}

/** Add text, with the escape character dimmed. */
function appendText(parent: HTMLElement, text: string, escape: string): void {
  if (!escape || !text.includes(escape)) {
    if (text !== '') parent.append(text);
    return;
  }
  text.split(escape).forEach((piece, i) => {
    if (i > 0) parent.append(delimiter(escape));
    if (piece !== '') parent.append(piece);
  });
}

function isHeader(seg: HL7Segment, field: string): boolean {
  return HEADER_SEGMENTS.has(seg.raw.slice(0, 3)) && seg.raw.charAt(3) === field;
}

function fieldCell(seg: HL7Segment, f: HL7Field, message: ParsedMessage, opts: ViewOptions, plain: boolean): HTMLElement {
  const d = message.delimiters;
  const cell = span('f');
  cell.setAttribute('role', 'gridcell');
  cell.tabIndex = -1;
  const key = `${seg.index}:${f.position}`;
  cell.dataset.k = key;
  const marks = opts.marks;
  // Marks of this field and of its parts, for the accessible name.
  const notes: string[] = [];
  const own = marks?.get(key);
  addMark(cell, own);
  if (own) notes.push(own.text);
  if (opts.isMasked(seg.index, f.position)) cell.classList.add('masked');

  const label = opts.cellLabel(seg, f);
  // MSH-1 and MSH-2 hold the delimiters themselves: show them as they are.
  if (plain || !hasParts(seg, f)) {
    if (plain) cell.append(f.value);
    else appendText(cell, f.value, d.escape);
    cell.setAttribute('aria-label', [label, ...notes].join('. '));
    return cell;
  }

  f.repetitions.forEach((rep, r) => {
    if (r > 0) cell.append(delimiter(d.repetition));
    rep.components.forEach((comp, c) => {
      if (c > 0) cell.append(delimiter(d.component));
      const part = span('c');
      const partKey = `${key}:${rep.index}:${comp.position}`;
      part.dataset.k = partKey;
      const partMark = marks?.get(partKey);
      addMark(part, partMark);
      if (partMark) notes.push(partMark.text);
      if (comp.subComponents.length > 1) {
        comp.subComponents.forEach((sub, s) => {
          if (s > 0) part.append(delimiter(d.subComponent));
          const subPart = span('c s');
          const subKey = `${partKey}:${s + 1}`;
          subPart.dataset.k = subKey;
          const subMark = marks?.get(subKey);
          addMark(subPart, subMark);
          if (subMark) notes.push(subMark.text);
          appendText(subPart, sub, d.escape);
          part.append(subPart);
        });
      } else {
        appendText(part, comp.value, d.escape);
      }
      cell.append(part);
    });
  });
  cell.setAttribute('aria-label', [label, ...notes].join('. '));
  return cell;
}

/** Fill root with one row per segment. Empty fields have no element. */
export function renderMessageView(root: HTMLElement, message: ParsedMessage, opts: ViewOptions): void {
  const d = message.delimiters;
  const rows = document.createDocumentFragment();

  for (const seg of message.segments) {
    const row = document.createElement('div');
    row.className = 'mv-row';
    row.setAttribute('role', 'row');
    const name = span(`mv-seg sc-${segmentColor(seg.name)}`);
    name.setAttribute('role', 'rowheader');
    name.textContent = seg.name;
    const rowMark = opts.marks?.get(`row:${seg.index}`);
    if (rowMark) {
      addMark(name, rowMark);
      name.setAttribute('aria-label', `${seg.name}. ${rowMark.text}`);
    }
    row.append(name);

    // In MSH, field 1 is the field separator itself and field 2 follows it
    // directly, so neither has a separator in front.
    const header = isHeader(seg, d.field);
    for (const f of seg.fields) {
      const own = header && f.position <= 2;
      if (!own) row.append(delimiter(d.field));
      if (f.value !== '') row.append(fieldCell(seg, f, message, opts, own));
    }
    rows.append(row);
  }
  root.replaceChildren(rows);
}
