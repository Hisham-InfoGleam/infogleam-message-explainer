// SPDX-License-Identifier: MPL-2.0
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// Builds src/dictionary/hl7-datatypes.json: the components of the HL7 v2
// data types that the fields in hl7-fields.json use.
//
// Source: the HL7 Version 2 to FHIR project, folder mappings/datatypes,
// commit 5e30516993 (Apache License 2.0, copyright HL7 International).
// Only four columns are used: identifier, name, data type and cardinality.
// Comments and other text from the source are not copied.
//
// Usage, from the repository root:
//   node packages/core/scripts/build-datatypes.mjs
//       downloads the CSV files of that commit from GitHub
//   node packages/core/scripts/build-datatypes.mjs <folder>
//       reads the CSV files from a local folder, for example
//       mappings/datatypes in a clone of HL7/v2-to-fhir at that commit
//
// The source has one CSV file per data type and FHIR target, for example
// "HL7 Data Type - FHIR R4_ XPN[HumanName] - Sheet1.csv". The files of one
// data type are merged. When they disagree, the value that most files have
// is used, and the script prints the disagreement. When the files are split
// evenly, TIE_BREAKS decides; the script stops if a tie has no entry there.
// CORRECTIONS then fixes a few values that the source has wrong.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'HL7/v2-to-fhir';
const COMMIT = '5e30516993';
const FOLDER = 'mappings/datatypes';
const LIST_URL = `https://api.github.com/repos/${REPO}/contents/${FOLDER}?ref=${COMMIT}`;
// GitHub asks every client to give its own name in the User-Agent header.
const USER_AGENT = 'infogleam-message-explainer (scripts/build-datatypes.mjs)';

const FIELDS_FILE = fileURLToPath(new URL('../src/dictionary/hl7-fields.json', import.meta.url));
const OUT_FILE = fileURLToPath(new URL('../src/dictionary/hl7-datatypes.json', import.meta.url));

// Primitive data types have no components. The source has a file for some of
// them, with a single placeholder row (for example ST.1). They are left out.
const PRIMITIVES = new Set(['DT', 'DTM', 'FT', 'GTS', 'ID', 'IS', 'NM', 'SI', 'SNM', 'ST', 'TM', 'TX']);

// Values in the field list that are not data types.
const NOT_TYPES = new Set(['', 'varies']);

// Values for ties (half of the files say one thing, half another). Each one
// was checked against the HL7 v2.9 standard text (chapter 2A, data types).
const TIE_BREAKS = {
  'HD.3 name': 'Universal ID Type', // the other files have a typo
  'HD.3 dataType': 'ID',
  'XPN.6 dataType': '', // withdrawn as of v2.7, no data type
  'XPN.9 dataType': 'CWE',
  'XPN.12 dataType': 'DTM',
  'XPN.13 dataType': 'DTM',
};

// Values that the source has wrong, checked against the HL7 v2.9 standard
// text (chapter 2A, data types). They replace the merged values. SPS is not
// in v2.9, so its values were checked against v2.5 and v2.6.
const CORRECTIONS = {
  'EIP.1': { dataType: 'EI' },
  'EIP.2': { dataType: 'EI' },
  'RI.1': { dataType: 'CWE' },
  'CNN.9': { name: 'Assigning Authority - Namespace ID' },
  'CNN.10': { name: 'Assigning Authority - Universal ID' },
  'CNN.11': { name: 'Assigning Authority - Universal ID Type' },
  'DLN.1': { name: "Driver's License Number" },
  'SPS.1': { name: 'Specimen Source Name or Code', dataType: 'CWE' },
  'SPS.3': { name: 'Specimen Collection Method' },
  'SPS.4': { dataType: 'CWE' },
  'SPS.5': { name: 'Site Modifier', dataType: 'CWE' },
  'SPS.6': { name: 'Collection Method Modifier Code', dataType: 'CWE' },
  'SPS.7': { name: 'Specimen Role', dataType: 'CWE' },
};

const KEYS = ['name', 'dataType', 'min', 'max'];

