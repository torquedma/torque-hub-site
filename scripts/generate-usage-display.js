#!/usr/bin/env node
'use strict';

// Generator for the usage-display rule (showMileage / showHours / normalizeSubcategory).
// Mirrors generate-taxonomy.js precisely: reads a JSON source in torque-hub-site,
// emits CJS + ESM + browser IIFE mirrors across BOTH repos.
// Run: node scripts/generate-usage-display.js
// Verify: node scripts/verify-usage-display.js

const fs   = require('fs');
const path = require('path');

const ROOT       = path.join(__dirname, '..');
const ADMIN_ROOT = path.join(process.env.HOME, 'torquedma/torque-hub-admin');
const SRC_JSON   = path.join(ROOT, 'netlify/functions/lib/usage-display.source.json');

const { allow_hours, allow_mileage, suppress_both } =
  JSON.parse(fs.readFileSync(SRC_JSON, 'utf8'));

const HEADER = '// GENERATED FROM usage-display.source.json — DO NOT EDIT. Run node scripts/generate-usage-display.js\n';

// One-line-per-entry lists (kept identical across variants for byte-parity readability).
function setLinesJoined(list, indent) {
  return list.map(s => `${indent}'${s.replace(/'/g, "\\'")}'`).join(',\n');
}

// ── (a) CommonJS module for Netlify functions ─────────────────────────────────
function buildCJS() {
  const hoursLines    = setLinesJoined(allow_hours, '  ');
  const mileageLines  = setLinesJoined(allow_mileage, '  ');
  const suppressLines = setLinesJoined(suppress_both, '  ');

  return `${HEADER}'use strict';

const { canonicalize } = require('./taxonomy.generated.js');

const ALLOW_HOURS = new Set([
${hoursLines}
]);

const ALLOW_MILEAGE = new Set([
${mileageLines}
]);

const SUPPRESS_BOTH = new Set([
${suppressLines}
]);

// Normalize unit.subcategory through the taxonomy alias map to a canonical value.
// Reuses canonicalize() from taxonomy.generated.js — do NOT re-implement.
// Returns '' when raw is missing, unmapped, or aliased-to-empty ('Mower','Lawn & Garden').
function normalizeSubcategory(unit) {
  const raw = String((unit && unit.subcategory) || '').trim();
  if (!raw) return '';
  const canonical = canonicalize(raw);
  return canonical || '';
}

// Numeric guard shared by both rules: rejects null/undefined/empty/'0'/'0 miles' etc.
function hasRealNumber(v) {
  if (v == null) return false;
  const s = String(v).trim();
  if (s === '') return false;
  const numPart = s.replace(/[^0-9.]/g, '');
  return numPart !== '' && Number(numPart) !== 0;
}

function showMileage(unit) {
  const sub = normalizeSubcategory(unit);
  if (!sub) {
    console.warn('[usage-display] unmapped subcategory: ' + ((unit && unit.subcategory) || '(none)'));
    return false;
  }
  if (!ALLOW_MILEAGE.has(sub)) return false;
  return hasRealNumber(unit.mileage);
}

function showHours(unit) {
  const sub = normalizeSubcategory(unit);
  if (!sub) {
    console.warn('[usage-display] unmapped subcategory: ' + ((unit && unit.subcategory) || '(none)'));
    return false;
  }
  if (!ALLOW_HOURS.has(sub)) return false;
  return hasRealNumber(unit.hours);
}

// Conservative variants for DESTRUCTIVE contexts (e.g. import scrubs that null
// the DB row). Returns TRUE only when the subcategory is KNOWN to disallow the
// field — never on unknown/unmapped/aliased-to-empty. Prefer these over
// !showMileage/!showHours anywhere raw data would be discarded on a guess.
function isKnownSuppressMileage(unit) {
  const sub = normalizeSubcategory(unit);
  if (!sub) return false;
  return ALLOW_HOURS.has(sub) || SUPPRESS_BOTH.has(sub);
}

function isKnownSuppressHours(unit) {
  const sub = normalizeSubcategory(unit);
  if (!sub) return false;
  return ALLOW_MILEAGE.has(sub) || SUPPRESS_BOTH.has(sub);
}

module.exports = { showMileage, showHours, isKnownSuppressMileage, isKnownSuppressHours, normalizeSubcategory };
`;
}

// ── (c) ES module for edge functions (Deno) ──────────────────────────────────
function buildESM() {
  const hoursLines    = setLinesJoined(allow_hours, '  ');
  const mileageLines  = setLinesJoined(allow_mileage, '  ');
  const suppressLines = setLinesJoined(suppress_both, '  ');

  return `${HEADER}// ESM variant for Netlify edge functions (Deno). Logic must match
// usage-display.generated.js byte-for-byte to keep SSR/client parity.

import { canonicalize } from './taxonomy.esm.js';

const ALLOW_HOURS = new Set([
${hoursLines}
]);

const ALLOW_MILEAGE = new Set([
${mileageLines}
]);

const SUPPRESS_BOTH = new Set([
${suppressLines}
]);

export function normalizeSubcategory(unit) {
  const raw = String((unit && unit.subcategory) || '').trim();
  if (!raw) return '';
  const canonical = canonicalize(raw);
  return canonical || '';
}

function hasRealNumber(v) {
  if (v == null) return false;
  const s = String(v).trim();
  if (s === '') return false;
  const numPart = s.replace(/[^0-9.]/g, '');
  return numPart !== '' && Number(numPart) !== 0;
}

export function showMileage(unit) {
  const sub = normalizeSubcategory(unit);
  if (!sub) {
    console.warn('[usage-display] unmapped subcategory: ' + ((unit && unit.subcategory) || '(none)'));
    return false;
  }
  if (!ALLOW_MILEAGE.has(sub)) return false;
  return hasRealNumber(unit.mileage);
}

export function showHours(unit) {
  const sub = normalizeSubcategory(unit);
  if (!sub) {
    console.warn('[usage-display] unmapped subcategory: ' + ((unit && unit.subcategory) || '(none)'));
    return false;
  }
  if (!ALLOW_HOURS.has(sub)) return false;
  return hasRealNumber(unit.hours);
}

// Conservative variants — see CJS mirror for full rationale.
export function isKnownSuppressMileage(unit) {
  const sub = normalizeSubcategory(unit);
  if (!sub) return false;
  return ALLOW_HOURS.has(sub) || SUPPRESS_BOTH.has(sub);
}

export function isKnownSuppressHours(unit) {
  const sub = normalizeSubcategory(unit);
  if (!sub) return false;
  return ALLOW_MILEAGE.has(sub) || SUPPRESS_BOTH.has(sub);
}
`;
}

