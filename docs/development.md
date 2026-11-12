# Development

## Requirements

- Node.js 20 or later
- npm (the project uses npm workspaces)

## Project layout

| Folder | What it is | License |
| --- | --- | --- |
| `packages/core` | HL7 v2 parsing, rebuilding, masking, paths, versions and the field dictionary. No UI and no network code. | MPL-2.0 (`hl7-fields.json`: Apache-2.0, see NOTICE) |
| `apps/web` | The web page (Svelte 5 + Vite + TypeScript). | AGPL-3.0-only |
| `samples` | Made-up HL7 messages for tests and the page. | MPL-2.0 |
| `brand` | The InfoGleam symbol files used by the page. | All rights reserved (see `brand/README.md`) |
| `docs` | Usage, development and legal pages. | |

## Commands

Run these from the project root:

```sh
npm install          # install packages
npm test             # run the unit tests of core and the web page (Vitest)
npm run check        # type checks (tsc and svelte-check)
npm run dev -w apps/web   # start the dev server
npm run build        # build core and the web page, then check the build
npm run test:e2e     # build, then run the browser tests (Playwright)
```

The built page is in `apps/web/dist`. It is built for the path
`/tools/message-explainer/` (see `base` in `apps/web/vite.config.ts`).

## Tests

There are three kinds of tests.

**Unit tests** (`npm test`). They are fast and need no browser.

| Command | What it runs |
| --- | --- |
| `npm test` | All unit tests of core and the web page. |
| `npm test -w packages/core` | The core tests in `packages/core/test`. |
| `npm test -w apps/web` | The web page tests in `apps/web/test`. |
| `npm test -w packages/core -- fuzz` | Only the test files with "fuzz" in the name. |

The core tests check:

- `data-integrity.test.ts`: rules for all files in `src/dictionary`. For
  example: every field has an explanation (and a history, when the field
  history file has fields), every data type is known, and the code values
  in the explanations are unique.
- `history.test.ts`: the field history file and `getFieldDoc()` with a
  version, with and without fields in the file.
- `version-matrix.test.ts`: every field in every version from 2.3 to 2.9,
  and bad versions such as `2.2` or `abc`.
- `version-detection.test.ts`: the version in `MSH-12`, in many forms.
- `bilingual.test.ts`: the English and Arabic explanations have the same
  codes, numbers, field ids, versions and table numbers.
- `fuzz.test.ts`: thousands of random made-up messages for the parser, the
  rebuild, the mask and the paths. `random-message.ts` builds them from a
  seed, so each run checks the same messages. A failing check names its
  seed.
- `parse-edge.test.ts`: odd input, such as an empty message, a BOM or MLLP
  characters.
- `sample-rules.test.ts`: each sample follows the rules of its HL7 version,
  and its data is clearly made up.
- `checks.test.ts`: the message checks (`checkMessage()`). For each check, a
  made-up message that triggers it and one that does not, in the versions
  where its rule changes, and the samples (no problem and no difference in
  their own version). The field checks use v2.9, and the checks that did
  not run are tested too. `check-messages.ts` builds the clean test
  messages.
- `checks-matrix.test.ts`: every field of every explained segment gives
  exactly one finding for its rule. With the field history, in every
  version (an empty required field, a filled withdrawn or
  backward-compatibility field, a field added later). Without it, each
  required field of v2.9, and no field finding in other versions.
- `checks-random.test.ts`: the checks on the 2,500 random messages never
  throw, point to positions that exist and hold no message values; and a
  message with 3,000 segments is checked in less than 0.2 seconds.

The web tests check the code in `apps/web/src/lib` and the texts in
`apps/web/src/i18n`. `checks.test.ts` checks the message check sentences
in English and Arabic, the folding rule, the marks and the copied list.
`samples.test.ts` checks the sample list: every sample in one of the two
groups, the order by version, the sample names, and the rule for when the
page asks before a sample replaces the text in the box (`isOwnText()`).
`npm run check` also type checks these tests.

