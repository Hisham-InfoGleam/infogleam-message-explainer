# Contributing

Thank you for your interest in this project.

## Never share real patient data

- Use made-up data only, in code, tests, samples, issues and pull requests.
- Never paste a real HL7 message into an issue, even a "masked" one.
  Masking is not complete.
- Use clearly fake values, for example patient `TEST^PATIENT^ONE`, MRN
  `TEST0001`, facility `DEMO HOSPITAL`, phone `555-0100`, address
  `1 EXAMPLE ST^^DEMO CITY`.
- Do not include real names of hospitals, clinics, companies or people.

## Sign your commits (DCO)

This project uses the Developer Certificate of Origin (DCO), version 1.1
(https://developercertificate.org/). By signing off, you confirm that you
wrote the change or have the right to submit it under the project licenses.

Sign off each commit with `-s`:

```sh
git commit -s -m "Fix PID-3 repetition label"
```

This adds a line like this to the commit message:

```text
Signed-off-by: Your Name <your.address@example.com>
```

## Before you open a pull request

```sh
npm install
npm test
npm run check
npm run build
```

- Keep changes small and focused.
- Add or update tests for changes in `packages/core`.
- Keep the license header at the top of each source file:
  - `packages/core`: `SPDX-License-Identifier: MPL-2.0`
  - `apps/web`: `SPDX-License-Identifier: AGPL-3.0-only`
- Field descriptions must be written in your own words. Do not copy text
  from the HL7 standard documents.

## Licenses

Your contribution is licensed under the license of the folder you change.
See [LICENSES.md](LICENSES.md).