// ── (b) Browser global for admin / hub-site client JS ────────────────────────
// Namespaced as window.UsageDisplay — never bare globals.
// MUST be loaded AFTER js/taxonomy.browser.js (depends on window.TAXONOMY.canonicalize).
function buildBrowser() {
  const hoursLines    = setLinesJoined(allow_hours, '    ');
  const mileageLines  = setLinesJoined(allow_mileage, '    ');
  const suppressLines = setLinesJoined(suppress_both, '    ');

  return `${HEADER}// Load AFTER js/taxonomy.browser.js — depends on window.TAXONOMY.canonicalize.
// Exposes window.UsageDisplay (namespaced — no bare globals).

(function (root) {
  var allowHours = [
${hoursLines}
  ];
  var allowMileage = [
${mileageLines}
  ];
  var suppressBoth = [
${suppressLines}
  ];

  function normalizeSubcategory(unit) {
    var raw = String((unit && unit.subcategory) || '').trim();
    if (!raw) return '';
    var canonicalize = (root.TAXONOMY && root.TAXONOMY.canonicalize) || null;
    if (!canonicalize) {
      console.error('[usage-display] window.TAXONOMY.canonicalize missing — load js/taxonomy.browser.js BEFORE js/usage-display.browser.js');
      return '';
    }
    var canonical = canonicalize(raw);
    return canonical || '';
  }

  function hasRealNumber(v) {
    if (v == null) return false;
    var s = String(v).trim();
    if (s === '') return false;
    var numPart = s.replace(/[^0-9.]/g, '');
    return numPart !== '' && Number(numPart) !== 0;
  }

  function showMileage(unit) {
    var sub = normalizeSubcategory(unit);
    if (!sub) {
      console.warn('[usage-display] unmapped subcategory: ' + ((unit && unit.subcategory) || '(none)'));
      return false;
    }
    if (allowMileage.indexOf(sub) === -1) return false;
    return hasRealNumber(unit.mileage);
  }

  function showHours(unit) {
    var sub = normalizeSubcategory(unit);
    if (!sub) {
      console.warn('[usage-display] unmapped subcategory: ' + ((unit && unit.subcategory) || '(none)'));
      return false;
    }
    if (allowHours.indexOf(sub) === -1) return false;
    return hasRealNumber(unit.hours);
  }

  // Conservative variants — see CJS mirror for full rationale.
  function isKnownSuppressMileage(unit) {
    var sub = normalizeSubcategory(unit);
    if (!sub) return false;
    return allowHours.indexOf(sub) !== -1 || suppressBoth.indexOf(sub) !== -1;
  }

  function isKnownSuppressHours(unit) {
    var sub = normalizeSubcategory(unit);
    if (!sub) return false;
    return allowMileage.indexOf(sub) !== -1 || suppressBoth.indexOf(sub) !== -1;
  }

  root.UsageDisplay = {
    showMileage: showMileage,
    showHours: showHours,
    isKnownSuppressMileage: isKnownSuppressMileage,
    isKnownSuppressHours: isKnownSuppressHours,
    normalizeSubcategory: normalizeSubcategory
  };
}(typeof window !== 'undefined' ? window : this));
`;
}

const cjsContent     = buildCJS();
const browserContent = buildBrowser();
const esmContent     = buildESM();

const TARGETS = [
  {
    path: path.join(ROOT, 'netlify/functions/lib/usage-display.generated.js'),
    content: cjsContent,
    label: 'hub CJS',
  },
  {
    path: path.join(ROOT, 'netlify/edge-functions/lib/usage-display.esm.js'),
    content: esmContent,
    label: 'hub ESM (edge)',
  },
  {
    path: path.join(ROOT, 'js/usage-display.browser.js'),
    content: browserContent,
    label: 'browser global',
  },
  {
    path: path.join(ADMIN_ROOT, 'netlify/functions/lib/usage-display.generated.js'),
    content: cjsContent,
    label: 'admin CJS',
  },
  {
    path: path.join(ADMIN_ROOT, 'js/usage-display.browser.js'),
    content: browserContent,
    label: 'admin browser global',
  },
];

for (const t of TARGETS) {
  fs.mkdirSync(path.dirname(t.path), { recursive: true });
  fs.writeFileSync(t.path, t.content, 'utf8');
  console.log(`Wrote [${t.label}]: ${t.path}`);
}

console.log('\nDone.');