/** Read CSV text. Handles quoted cells with commas, quotes and line breaks. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 2;
      } else if (ch === '"') {
        quoted = false;
        i++;
      } else {
        cell += ch;
        i++;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\r' || ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else {
      cell += ch;
    }
    i++;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function clean(text) {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

function toMin(text) {
  const n = Number.parseInt(clean(text), 10);
  return Number.isNaN(n) || n < 0 ? 0 : n;
}

function toMax(text) {
  const t = clean(text);
  if (t === '*' || t === '-1') return '*';
  const n = Number.parseInt(t, 10);
  return Number.isNaN(n) ? '' : n;
}

/** Data type code from a file name, for example "XPN". */
function typeFromFileName(name) {
  return /FHIR R4_ ([A-Z][A-Z0-9]{1,3})\[/.exec(name)?.[1];
}

async function download() {
  const headers = { 'User-Agent': USER_AGENT };
  const res = await fetch(LIST_URL, { headers });
  if (!res.ok) throw new Error(`File list: HTTP ${res.status}`);
  const list = await res.json();
  const files = [];
  for (const entry of list) {
    if (entry.type !== 'file' || !entry.name.endsWith('.csv')) continue;
    const r = await fetch(entry.download_url, { headers });
    if (!r.ok) throw new Error(`${entry.name}: HTTP ${r.status}`);
    files.push({ name: entry.name, text: await r.text() });
  }
  return files;
}

function readFolder(folder) {
  return readdirSync(folder)
    .filter((name) => name.endsWith('.csv'))
    .map((name) => ({ name, text: readFileSync(join(folder, name), 'utf8') }));
}

/**
 * The components in one file: { id, number, name, dataType, min, max }.
 * A component can have several rows (one per FHIR target); the first row
 * counts, so each file has one vote per component.
 */
function readComponents(file, code, notes) {
  const rows = parseCsv(file.text);
  const headerIndex = rows.findIndex((r) => clean(r[1]) === 'Identifier' && clean(r[2]) === 'Name');
  if (headerIndex === -1) {
    notes.push(`${file.name}: no column header, file skipped`);
    return [];
  }
  const header = rows[headerIndex].map(clean);
  // The first columns with these names belong to the HL7 v2 side.
  const col = {
    id: header.indexOf('Identifier'),
    name: header.indexOf('Name'),
    dataType: header.indexOf('Data Type'),
    min: header.indexOf('Cardinality - Min'),
    max: header.indexOf('Cardinality - Max'),
  };

  const found = new Map();
  for (const row of rows.slice(headerIndex + 1)) {
    const raw = clean(row[col.id]);
    if (raw === '') continue;
    const m = /^([A-Z][A-Z0-9]{1,3})[.-](\d+)$/.exec(raw);
    if (!m) {
      notes.push(`${file.name}: row "${raw}" skipped (not a component)`);
      continue;
    }
    if (m[1] !== code) {
      notes.push(`${file.name}: row ${raw} skipped (not ${code})`);
      continue;
    }
    const id = `${m[1]}.${Number(m[2])}`;
    const comp = {
      id,
      number: Number(m[2]),
      name: clean(row[col.name]),
      dataType: clean(row[col.dataType]),
      min: col.min === -1 ? 0 : toMin(row[col.min]),
      max: col.max === -1 ? '' : toMax(row[col.max]),
    };
    const first = found.get(id);
    if (!first) {
      found.set(id, comp);
    } else if (KEYS.some((k) => first[k] !== comp[k])) {
      notes.push(`${file.name}: ${id} has rows that differ, the first row is used`);
    }
  }
  return [...found.values()];
}

/** Count the values and pick the one most files have. */
function vote(id, key, values, problems) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const top = Math.max(...counts.values());
  const leaders = [...counts].filter(([, n]) => n === top).map(([v]) => v);
  if (leaders.length === 1) return { value: leaders[0], counts };

  const tie = `${id} ${key}`;
  if (Object.hasOwn(TIE_BREAKS, tie) && leaders.includes(TIE_BREAKS[tie])) {
    return { value: TIE_BREAKS[tie], counts };
  }
  // A missing repeat rule loses against any real one.
  const real = leaders.filter((v) => v !== '');
  if (key === 'max' && real.length === 1) return { value: real[0], counts };
  problems.push(`tie for ${tie}: ${describe(counts)}; add it to TIE_BREAKS`);
  return { value: leaders[0], counts };
}

function describe(counts) {
  return [...counts].map(([v, n]) => `"${v}" x${n}`).join(', ');
}

