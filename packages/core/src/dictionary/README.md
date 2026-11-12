# Field dictionary

This folder holds the data the tool uses to describe HL7 v2 segments and fields.

| File or folder | What it holds | Source and license |
| --- | --- | --- |
| `hl7-fields.json` | Field number, name, data type and repeat rule for each field | HL7 Version 2 to FHIR project, © HL7 International, Apache License 2.0 ([LICENSE-Apache-2.0.txt](LICENSE-Apache-2.0.txt), [NOTICE](../../../../NOTICE)) |
| `hl7-datatypes.json` | Name, data type and repeat rule of each component of the data types that the fields use (for example `XPN.1` Family Name) | HL7 Version 2 to FHIR project (folder `mappings/datatypes`), © HL7 International, Apache License 2.0 ([LICENSE-Apache-2.0.txt](LICENSE-Apache-2.0.txt), [NOTICE](../../../../NOTICE)) |
| `hl7-field-history.json` | Optional: for each field, the name, data type, optionality and repeat limit in each version from 2.3 to 2.9. Empty in this edition | This project, MPL-2.0 |
| `explanations/` | One file per segment with short explanations in English and Arabic | Written for this project in our own words, MPL-2.0 |

`hl7-fields.json` follows HL7 v2.9. Older versions (2.3 to 2.8.2) use the
same field numbers, but some fields have other names, data types or
required and repeat rules. `hl7-field-history.json` can list these
differences. It is empty in this edition, so the tool shows the v2.9 facts
for every version and says so on the page.

The explanations are not copied from the HL7 standard. Code values for HL7
tables come from HL7 Terminology (THO), which is CC0.

Each code value in `values` has `code`, `en` and `ar`, and two optional
version keys:

- `since`: the first HL7 version with the code, for example `"2.6"`.
  Leave it out when the code is as old as the field.
- `until`: the last HL7 version with the code, for example `"2.5.1"`.
  Later versions do not have it. Leave it out when v2.9 still has the code.

For example, HL7 table 0125 (OBX-2) has the codes `CE` and `TS` up to
v2.5.1, so they have `"until": "2.5.1"`. Both keys must be versions from
2.3 to 2.9, and not before the field exists. `until` must not be before
`since`. The page warns when a message holds a code that its version does
not have.

The code in `../dictionary.ts` merges both sources: `getFieldDoc()` and
`getSegmentDoc()` return the name, data type and repeat rule from
`hl7-fields.json` together with the explanation.

## Field history

`hl7-field-history.json` has the keys `about`, `versions` (2.3 to 2.9),
`sources` and `fields`. In this edition `sources` and `fields` are empty.

The file can store, for each field, only the changes. The first entry of a
field has its name, data type, optionality (`opt`: R required, O optional,
C conditional, B kept for backward compatibility only, W withdrawn, X not
used) and repeat limit (`max`) in the first version that has the field.
Each later entry has only what changed in that version. The shape of an
entry, with made-up values:

```json
"ZZZ-1": [
  { "from": "2.3", "name": "Old Name", "dataType": "ST", "opt": "O", "max": 1 },
  { "from": "2.5", "name": "New Name" }
]
```

`getFieldVersion()` and `getFieldHistory()` in `../history.ts` read the file.
`HAS_FIELD_HISTORY` says whether it has fields, and `hasFieldFacts(version)`
whether the tool has the field facts of a version: every version with
fields in the file, otherwise only v2.9 (from `hl7-fields.json`).
`getFieldDoc(segment, field, version)` returns the explanation with the
name, data type and rules of that version when the file has them, and
otherwise the v2.9 ones. Its `factsVersion` says which version they are
from. Whether a field exists in a version then comes from the explanation
(`since`). `history.test.ts` checks both cases.

## Component names

Component names come from `hl7-datatypes.json`. `getComponentDoc()` in
`../datatypes.ts` finds them through the field's data type, then the
component's data type: `PID-3.4.1` is `CX.4` (data type `HD`), then `HD.1`
Namespace ID. With a version, the data type that `getFieldDoc()` gives for
that version is used. Component names are in English only and follow HL7
v2.9. Four data types are not in v2.9 (`CE`, `TS`, `TQ` and
`SPS`): their names follow the last version that has them. The file lists
in `missing` the data types that the
source does not have (for example `VID` in `MSH-12`); `dataTypeKind()` tells
whether the tool has names for a data type. To rebuild the file, run
`node packages/core/scripts/build-datatypes.mjs` from the repository root.

HL7® is the registered trademark of Health Level Seven International and the
use does not constitute endorsement by HL7.
