// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Hisham Alrashdan (InfoGleam)

// Checks the built page in dist/ after "vite build".
// 1. index.html has the Content Security Policy meta tag from vite.config.ts.
// 2. No built script can send data: no fetch, XMLHttpRequest, WebSocket,
//    sendBeacon or EventSource.
// The build fails when a check fails.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));

// The policy as written in vite.config.ts (the CSP list there).
const config = readFileSync(fileURLToPath(new URL('../vite.config.ts', import.meta.url)), 'utf8');
const list = /export const CSP = \[([\s\S]*?)\]\.join\('; '\)/.exec(config);
if (!list) {
  console.error('Build check failed: vite.config.ts has no CSP list.');
  process.exit(1);
}
const CSP = [...list[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]).join('; ');

const NETWORK = [/\bfetch\s*\(/, /\bXMLHttpRequest\b/, /\bWebSocket\b/, /\bsendBeacon\b/, /\bEventSource\b/];

const problems = [];

/** Read the HTML character references that Vite writes in attributes. */
function decode(text) {
  return text
    .replace(/&#(\d+);/g,(_, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const meta = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i.exec(html);
if (!meta) problems.push('dist/index.html has no Content-Security-Policy meta tag');
else if (decode(meta[1]) !== CSP) problems.push(`dist/index.html has another policy: ${decode(meta[1])}`);
// The policy must come before any script, so it covers all of them.
if (meta && html.search(/<script/i) !== -1 && html.search(/<script/i) < meta.index) {
  problems.push('dist/index.html has a script before the policy');
}
if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) problems.push('dist/index.html has an inline script');

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
  );
}

const scripts = files(dist).filter((f) => /\.(m?js|html)$/.test(f));
if (!scripts.some((f) => f.endsWith('.js'))) problems.push('dist has no script file');
for (const file of scripts) {
  const text = readFileSync(file, 'utf8');
  for (const pattern of NETWORK) {
    if (pattern.test(text)) problems.push(`${file.slice(dist.length)} contains ${pattern.source}`);
  }
}

if (problems.length > 0) {
  console.error('Build check failed:');
  for (const p of problems) console.error(`- ${p}`);
  process.exit(1);
}
console.log(`Build check passed: policy in index.html, no network code in ${scripts.length} files.`);
