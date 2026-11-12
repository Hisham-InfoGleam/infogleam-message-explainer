<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- Copyright 2026 Hisham Alrashdan (InfoGleam) -->
<script lang="ts">
  import {
    getComponentDoc,
    getFieldDoc,
    type HL7Field,
    type HL7Segment,
    type ParsedMessage,
  } from '@infogleam/message-explainer-core';
  import { untrack } from 'svelte';
  import { dirFor, format, type Lang, type Messages } from '../i18n';
  import { renderMessageView, type ViewMark } from '../lib/messageView';
  import { maskKey } from '../lib/rows';
  import { parsePartKey, partKey, safePath, type Selection } from '../lib/selection';
  import { fieldName } from '../lib/text';

  interface Props {
    message: ParsedMessage;
    lang: Lang;
    t: Messages;
    /** The HL7 version whose names the labels show. */
    version: string;
    maskedKeys: Set<string>;
    selection: Selection | null;
    onSelect: (sel: Selection, opener: HTMLElement) => void;
    /** Message check marks, by part key or row ("row:3"). */
    marks?: ReadonlyMap<string, ViewMark>;
  }

  let { message, lang, t, version, maskedKeys, selection, onSelect, marks = new Map() }: Props = $props();

  // The view is built with DOM calls (see lib/messageView.ts). Keyboard
  // focus uses a roving tabindex: only one field has tabindex 0.
  let grid = $state<HTMLDivElement>();
  let tip = $state<HTMLDivElement>();
  let hovered: HTMLElement | null = null;
  // The field with tabindex 0, and its key to find it again after a new render.
  let activeCell: HTMLElement | null = null;
  let activeKey = '';
  // Rows that have at least one field, for the up and down keys.
  let rowCache: HTMLElement[] | null = null;
  // True while a click or key in the view itself changes the selection:
  // the part is already in sight, so the view does not scroll.
  let fromView = false;

  const CELL = '[role="gridcell"]';

  function cellLabel(seg: HL7Segment, f: HL7Field): string {
    const doc = getFieldDoc(seg.name, f.position, version);
    const label = safePath(seg, f.position).label;
    const part = doc ? `${label} ${fieldName(doc, lang)}` : label;
    return format(t.cellLabel, { part, value: f.value });
  }

  $effect(() => {
    if (!grid) return;
    renderMessageView(grid, message, {
      cellLabel,
      isMasked: (s, f) => maskedKeys.has(maskKey(s, f)),
      marks,
    });
    hovered = null;
    activeCell = null;
    rowCache = null;
    untrack(() => {
      hideTip();
      restoreActive();
      markSelection();
    });
  });

  $effect(() => {
    void selection;
    untrack(() => markSelection(!fromView));
    fromView = false;
  });

  $effect(() => {
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', hideTip);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', hideTip);
    };
  });

  /** On scroll, a label for the keyboard focus moves along; a label for the pointer goes away. */
  function onScroll() {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && grid?.contains(focused) && focused.matches(`${CELL}:focus-visible`)) {
      showTip(focused);
    } else {
      hideTip();
    }
  }

  function find(key: string): HTMLElement | null {
    return grid?.querySelector<HTMLElement>(`[data-k="${key}"]`) ?? null;
  }

  function markSelection(scroll = false) {
    if (!grid) return;
    for (const el of grid.querySelectorAll<HTMLElement>('.sel, .sel-field')) {
      el.classList.remove('sel', 'sel-field');
      el.removeAttribute('aria-selected');
    }
    const target = selection ? find(partKey(selection)) : null;
    if (!target) return;
    target.classList.add('sel');
    const cell = target.closest<HTMLElement>(CELL);
    if (cell && cell !== target) cell.classList.add('sel-field');
    cell?.setAttribute('aria-selected', 'true');
    if (scroll) scrollWithin(target);
  }

  /** Scroll the view box (not the page) so the element can be seen. */
  function scrollWithin(el: HTMLElement) {
    if (!grid) return;
    const box = grid.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.top < box.top) grid.scrollTop -= box.top - r.top + 8;
    else if (r.bottom > box.bottom) grid.scrollTop += r.bottom - box.bottom + 8;
    if (r.left < box.left || r.right > box.right) grid.scrollLeft += r.left - box.left - 32;
  }

  function cellsOf(row: Element): HTMLElement[] {
    return Array.from(row.querySelectorAll<HTMLElement>(`:scope > ${CELL}`));
  }

  function rowsWithCells(): HTMLElement[] {
    if (!grid) return [];
    rowCache ??= Array.from(grid.querySelectorAll<HTMLElement>(':scope > [role="row"]')).filter(
      (row) => row.querySelector(CELL) !== null,
    );
    return rowCache;
  }

  function fieldOf(cell: HTMLElement): number {
    return Number(cell.dataset.k?.split(':')[1] ?? 0);
  }

  function setActive(cell: HTMLElement) {
    if (activeCell && activeCell !== cell) activeCell.tabIndex = -1;
    cell.tabIndex = 0;
    activeCell = cell;
    activeKey = cell.dataset.k ?? '';
  }

  function restoreActive() {
    if (!grid) return;
    const cell = (activeKey ? grid.querySelector<HTMLElement>(`${CELL}[data-k="${activeKey}"]`) : null) ??
      grid.querySelector<HTMLElement>(CELL);
    if (cell) setActive(cell);
  }

  /** The cell in the row up or down, closest to the same field number. */
  function vertical(row: HTMLElement, cell: HTMLElement, delta: number): HTMLElement | undefined {
    const rows = rowsWithCells();
    const i = rows.indexOf(row);
    const j = Math.max(0, Math.min(rows.length - 1, i + delta));
    if (i === -1 || j === i) return undefined;
    const field = fieldOf(cell);
    let best: HTMLElement | undefined;
    let distance = Infinity;
    for (const c of cellsOf(rows[j]!)) {
      const dist = Math.abs(fieldOf(c) - field);
      if (dist < distance) {
        best = c;
        distance = dist;
      }
    }
    return best;
  }

  function select(target: HTMLElement) {
    const sel = parsePartKey(target.dataset.k);
    const cell = target.closest<HTMLElement>(CELL);
    if (!sel || !cell) return;
    setActive(cell);
    hideTip();
    fromView = true;
    onSelect(sel, cell);
  }

  function onClick(e: MouseEvent) {
    const target = (e.target as Element).closest<HTMLElement>('[data-k]');
    if (target && grid?.contains(target)) select(target);
  }

  function onKeydown(e: KeyboardEvent) {
    // Leave browser shortcuts such as Alt+Left (back) alone.
    if (e.altKey || e.metaKey) return;
    const cell = (e.target as Element).closest<HTMLElement>(CELL);
    if (!cell || !grid?.contains(cell)) return;
    const row = cell.parentElement;
    if (!row) return;
    const cells = cellsOf(row);
    const i = cells.indexOf(cell);
    let next: HTMLElement | undefined;

    switch (e.key) {
      case 'ArrowRight':
        next = cells[i + 1];
        break;
      case 'ArrowLeft':
        next = cells[i - 1];
        break;
      case 'ArrowDown':
        next = vertical(row, cell, 1);
        break;
      case 'ArrowUp':
        next = vertical(row, cell, -1);
        break;
      case 'PageDown':
        next = vertical(row, cell, 10);
        break;
      case 'PageUp':
        next = vertical(row, cell, -10);
        break;
      case 'Home':
        next = e.ctrlKey ? cellsOf(rowsWithCells()[0] ?? row)[0] : cells[0];
        break;
      case 'End':
        next = e.ctrlKey ? cellsOf(rowsWithCells().at(-1) ?? row).at(-1) : cells.at(-1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        select(cell);
        return;
      default:
        return;
    }
    e.preventDefault();
    if (next) {
      setActive(next);
      next.focus();
    }
  }

  function onFocusIn(e: FocusEvent) {
    if (e.target === grid) {
      // The box itself got focus (for example a click on a delimiter).
      activeCell?.focus({ preventScroll: true });
      return;
    }
    const cell = (e.target as Element).closest<HTMLElement>(CELL);
    if (!cell) return;
    setActive(cell);
    if (cell.matches(':focus-visible')) showTip(cell);
  }

  function onFocusOut(e: FocusEvent) {
    if (!grid?.contains(e.relatedTarget as Node | null)) hideTip();
  }

  function onPointerOver(e: PointerEvent) {
    const found = (e.target as Element).closest<HTMLElement>('[data-k]');
    const target = found && grid?.contains(found) ? found : null;
    if (target === hovered) return;
    hovered?.classList.remove('hover');
    hovered = target;
    if (!target) {
      hideTip();
      return;
    }
    target.classList.add('hover');
    if (e.pointerType !== 'touch') showTip(target);
  }

  function onPointerLeave() {
    hovered?.classList.remove('hover');
    hovered = null;
    hideTip();
  }

  function hideTip() {
    tip?.classList.remove('show');
  }

  /**
   * Small label over a part: "PID-8 · Administrative Sex" or "PID-5.1 ·
   * Family Name", with the field name that the page uses for the version.
   */
  function showTip(target: HTMLElement) {
    const sel = parsePartKey(target.dataset.k);
    const seg = sel ? message.segments[sel.seg] : undefined;
    if (!tip || !sel || !seg) return;

    const label = document.createElement('bdi');
    label.dir = 'ltr';
    label.className = 'mv-tip-pos';
    label.textContent = safePath(seg, sel.field, sel.rep, sel.comp, sel.sub).label;
    const content: (Node | string)[] = [label];

    let name = '';
    let nameLang: Lang = 'en';
    if (sel.comp === undefined) {
      const doc = getFieldDoc(seg.name, sel.field, version);
      if (doc) {
        name = fieldName(doc, lang);
        if (lang === 'ar' && doc.nameAr) nameLang = 'ar';
      }
    } else {
      name = getComponentDoc(seg.name, sel.field, sel.comp, sel.sub, version)?.name ?? '';
    }
    if (name) {
      const n = document.createElement('bdi');
      n.lang = nameLang;
      n.textContent = name;
      content.push(' · ', n);
    }
    // The message check sentence of this place, if any.
    const mark = marks.get(target.dataset.k ?? '') ?? marks.get(`${sel.seg}:${sel.field}`);
    if (mark) {
      const m = document.createElement('span');
      m.className = 'mv-tip-check';
      m.textContent = mark.text;
      content.push(m);
    }
    tip.replaceChildren(...content);

    // The tip stays laid out (it is only made invisible) and moves with a
    // transform, which is cheap even when the page is very long.
    const r = target.getBoundingClientRect();
    const box = tip.getBoundingClientRect();
    let top = r.top - box.height - 6;
    if (top < 4) top = r.bottom + 6;
    const left = Math.max(4, Math.min(r.left, document.documentElement.clientWidth - box.width - 4));
    tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    tip.classList.add('show');
  }
</script>

<div class="mv-wrap">
  <div
    bind:this={grid}
    class="mv"
    role="grid"
    tabindex="-1"
    aria-label={t.messageView}
    aria-describedby="mv-hint"
    aria-readonly="true"
    dir="ltr"
    onclick={onClick}
    onkeydown={onKeydown}
    onfocusin={onFocusIn}
    onfocusout={onFocusOut}
    onpointerover={onPointerOver}
    onpointerleave={onPointerLeave}
    onscroll={onScroll}
  ></div>
  <div bind:this={tip} class="mv-tip" dir={dirFor(lang)} aria-hidden="true"></div>
</div>
<p id="mv-hint" class="hint mv-hint">{t.messageViewHint}</p>
