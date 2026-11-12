# InfoGleam Message Explainer

InfoGleam Message Explainer is a free tool that explains HL7® v2 messages in
plain words. You paste a message, and the tool shows each segment and field
with its position (for example `PID-5`), its name, a short explanation and the
matching Mirth Connect / OIE path. Click any part of the message to see what
it means. It can also mask common patient identifiers. Everything runs in
your web browser. Nothing is sent to a server.

**Status: Early development — not released yet.**

## Disclaimer

For learning and testing only. Explanations may contain mistakes. Check against
the official HL7 standard and test before using anything in production. Do not
paste real patient data unless your organization allows it.

The tool is not a medical device and is not for clinical decisions. See
[docs/legal/terms.md](docs/legal/terms.md).

## Features

Working now:

- Read HL7 v2 messages with CR, LF or CRLF segment endings
- Paste a message, open a file or drop it on the text box. Pasting a
  message or pressing Ctrl+Enter explains it right away
- Message view: the message in colour, exactly as it is. Point at any part
  to see its position and name; click it (or use the keyboard) to open its
  explanation
- Explanation panel next to the message on wide screens, and a sheet from
  the bottom on phones
- Show segments, fields, repetitions, components and sub-components
- Component names, for example `PID-5.1` Family Name, from HL7's data type
  tables (HL7 v2.9 names, English only)
- Position labels such as `PID-5.1` and Mirth/OIE paths such as
  `msg['PID']['PID.5']['PID.5.1']`
- Show the message type (`MSH-9`) and the HL7 version (`MSH-12`), with a note
  when the version is old or unknown
- Explain a message as any HL7 version from 2.3 to 2.9: Auto follows
  `MSH-12`, or pick a version. The warnings and the message checks follow
  that version. Field names, data types and repeat rules are shown as in
  HL7 v2.9, with a note when another version is used
- Explain 10 common segments (`MSH`, `EVN`, `PID`, `PV1`, `NK1`, `ORC`, `OBR`,
  `OBX`, `AL1`, `DG1`) and their fields, in English and Arabic: field name,
  meaning, version notes, advice from real projects, examples, data type and
  common table codes
- Warn when a field or a table code is newer than the chosen version, and
  when a table code was removed before it
- Message checks: a list of the places where the message does not follow
  the HL7 rules, each with the reason and where the rule is in the
  standard. The checks of the structure (encoding characters, escape
  sequences, segment names and ends, the version) follow the chosen
  version. The field checks (required fields, repeats, fields past the end,
  dates, times and numbers) are for HL7 v2.9. The list never holds values
  from the message, so it is safe to copy into a ticket
- Find a field by position (`PID-3`, `pid 3`), by English name (the HL7
  v2.9 name) or by Arabic name
- Components folded under their field, and a card layout on phones
- Mask common patient fields (name, IDs, birth date, address, phones, email,
  SSN)
- Copy the masked message or a Mirth path to the clipboard
- English and Arabic page text, with the Noto Sans Arabic font bundled into
  the page
- Light and dark mode in the InfoGleam colours
- Made-up sample messages for HL7 v2.2 to v2.9, in a list under the
  Explain button. Choosing one explains it right away. The tool asks before
  a sample replaces your own message. The v2.9 sample has two mistakes on
  purpose, to show the field checks

Planned:

- Explanations for more segments
- More checks and hints for common mistakes
- The exact field names and data types of older versions

Field names, data types and repeat rules are shown as in HL7 v2.9, for
every version. Older versions can differ. Many fields have a version note
that says how.

## Privacy

The tool runs fully in your browser. The messages you paste are not sent or
stored. The page uses a Content Security Policy that blocks it from sending
data. It loads nothing from other sites: no fonts, no analytics.
See [docs/legal/privacy.md](docs/legal/privacy.md).

## How this was built

I designed this tool and made the decisions. I built it with help from
Claude Code, an AI coding assistant by Anthropic. The facts in the
explanations were checked against HL7's published sources.

The tool itself contains no AI. It runs only in your browser, and the page is
blocked from sending data anywhere. No real patient data was used to build or
test it. All sample messages are made up.

— Hisham Alrashdan

## How to run

You need Node.js 20 or later.

```sh
npm install
npm test
npm run dev -w apps/web
npm run build
```

More details: [docs/development.md](docs/development.md).
How to use the tool: [docs/usage.md](docs/usage.md).

## Licenses

| Part | License |
| --- | --- |
| `packages/core` (HL7 logic) | [MPL-2.0](packages/core/LICENSE) |
| `packages/core/src/dictionary/hl7-fields.json` (field names, data types, repeat rules) | Apache License 2.0, © HL7 International, see [NOTICE](NOTICE) |
| `packages/core/src/dictionary/hl7-datatypes.json` (component names, data types, repeat rules) | Apache License 2.0, © HL7 International, see [NOTICE](NOTICE) |
| `apps/web` (web page) | [AGPL-3.0-only](apps/web/LICENSE) with an additional term under section 7(b), see [apps/web/ADDITIONAL-TERMS.md](apps/web/ADDITIONAL-TERMS.md) |
| `samples` (made-up data) | MPL-2.0 |
| Noto Sans Arabic font (in the web page) | SIL Open Font License 1.1, © 2022 The Noto Project Authors, see [NOTICE](NOTICE) |

The additional term means: if you share or host a version of the web page,
it must show "Based on InfoGleam Message Explainer" with a link to
https://infogleam.com/tools/message-explainer/.

Full details: [LICENSES.md](LICENSES.md) and [NOTICE](NOTICE).

## Trademarks

"InfoGleam" and its logo are not covered by the code licenses. See
[TRADEMARKS.md](TRADEMARKS.md).

HL7® is the registered trademark of Health Level Seven International and the
use does not constitute endorsement by HL7.

## Contributing and security

- How to help: [CONTRIBUTING.md](CONTRIBUTING.md)
- How to report a security problem: [SECURITY.md](SECURITY.md)
