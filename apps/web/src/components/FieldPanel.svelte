<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- Copyright 2026 Hisham Alrashdan (InfoGleam) -->
<script lang="ts">
  import { fieldVersionWarning, type FieldDoc } from '@infogleam/message-explainer-core';
  import { dirFor, format, type Lang, type Messages } from '../i18n';
  import { pick, repeatText, typeInfo } from '../lib/text';
  import { codeNotes, codeRemoved, codeUntilTag, fieldStates, stateIndex, type VersionView } from '../lib/versions';

  interface Props {
    doc: FieldDoc;
    lang: Lang;
    t: Messages;
    /** The HL7 version the page explains the message as. */
    ver: VersionView;
    /** Codes in this field (component 1 of each repetition). */
    codes: string[];
    id: string;
    /** Show the data type. The panel header shows it already for a field. */
    showType?: boolean;
  }

  let { doc, lang, t, ver, codes, id, showType = true }: Props = $props();

  const info = $derived(typeInfo(doc, t));
  const addedLater = $derived(fieldVersionWarning(doc, ver.warn) === 'added-later');
  const showSince = $derived((doc.values ?? []).some((v) => v.since));
  // Notes about codes in the message that are not in the version in use.
  const notes = $derived(codeNotes(doc.values ?? [], codes, ver, t));
  // The version history, shown when the field history file has the field
  // and something changed between v2.3 and v2.9. Without it, there is none.
  const states = $derived(fieldStates(doc));
  const current = $derived(stateIndex(doc, states));
</script>

<div class="field-panel" {id} {lang} dir={dirFor(lang)}>
  {#if states.length > 1}
    <div class="fp-block fp-history">
      <strong>{t.versionHistory}</strong>
      <ol class="history">
        {#each states as s, i (s.from)}
          <li class:current={i === current}>
            <bdi class="hist-version" dir="ltr">v{s.from}</bdi>
            <span class="hist-facts">
              <bdi lang="en" dir="ltr" class:changed={s.changed.includes('name')}>{s.name}</bdi>
              (<bdi dir="ltr" class:changed={s.changed.includes('dataType')}>{s.dataType}</bdi>)
              <span class="xp-dot" aria-hidden="true">·</span>
              <span class:changed={s.changed.includes('opt')}>{t.opt[s.opt]}</span>
              {#if s.max !== 1 || s.changed.includes('max')}
                <span class="xp-dot" aria-hidden="true">·</span>
                <span class:changed={s.changed.includes('max')}>{repeatText(s.max, t) || t.singleValue}</span>
              {/if}
              {#if i === current}
                <span class="tag tag-current">{format(t.appliesTo, { version: ver.effective })}</span>
              {/if}
            </span>
          </li>
        {/each}
      </ol>
    </div>
  {/if}

  {#if doc.summary}
    <p class="fp-summary">{pick(doc.summary, lang)}</p>
  {/if}
  {#if doc.details}
    <p>{pick(doc.details, lang)}</p>
  {/if}

  <p class="fp-meta">
    {#if lang === 'ar'}
      <span>{t.hl7Name}: <bdi lang="en">{doc.name}</bdi></span>
    {/if}
    {#if info && showType}
      <span>{t.dataType}: <bdi dir="ltr">{info}</bdi></span>
    {/if}
    {#if showType && doc.opt}
      <span class="tag" class:tag-warn={doc.opt === 'W'} title={format(t.optTitle, { version: ver.effective })}>
        {doc.opt === 'W' ? format(t.withdrawnIn, { version: ver.effective }) : t.opt[doc.opt]}
      </span>
    {/if}
    {#if doc.otherNames}
      <span>{t.otherNames}: <bdi lang="en">{doc.otherNames.join(', ')}</bdi></span>
    {/if}
    {#if doc.since}
      <span class="tag" class:tag-warn={addedLater}>{format(t.addedIn, { since: doc.since })}</span>
    {/if}
  </p>

  {#if addedLater && doc.since && ver.warn}
    <p class="warning" role="note">
      {format(ver.chosen ? t.addedLaterChosen : t.addedLater, { since: doc.since, version: ver.warn })}
    </p>
  {/if}

  {#if doc.versionNote}
    <div class="fp-block">
      <strong>{t.versionNote}</strong>
      <p>{pick(doc.versionNote, lang)}</p>
    </div>
  {/if}

  {#if doc.tip}
    <div class="fp-block fp-tip">
      <strong>{t.tip}</strong> <span class="hint">({t.tipHint})</span>
      <p>{pick(doc.tip, lang)}</p>
    </div>
  {/if}

  {#if doc.example}
    <p>{t.example}: <code dir="ltr">{doc.example}</code></p>
  {/if}

  {#if doc.values}
    <table class="codes">
      <caption>{doc.table ? format(t.codesFrom, { table: doc.table }) : t.codes}</caption>
      <thead>
        <tr>
          <th>{t.code}</th>
          <th>{t.meaning}</th>
          {#if showSince}<th>{t.since}</th>{/if}
        </tr>
      </thead>
      <tbody>
        {#each doc.values as v, i (i)}
          {@const inMessage = codes.includes(v.code)}
          <tr class:current={inMessage}>
            <td><code dir="ltr">{v.code}</code></td>
            <td>
              {lang === 'ar' ? v.ar : v.en}
              {#if v.until}<span class="tag" class:tag-warn={codeRemoved(v, ver)}>{codeUntilTag(v, t)}</span>{/if}
              {#if inMessage}<span class="tag tag-current">{t.inMessage}</span>{/if}
            </td>
            {#if showSince}<td dir="ltr">{v.since ?? ''}</td>{/if}
          </tr>
        {/each}
      </tbody>
    </table>
    {#each notes as note, i (i)}
      <p class="warning" role="note">{note}</p>
    {/each}
  {/if}
</div>
