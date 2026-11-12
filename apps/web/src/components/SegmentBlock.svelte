<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- Copyright 2026 Hisham Alrashdan (InfoGleam) -->
<script lang="ts">
  import { fieldVersionWarning, getSegmentDoc, type HL7Segment } from '@infogleam/message-explainer-core';
  import { dirFor, format, type Lang, type Messages } from '../i18n';
  import { whenNearScreen } from '../lib/nearScreen';
  import type { Mark } from '../lib/checks';
  import type { Row, ShownGroup } from '../lib/rows';
  import { segmentColor } from '../lib/segcolor';
  import { partKey, type Selection } from '../lib/selection';
  import { fieldName, pathPieces, pick } from '../lib/text';
  import type { VersionView } from '../lib/versions';
  import Icon from './Icon.svelte';

  interface Props {
    seg: HL7Segment;
    /** The field groups to show (already filtered by the search). */
    groups: ShownGroup[];
    lang: Lang;
    t: Messages;
    /** The HL7 version the page explains the message as. */
    ver: VersionView;
    maskedKeys: Set<string>;
    /** Fields whose parts are unfolded, by field key ("3:5"). */
    expanded: Set<string>;
    onToggle: (fieldKey: string) => void;
    copiedKey: string;
    onCopyPath: (key: string, path: string) => void;
    /** partKey() of the selected part, or an empty string. */
    selectedKey: string;
    onSelect: (sel: Selection, opener: HTMLElement) => void;
    /** Build the table at once, not only when the segment comes near the screen. */
    eager?: boolean;
    /** Message check marks, by field key ("3:5"). */
    marks?: ReadonlyMap<string, Mark>;
  }

  let {
    seg,
    groups,
    lang,
    t,
    ver,
    maskedKeys,
    expanded,
    onToggle,
    copiedKey,
    onCopyPath,
    selectedKey,
    onSelect,
    eager = false,
    marks = new Map(),
  }: Props = $props();

  const doc = $derived(getSegmentDoc(seg.name));
  const headingId = $derived('seg-h-' + seg.index);

  // A message can have hundreds of segments (for example many OBX). Each
  // table is built when its segment comes near the screen, so the page
  // does not build tens of thousands of elements at once.
  let section = $state<HTMLElement>();
  let near = $state(false);
  const showTable = $derived(eager || near);

  $effect(() => {
    if (showTable || !section) return;
    return whenNearScreen(section, () => (near = true));
  });

  function partsText(count: number): string {
    return count === 1 ? t.partsOne : format(t.partsMany, { count });
  }
</script>

