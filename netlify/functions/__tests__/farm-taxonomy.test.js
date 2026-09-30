'use strict';
// farm-taxonomy.test.js — Farm/Grain Drill leaf, Disk parent, canonical-parent receiver rule (Chief 2026-09-30).
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
