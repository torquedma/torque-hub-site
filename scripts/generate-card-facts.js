#!/usr/bin/env node
'use strict';

// Generator for the inventory card pill logic (card-facts).
// Mirrors generate-usage-display.js precisely: reads ONE source body in torque-hub-site and
// emits CJS + ESM + browser IIFE mirrors whose logic is byte-identical.
// Run:    node scripts/generate-card-facts.js
// Verify: node scripts/verify-card-facts.js
//
// Unlike generate-usage-display.js this writes only inside torque-hub-site — the three mirrors
// named in card-facts.source.js. It does not touch torque-hub-admin.
//
// The ONLY thing that differs between mirrors is how the two free identifiers showMileage and
// showHours are bound:
//   CJS / ESM : the real usage-display module      -> FAIL-CLOSED (edge behaviour at cc687342)
//   browser   : window.UsageDisplay, true if absent -> FAIL-OPEN  (client behaviour at cc687342)
// That asymmetry is deliberate and is exactly the divergence the three old copies carried.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'netlify/functions/lib/card-facts.source.js');

const HEADER = '// GENERATED FROM card-facts.source.js — DO NOT EDIT. Run node scripts/generate-card-facts.js\n';

const TARGETS = {
  cjs: 'netlify/functions/lib/card-facts.generated.js',
  esm: 'netlify/edge-functions/lib/card-facts.esm.js',
  browser: 'js/card-facts.browser.js',
};

// Public surface. Section A is owned by Dispatch 1; Section B by Dispatch 2.
const EXPORTS_A = ['buildCardChips', 'trimEngine'];
const EXPORTS_B = ['profileOf', 'governedCandidates', 'selectBestFacts', 'formatFact'];
const EXPORTS = EXPORTS_A.concat(EXPORTS_B);

/** The shared logic body: the source file with its leading header comment stripped. */
function body() {
  const src = fs.readFileSync(SRC, 'utf8');
  const marker = '// ───────────────────────────────────────────────────────────── A. LIVE';
  const i = src.indexOf(marker);
  if (i === -1) throw new Error('card-facts.source.js: Section A marker missing');
  return src.slice(i).replace(/\s+$/, '') + '\n';
}

const BODY = body();

function indent(block, pad) {
  return block.split('\n').map((l) => (l ? pad + l : l)).join('\n');
}

// ── (a) CommonJS mirror, for netlify/functions and node:test ──────────────────
function buildCJS() {
  return `${HEADER}'use strict';

const { showMileage, showHours } = require('./usage-display.generated.js');

${BODY}
module.exports = { ${EXPORTS.join(', ')} };
`;
}

// ── (b) ESM mirror, for Netlify edge functions (Deno) ─────────────────────────
function buildESM() {
  return `${HEADER}// ESM variant for Netlify edge functions (Deno). Logic must match card-facts.generated.js
// byte-for-byte to keep SSR/client parity.

import { showMileage, showHours } from './usage-display.esm.js';

${BODY}
export { ${EXPORTS.join(', ')} };
`;
}

// ── (c) Browser IIFE mirror ───────────────────────────────────────────────────
function buildBrowser() {
  return `${HEADER}// Load AFTER js/taxonomy.browser.js and js/usage-display.browser.js.
// Exposes window.CardFacts (namespaced — no bare globals).
//
// showMileage/showHours are FAIL-OPEN here: when window.UsageDisplay is missing they return
// true, so the mileage/hours pills are NOT suppressed. That reproduces the live client exactly
// (js/inventory-engine.js:425-427 at cc687342: \`if (UD && !UD.showMileage(u)) return null;\`).
// The edge mirrors are fail-closed, as the edge has always been.

(function (root) {
  'use strict';

  function showMileage(u) { var UD = root.UsageDisplay; return UD ? UD.showMileage(u) : true; }
  function showHours(u)   { var UD = root.UsageDisplay; return UD ? UD.showHours(u)   : true; }

${indent(BODY, '  ')}
  root.CardFacts = {
    // The client is the only caller that SELECTs search_pills, so it is the only caller that
    // enables that branch. Caller opts (e.g. { title }) are MERGED on top, so the browser
    // wrapper carries the same opts surface as the edge/CJS mirrors.
    buildCardChips: function (u, o) { return buildCardChips(u, Object.assign({ searchPills: true }, o || {})); },
${EXPORTS.filter((e) => e !== 'buildCardChips').map((e) => `    ${e}: ${e}`).join(',\n')}
  };
})(typeof window !== 'undefined' ? window : globalThis);
`;
}

const RENDER = { cjs: buildCJS, esm: buildESM, browser: buildBrowser };

if (require.main === module) {
  for (const [kind, rel] of Object.entries(TARGETS)) {
    const out = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, RENDER[kind]());
    console.log('wrote ' + rel);
  }
}

module.exports = { RENDER, TARGETS, ROOT };
