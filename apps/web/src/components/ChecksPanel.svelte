<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- Copyright 2026 Hisham Alrashdan (InfoGleam) -->
<script lang="ts">
  import { CHECK_LEVELS, type CheckLevel, type CheckResult } from '@infogleam/message-explainer-core';
  import { untrack } from 'svelte';
  import { dirFor, type Lang, type Messages } from '../i18n';
  import { copyText, fieldsHint, startsOpen, statusHint, summaryText, type CheckItem } from '../lib/checks';
  import type { Selection } from '../lib/selection';
  import Icon from './Icon.svelte';

  interface Props {
    result: CheckResult;
    items: CheckItem[];
    lang: Lang;
    t: Messages;
    /** True on narrow screens: the list then starts folded. */
    narrow: boolean;
    onSelect: (sel: Selection, opener: HTMLElement) => void;
    /** Copy a text. Resolves to false when the browser blocks the clipboard. */
    onCopy: (text: string) => Promise<boolean>;
  }

  let { result, items, lang, t, narrow, onSelect, onCopy }: Props = $props();

  type Filter = 'all' | CheckLevel;

  let open = $state(false);
  let filter = $state<Filter>('all');
  let copyStatus = $state('');

  // Each new check run (a new message, a mask, another version) starts
  // with the folding rule and no filter.
  $effect.pre(() => {
    const r = result;
    untrack(() => {
      open = !narrow && startsOpen(r);
      filter = 'all';
      copyStatus = '';
    });
  });

  const c = $derived(t.checks);
  const summary = $derived(summaryText(result, t));
  const top = $derived(CHECK_LEVELS.find((l) => result.counts[l] > 0));
  const levels = $derived(CHECK_LEVELS.filter((l) => result.counts[l] > 0));
  const shown = $derived(levels.filter((l) => filter === 'all' || filter === l));
  // How to run the field checks, or that they are not available for this
  // version; and the fields whose status (withdrawn and so on) was not checked.
  const hint = $derived(fieldsHint(result, items, t));
  const status = $derived(statusHint(result, t));

  async function copy() {
    copyStatus = (await onCopy(copyText(result, items, t))) ? c.listCopied : t.copyFailed;
  }

  function goToSegment(e: MouseEvent, index: number) {
    e.preventDefault();
    document.getElementById('seg-' + index)?.scrollIntoView();
  }
</script>

{#snippet where(item: CheckItem)}
  <span class={'tag chk-tag chk-' + item.level}><Icon name={item.level} size={12} />{c.levels[item.level]}</span>
  <span class="chk-line">{item.lineText}</span>
  {#if item.label}
    <span class="xp-dot" aria-hidden="true">·</span>
    <bdi class="chk-pos" dir="ltr">{item.label}</bdi>
  {/if}
  {#if item.fieldName}
    <bdi class="chk-name">{item.fieldName}</bdi>
  {/if}
{/snippet}

<section class="checks" aria-labelledby="checks-summary" {lang} dir={dirFor(lang)}>
  <h2 class="sr-only">{c.title}</h2>
  <button
    type="button"
    id="checks-summary"
    class={'checks-summary chk-sum-' + (top ?? 'none')}
    aria-expanded={open}
    aria-controls="checks-list"
    onclick={() => (open = !open)}
  >
    <span class="checks-chevron"><Icon name="chevron" size={14} /></span>
    <Icon name={top ?? 'check'} size={16} />
    <span>{summary}</span>
  </button>

  <div id="checks-list" class="checks-list" hidden={!open}>
    {#if items.length > 0}
      <div class="checks-tools">
        <div class="checks-filter" role="group" aria-label={c.filterLabel}>
          <span class="checks-filter-label" aria-hidden="true">{c.filterLabel}:</span>
          <button type="button" aria-pressed={filter === 'all'} onclick={() => (filter = 'all')}>
            {c.filterAll} <bdi>({items.length})</bdi>
          </button>
          {#each levels as level (level)}
            <button type="button" class="with-icon" aria-pressed={filter === level} onclick={() => (filter = level)}>
              <Icon name={level} size={14} />{c.groups[level]} <bdi>({result.counts[level]})</bdi>
            </button>
          {/each}
        </div>
        <button type="button" class="with-icon checks-copy" onclick={copy}>
          <Icon name="copy" />{c.copyList}
        </button>
      </div>
      <p class="checks-status" role="status">{copyStatus}</p>
    {/if}

    {#each shown as level (level)}
      <h3 class={'checks-group chk-' + level}><Icon name={level} size={16} />{c.groups[level]}</h3>
      <ul class="checks-items">
        {#each items.filter((i) => i.level === level) as item (item.key)}
          <li class="chk-item">
            {#if item.sel}
              {@const sel = item.sel}
              <button type="button" class="chk-go" onclick={(e) => onSelect(sel, e.currentTarget)}>
                {@render where(item)}
              </button>
            {:else if item.segmentIndex !== undefined}
              {@const index = item.segmentIndex}
              <a class="chk-go" href={'#seg-' + index} onclick={(e) => goToSegment(e, index)}>{@render where(item)}</a>
            {:else}
              <span class="chk-go chk-static">{@render where(item)}</span>
            {/if}
            <p class="chk-sentence">{item.sentence}</p>
            <details class="chk-why">
              <summary>{c.why}</summary>
              <p><strong>{c.ruleLabel}:</strong> {item.rule}</p>
              <p><strong>{c.sourceLabel}:</strong> {item.source}</p>
            </details>
          </li>
        {/each}
      </ul>
    {/each}

    {#if hint}
      <p class="hint checks-hint">{hint}</p>
    {/if}
    {#if status}
      <p class="hint checks-not-status">{status}</p>
    {/if}
    <p class="hint checks-not">{c.notChecked}</p>
  </div>
</section>
