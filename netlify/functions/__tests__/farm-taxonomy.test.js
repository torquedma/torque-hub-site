'use strict';
// farm-taxonomy.test.js — Farm/Grain Drill leaf, Disk parent, canonical-parent receiver rule (Chief 2026-09-30);
// Farm/Sprayer leaf, suppress both mileage and hours (Owner 2026-09-30, T9-T13).
// Run: node --test netlify/functions/__tests__/farm-taxonomy.test.js
// Loads the REAL generated modules and the REAL receiver deriveCategory. No network, no database.
const test = require('node:test');
const assert = require('node:assert/strict');

const { parentOf, SUBCATEGORY_PARENT } = require('../lib/taxonomy-parents.generated.js');
const { canonicalize, CANONICAL_SUBCATEGORIES } = require('../lib/taxonomy.generated.js');
const usage = require('../lib/usage-display.generated.js');
const { deriveCategory } = require('../sync-truckpaper-background.js');

test('T1: parentOf(Grain Drill) and parentOf(Disk) are Farm', () => {
  assert.equal(parentOf('Grain Drill'), 'Farm');
  assert.equal(parentOf('Disk'), 'Farm');
});

test('T2: Grain Drill sent under Trailers derives Farm', () => {
  assert.equal(deriveCategory('Grain Drill', 'John Deere', { category: 'Trailers' }), 'Farm');
});

test('T3: Disk sent under Trailers derives Farm', () => {
  assert.equal(deriveCategory('Disk', 'Case', { category: 'Trailers' }), 'Farm');
});

test('T4: dealer-agnostic — Grain Drill and Disk give Farm for any make, source Trailers/Trucks/empty', () => {
  const makes = ['John Deere', 'Case', 'Great Plains', 'Kinze', 'International', 'Allied', ''];
  const dealers = ['Allied Truck & Trailer Sales', 'DeBary Truck Sales', 'Suttontown Repair Service', ''];
  for (const sub of ['Grain Drill', 'Disk']) for (const make of makes) for (const dealer of dealers) for (const category of ['Trailers', 'Trucks', '']) {
    assert.equal(deriveCategory(sub, make, { category, dealer, make }), 'Farm', `${sub}|${make}|${dealer}|${category}`);
  }
});

test('T5: Trucks parentage unchanged — every canonical Trucks sub sent under Trailers stays Trucks', () => {
  const truckSubs = Object.keys(SUBCATEGORY_PARENT).filter(s => SUBCATEGORY_PARENT[s] === 'Trucks');
  assert.ok(truckSubs.includes('Dump Truck') && truckSubs.includes('Flatbed Truck'));
  for (const s of truckSubs) assert.equal(deriveCategory(s, 'Freightliner', { category: 'Trailers' }), 'Trucks', s);
});

test('T6: earlier special cases still win over the canonical parent and the source category', () => {
  assert.equal(deriveCategory('Utility Trailer', 'Big Tex', { category: 'Trucks' }), 'Trailers');
  assert.equal(deriveCategory('Crane Truck', 'Grove', { category: 'Trucks' }), 'Construction');
  assert.equal(deriveCategory('Crane Truck', 'Link-Belt', { category: 'Trucks' }), 'Construction');
  assert.equal(deriveCategory('Crane Truck', 'Freightliner', { category: 'Trailers' }), 'Trucks');
  assert.equal(deriveCategory('Truck Body', 'Morgan', { category: 'Trailers' }), 'Other');
  // no canonical parent → the raw source category is still the fallback, then 'Trucks'
  assert.equal(parentOf('Zorp Widget'), null);
  assert.equal(deriveCategory('Zorp Widget', 'X', { category: 'Trailers' }), 'Trailers');
  assert.equal(deriveCategory('Zorp Widget', 'X', {}), 'Trucks');
});

