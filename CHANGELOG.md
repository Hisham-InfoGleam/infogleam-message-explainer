# Changelog

All notable changes to this project are listed here.

## 0.9.0 - 2026-11-12

First public release.

- Project structure: core package (MPL-2.0) and web page (AGPL-3.0-only).
- Core: parse and rebuild HL7 v2 messages (CR, LF and CRLF), position labels
  and Mirth/OIE paths, masking of common patient fields.
- Web page: explain a message, load a sample, mask patient data, copy the
  masked message, copy Mirth paths, English and Arabic text.
- Made-up sample messages: ADT^A01 and ORU^R01.
- New name: InfoGleam Message Explainer. HL7® is not part of the name.
  Packages are now `@infogleam/message-explainer-core` and
  `@infogleam/message-explainer-web`. The page path is
  `/tools/message-explainer/`.
- Field list from the HL7 Version 2 to FHIR project (Apache-2.0) and our own
  English and Arabic explanations for MSH, EVN, PID, PV1, NK1, ORC, OBR, OBX,
  AL1 and DG1.
- Core: `getSegmentDoc()`, `getFieldDoc()`, `messageVersion()`,
  `compareVersions()`, `versionSupport()` and `fieldVersionWarning()`.
- Web page: message type and version bar, segment titles and summaries,
  field names, usage labels and an explanation panel for each field, with
  version notes, advice from real projects, examples and table codes.
- Web page: Credits page, source code link and HL7's trademark notice in the
  footer.
- Masking now also covers `PID-40` (phone and email, v2.7 and later).
- Made-up sample messages for HL7 v2.2, v2.3, v2.4, v2.5.1, v2.7 and v2.8.
- Message view: the message in colour, one segment per line, with the exact
  characters. Point at a part to see its position and name. Click a field,
  component or sub-component, or use the keyboard, to open its explanation.
- Explanation panel next to the message on wide screens, and a sheet from
  the bottom on narrow screens, with the value, the data type, a Copy Mirth
  path button and the field explanation.
- Component names (for example `PID-5.1` Family Name) from the HL7 Version
  2 to FHIR project's data type tables (Apache-2.0). Core:
  `getComponentDoc()` and `getDataTypeDoc()`, and a script that rebuilds
  the data.
- Field list: components folded under their field, a small copy button for
  Mirth paths, a card layout on phones, and a search box for positions and
  English or Arabic names. Core: `matchesSearch()` and
  `parsePositionQuery()`.
- First screen: three short steps, a "Try a sample" button, Open file and
  drag and drop (read in the browser only), explain on paste and with
  Ctrl+Enter, and a short privacy line.
- InfoGleam symbol in the header and as the tab icon, and the InfoGleam
  colours in light and dark mode. All text passes WCAG AA contrast.
- Arabic text uses Noto Sans Arabic (SIL Open Font License 1.1), bundled
  with the page.
- Long messages (hundreds of segments) stay fast: tables are built when
  they come near the screen.
- Version mode: **Explain as version** next to the version label (Auto from
  `MSH-12`, or 2.3 to 2.9). The "added in" warnings, the warnings for table
  codes and the message checks follow the chosen version. The panel shows
  the data type with a short meaning.
- An optional data file for the field facts of each version from 2.3 to
  2.9 (`hl7-field-history.json`: name, data type, optionality and repeat
  limit). The code works with and without it. Core: `getFieldVersion()`,
  `getFieldHistory()`, `HISTORY_VERSIONS`, `HAS_FIELD_HISTORY`,
  `hasFieldFacts()`, `LATEST_VERSION`, `dataTypeKind()`; `getFieldDoc()`
  and `getComponentDoc()` take an optional version, and
  `FieldDoc.factsVersion` says which version the name and data type are
  from.
- Data fixes after checking the HL7 v2.9 tables: field names with footnote
  marks or a missing space, the v2.9 names and data types of `ORC-4` and
  `ORC-9`, some required and repeat rules, the data types of a few
  withdrawn fields, and the component data types of `EIP` and `RI`. Both
  data files list their corrections.
- Version notes fixed where they disagreed with the HL7 tables (`OBR-29`,
  `OBX-12`, `ORC-4`, `PV1-50`, `PID-35`).