async function main() {
  const folder = process.argv[2];
  const files = (folder ? readFolder(folder) : await download()).sort((a, b) => a.name.localeCompare(b.name));
  const notes = [];
  const problems = [];
  const disagreements = [];
  const corrected = [];

  // Collect the components of every file, by data type and component id.
  const byType = new Map();
  for (const file of files) {
    const code = typeFromFileName(file.name);
    if (!code) {
      notes.push(`${file.name}: no data type in the file name, file skipped`);
      continue;
    }
    const comps = byType.get(code) ?? new Map();
    byType.set(code, comps);
    for (const c of readComponents(file, code, notes)) {
      const list = comps.get(c.id) ?? [];
      list.push(c);
      comps.set(c.id, list);
    }
  }

  // Merge the files of each data type.
  const merged = new Map();
  for (const [code, comps] of byType) {
    if (PRIMITIVES.has(code) || comps.size === 0) continue;
    const components = [];
    for (const [id, rows] of comps) {
      const result = { id };
      for (const key of KEYS) {
        const { value, counts } = vote(id, key, rows.map((r) => r[key]), problems);
        if (counts.size > 1) disagreements.push(`${id} ${key}: ${describe(counts)} -> "${value}"`);
        result[key] = value;
      }
      if (result.max === '') result.max = 1;
      if (Object.hasOwn(CORRECTIONS, id)) {
        for (const [key, value] of Object.entries(CORRECTIONS[id])) {
          if (result[key] === value) notes.push(`${id} ${key}: the source already has "${value}"; the correction can go`);
          else corrected.push(`${id} ${key}: "${result[key]}" -> "${value}"`);
          result[key] = value;
        }
      }
      components.push({ number: rows[0].number, ...result });
    }
    components.sort((a, b) => a.number - b.number);
    merged.set(
      code,
      components.map(({ number, ...rest }) => rest),
    );
  }

  // Data types reachable from the field list, following component types.
  const fieldList = JSON.parse(readFileSync(FIELDS_FILE, 'utf8'));
  const queue = [];
  for (const seg of Object.values(fieldList.segments)) {
    for (const f of seg.fields) queue.push(f.dataType);
  }
  const reachable = new Set();
  const missing = new Set();
  while (queue.length > 0) {
    const code = queue.shift();
    if (NOT_TYPES.has(code) || PRIMITIVES.has(code) || reachable.has(code) || missing.has(code)) continue;
    const components = merged.get(code);
    if (!components) {
      missing.add(code);
      continue;
    }
    reachable.add(code);
    for (const c of components) queue.push(c.dataType);
  }

  if (problems.length > 0) {
    console.error('Stopped:');
    for (const p of problems) console.error('  ' + p);
    process.exit(1);
  }

  const dataTypes = {};
  for (const code of [...reachable].sort()) dataTypes[code] = { components: merged.get(code) };

  const out = {
    about:
      'Components of HL7 Version 2 data types (identifier, name, data type and repeat rule), taken from the data type mapping tables of the HL7 Version 2 to FHIR project published by HL7 International. Reformatted to JSON. Only the data types used by the fields in hl7-fields.json are included. Primitive data types (for example ST, NM and DTM) have no components and are not listed. "missing" lists the data types that the source does not have.',
    source: `https://github.com/${REPO} (${FOLDER}), commit ${COMMIT}`,
    license: 'Apache-2.0',
    copyright: 'HL7 International',
    dataTypes,
    missing: [...missing].sort(),
    corrections:
      "Checked against the HL7 v2.9 standard text (chapter 2A, data types) and corrected: EIP.1 and EIP.2 have data type EI, RI.1 has data type CWE, the names of CNN.9 to CNN.11 have a space before the dash (Assigning Authority - Namespace ID), and DLN.1 is Driver's License Number. SPS is not in v2.9; checked against v2.5 and v2.6 and corrected: SPS.3 is Specimen Collection Method, and SPS.1 and SPS.4 to SPS.7 have data type CWE.",
  };
  writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + '\n');

  console.log(`Read ${files.length} files, ${byType.size} data types.`);
  console.log(`Wrote ${reachable.size} data types: ${[...reachable].sort().join(', ')}`);
  console.log(`Missing in the source: ${[...missing].sort().join(', ') || 'none'}`);
  console.log('Corrected:');
  for (const c of corrected) console.log('  ' + c);
  if (disagreements.length > 0) {
    console.log('Files disagree:');
    for (const d of disagreements) console.log('  ' + d);
  }
  if (notes.length > 0) {
    console.log('Notes:');
    for (const n of notes) console.log('  ' + n);
  }
}

await main();
