<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- Copyright 2026 Hisham Alrashdan (InfoGleam) -->
<script lang="ts">
  import {
    checkMessage,
    HAS_FIELD_HISTORY,
    maskMessage,
    messageVersion,
    parseMessage,
    serializeMessage,
    terminatorName,
    type ParsedMessage,
  } from '@infogleam/message-explainer-core';
  import { tick } from 'svelte';
  // The InfoGleam symbol (all rights reserved, see brand/README.md).
  import SYMBOL from '../../../brand/infogleam-symbol.svg?raw';
  import ChecksPanel from './components/ChecksPanel.svelte';
  import ExplainPanel from './components/ExplainPanel.svelte';
  import Icon from './components/Icon.svelte';
  import MessageInfo from './components/MessageInfo.svelte';
  import MessageView from './components/MessageView.svelte';
  import SegmentBlock from './components/SegmentBlock.svelte';
  import { dirFor, format, messagesFor, type Lang } from './i18n';
  import { checkItems, checkVersion, fieldMarks, viewMarks, withoutTextBoxEnds } from './lib/checks';
  import { LEGAL, LEGAL_PAGES, type LegalPage } from './lib/legal';
  import { filterGroups, maskKey, segmentGroups } from './lib/rows';
  import { isOwnText, isSampleId, SAMPLE_GROUPS, SAMPLES, type SampleId } from './lib/samples';
  import { fieldKeyOf, partInfo, partKey, type Selection } from './lib/selection';
  import { HL7_NOTICE, SITE_LINK, SITE_URL, SOURCE_URL } from './lib/site';
  import { AUTO, versionView } from './lib/versions';

  // Two columns (message and explanation side by side) from this width.
  // Keep in sync with the media queries in app.css.
  const WIDE = '(min-width: 1100px)';

  let lang = $state<Lang>('en');
  const t = $derived(messagesFor(lang));

  let input = $state('');
  // True when the text came from a file or a sample, with its exact
  // characters. Typing or pasting in the text box turns CR into LF.
  let exactText = $state(false);
  let parsed = $state<ParsedMessage | null>(null);
  // exactText at the time of the last Explain.
  let parsedExact = $state(false);
  // Changes on each new Explain, so the field lists start fresh.
  let run = $state(0);
  let maskedKeys = $state(new Set<string>());
  let status = $state('');
  let copiedKey = $state('');
  // The sample list: its value ('' shows "Choose a sample…"), the sample
  // that is in the text box unchanged (null after the user typed, pasted,
  // opened a file or masked), and a sample that waits for a yes because the
  // box holds the user's own text.
  let samplePick = $state('');
  let loadedSample = $state<SampleId | null>(null);
  let pendingSample = $state<SampleId | null>(null);
  let sampleSelect = $state<HTMLSelectElement>();
  let replaceCancel = $state<HTMLButtonElement>();
  let fileInput = $state<HTMLInputElement>();
  // True while a file is dragged over the text box.
  let dragging = $state(false);

  // The part shown in the explanation panel, and the element that opened it.
  let selection = $state<Selection | null>(null);
  // Fields whose components are unfolded in the field list ("3:5").
  let expanded = $state(new Set<string>());
  // Search text for the field list.
  let query = $state('');
  // "Explain as version": Auto (from MSH-12) or a version the user picked.
  // Not stored; each new message starts with Auto.
  let versionChoice = $state(AUTO);
  let opener: HTMLElement | null = null;
  let panel = $state<HTMLElement>();
  let wide = $state(window.matchMedia(WIDE).matches);

  let hash = $state(location.hash);
  const page = $derived<LegalPage | null>(LEGAL_PAGES.find((p) => hash === '#/' + p) ?? null);

  const ver = $derived(versionView(parsed ? messageVersion(parsed) : undefined, versionChoice));
  const selectedKey = $derived(selection ? partKey(selection) : '');
  const groups = $derived(parsed ? parsed.segments.map((s) => segmentGroups(s, ver.effective)) : []);
  const filtered = $derived(groups.map((g) => filterGroups(g, query)));
  const searching = $derived(query.trim() !== '');
  const matchCount = $derived(filtered.reduce((sum, f) => sum + f.matches, 0));
  const matchText = $derived.by(() => {
    if (!searching) return '';
    if (matchCount === 0) return t.noMatches;
    return matchCount === 1 ? t.matchesOne : format(t.matchesMany, { count: matchCount });
  });
  // Message checks: they run again when the message or the version changes.
  // Without a supported or picked version, only the checks that need no
  // version run (see checkVersion).
  // For typed or pasted text, the segment ends come from the text box, so
  // S4 and S5 are left out (see withoutTextBoxEnds).
  const checks = $derived.by(() => {
    if (!parsed) return null;
    const result = checkMessage(parsed, checkVersion(ver));
    return parsedExact ? result : withoutTextBoxEnds(result);
  });
  const items = $derived(checks && parsed ? checkItems(checks, parsed, t, lang) : []);
  const marks = $derived(parsed ? viewMarks(items, parsed, t) : new Map());
  const listMarks = $derived(fieldMarks(items, t));
  // On narrow screens the panel is a sheet at the bottom of the screen.
  const sheetOpen = $derived(selection !== null && !wide && page === null);

  $effect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dirFor(lang);
  });

  $effect(() => {
    const onHash = () => (hash = location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  });

  $effect(() => {
    const mq = window.matchMedia(WIDE);
    const update = () => (wide = mq.matches);
    mq.addEventListener('change', update);
    window.addEventListener('resize', update);
    return () => {
      mq.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  });

  $effect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selection && !e.defaultPrevented) closePanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function hasInput(): boolean {
    if (input.trim() !== '') return true;
    status = t.noMessage;
    return false;
  }

  function explain() {
    if (!hasInput()) return;
    parsed = parseMessage(input);
    parsedExact = exactText;
    run++;
    maskedKeys = new Set();
    selection = null;
    opener = null;
    expanded = new Set();
    query = '';
    versionChoice = AUTO;
    status = '';
  }

  /** Put a sample in the text box and explain it. */
  function useSample(id: SampleId) {
    input = SAMPLES[id];
    exactText = true;
    loadedSample = id;
    samplePick = id;
    pendingSample = null;
    explain();
  }

  /**
   * The text box no longer holds an unchanged sample: the list shows
   * "Choose a sample…" again, and a waiting question goes away.
   */
  function forgetSample() {
    loadedSample = null;
    samplePick = '';
    pendingSample = null;
  }

  /** A sample was chosen in the list. Ask first when the box holds the user's own text. */
  async function onSampleChange() {
    const id = samplePick;
    if (!isSampleId(id)) {
      pendingSample = null;
      return;
    }
    if (isOwnText(input, loadedSample)) {
      pendingSample = id;
      await tick();
      // The safe choice gets the focus, so Enter does not replace the text.
      replaceCancel?.focus();
      return;
    }
    useSample(id);
  }

  function confirmReplace() {
    if (pendingSample) useSample(pendingSample);
    sampleSelect?.focus();
  }

  function cancelReplace() {
    pendingSample = null;
    samplePick = '';
    sampleSelect?.focus();
  }

  function onReplaceKey(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    // Escape answers the question; it must not also close the panel.
    e.preventDefault();
    e.stopPropagation();
    cancelReplace();
  }

  // Explain right away when a pasted text looks like an HL7 message.
  function onPaste(e: ClipboardEvent) {
    const text = e.clipboardData?.getData('text') ?? '';
    if (text.includes('MSH|')) setTimeout(explain, 0);
  }

  function onInputKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      explain();
    }
  }

  /** Read a file in the browser. Nothing is uploaded. */
  function readFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      input = typeof reader.result === 'string' ? reader.result : '';
      exactText = true;
      forgetSample();
      explain();
    };
    reader.onerror = () => {
      status = t.fileError;
    };
    reader.readAsText(file);
  }

  function onFileChosen(e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    const file = el.files?.[0];
    if (file) readFile(file);
    el.value = '';
  }

  function hasFiles(e: DragEvent): boolean {
    return Array.from(e.dataTransfer?.types ?? []).includes('Files');
  }

  function onDragOver(e: DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    dragging = true;
  }

  function onDrop(e: DragEvent) {
    dragging = false;
    if (!hasFiles(e)) return;
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (file) readFile(file);
  }

  function mask() {
    if (!hasInput()) return;
    const result = maskMessage(parseMessage(input));
    parsed = result.message;
    input = serializeMessage(result.message);
    // The masked text is no longer the sample as it was loaded.
    if (input !== (loadedSample ? SAMPLES[loadedSample] : '')) forgetSample();
    maskedKeys = new Set(result.changes.map((c) => maskKey(c.segmentIndex, c.field)));
    // Masking can remove components, so the selected part may be gone.
    if (selection && !partInfo(result.message, selection, ver.effective)) selection = null;
    status =
      result.changes.length > 0
        ? format(t.maskedSummary, { count: result.changes.length })
        : t.maskedNone;
  }

  async function copyText(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  async function copyMasked() {
    if (!hasInput()) return;
    const masked = serializeMessage(maskMessage(parseMessage(input)).message);
    status = (await copyText(masked)) ? t.maskedCopied : t.copyFailed;
  }

  async function copyPath(key: string, path: string) {
    if (await copyText(path)) {
      copiedKey = key;
      setTimeout(() => {
        if (copiedKey === key) copiedKey = '';
      }, 1500);
    } else {
      status = t.copyFailed;
    }
  }

  async function select(sel: Selection, from: HTMLElement) {
    selection = sel;
    opener = from;
    // Show a selected component in the field list too.
    if (sel.comp !== undefined && !expanded.has(fieldKeyOf(sel))) {
      expanded = new Set(expanded).add(fieldKeyOf(sel));
    }
    await tick();
    // Start each explanation at its top.
    if (panel) panel.scrollTop = 0;
    // On narrow screens the sheet slides up: move focus into it.
    if (!wide) panel?.focus();
  }

  function closePanel() {
    const focusInPanel = panel?.contains(document.activeElement) ?? false;
    selection = null;
    if ((focusInPanel || !wide) && opener?.isConnected) opener.focus();
    opener = null;
  }

  function toggleParts(fieldKey: string) {
    const next = new Set(expanded);
    if (!next.delete(fieldKey)) next.add(fieldKey);
    expanded = next;
  }

  function onSearchKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && query !== '') {
      e.preventDefault();
      e.stopPropagation();
      query = '';
    }
  }

  function toggleLang() {
    lang = lang === 'en' ? 'ar' : 'en';
  }
