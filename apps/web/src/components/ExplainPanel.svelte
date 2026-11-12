<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- Copyright 2026 Hisham Alrashdan (InfoGleam) -->
<script lang="ts">
  import { dataTypeKind, partNamesType, type ParsedMessage } from '@infogleam/message-explainer-core';
  import { format, type Lang, type Messages } from '../i18n';
  import { maskKey } from '../lib/rows';
  import { partInfo, type Selection } from '../lib/selection';
  import { fieldName, repeatText, splitTemplate } from '../lib/text';
  import { laterValues, type VersionView } from '../lib/versions';
  import FieldPanel from './FieldPanel.svelte';
  import Icon from './Icon.svelte';

  interface Props {
    message: ParsedMessage;
    selection: Selection | null;
    lang: Lang;
    t: Messages;
    /** The HL7 version the page explains the message as. */
    ver: VersionView;
    maskedKeys: Set<string>;
    copiedKey: string;
    onCopyPath: (key: string, path: string) => void;
    onClose: () => void;
  }

  let { message, selection, lang, t, ver, maskedKeys, copiedKey, onCopyPath, onClose }: Props = $props();

  const COPY_KEY = 'panel';

  // An empty field past the end of its segment can be selected from the message checks.
  const info = $derived(selection ? partInfo(message, selection, ver.effective, { emptyField: true }) : undefined);
  const isPart = $derived(info?.sel.comp !== undefined);
  const isSub = $derived(info?.sel.sub !== undefined);
  // Name of the selected component or sub-component (English, HL7 v2.9).
  const partDoc = $derived(isSub ? info?.subDoc : info?.compDoc);
  const fieldTitle = $derived(info?.fieldDoc ? fieldName(info.fieldDoc, lang) : '');
  const doc = $derived(info?.fieldDoc);
  // Later names and data types of the field, after the version shown.
  const laterNames = $derived(doc && !isPart ? laterValues(doc, 'name') : []);
  const laterTypes = $derived(doc && !isPart ? laterValues(doc, 'dataType') : []);
  const typeCode = $derived(isPart ? (partDoc?.dataType ?? '') : (doc?.dataType ?? ''));
  const typeMeaning = $derived(Object.hasOwn(t.typeGloss, typeCode) ? t.typeGloss[typeCode as keyof Messages['typeGloss']] : '');
  const repeat = $derived(doc && !isPart ? repeatText(doc.max, t) : '');
  // The field has components in this message, or a component is selected.
  const hasParts = $derived(
    isPart ||
      (info?.field.repetitions.some((r) => r.components.length > 1 || r.components.some((c) => c.subComponents.length > 1)) ??
        false),
  );
  // Where the part names come from. For a field with the general data type
  // CM they come from the named data type that HL7 gave the field later.
  const partTypes = $derived(doc && hasParts ? partNamesType(doc.segment, doc.field, doc.version) : undefined);
  const noNames = $derived(
    doc && hasParts && !partTypes?.from && dataTypeKind(doc.dataType) === 'unknown' ? doc.dataType : '',
  );
  const masked = $derived(info ? maskedKeys.has(maskKey(info.sel.seg, info.sel.field)) : false);
</script>