- When the field facts give a field the general data type `CM`, the panel
  shows the part names of the named data type that HL7 gave the field
  later, with a note.
- More tests: data rules for all dictionary files, every field in every
  version, English and Arabic texts that agree, thousands of random
  messages for the parser and the mask, sample rules, unit tests for the
  page logic and texts, a build check (security policy, no network code)
  and browser tests of the built page with Playwright (`npm run test:e2e`).
- A second check against the HL7 tables found and fixed: `OBR-55` Action
  Code (new in v2.9) was missing; the parts of data type `SPS` had old
  names and data types.
- Explanations corrected after the same check: order rules that apply only
  up to v2.6 (`PID-5`, `PID-11`, `NK1-2`, `NK1-4`, `NK1-30`, `NK1-32`,
  `DG1-16`), the coding system rule of `DG1-3` (from v2.6), a new version
  note for `DG1-15` and `EVN-5`, the meaning of code `X` in `OBR-25`, code
  dates in `OBX-11` and `ORC-35`, the `ORM` status in the `MSH-9` tip, and
  version 2.9 in the `MSH-12` codes.
- Message checks: a summary line under the version bar and a list of the
  places where the message does not follow the HL7 rules of the version
  used, in three levels (problem, differs from HL7, note). The checks cover
  the message structure, the version in `MSH-12`, the fields of the ten
  explained segments (past the end, required but empty, repeats; with the
  field facts of older versions also added later, withdrawn and backward
  compatibility only) and the form of `DT`, `TS`, `DTM`, `TM`, `NM` and `SI`
  values. Each item has a "Why?" with the rule and its place in the HL7
  standard, marks in the message view and the field list, a level filter
  and a "Copy the list" button. The list never holds values from the
  message. The parse warnings above the message moved into this list.
  Core: `checkMessage()` and `checkValueFormat()`.
- Parser: a byte order mark (BOM) at the start, and the MLLP frame
  characters (vertical tab at the start, file separator at the end), are
  skipped and kept, so parse then rebuild still gives the exact text. Such
  a message no longer gets the "no MSH" problem. The summary line says when
  these characters were found. Core: `ParsedMessage.frame`.
- Table codes can have an end version (`until`). `OBX-2` codes `CE` and
  `TS` exist only up to v2.5.1. The code table shows "Until v2.5.1", marks
  the code when the version in use is later, and warns when the message
  holds such a code. Core: `fieldVersionWarning()` can return `removed`.
- Licenses and name: README, LICENSES.md, NOTICE and the dictionary README
  now say that HL7 International owns the HL7 v2 standard, and that this
  project's licenses cover only its own work in the data files that hold
  facts from the standard. HL7 is no longer in the page title, and the
  English tagline is now a sentence ("A tool that explains HL7® v2
  messages").
- In this edition the field history file is empty. Field names, data types
  and repeat rules are shown as in HL7 v2.9 for every version, and a short
  note near the version bar says so when another version is used. The page
  shows no version history list and no "withdrawn" tags. The field checks
  run for v2.9 only; for another version the checks panel says so, and the
  other checks still run. Core: `FIELD_CHECKS` and `STATUS_CHECKS`; the
  check result lists the checks that did not run.
- A made-up v2.9 sample, `ADT^A04` (register a patient), with two mistakes
  on purpose to show the field checks: `PID-7` is not a real date and the
  required field `PV1-2` is empty. Apart from these two, it follows HL7
  v2.9.
- First screen: one place for samples. The "Try a sample" and "Load
  sample" buttons are gone. A sample list with a visible label ("No message
  at hand? Try a sample:") is under the action buttons, in two groups
  (patient admission and registration, lab orders and results). Choosing a
  sample loads and explains it at once. When the box holds the user's own
  text, the page asks first (Replace or Cancel). The sample names now say
  what the message is first, then the type and version. **Mask patient
  data** and **Copy masked message** show only when the box holds a
  message. A shorter text box hint and a new intro line. The tip about
  dropping a file is next to the Ctrl+Enter tip, on wide screens only. On a
  phone, **Explain** is as wide as the screen.
