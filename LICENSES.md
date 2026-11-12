# Licenses

This project uses different licenses for different parts.

| Part | License | File |
| --- | --- | --- |
| `packages/core` | Mozilla Public License 2.0 (MPL-2.0) | [packages/core/LICENSE](packages/core/LICENSE) |
| `apps/web` | GNU Affero General Public License v3.0 only (AGPL-3.0-only), plus one additional term under section 7(b) | [apps/web/LICENSE](apps/web/LICENSE), [apps/web/ADDITIONAL-TERMS.md](apps/web/ADDITIONAL-TERMS.md) |
| `packages/core/src/dictionary/hl7-fields.json` (HL7 field names, data types and repeat rules) | Apache License 2.0, © HL7 International. Taken from the HL7 Version 2 to FHIR project. See [NOTICE](NOTICE). | [packages/core/src/dictionary/LICENSE-Apache-2.0.txt](packages/core/src/dictionary/LICENSE-Apache-2.0.txt) |
| `packages/core/src/dictionary/hl7-datatypes.json` (HL7 component names, data types and repeat rules) | Apache License 2.0, © HL7 International. Taken from the HL7 Version 2 to FHIR project. See [NOTICE](NOTICE). | [packages/core/src/dictionary/LICENSE-Apache-2.0.txt](packages/core/src/dictionary/LICENSE-Apache-2.0.txt) |
| `packages/core/src/dictionary/explanations` (our own explanations, English and Arabic) | MPL-2.0 (same as core) | [packages/core/LICENSE](packages/core/LICENSE) |
| HL7 code values (for example the codes for sex or patient class) inside the explanations | CC0 1.0, from HL7 Terminology (THO) | — |
| `samples` | MPL-2.0 (same as core) | [packages/core/LICENSE](packages/core/LICENSE) |
| `docs` and the root project files | MPL-2.0 (same as core), unless a file says otherwise | [packages/core/LICENSE](packages/core/LICENSE) |
| Noto Sans Arabic font (bundled into the web page from `@fontsource/noto-sans-arabic`) | SIL Open Font License 1.1, © 2022 The Noto Project Authors. See [NOTICE](NOTICE). | [apps/web/public/licenses/OFL-Noto-Sans-Arabic.txt](apps/web/public/licenses/OFL-Noto-Sans-Arabic.txt) |
| `brand/` (InfoGleam symbol files) and the InfoGleam name and logo | All rights reserved. Not covered by the code licenses. | [TRADEMARKS.md](TRADEMARKS.md), [brand/README.md](brand/README.md) |

## Why two licenses

- **Core (MPL-2.0).** The HL7 logic can be used in other projects, including
  closed-source ones. If you change the core files themselves and share them,
  you must share those changed files under MPL-2.0.
- **Web page (AGPL-3.0-only).** If you change the web page and let other
  people use it, also over a network, you must share your source code under
  the same license.

## Additional term for the web page

Any version of the web page that you share or host for others must show the
text "Based on InfoGleam Message Explainer" with a link to
https://infogleam.com/tools/message-explainer/ in its user interface. The full
text is in [apps/web/ADDITIONAL-TERMS.md](apps/web/ADDITIONAL-TERMS.md).

## Sample data

All sample messages are made up. They contain no real patient, staff or
organization data.

## Each file

Every source file starts with an `SPDX-License-Identifier` line that names
its license.