{#snippet later(template: string, slot: string, value: string, from: string)}
  {@const [before, after] = splitTemplate(template, slot)}
  {format(before, { version: from })}<bdi lang="en" dir="ltr">{value}</bdi>{format(after, { version: from })}
{/snippet}

{#if info}
  <div class="xp-head">
    <h2 class="xp-title" id="xp-title">
      <bdi class="xp-pos" dir="ltr">{info.path.label}</bdi>
      {#if isPart && partDoc}
        <span class="xp-dot" aria-hidden="true">·</span>
        <bdi lang="en" dir="ltr">{partDoc.name}</bdi>
      {:else if !isPart && fieldTitle}
        <span class="xp-dot" aria-hidden="true">·</span>
        <bdi>{fieldTitle}</bdi>
      {/if}
      {#if isPart}
        <span class="xp-partof">
          — {t.partOf}
          {#if isSub}
            <bdi dir="ltr">{info.compLabel}</bdi>
            {#if info.compDoc}<bdi lang="en" dir="ltr">{info.compDoc.name}</bdi>{/if}
          {:else}
            <bdi dir="ltr">{info.fieldLabel}</bdi>
            {#if fieldTitle}<bdi>{fieldTitle}</bdi>{/if}
          {/if}
        </span>
      {/if}
    </h2>
    <button type="button" class="icon-btn xp-close" aria-label={t.closePanel} title={t.closePanel} onclick={onClose}>
      <Icon name="close" size={18} />
    </button>
  </div>

  {#if laterNames.length > 0}
    <p class="xp-later">
      {#each laterNames as c, i (c.from)}
        {@render later(i === 0 ? t.calledFrom : t.calledThen, 'name', `"${c.value}"`, c.from)}
      {/each}
    </p>
  {/if}

  {#if (!isPart && (doc?.usage || doc?.opt || repeat)) || typeCode || masked}
    <p class="xp-meta">
      {#if !isPart && doc?.usage}
        <span class={'tag usage-' + doc.usage} title={t.usageTitle}>{t.usage[doc.usage]}</span>
      {/if}
      {#if !isPart && doc?.opt}
        <span
          class="tag"
          class:tag-warn={doc.opt === 'W'}
          title={format(t.optTitle, { version: ver.effective })}
          >{doc.opt === 'W' ? format(t.withdrawnIn, { version: ver.effective }) : t.opt[doc.opt]}</span
        >
      {/if}
      {#if repeat}
        <span class="tag">{repeat}</span>
      {/if}
      {#if typeCode}
        <span>
          {t.dataType}:
          <bdi dir="ltr">{typeCode}</bdi>{#if typeMeaning}&nbsp;({typeMeaning}){/if}
          {#each laterTypes as c (c.from)}
            <span class="xp-dot" aria-hidden="true">·</span>
            {@render later(t.typeFrom, 'type', c.value, c.from)}
          {/each}
        </span>
      {/if}
      {#if masked}
        <span class="badge">{t.maskedBadge}</span>
      {/if}
    </p>
  {/if}
  {#if doc && partTypes?.from}
    <p class="hint xp-note">
      {format(t.laterPartNames, {
        later: partTypes.dataType,
        from: partTypes.from,
        version: ver.effective,
        type: doc.dataType,
      })}
    </p>
  {:else if noNames}
    <p class="hint xp-note">{format(t.noComponentNames, { type: noNames })}</p>
  {/if}

  <div class="xp-block">
    <h3 class="xp-label">{t.valueInMessage}</h3>
    {#if info.value !== ''}
      <pre class="xp-value" dir="ltr">{info.value}</pre>
    {:else}
      <p class="hint">{t.emptyValue}</p>
    {/if}
  </div>

  {#if info.path.mirthPath}
    <div class="xp-block">
      <h3 class="xp-label">{t.mirthPath}</h3>
      <code class="xp-path" dir="ltr">{info.path.mirthPath}</code>
      <button type="button" class="xp-copy" onclick={() => onCopyPath(COPY_KEY, info.path.mirthPath)}>
        <Icon name={copiedKey === COPY_KEY ? 'check' : 'copy'} />
        {copiedKey === COPY_KEY ? t.copied : t.copyMirth}
      </button>
    </div>
  {/if}

  {#if isPart}
    {#if partDoc}
      <p class="hint xp-note">{t.componentNamesNote}</p>
    {/if}
    {#if info.fieldDoc}
      <h3 class="xp-about">
        {t.aboutField} <bdi dir="ltr">{info.fieldLabel}</bdi>
        {#if fieldTitle}<bdi>{fieldTitle}</bdi>{/if}
      </h3>
    {/if}
  {/if}

  {#if info.fieldDoc}
    <FieldPanel doc={info.fieldDoc} {lang} {t} {ver} codes={info.codes} id="xp-field" showType={isPart} />
  {:else}
    <p class="hint">{t.noExplanation}</p>
  {/if}
{:else}
  <p class="xp-empty">{t.panelEmpty}</p>
{/if}
