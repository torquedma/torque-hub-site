#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT       = path.join(__dirname, '..');
const ADMIN_ROOT = path.join(process.env.HOME, 'Downloads/torquehub-admin');
const TAX_JSON   = path.join(ROOT, 'netlify/functions/lib/taxonomy.json');

const { canonical_subcategories: canonical, subcategory_aliases: aliases } =
  JSON.parse(fs.readFileSync(TAX_JSON, 'utf8'));

const HEADER = '// GENERATED FROM taxonomy.json — DO NOT EDIT. Run npm run gen-taxonomy.\n';

// ── (a) CommonJS module for Netlify functions ─────────────────────────────────
function buildCJS() {
  const canonicalLines = canonical.map(s => `  '${s.replace(/'/g, "\\'")}'`).join(',\n');
  const aliasLines = Object.entries(aliases)
    .map(([k, v]) => `  '${k.replace(/'/g, "\\'")}': '${v.replace(/'/g, "\\'")}'`)
    .join(',\n');

  return `${HEADER}'use strict';

const CANONICAL_SUBCATEGORIES = new Set([
${canonicalLines}
]);

const SUBCATEGORY_ALIASES = {
${aliasLines}
};

function canonicalize(value) {
  if (!value) return '';
  const v = value.toString().trim();
  const mapped = SUBCATEGORY_ALIASES.hasOwnProperty(v) ? SUBCATEGORY_ALIASES[v] : v;
  return CANONICAL_SUBCATEGORIES.has(mapped) ? mapped : '';
}

module.exports = { CANONICAL_SUBCATEGORIES, SUBCATEGORY_ALIASES, canonicalize };
`;
}

// ── (b) Browser global for inventory-engine.js / admin ───────────────────────
function buildBrowser() {
  const canonicalJSON = JSON.stringify(canonical, null, 2)
    .split('\n').map((l, i) => i === 0 ? l : '  ' + l).join('\n');
  const aliasLines = Object.entries(aliases)
    .map(([k, v]) => `    '${k.replace(/'/g, "\\'")}': '${v.replace(/'/g, "\\'")}'`)
    .join(',\n');

  return `${HEADER}(function (root) {
  var canonical = ${canonicalJSON};
  var aliases = {
${aliasLines}
  };
  function canonicalize(value) {
    if (!value) return '';
    var v = value.toString().trim();
    var mapped = Object.prototype.hasOwnProperty.call(aliases, v) ? aliases[v] : v;
    return canonical.indexOf(mapped) !== -1 ? mapped : '';
  }
  root.TAXONOMY = { canonical: canonical, aliases: aliases, canonicalize: canonicalize };
}(typeof window !== 'undefined' ? window : this));
`;
}

const cjsContent     = buildCJS();
const browserContent = buildBrowser();

const TARGETS = [
  {
    path: path.join(ROOT, 'netlify/functions/lib/taxonomy.generated.js'),
    content: cjsContent,
    label: 'hub CJS',
  },
  {
    path: path.join(ROOT, 'js/taxonomy.browser.js'),
    content: browserContent,
    label: 'browser global',
  },
  {
    path: path.join(ADMIN_ROOT, 'netlify/functions/lib/taxonomy.generated.js'),
    content: cjsContent,
    label: 'admin CJS',
  },
  {
    path: path.join(ADMIN_ROOT, 'js/taxonomy.browser.js'),
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
