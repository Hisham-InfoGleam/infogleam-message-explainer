<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- Copyright 2026 Hisham Alrashdan (InfoGleam) -->
<script lang="ts">
  import { HISTORY_VERSIONS, type ParsedMessage } from '@infogleam/message-explainer-core';
  import { format, type Lang, type Messages } from '../i18n';
  import { messageTypeText } from '../lib/text';
  import { AUTO, showsLatestFacts, type VersionView } from '../lib/versions';

  interface Props {
    message: ParsedMessage;
    lang: Lang;
    t: Messages;
    ver: VersionView;
    /** "Explain as version": "auto" or a version. */
    choice: string;
  }

  let { message, lang, t, ver, choice = $bindable() }: Props = $props();

  const msh = $derived(message.segments.find((s) => s.name === 'MSH'));
  const type = $derived(msh?.fields.find((f) => f.position === 9)?.value ?? '');
  const typeText = $derived(messageTypeText(msh, lang));
  const autoLabel = $derived(
    ver.support === 'supported' && ver.message ? format(t.autoFromMsh, { version: ver.message }) : t.autoLatest,
  );
</script>

<div class="info-bar" role="group" aria-label={t.messageInfo}>
  <p>
    <span class="info-label">{t.messageType}:</span>
    <code dir="ltr">{type || '-'}</code>
    {#if typeText}<span class="hint">{typeText}</span>{/if}
  </p>
  <p>
    <span class="info-label">{t.messageVersion}:</span>
    <code dir="ltr">{ver.message ?? '-'}</code>
    <span class={'tag support-' + ver.support}>{t.support[ver.support]}</span>
  </p>
  <p class="explain-as">
    <label for="explain-as">{t.explainAs}</label>
    <select id="explain-as" bind:value={choice}>
      <option value={AUTO}>{autoLabel}</option>
      {#each HISTORY_VERSIONS as v (v)}
        <option value={v}>{v}</option>
      {/each}
    </select>
  </p>
  {#if ver.support === 'older'}
    <p class="info-note">{t.olderNote}</p>
  {:else if ver.support === 'unknown'}
    <p class="info-note">{ver.message ? t.unknownNote : t.noVersion}</p>
  {/if}
  {#if showsLatestFacts(ver)}
    <!-- The tool has no field facts for this version: the page shows the v2.9 ones. -->
    <p class="info-note facts-note" role="note">{format(t.factsNote, { version: ver.factsVersion })}</p>
  {/if}
</div>
