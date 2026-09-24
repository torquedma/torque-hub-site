#!/usr/bin/env node
'use strict';
// generate-taxonomy-parents.js — builds the Netlify-functions (CommonJS) mirror of the
// subcategory → parent-category map declared in js/taxonomy-data.js, the canonical
// taxonomy source of truth. Run: node scripts/generate-taxonomy-parents.js
// The receiver uses the mirror so a canonical subcategory's parent can never be
// overridden by a raw source category (Allied 'Trailers' on trucks, 2026-09-24).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'js/taxonomy-data.js');
const OUT = path.join(ROOT, 'netlify/functions/lib/taxonomy-parents.generated.js');

function loadTaxonomyData(file = SRC) {
  // taxonomy-data.js is an ES module with a browser block; evaluate its data only.
  const src = fs.readFileSync(file, 'utf8')
    .replace(/^export\s*\{[^}]*\};?\s*$/m, '')
    .replace(/if \(typeof window !== 'undefined'\) \{[\s\S]*?\n\}\n/, '');
  const ctx = {};
  vm.runInNewContext(src + '\n;this.__T = TAXONOMY_DATA;', ctx);
  if (!Array.isArray(ctx.__T) || !ctx.__T.length) throw new Error('TAXONOMY_DATA not found');
  return ctx.__T;
}

function buildParentMap(data) {
  const parent = {};
  for (const e of data) {
    for (const sub of e.subs || []) {
      if (parent[sub] && parent[sub] !== e.category) {
        throw new Error(`subcategory '${sub}' has two parents: ${parent[sub]} and ${e.category}`);
      }
      parent[sub] = e.category;
    }
  }
  return parent;
}

function render(parent) {
  const lines = Object.keys(parent).sort().map(k => `  ${JSON.stringify(k)}: ${JSON.stringify(parent[k])},`).join('\n');
  return `// GENERATED FROM js/taxonomy-data.js — DO NOT EDIT. Run: node scripts/generate-taxonomy-parents.js
'use strict';

const SUBCATEGORY_PARENT = Object.freeze({
${lines}
});

// Canonical parent category of a subcategory, or null when the taxonomy does not declare one.
function parentOf(subcategory) {
  return typeof subcategory === 'string' && Object.prototype.hasOwnProperty.call(SUBCATEGORY_PARENT, subcategory)
    ? SUBCATEGORY_PARENT[subcategory] : null;
}

module.exports = { SUBCATEGORY_PARENT, parentOf };
`;
}

if (require.main === module) {
  fs.writeFileSync(OUT, render(buildParentMap(loadTaxonomyData())));
  console.log('wrote', path.relative(ROOT, OUT));
}

module.exports = { loadTaxonomyData, buildParentMap, render, SRC, OUT };
