'use strict';
// golf-cart-land-leveler-taxonomy.test.js — Other/Golf Cart and Farm/Land Leveler canonical leaves
// (Chief rulings 2026-09-30, Master Board v6 §37; rebuilt on ba6710d after the Sprayer leaf and Task D).
// Run: node --test netlify/functions/__tests__/golf-cart-land-leveler-taxonomy.test.js
// Loads the REAL generated modules and the REAL receiver deriveCategory. No network, no database.
const test = require('node:test');
const assert = require('node:assert/strict');

const { parentOf } = require('../lib/taxonomy-parents.generated.js');
const { canonicalize, CANONICAL_SUBCATEGORIES } = require('../lib/taxonomy.generated.js');
const usage = require('../lib/usage-display.generated.js');
const { deriveCategory } = require('../sync-truckpaper-background.js');

test('G1: Golf Cart is canonical', () => {
  assert.ok(CANONICAL_SUBCATEGORIES.has('Golf Cart'));
  assert.equal(canonicalize('Golf Cart'), 'Golf Cart');
});

test('G2: parentOf(Golf Cart) is Other', () => {
  assert.equal(parentOf('Golf Cart'), 'Other');
});

test('G3: Golf Cart derives Other whatever the source category or make', () => {
  for (const make of ['SDLanch', 'Club Car', 'E-Z-GO', 'Yamaha', '']) for (const category of ['Farm', 'Trucks', 'Trailers', 'Other', '']) {
    assert.equal(deriveCategory('Golf Cart', make, { category, make }), 'Other', `${make}|${category}`);
  }
});

test('G4: usage display — Golf Cart is mileage-based (allow_mileage), never hours', () => {
  const gc = { subcategory: 'Golf Cart', mileage: '3', hours: '850' };
  assert.equal(usage.usageClass(gc), 'odometer');
  assert.equal(usage.showMileage(gc), true);
  assert.equal(usage.showHours(gc), false);
  assert.equal(usage.isKnownSuppressMileage(gc), false);
});

test('G5: neighbouring leaves unchanged (incl. Sprayer from 24b01a9)', () => {
  assert.equal(parentOf('Utility Vehicle'), 'Farm');
  assert.equal(usage.usageClass({ subcategory: 'Utility Vehicle', hours: '10' }), 'hours-based');
  assert.equal(parentOf('Grain Drill'), 'Farm');
  assert.equal(parentOf('Sprayer'), 'Farm');
  assert.equal(usage.showHours({ subcategory: 'Sprayer', hours: '10' }), false);
  assert.equal(usage.showMileage({ subcategory: 'Sprayer', mileage: '10' }), false);
  assert.equal(deriveCategory('Truck Body', 'Morgan', { category: 'Trailers' }), 'Other');
});

test('L1: parentOf(Land Leveler) is Farm and it stays canonical', () => {
  assert.equal(parentOf('Land Leveler'), 'Farm');
  assert.equal(canonicalize('Land Leveler'), 'Land Leveler');
});

test('L2: Land Leveler derives Farm whatever the source category or make', () => {
  for (const make of ['Frontier', 'John Deere', '']) for (const category of ['Landscape', 'Trailers', 'Farm', '']) {
    assert.equal(deriveCategory('Land Leveler', make, { category, make }), 'Farm', `${make}|${category}`);
  }
});

test('L3: usage display — Land Leveler stays hours-based', () => {
  assert.equal(usage.usageClass({ subcategory: 'Land Leveler', hours: '10' }), 'hours-based');
});
