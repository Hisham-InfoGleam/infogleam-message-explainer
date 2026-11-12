<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- Copyright 2026 Hisham Alrashdan (InfoGleam) -->
<script lang="ts">
  // Small line icons. They are decoration only: the button or text next to
  // them carries the meaning, so they are hidden from screen readers.
  type IconName =
    | 'copy'
    | 'check'
    | 'lock'
    | 'file'
    | 'close'
    | 'chevron'
    | 'arrow'
    | 'search'
    | 'problem'
    | 'differs'
    | 'note';

  interface Props {
    name: IconName;
    size?: number;
  }

  let { name, size = 16 }: Props = $props();
</script>

<svg
  class={'icon icon-' + name}
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"
>
  {#if name === 'copy'}
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 4H6a2 2 0 0 0-2 2v10" />
  {:else if name === 'check'}
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  {:else if name === 'lock'}
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  {:else if name === 'file'}
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  {:else if name === 'close'}
    <path d="M6 6l12 12M18 6L6 18" />
  {:else if name === 'chevron'}
    <path d="M9 6l6 6-6 6" />
  {:else if name === 'arrow'}
    <path d="M5 12h14M13 6l6 6-6 6" />
  {:else if name === 'search'}
    <circle cx="11" cy="11" r="6" />
    <path d="M20 20l-4.5-4.5" />
  {:else if name === 'problem'}
    <circle cx="12" cy="12" r="9" />
    <path d="M9 9l6 6M15 9l-6 6" />
  {:else if name === 'differs'}
    <path d="M12 3.5L2.5 20h19z" />
    <path d="M12 10v4.5M12 17.5v.01" />
  {:else if name === 'note'}
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v6M12 7.5v.01" />
  {/if}
</svg>
