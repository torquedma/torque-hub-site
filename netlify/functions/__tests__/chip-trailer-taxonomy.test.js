'use strict';
// chip-trailer-taxonomy.test.js — Trailers/Chip Trailer canonical leaf (Owner ruled 2026-10-02:
// first chip trailers, Wilson Trailer Sales Peerless units). Non-SSR leaf, no SEO page, no sitemap entry.
// Run: node --test netlify/functions/__tests__/chip-trailer-taxonomy.test.js
// Loads the REAL generated modules, the REAL taxonomy-data.js and the REAL receiver deriveCategory.
// No network, no database.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { parentOf } = require('../lib/taxonomy-parents.generated.js');
const { canonicalize, CANONICAL_SUBCATEGORIES } = require('../lib/taxonomy.generated.js');
const usage = require('../lib/usage-display.generated.js');
const { deriveCategory } = require('../sync-truckpaper-background.js');

function taxonomyData() {
  const src = fs.readFileSync(path.join(__dirname, '../../../js/taxonomy-data.js'), 'utf8')
    .replace(/^export\s*\{[^}]*\};?\s*$/m, '')
    .replace(/if \(typeof window !== 'undefined'\) \{[\s\S]*?\n\}\n/, '');
  const ctx = {};
  vm.runInNewContext(src + '\n;this.__T = TAXONOMY_DATA;', ctx);
  return ctx.__T;
}

test('C1: Chip Trailer is canonical', () => {
  assert.ok(CANONICAL_SUBCATEGORIES.has('Chip Trailer'));
  assert.equal(canonicalize('Chip Trailer'), 'Chip Trailer');
});

test('C2: parentOf(Chip Trailer) is Trailers', () => {
  assert.equal(parentOf('Chip Trailer'), 'Trailers');
});

test('C3: Chip Trailer derives Trailers whatever the source category or make', () => {
  for (const make of ['Peerless', 'Wilson', '']) for (const category of ['Trailers', 'Trucks', 'Farm', 'Other', '']) {
    assert.equal(deriveCategory('Chip Trailer', make, { category, make }), 'Trailers', `${make}|${category}`);
  }
});

test('C4: usage display — Chip Trailer suppresses both mileage and hours, like every trailer', () => {
  const ct = { subcategory: 'Chip Trailer', mileage: '120000', hours: '900' };
  assert.equal(usage.showMileage(ct), false);
  assert.equal(usage.showHours(ct), false);
  assert.equal(usage.usageClass(ct), usage.usageClass({ subcategory: 'Belt Trailer', mileage: '1', hours: '1' }));
});

test('C5: leaf is a Trailers tile, non-SSR, exactly one entry', () => {
  const leaves = taxonomyData().filter(e => (e.subs || []).includes('Chip Trailer'));
  assert.equal(leaves.length, 1);
  assert.equal(leaves[0].category, 'Trailers');
  assert.equal(leaves[0].ssr, false);
  assert.equal(leaves[0].slug, 'chip-trailers');
});

test('C6: neighbouring leaves unchanged', () => {
  assert.equal(parentOf('Belt Trailer'), 'Trailers');
  assert.equal(parentOf('Hopper Bottom Trailer'), 'Trailers');
  assert.equal(parentOf('Dry Van Trailer'), 'Trailers');
  assert.equal(parentOf('Golf Cart'), 'Other');
  assert.equal(parentOf('Land Leveler'), 'Farm');
  assert.equal(taxonomyData().filter(e => e.category === 'Trailers' && e.ssr === true).length, 16);
});
