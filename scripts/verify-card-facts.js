#!/usr/bin/env node
'use strict';

// Verifier for card-facts. Mirrors verify-usage-display.js.
// (a) Every generated mirror must byte-match what the generator would emit RIGHT NOW from the
//     source — catches "someone edited a generated file by hand" drift.
// (b) The shared logic body must be byte-identical across all three mirrors once each one's
//     own wrapper is stripped — catches a generator change that silently desynchronises them.
// (c) Section A must not reference any emitter deleted by Chief ruling L1, and the order
//     profiles must be exactly the ruled set.
// Run: node scripts/verify-card-facts.js

const fs = require('fs');
const path = require('path');
const { RENDER, TARGETS, ROOT } = require('./generate-card-facts.js');

let failures = 0;
const fail = (m) => { console.error('FAIL: ' + m); failures++; };
const ok = (m) => console.log('OK: ' + m);

// ── (a) byte-compare each mirror against a fresh in-memory render ─────────────
for (const [kind, rel] of Object.entries(TARGETS)) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { fail(`${rel} does not exist — run node scripts/generate-card-facts.js`); continue; }
  const onDisk = fs.readFileSync(abs, 'utf8');
  const fresh = RENDER[kind]();
  if (onDisk !== fresh) {
    fail(`${rel} is stale or hand-edited (${onDisk.length} bytes on disk vs ${fresh.length} regenerated)`);
  } else {
    ok(`${rel} byte-matches the generator (${onDisk.length} bytes)`);
  }
}

// ── (b) the shared body is identical across mirrors ──────────────────────────
const MARK_START = '// ───────────────────────────────────────────────────────────── A. LIVE';
function sharedBody(text, dedent) {
  const i = text.indexOf(MARK_START);
  if (i === -1) return null;
  let b = text.slice(i);
  // cut each wrapper's own trailing export/registration block
  const stops = ['\nmodule.exports = {', '\nexport {', '\n  root.CardFacts = {'];
  for (const s of stops) { const j = b.indexOf(s); if (j !== -1) b = b.slice(0, j); }
  if (dedent) b = b.split('\n').map((l) => l.replace(/^ {2}/, '')).join('\n');
  return b.replace(/\s+$/, '');
}
const bodies = {};
for (const [kind, rel] of Object.entries(TARGETS)) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) continue;
  bodies[kind] = sharedBody(fs.readFileSync(abs, 'utf8'), kind === 'browser');
}
const kinds = Object.keys(bodies);
if (kinds.length === 3) {
  const ref = bodies.cjs;
  let same = true;
  for (const k of kinds) if (bodies[k] !== ref) { fail(`mirror '${k}' logic body differs from 'cjs'`); same = false; }
  if (same) ok(`all three mirrors share a byte-identical logic body (${ref.split('\n').length} lines)`);
} else {
  fail('could not extract the logic body from all three mirrors');
}

// ── (c) Chief ruling L1 — deleted emitters must be gone from Section A ────────
const SRC = fs.readFileSync(path.join(ROOT, 'netlify/functions/lib/card-facts.source.js'), 'utf8');
const sectionA = SRC.slice(SRC.indexOf(MARK_START), SRC.indexOf('// ───────────────────────────────────────────────────────────── B. DARK'));

const L1_DELETED = ['transmission', 'drivetrain', 'operating_weight', 'length', 'gvwr', 'axles', 'deck_width'];
const stillThere = L1_DELETED.filter((k) => new RegExp('(^|[^\\w.])' + k + '\\s*:', 'm').test(sectionA)
  || new RegExp("'" + k + "'").test(sectionA));
if (stillThere.length) fail('Section A still references L1-deleted emitters: ' + stillThere.join(', '));
else ok(`Section A references none of the ${L1_DELETED.length} L1-deleted emitters`);

// Control: the surviving emitters MUST still be present, otherwise the check above is vacuous.
const SURVIVORS = ['mileage', 'hours', 'engine', 'fuel', 'horsepower'];
const missing = SURVIVORS.filter((k) => !new RegExp(k + '\\s*:').test(sectionA));
if (missing.length) fail('Section A is missing surviving emitters: ' + missing.join(', '));
else ok(`control: all ${SURVIVORS.length} surviving emitters still present in Section A`);

// Exact order profiles per L1.
const EXPECTED = {
  "sub === 'tractor'": "['horsepower', 'hours']",
  'CHIP_MOWERS[sub]': "['hours', 'horsepower']",
  "sub === 'crane truck'": "['mileage', 'engine']",
  "cat === 'trailers'": '[]',
  "cat === 'trucks'": "['mileage', 'engine', 'fuel']",
  "cat === 'construction'": "['horsepower', 'hours']",
  "cat === 'farm'": "['horsepower', 'hours']",
};
for (const [cond, want] of Object.entries(EXPECTED)) {
  const line = sectionA.split('\n').find((l) => l.includes(cond) && l.includes('order ='));
  if (!line) { fail(`order profile for ${cond} not found`); continue; }
  const got = line.slice(line.indexOf('order =') + 7).replace(/;.*$/, '').trim();
  if (got !== want) fail(`order profile for ${cond}: expected ${want}, got ${got}`);
}
const dflt = sectionA.split('\n').find((l) => /else\s+order =/.test(l));
if (!dflt || !dflt.includes("['mileage', 'fuel']")) fail('default order profile is not [mileage, fuel]');
if (!failures) ok('all eight order profiles match Chief ruling L1');

// ── (d) Section B must be untouched by Section A work ────────────────────────
if (!/function profileOf\(category, subcategory\)/.test(SRC)) fail('Section B profileOf missing');
else ok('Section B present and intact (Dispatch 2 owns it)');

console.log(failures === 0 ? '\ncard-facts: VERIFIED' : `\ncard-facts: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