</script>

<div class="page" class:sheet-open={sheetOpen}>
  <header>
    <div class="title-row">
      <!-- The symbol links to the InfoGleam website; the name and tagline
           link to the start of the tool. -->
      <div class="brand">
        <a
          class="brand-logo"
          href={SITE_LINK.href}
          target={SITE_LINK.target}
          rel={SITE_LINK.rel}
          aria-label={`${t.siteLogo} ${t.newTab}`}
        >
          <span class="brand-symbol" aria-hidden="true">{@html SYMBOL}</span>
        </a>
        <h1>
          <a class="brand-text" href="#/">
            <span dir="ltr">{t.appName}</span>
            <span class="tagline">{t.tagline}</span>
          </a>
        </h1>
      </div>
      <div class="header-links">
        <a class="site-link" href={SITE_LINK.href} target={SITE_LINK.target} rel={SITE_LINK.rel}>
          {t.siteLink}<Icon name="arrow" size={14} /><span class="sr-only">{` ${t.newTab}`}</span>
        </a>
        <button type="button" class="lang-btn" onclick={toggleLang} lang={lang === 'en' ? 'ar' : 'en'}>
          {t.language}
        </button>
      </div>
    </div>
    <p class="intro">{t.intro}</p>
  </header>

  {#if page}
    <main class="legal">
      <p><a href="#/">{t.back}</a></p>
      {#if t.legalEnglishOnly}
        <p class="hint">{t.legalEnglishOnly}</p>
      {/if}
      <article lang="en" dir="ltr">
        {#each LEGAL[page] as block, i (i)}
          {#if block.kind === 'h1'}
            <h2>{block.text}</h2>
          {:else if block.kind === 'h2'}
            <h3>{block.text}</h3>
          {:else if block.kind === 'p'}
            <p>{block.text}</p>
          {:else if block.kind === 'ul'}
            <ul>
              {#each block.items as item, j (j)}<li>{item}</li>{/each}
            </ul>
          {:else if block.kind === 'ol'}
            <ol>
              {#each block.items as item, j (j)}<li>{item}</li>{/each}
            </ol>
          {/if}
        {/each}
        {#if page === 'credits'}
          <p>Source code and license files: <a href={SOURCE_URL} rel="noopener">{SOURCE_URL}</a></p>
        {/if}
      </article>
      {#if page === 'credits'}
        <section class="how-built">
          <h3>{t.howBuiltTitle}</h3>
          <p>{t.howBuilt}</p>
        </section>
      {/if}
    </main>
  {:else}
    <main>
      {#if !parsed}
        <section class="start" aria-label={t.steps}>
          <!-- svelte-ignore a11y_no_redundant_roles -->
          <ol class="steps" role="list">
            <li><span class="step-num">1</span>{t.step1}</li>
            <li><span class="step-num">2</span>{t.step2}</li>
            <li><span class="step-num">3</span>{t.step3}</li>
          </ol>
        </section>
      {/if}

      <p class="notice" role="note">{t.notice}</p>

      <div class="input-head">
        <label for="message">{t.inputLabel}</label>
        <button type="button" class="with-icon" onclick={() => fileInput?.click()}>
          <Icon name="file" />
          {t.openFile}
        </button>
        <input bind:this={fileInput} type="file" accept=".hl7,.txt,.dat,.msg" hidden onchange={onFileChosen} />
      </div>
      <div class="drop-zone" class:dragging>
        <textarea
          id="message"
          dir="ltr"
          spellcheck="false"
          autocomplete="off"
          placeholder={t.placeholder}
          aria-keyshortcuts="Control+Enter Meta+Enter"
          bind:value={input}
          oninput={() => {
            exactText = false;
            forgetSample();
          }}
          onpaste={onPaste}
          onkeydown={onInputKey}
          ondragenter={onDragOver}
          ondragover={onDragOver}
          ondragleave={() => (dragging = false)}
          ondrop={onDrop}
        ></textarea>
        {#if dragging}
          <div class="drop-overlay" aria-hidden="true">{t.dropFile}</div>
        {/if}
      </div>
      <!-- Tips for wide screens: phones hide them (see app.css). -->
      <p class="privacy">
        <Icon name="lock" />
        <span>{t.privacyLine}</span>
        <span class="shortcut">{t.shortcutHint}</span>
        <span class="shortcut">{t.dropHint}</span>
      </p>

      <!-- Things to do with the message. Mask and Copy need a message. -->
      <div class="actions">
        <button
          type="button"
          class="primary"
          aria-keyshortcuts="Control+Enter Meta+Enter"
          title={t.shortcutHint}
          onclick={explain}>{t.explain}</button
        >
        {#if input.trim() !== ''}
          <button type="button" onclick={mask}>{t.mask}</button>
          <button type="button" onclick={copyMasked}>{t.copyMasked}</button>
        {/if}
      </div>

      {#if status}
        <p class="status" role="status">{status}</p>
      {/if}
      <p class="sr-only" role="status">{copiedKey ? t.copied : ''}</p>

      <!-- Another way to get a message in: a made-up sample. Choosing one
           loads and explains it; the user's own text is never replaced
           without a yes. -->
      <div class="sample-line">
        <label for="sample-pick">{t.samplePrompt}</label>
        <select id="sample-pick" bind:this={sampleSelect} bind:value={samplePick} onchange={onSampleChange}>
          <option value="">{t.samplePlaceholder}</option>
          {#each SAMPLE_GROUPS as group (group.id)}
            <optgroup label={t.sampleGroups[group.id]}>
              {#each group.ids as id (id)}
                <option value={id}>{t.samples[id]}</option>
              {/each}
            </optgroup>
          {/each}
        </select>
      </div>
      {#if pendingSample}
        <div class="sample-confirm" role="group" aria-labelledby="sample-confirm-text">
          <p id="sample-confirm-text">{t.sampleReplace}</p>
          <div class="sample-confirm-buttons">
            <button type="button" onclick={confirmReplace} onkeydown={onReplaceKey}>{t.sampleReplaceYes}</button>
            <button type="button" bind:this={replaceCancel} onclick={cancelReplace} onkeydown={onReplaceKey}>
              {t.sampleReplaceNo}
            </button>
          </div>
        </div>
      {/if}

      {#if parsed}
        <section class="result">
          <MessageInfo message={parsed} {lang} {t} {ver} bind:choice={versionChoice} />
          {#if checks}
            <ChecksPanel result={checks} {items} {lang} {t} narrow={!wide} onSelect={select} onCopy={copyText} />
          {/if}
          <p class="summary">
            {format(t.summary, {
              count: parsed.segments.length,
              terminator: terminatorName(parsed.terminator),
              field: parsed.delimiters.field,
              encoding: parsed.delimiters.encodingCharacters,
            })}
            {#if parsed.terminator === '\n'}
              <span class="hint">{t.textBoxNote}</span>
            {/if}
            {#if parsed.frame.bom}
              <span class="hint">{t.bomNote}</span>
            {/if}
            {#if parsed.frame.mllp}
              <span class="hint">{t.mllpNote}</span>
            {/if}
          </p>

          <div class="workspace">
            <div class="work-main">
              <h2 class="block-title">{t.messageView}</h2>
              <MessageView
                message={parsed}
                {lang}
                {t}
                version={ver.effective}
                {maskedKeys}
                {selection}
                onSelect={select}
                {marks}
              />

              <nav class="segments" aria-label={t.segment}>
                {#each parsed.segments as seg, i (seg.index)}
                  <a
                    href={'#seg-' + seg.index}
                    class:dim={searching && filtered[i]?.groups.length === 0}
                    onclick={(e) => {
                      e.preventDefault();
                      document.getElementById('seg-' + seg.index)?.scrollIntoView();
                    }}>{seg.name}</a
                  >
                {/each}
              </nav>

              <div class="field-search" role="search">
                <label for="field-search">{t.searchLabel}</label>
                <div class="search-row">
                  <input
                    id="field-search"
                    type="search"
                    dir="auto"
                    autocomplete="off"
                    spellcheck="false"
                    placeholder={t.searchPlaceholder}
                    aria-describedby="search-count"
                    bind:value={query}
                    onkeydown={onSearchKey}
                  />
                  <span id="search-count" class="search-count" role="status">{matchText}</span>
                </div>
              </div>
              <p class="hint">{t.emptyHidden}</p>

              {#each parsed.segments as seg, i (run + ':' + seg.index)}
                {@const shown = filtered[i]?.groups ?? []}
                {#if !searching || shown.length > 0}
                  <SegmentBlock
                    {seg}
                    groups={shown}
                    {lang}
                    {t}
                    {ver}
                    {maskedKeys}
                    {expanded}
                    onToggle={toggleParts}
                    {copiedKey}
                    onCopyPath={copyPath}
                    {selectedKey}
                    onSelect={select}
                    eager={i < 12}
                    marks={listMarks}
                  />
                {/if}
              {/each}

              <!-- Another version changes the names only when the tool has the field history. -->
              <p class="hint names-note">
                {format(t.namesNote, { version: ver.factsVersion })}
                {#if HAS_FIELD_HISTORY}{t.namesPick}{/if}
                {t.componentNamesNote}
              </p>
            </div>

            <aside
              bind:this={panel}
              class="explain"
              class:open={selection !== null}
              tabindex="-1"
              aria-label={t.explanation}
            >
              <ExplainPanel
                message={parsed}
                {selection}
                {lang}
                {t}
                {ver}
                {maskedKeys}
                {copiedKey}
                onCopyPath={copyPath}
                onClose={closePanel}
              />
            </aside>
          </div>
        </section>
      {/if}
    </main>
  {/if}

  <footer>
    <p>{t.footerLegal}</p>
    <p lang="en" dir="ltr">{HL7_NOTICE}</p>
    <p dir="ltr">{t.appName} · <a href={SITE_URL} rel="noopener">{SITE_URL}</a></p>
    <p>
      <a href="#/terms">{t.terms}</a> ·
      <a href="#/privacy">{t.privacy}</a> ·
      <a href="#/credits">{t.credits}</a> ·
      <a href={SOURCE_URL} rel="noopener">{t.sourceCode}</a>
    </p>
  </footer>
</div>
