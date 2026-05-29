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
  [path.join(ROOT, 'netlify/functions/lib/taxonomy.generated.js')]: buildCJS(),
  [path.join(ROOT, 'js/taxonomy.browser.js')]:                       buildBrowser(),
  [path.join(ADMIN_ROOT, 'netlify/functions/lib/taxonomy.generated.js')]: buildCJS(),
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
  process.exit(0);
}
