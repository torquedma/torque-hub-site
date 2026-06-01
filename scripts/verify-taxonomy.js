#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT       = path.join(__dirname, '..');
const ADMIN_ROOT = path.join(process.env.HOME, 'Downloads/torquehub-admin');
const TAX_JSON   = path.join(ROOT, 'netlify/functions/lib/taxonomy.json');

// Re-run generation into strings (same logic as generate-taxonomy.js)
const { canonical_subcategories: canonical, subcategory_aliases: aliases } =
  JSON.parse(fs.readFileSync(TAX_JSON, 'utf8'));

const HEADER = '// GENERATED FROM taxonomy.json — DO NOT EDIT. Run npm run gen-taxonomy.\n';

function buildCJS() {
  const canonicalLines = canonical.map(s => `  '${s.replace(/'/g, "\\'")}'`).join(',\n');
  const aliasLines = Object.entries(aliases)
    .map(([k, v]) => `  '${k.replace(/'/g, "\\'")}': '${v.replace(/'/g, "\\'")}'`)
    .join(',\n');
  return `${HEADER}'use strict';\n\nconst CANONICAL_SUBCATEGORIES = new Set([\n${canonicalLines}\n]);\n\nconst SUBCATEGORY_ALIASES = {\n${aliasLines}\n};\n\nfunction canonicalize(value) {\n  if (!value) return '';\n  const v = value.toString().trim();\n  const mapped = SUBCATEGORY_ALIASES.hasOwnProperty(v) ? SUBCATEGORY_ALIASES[v] : v;\n  return CANONICAL_SUBCATEGORIES.has(mapped) ? mapped : '';\n}\n\nmodule.exports = { CANONICAL_SUBCATEGORIES, SUBCATEGORY_ALIASES, canonicalize };\n`;
}

function buildBrowser() {
  const canonicalJSON = JSON.stringify(canonical, null, 2)
    .split('\n').map((l, i) => i === 0 ? l : '  ' + l).join('\n');
  const aliasLines = Object.entries(aliases)
    .map(([k, v]) => `    '${k.replace(/'/g, "\\'")}': '${v.replace(/'/g, "\\'")}'`)
    .join(',\n');
  return `${HEADER}(function (root) {\n  var canonical = ${canonicalJSON};\n  var aliases = {\n${aliasLines}\n  };\n  function canonicalize(value) {\n    if (!value) return '';\n    var v = value.toString().trim();\n    var mapped = Object.prototype.hasOwnProperty.call(aliases, v) ? aliases[v] : v;\n    return canonical.indexOf(mapped) !== -1 ? mapped : '';\n  }\n  root.TAXONOMY = { canonical: canonical, aliases: aliases, canonicalize: canonicalize };\n}(typeof window !== 'undefined' ? window : this));\n`;
}

const expected = {
  [path.join(ROOT, 'netlify/functions/lib/taxonomy.generated.js')]:       buildCJS(),
  [path.join(ROOT, 'js/taxonomy.browser.js')]:                             buildBrowser(),
  [path.join(ADMIN_ROOT, 'netlify/functions/lib/taxonomy.generated.js')]: buildCJS(),
  [path.join(ADMIN_ROOT, 'js/taxonomy.browser.js')]:                       buildBrowser(),
};

let drifted = false;
for (const [filePath, expectedContent] of Object.entries(expected)) {
  if (!fs.existsSync(filePath)) {
    console.error(`MISSING: ${filePath}`);
    drifted = true;
    continue;
  }
  const actual = fs.readFileSync(filePath, 'utf8');
  if (actual !== expectedContent) {
    console.error(`DRIFT: ${filePath}`);
    // Print a simple line-by-line diff
    const aLines = actual.split('\n');
    const eLines = expectedContent.split('\n');
    const maxLen = Math.max(aLines.length, eLines.length);
    for (let i = 0; i < maxLen; i++) {
      if (aLines[i] !== eLines[i]) {
        console.error(`  line ${i + 1}:`);
        console.error(`    actual:   ${JSON.stringify(aLines[i])}`);
        console.error(`    expected: ${JSON.stringify(eLines[i])}`);
      }
    }
    drifted = true;
  } else {
    console.log(`OK: ${filePath}`);
  }
}

if (drifted) {
  console.error('\nverify-taxonomy: FAILED — generated files are out of sync with taxonomy.json');
  process.exit(1);
} else {
  console.log('\nverify-taxonomy: OK — all generated files match taxonomy.json');
}

// ---------------------------------------------------------------------------
// ORPHAN_SUB pass — catch subcategories wired into buyer-facing layers that
// are neither canonical nor a defined alias (the Boom Truck / Conestoga /
// Living Quarters Trailer bug class).
// ---------------------------------------------------------------------------

const canonicalSet = new Set(canonical);

// Extract every value from every subs: [...] array in a JS source file.
// Strategy: find each `subs: [...]` block, then pull every single-quoted
// string out of it.  Handles multi-value arrays like ['Foo', 'Bar'] and
// tight spacing like ['Foo','Bar'].
function extractSubsFrom(src, filePath) {
  const results = [];
  const blockRe = /\bsubs:\s*\[([^\]]*)\]/g;
  const strRe   = /'([^']+)'/g;
  let block;
  while ((block = blockRe.exec(src)) !== null) {
    const inner = block[1];
    let m;
    while ((m = strRe.exec(inner)) !== null) {
      results.push({ sub: m[1], file: filePath });
    }
  }
  return results;
}

const CAT_SUBS_FILE   = path.join(ROOT, 'js/inventory-engine.js');
const LEAVES_FILE     = path.join(ROOT, 'netlify/edge-functions/category.js');

const catSubsRefs   = extractSubsFrom(fs.readFileSync(CAT_SUBS_FILE,   'utf8'), 'CAT_SUBS (inventory-engine.js)');
const leavesRefs    = extractSubsFrom(fs.readFileSync(LEAVES_FILE,     'utf8'), 'SUBCATEGORY_LEAVES (category.js)');
const allRefs       = [...catSubsRefs, ...leavesRefs];

// Deduplicate for the OK count, but keep per-source info for failure output.
const uniqueSubs = new Set(allRefs.map(r => r.sub));

// REVIEW-ONLY verbose output — remove or stop setting VERIFY_VERBOSE once
// you've confirmed the parse caught everything expected.
if (process.env.VERIFY_VERBOSE) {
  console.log('\n--- REVIEW: all subs extracted from CAT_SUBS ---');
  catSubsRefs.forEach(r => console.log('  ' + r.sub));
  console.log('\n--- REVIEW: all subs extracted from SUBCATEGORY_LEAVES ---');
  leavesRefs.forEach(r => console.log('  ' + r.sub));
  console.log('--- END REVIEW ---\n');
}

let orphaned = false;
for (const { sub, file } of allRefs) {
  if (!canonicalSet.has(sub) && !Object.prototype.hasOwnProperty.call(aliases, sub)) {
    console.error(`ORPHAN_SUB: '${sub}' referenced in ${file} is neither canonical nor a defined alias`);
    orphaned = true;
  }
}

if (orphaned) {
  console.error('\nverify-taxonomy: FAILED — orphaned subcategories found (run npm run gen-taxonomy if taxonomy.json was just updated)');
  process.exit(1);
} else {
  console.log(`ORPHAN_SUB OK: checked ${uniqueSubs.size} unique subcategories across CAT_SUBS and SUBCATEGORY_LEAVES`);
  process.exit(0);
}