**Build check** (part of `npm run build`). After `vite build`,
`apps/web/scripts/check-build.mjs` checks that `dist/index.html` has the
Content Security Policy from `vite.config.ts`, and that no built file
holds network code (`fetch(`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`
or `EventSource`). The build fails if a check fails.

**Browser tests** (`npm run test:e2e`). This command builds the page,
starts `vite preview` on port 4175 and tests the built page in a real
browser with Playwright. Only the build has the security policy, so the
tests never use the dev server. The tests are in `apps/web/e2e`. They
check, for example: the page sends no data, the first screen, the sample
list and the question before a sample replaces the user's text, the
version choice, search, Arabic, masking and copying, the keyboard, phone,
tablet and desktop sizes in light and dark mode (with the contrast of the
first screen's texts), and a message with 3,000 segments.
`checks.spec.ts` tests the message checks: the summary and the list, the
marks, a version change, the texts for checks that did not run, Arabic, a
phone, the copied list and the network. Like the unit tests, the browser
tests hold with and without fields in the field history file.

The tests use a browser that is already installed. They do not download
one. Settings:

| Setting | Default | What it does |
| --- | --- | --- |
| `E2E_BROWSER_CHANNEL` | `msedge` | The browser: `msedge`, `chrome`, or `chromium` (the browser that `npx playwright install chromium` downloads, for example on Linux). |
| `E2E_PORT` | `4175` | The port of the preview server. |
| `E2E_BIG_MESSAGE_MS` | `15000` | The longest time, in milliseconds, to explain the big message. |

To run only some browser tests on a page that is already built:

```sh
npm run test:e2e -w apps/web -- -g "search"
```

To try the built page locally:

```sh
npm run preview -w apps/web
```

## Sample files

The files in `samples/` use a single CR between segments, like real HL7.
`.gitattributes` marks `*.hl7` as `-text`, so git never changes these line
endings. Some editors show CR-only files as one long line. That is normal.

Only use made-up data. See CONTRIBUTING.md.

Each sample has a test case in `packages/core/test/samples.test.ts`. The
test fails if a new file in `samples/` has no test case.

The page lists the samples in `apps/web/src/lib/samples.ts`. A new sample
also needs:

- a place in one of the two groups of `SAMPLE_GROUPS` (patient admission
  and registration, or lab orders and results), in version order;
- a name in `en.json` and `ar.json`: plain words first, then the type and
  the version, for example `Patient admit (ADT^A01, v2.3)`.

`apps/web/test/samples.test.ts` checks both.

| File | HL7 version | What it shows |
| --- | --- | --- |
| `v22-adt-a01.hl7` | 2.2 | An older version. The page shows a note. |
| `v23-adt-a01.hl7` | 2.3 | `MSH-9` with two components, `EVN-1`, `PID-2`, `PID-13`. `EVN-7` (added in v2.4) is filled on purpose, to show the version warning. |
| `v24-orm-o01.hl7` | 2.4 | An order with the priority in `ORC-7` and `OBR-27`. |
| `adt-a01.hl7` | 2.5.1 | A patient admit. |
| `oru-r01.hl7` | 2.5.1 | A lab result with a note (`NTE`). |
| `v251-oru-r01.hl7` | 2.5.1 | `OBR-14`, `OBR-15` and `OBX-8` flags. |
| `v27-oru-r01.hl7` | 2.7 | The truncation character in `MSH-2` (`^~\&#`) and coded values with text. |
| `v28-adt-a08.hl7` | 2.8 | Phone and email in `PID-40`. |
| `v29-adt-a04.hl7` | 2.9 | A patient registration (`ADT^A04`) with two mistakes on purpose, to show the field checks: `PID-7` is not a real date (31 February), and the required field `PV1-2` is empty. Apart from these two, the message follows HL7 v2.9. |

## Field dictionary

`packages/core/src/dictionary/` holds the field list (`hl7-fields.json`), the
component names of the data types (`hl7-datatypes.json`), an optional file
for the field facts of each version (`hl7-field-history.json`) and one
explanation file per segment (`explanations/<SEG>.json`).
`npm run build:datatypes -w packages/core` rebuilds `hl7-datatypes.json` from
HL7's source files.
`packages/core/test/dictionary.test.ts` checks the shape and length of every
explanation, and `version-notes.test.ts` checks the version numbers in the
version notes. See the README in that folder for sources and licenses.

### The field history file

`hl7-field-history.json` can hold, for each field, the name, data type,
optionality and repeat limit in each version from 2.3 to 2.9. It is empty in
this edition (no fields). The code works with and without fields in it:

- `HAS_FIELD_HISTORY` (in `packages/core/src/history.ts`) is true when the
  file has fields.
- `hasFieldFacts(version)` says whether the tool has the field facts of a
  version. Without fields in the file, that is v2.9 only, from
  `hl7-fields.json`.
- `getFieldDoc(segment, field, version)` then gives the v2.9 name, data type
  and repeat rule, with `factsVersion: "2.9"`. Whether the field exists in
  the version comes from the explanation (`since`). The page shows a note
  near the version bar when it shows the v2.9 facts for another version.
- The field checks (F and D) run only for a version with field facts. For
  v2.9 without the file, the checks that need to know whether a field is
  withdrawn, not used or kept for backward compatibility (F3, F4, F5) do not
  run. The check result lists the checks that did not run (`skipped`).

Tests that need fields in the file run only when it has them
(`it.runIf(HAS_FIELD_HISTORY)`), and tests of the empty file run only when
it is empty. So `npm test` passes in both cases.

The whole dictionary is bundled into the page (about 160 kB of
gzip-compressed JavaScript in total). If the page grows past about 250 kB
gzip, load the explanation files per segment with `import()`. The Arabic
font adds two font files (about 100 kB together) that the browser loads only
when it shows Arabic text.

## Content Security Policy

The production build adds this `<meta>` tag to `index.html`:

```text
default-src 'self'; connect-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; form-action 'none'
```

- `connect-src 'none'` stops the page from sending data to any server.
- `style-src 'unsafe-inline'` is allowed for styles only. Scripts are never
  inline.
- The dev server does not get this tag, because hot reload needs a
  websocket connection.

When you host the page, also send the policy as an HTTP header. A header
can add `frame-ancestors`, which a `<meta>` tag cannot. Example for Nginx:

```nginx
location /tools/message-explainer/ {
    add_header Content-Security-Policy "default-src 'self'; connect-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer" always;
}
```

If you change the policy, change it in `apps/web/vite.config.ts` and here.

## Source file headers

Every source file starts with a license line and a copyright line.

- In `packages/core`: `SPDX-License-Identifier: MPL-2.0`
- In `apps/web`: `SPDX-License-Identifier: AGPL-3.0-only`
