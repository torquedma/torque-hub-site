#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT       = path.join(__dirname, '..');
const ADMIN_ROOT = path.join(process.env.HOME, 'torquedma/torque-hub-admin');
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

let failed = false;
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
} else {
  console.log('\nverify-taxonomy: OK — all generated files match taxonomy.json');
}
failed = failed || drifted;

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
} else {
  console.log(`ORPHAN_SUB OK: checked ${uniqueSubs.size} unique subcategories across CAT_SUBS and SUBCATEGORY_LEAVES`);
}
failed = failed || orphaned;

// ---------------------------------------------------------------------------
// LEAF_ROUTING pass — cross-check every ssr:true taxonomy-data entry against
// netlify.toml category routes, sitemap.js leaf entries, and
// inventory-engine.js tile slugs. All parsed as text — no require().
// ---------------------------------------------------------------------------

const TAX_DATA_FILE = path.join(ROOT, 'js/taxonomy-data.js');
const NETLIFY_TOML  = path.join(ROOT, 'netlify.toml');
const SITEMAP_FILE  = path.join(ROOT, 'netlify/functions/sitemap.js');
// CAT_SUBS_FILE already defined above

// ── parsers ──────────────────────────────────────────────────────────────────

function parseTaxonomyEntries(src) {
  const entries = [];
  const objRe = /\{[^}]+\}/g;
  let m;
  while ((m = objRe.exec(src)) !== null) {
    const obj = m[0];
    const category = (obj.match(/category:\s*'([^']+)'/) || [])[1];
    const slug     = (obj.match(/slug:\s*'([^']+)'/)     || [])[1];
    const label    = (obj.match(/label:\s*'([^']+)'/)    || [])[1];
    if (!category || !slug || !label) continue;
    const ssrMatch  = obj.match(/\bssr:\s*(true|false)\b/);
    const ssr       = ssrMatch ? ssrMatch[1] === 'true' : false;
    const subsBlock = (obj.match(/subs:\s*\[([^\]]*)\]/) || [])[1] || '';
    const subs = [];
    const subStrRe = /'([^']+)'/g;
    let sm;
    while ((sm = subStrRe.exec(subsBlock)) !== null) subs.push(sm[1]);
    entries.push({ category, slug, label, subs, ssr });
  }
  return entries;
}

function parseCategoryHubSlugs(src) {
  const hubSlugs = new Set();
  const blockM = src.match(/const CATEGORY_HUB\s*=\s*\{([^}]+)\}/);
  if (!blockM) return hubSlugs;
  const valRe = /:\s*'([^']+)'/g;
  let m;
  while ((m = valRe.exec(blockM[1])) !== null) hubSlugs.add(m[1]);
  return hubSlugs;
}

function parseTomlCategoryRoutes(src) {
  src = src.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  const slugs = new Set();
  const blocks = src.split(/\[\[edge_functions\]\]/);
  for (const block of blocks) {
    if (/function\s*=\s*"category"/.test(block)) {
      const pm = block.match(/path\s*=\s*"\/([^"]+)"/);
      if (pm) slugs.add(pm[1]);
    }
  }
  return slugs;
}

function parseSitemapLeafSlugs(src) {
  src = src.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  const slugs = new Set();
  const re = /\{\s*loc:\s*'\/([\w-]+)'/g;
  let m;
  while ((m = re.exec(src)) !== null) slugs.add(m[1]);
  return slugs;
}

function parseTileMap(src) {
  src = src.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  const map = new Map();
  const cats = ['Trucks', 'Trailers', 'Construction', 'Farm', 'Landscape'];
  for (const cat of cats) {
    const catRe = new RegExp(`['"]${cat}['"]\\s*:\\s*\\[`, 'g');
    const cm = catRe.exec(src);
    if (!cm) continue;
    let depth = 1, i = cm.index + cm[0].length;
    const start = i;
    while (i < src.length && depth > 0) {
      if (src[i] === '[') depth++;
      else if (src[i] === ']') depth--;
      i++;
    }
    const block = src.slice(start, i - 1);
    const entryRe = /label\s*:\s*'([^']+)'[^{}]*?slug\s*:\s*'([^']+)'/g;
    let em;
    while ((em = entryRe.exec(block)) !== null) map.set(`${cat}:${em[1]}`, em[2]);
  }
  return map;
}

// ── load & parse ─────────────────────────────────────────────────────────────

const taxSrc       = fs.readFileSync(TAX_DATA_FILE, 'utf8');
const taxEntries   = parseTaxonomyEntries(taxSrc);
const hubSlugs     = parseCategoryHubSlugs(taxSrc);
const tomlRoutes   = parseTomlCategoryRoutes(fs.readFileSync(NETLIFY_TOML, 'utf8'));
const sitemapSlugs = parseSitemapLeafSlugs(fs.readFileSync(SITEMAP_FILE, 'utf8'));
const tileMap      = parseTileMap(fs.readFileSync(CAT_SUBS_FILE, 'utf8'));

const ssrLeaves = taxEntries.filter(e => e.ssr);
const ssrSlugs  = new Set(ssrLeaves.map(e => e.slug));

let leafFailed = false;

// ── FORWARD checks ───────────────────────────────────────────────────────────

for (const e of ssrLeaves) {
  if (!e.slug.endsWith('-for-sale')) {
    console.error(`LEAF_ROUTING (a) ssr:true slug missing '-for-sale' suffix: '${e.slug}' [${e.category}]`);
    leafFailed = true;
  }
  if (e.subs.length === 0) {
    console.error(`LEAF_ROUTING (b) ssr:true entry has empty subs[]: '${e.slug}' [${e.category}]`);
    leafFailed = true;
  }
  if (!tomlRoutes.has(e.slug)) {
    console.error(`LEAF_ROUTING (c) missing netlify.toml category route: '${e.slug}' [${e.category}]`);
    leafFailed = true;
  }
  if (!sitemapSlugs.has(e.slug)) {
    console.error(`LEAF_ROUTING (d) missing sitemap.js entry: '${e.slug}' [${e.category}]`);
    leafFailed = true;
  }
  const tileSlug = tileMap.get(`${e.category}:${e.label}`);
  if (tileSlug !== undefined && tileSlug !== e.slug) {
    console.error(`LEAF_ROUTING (e) tile slug mismatch for '${e.category}:${e.label}': tile='${tileSlug}' taxonomy='${e.slug}'`);
    leafFailed = true;
  }
}

// ── REVERSE checks ───────────────────────────────────────────────────────────

for (const slug of tomlRoutes) {
  if (!ssrSlugs.has(slug) && !hubSlugs.has(slug)) {
    console.error(`LEAF_ROUTING (f) orphan netlify.toml route '/${slug}' has no ssr:true taxonomy entry`);
    leafFailed = true;
  }
}

for (const slug of sitemapSlugs) {
  if (slug.endsWith('-for-sale') && !ssrSlugs.has(slug) && !hubSlugs.has(slug)) {
    console.error(`LEAF_ROUTING (g) orphan sitemap entry '/${slug}' has no ssr:true taxonomy entry`);
    leafFailed = true;
  }
}

for (const e of taxEntries) {
  if (!e.ssr && e.slug.endsWith('-for-sale')) {
    console.error(`LEAF_ROUTING (h) kw-only (ssr:false) entry uses '-for-sale' slug: '${e.slug}' [${e.category}]`);
    leafFailed = true;
  }
}

if (!leafFailed) {
  console.log(`LEAF_ROUTING OK: ${ssrLeaves.length} SSR leaves validated across 4 surfaces`);
}
failed = failed || leafFailed;

process.exit(failed ? 1 : 0);