{#snippet row(r: Row, g: ShownGroup, open: boolean)}
  {@const copyKey = `${seg.index}|${r.key}`}
  {@const copyLabel = format(t.copyMirthFor, { label: r.label })}
  <!-- svelte-ignore a11y_no_redundant_roles -->
  <tr
    role="row"
    class={'level-' + r.level}
    class:masked={maskedKeys.has(r.fieldKey)}
    class:selected={selectedKey === partKey(r.sel)}
  >
    <td role="cell" class="pos">
      {r.label}
      {#if r.level === 0 && maskedKeys.has(r.fieldKey)}
        <span class="badge">{t.maskedBadge}</span>
      {/if}
    </td>
    <td role="cell" class="name" {lang} dir={dirFor(lang)}>
      {#if r.level === 0}
        {#if r.fieldDoc}
          <button type="button" class="field-name" onclick={(e) => onSelect(r.sel, e.currentTarget)}>
            {fieldName(r.fieldDoc, lang)}
          </button>
          {#if r.fieldDoc.usage}
            <span class={'tag usage-' + r.fieldDoc.usage} title={t.usageTitle}>{t.usage[r.fieldDoc.usage]}</span>
          {/if}
          {#if r.fieldDoc.since && fieldVersionWarning(r.fieldDoc, ver.warn)}
            <span class="tag tag-warn">{format(t.addedIn, { since: r.fieldDoc.since })}</span>
          {/if}
          {#if r.fieldDoc.opt === 'W'}
            <span class="tag tag-warn" title={format(t.optTitle, { version: ver.effective })}>{t.opt.W}</span>
          {/if}
          {#if marks.has(r.fieldKey)}
            {@const mark = marks.get(r.fieldKey)!}
            <span class={'tag chk-tag chk-' + mark.level} title={mark.text}>
              <Icon name={mark.level} size={12} /><span aria-hidden="true">{t.checks.levels[mark.level]}</span><span class="sr-only">{mark.text}</span>
            </span>
          {/if}
        {:else}
          <span class="hint">{t.noExplanation}</span>
        {/if}
        {#if g.parts.length > 0 && !g.open}
          <button type="button" class="parts-toggle" aria-expanded={open} onclick={() => onToggle(r.fieldKey)}>
            <Icon name="chevron" size={14} />
            {partsText(g.parts.length)}
          </button>
        {/if}
      {:else if r.compDoc}
        <button
          type="button"
          class="field-name part-name"
          lang="en"
          dir="ltr"
          onclick={(e) => onSelect(r.sel, e.currentTarget)}
        >
          {r.compDoc.name}
        </button>
      {/if}
    </td>
    <td role="cell" class="val">{r.value}</td>
    <td role="cell" class="path">
      {#if r.mirthPath}
        <code>{#each pathPieces(r.mirthPath) as piece, i (i)}{#if i > 0}<wbr />{/if}{piece}{/each}</code>
        <button
          type="button"
          class="icon-btn copy-path"
          class:copied={copiedKey === copyKey}
          aria-label={copyLabel}
          title={copiedKey === copyKey ? t.copied : copyLabel}
          onclick={() => onCopyPath(copyKey, r.mirthPath)}
        >
          <Icon name={copiedKey === copyKey ? 'check' : 'copy'} />
        </button>
      {/if}
    </td>
  </tr>
{/snippet}

<section bind:this={section} class="segment" id={'seg-' + seg.index} aria-labelledby={headingId}>
  <h2 id={headingId}>
    <span class={'seg-code sc-' + segmentColor(seg.name)} dir="ltr">{seg.name}</span>
    {#if seg.occurrence > 1}<span class="occ">#{seg.occurrence}</span>{/if}
    {#if doc}<span class="seg-title">{pick(doc.title, lang)}</span>{/if}
  </h2>
  {#if doc}
    <p class="seg-summary">{pick(doc.summary, lang)}</p>
    <details class="more">
      <summary>{t.more}</summary>
      <p>{pick(doc.details, lang)}</p>
    </details>
  {:else}
    <p class="hint">{t.noExplanation}</p>
  {/if}

  {#if showTable}
    <div class="table-wrap">
      <!-- The roles keep the table readable for screen readers when the
           phone layout shows each row as a card. -->
      <!-- svelte-ignore a11y_no_redundant_roles -->
      <table class="fields" dir="ltr" role="table">
        <!-- svelte-ignore a11y_no_redundant_roles -->
        <thead role="rowgroup">
          <!-- svelte-ignore a11y_no_redundant_roles -->
          <tr role="row">
            <th role="columnheader" class="col-pos"><bdi>{t.position}</bdi></th>
            <th role="columnheader" class="col-name" {lang} dir={dirFor(lang)}>{t.name}</th>
            <th role="columnheader" class="col-val"><bdi>{t.value}</bdi></th>
            <th role="columnheader" class="col-path"><bdi>{t.mirthPath}</bdi></th>
          </tr>
        </thead>
        <!-- svelte-ignore a11y_no_redundant_roles -->
        <tbody role="rowgroup">
          {#each groups as g (g.field.key)}
            {@const open = g.open || expanded.has(g.field.fieldKey)}
            {@render row(g.field, g, open)}
            {#if open}
              {#each g.parts as p (p.key)}
                {@render row(p, g, open)}
              {/each}
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <div class="table-later" style:min-height={groups.length * 2.25 + 'rem'}></div>
  {/if}
</section>