test('T7: usage display — Grain Drill is suppress_both; Disk stays hours-based (Ryan 2026-09-30)', () => {
  const gd = { subcategory: 'Grain Drill', mileage: '12,000', hours: '850' };
  assert.equal(usage.isKnownSuppressMileage(gd), true);
  assert.equal(usage.isKnownSuppressHours(gd), true);
  assert.equal(usage.showMileage(gd), false);
  assert.equal(usage.showHours(gd), false);
  const disk = { subcategory: 'Disk', mileage: '12,000', hours: '850' };
  assert.equal(usage.usageClass(disk), 'hours-based');
  assert.equal(usage.showHours(disk), true);
  assert.equal(usage.isKnownSuppressHours(disk), false);
});

test('T8: canonicalize(Grain Drill) returns Grain Drill', () => {
  assert.equal(canonicalize('Grain Drill'), 'Grain Drill');
  assert.ok(CANONICAL_SUBCATEGORIES.has('Grain Drill'));
});

// ── Sprayer (Owner 2026-09-30): real Farm leaf, not an alias of any other leaf ──

test('T9: canonicalize(Sprayer) returns Sprayer in the CJS mirror and the browser global', () => {
  assert.equal(canonicalize('Sprayer'), 'Sprayer');
  assert.ok(CANONICAL_SUBCATEGORIES.has('Sprayer'));
  const fs = require('fs');
  const path = require('path');
  const vm = require('vm');
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../../js/taxonomy.browser.js'), 'utf8'), ctx);
  assert.equal(ctx.window.TAXONOMY.canonicalize('Sprayer'), 'Sprayer');
  assert.ok(ctx.window.TAXONOMY.canonical.includes('Sprayer'));
});

test('T10: parentOf(Sprayer) is Farm; Sprayer is a kw-only Farm leaf (no SSR route) in exactly one entry', () => {
  assert.equal(parentOf('Sprayer'), 'Farm');
  const { loadTaxonomyData } = require('../../../scripts/generate-taxonomy-parents.js');
  const owners = loadTaxonomyData().filter(e => (e.subs || []).includes('Sprayer'));
  assert.equal(owners.length, 1);
  assert.equal(owners[0].category, 'Farm');
  assert.equal(owners[0].ssr, false);
  assert.deepEqual(Array.from(owners[0].subs), ['Sprayer']); // vm-realm array → copy before deep compare
});

test('T11: dealer-agnostic — Sprayer gives Farm for any make, source Trailers/Trucks/empty', () => {
  const makes = ['Sheppard', 'John Deere', 'Fimco', 'Kinze', 'Allied', ''];
  const dealers = ['Allied Truck & Trailer Sales', 'DeBary Truck Sales', 'Suttontown Repair Service', ''];
  for (const make of makes) for (const dealer of dealers) for (const category of ['Trailers', 'Trucks', '']) {
    assert.equal(deriveCategory('Sprayer', make, { category, dealer, make }), 'Farm', `Sprayer|${make}|${dealer}|${category}`);
  }
});

test('T12: usage display — Sprayer suppresses both mileage and hours', () => {
  const u = { subcategory: 'Sprayer', mileage: '12,000', hours: '850' };
  assert.equal(usage.isKnownSuppressMileage(u), true);
  assert.equal(usage.isKnownSuppressHours(u), true);
  assert.equal(usage.showMileage(u), false);
  assert.equal(usage.showHours(u), false);
  assert.equal(usage.usageClass(u), 'neither');
});

test('T13: adding Sprayer leaves Grain Drill / Disk / Tractor unchanged', () => {
  assert.equal(parentOf('Grain Drill'), 'Farm');
  assert.equal(parentOf('Disk'), 'Farm');
  assert.equal(parentOf('Tractor'), 'Farm');
  assert.equal(canonicalize('Disks'), 'Disk');
  assert.equal(usage.usageClass({ subcategory: 'Disk' }), 'hours-based');
  assert.equal(usage.usageClass({ subcategory: 'Grain Drill' }), 'neither');
  assert.equal(usage.usageClass({ subcategory: 'Tractor' }), 'hours-based');
});
