'use strict';
// vdp-heading-title.test.js - VDP-H1-COPY-001 (Chief 1 TH-CHIEF_1-20261109-296/-298; Chief 2 -270 ACCEPT).
// buildHeadingTitle is the VDP H1 text only: buildDisplayTitle + the canonical type, with the type left out
// when not canonical, when it is the broad bucket 'Turf & Grounds Care', or when all of its words are already
// in the name, and with a suffix/prefix overlap merged. The edge ESM twin and the browser IIFE twin must agree.
// The other helpers (buildDisplayTitle, buildSeoTitle, subcategoryLabel) must keep their outputs.
// Fixtures are synthetic rows shaped like live units. No network.
// Run: node --test netlify/functions/__tests__/vdp-heading-title.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '../../..');

function loadBrowserTwin() {
  const win = {};
  const ctx = vm.createContext({ window: win });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/taxonomy.browser.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/title-helpers.js'), 'utf8'), ctx);
  return win.TITLE_HELPERS;
}
const loadEdgeTwin = () => import(pathToFileURL(path.join(ROOT, 'netlify/edge-functions/lib/title-helpers.js')).href);

// [label, row, expected H1 text, expected buildDisplayTitle]
const CASES = [
  ['truck + type', { year: '2019', make: 'Freightliner', model: 'Cascadia 126', trim: 'Day Cab Tractor', subcategory: 'Day Cab Tractor' },
    '2019 Freightliner Cascadia 126 Day Cab Tractor', '2019 Freightliner Cascadia 126'],
  ['truck, trim kept, type appended', { year: '2025', make: 'Freightliner', model: 'Business Class M2 106', trim: 'Plus', subcategory: 'Rollback Tow Truck' },
    '2025 Freightliner Business Class M2 106 Plus Rollback Tow Truck', '2025 Freightliner Business Class M2 106 Plus'],
  ['trailer specimen (current stored model)', { year: '2027', make: 'PJ Trailers', model: '16+8ft Tilt', trim: 'Equipment Trailer', subcategory: 'Equipment Trailer' },
    '2027 PJ Trailers 16+8ft Tilt Equipment Trailer', '2027 PJ Trailers 16+8ft Tilt'],
  ['trailer specimen (Owner-corrected model, derived automatically)', { year: '2027', make: 'PJ Trailers', model: '16+8 ft Tilt Deck', trim: 'Equipment Trailer', subcategory: 'Equipment Trailer' },
    '2027 PJ Trailers 16+8 ft Tilt Deck Equipment Trailer', '2027 PJ Trailers 16+8 ft Tilt Deck'],
  ['merge one word', { year: '1984', make: 'Reid', model: 'Deckover', subcategory: 'Deckover Trailer' },
    '1984 Reid Deckover Trailer', '1984 Reid Deckover'],
  ['merge, no year', { year: '', make: 'Modern', model: 'Utility', subcategory: 'Utility Trailer' },
    'Modern Utility Trailer', 'Modern Utility'],
  ['merge two words', { year: '2024', make: 'Acme', model: 'X1 Car Hauler', subcategory: 'Car Hauler Trailer' },
    '2024 Acme X1 Car Hauler Trailer', '2024 Acme X1 Car Hauler'],
  ['full repeat skipped (words already present)', { year: '2020', make: 'Ford', model: 'Transit Connect Cargo Mini Van', trim: 'Cargo Van', subcategory: 'Cargo Van' },
    '2020 Ford Transit Connect Cargo Mini Van', '2020 Ford Transit Connect Cargo Mini Van'],
  ['full repeat, case/punctuation-insensitive', { year: '2019', make: 'X', model: 'ROLL-OFF 20', subcategory: 'Roll-Off' },
    '2019 X ROLL-OFF 20', '2019 X ROLL-OFF 20'],
  ['bucket type skipped', { year: '2019', make: 'Toro', model: 'Grandstand 60', subcategory: 'Turf & Grounds Care' },
    '2019 Toro Grandstand 60', '2019 Toro Grandstand 60'],
  ['non-canonical type adds nothing', { year: '', make: 'Billy Goat', model: 'Hurricane Z3000', subcategory: 'Stand-On Blower' },
    'Billy Goat Hurricane Z3000', 'Billy Goat Hurricane Z3000'],
  ['alias canonicalized', { year: '2012', make: 'Deere', model: '326D', subcategory: 'Wheel Skid Steer' },
    '2012 Deere 326D Skid Steer', '2012 Deere 326D'],
  ['missing type', { year: '1998', make: 'Ford', model: 'F800 De-Icer Truck', subcategory: '' },
    '1998 Ford F800 De-Icer Truck', '1998 Ford F800 De-Icer Truck'],
  ['null type', { year: '1999', make: 'Lay-mor', model: '8HC', subcategory: null },
    '1999 Lay-mor 8HC', '1999 Lay-mor 8HC'],
  ['empty name stays Unit Available', { year: '', make: '', model: '', trim: null, subcategory: 'Truck Body' },
    'Unit Available', 'Unit Available'],
  ['partial overlap is not a merge (data residual kept, noun kept)', { year: '2018', make: 'Ford', model: 'F-250 Flatbed w/ Lift', subcategory: 'Flatbed Truck' },
    '2018 Ford F-250 Flatbed w/ Lift Flatbed Truck', '2018 Ford F-250 Flatbed w/ Lift'],
  ['raw markup is passed through for the caller to escape', { year: '2020', make: 'A&B <Co>', model: '"X" 1', subcategory: 'Box Truck' },
    '2020 A&B <Co> "X" 1 Box Truck', '2020 A&B <Co> "X" 1'],
  ['sold row: no state word', { year: '2018', make: 'Ram', model: '4500', trim: null, subcategory: 'Service Truck', listing_state: 'sold' },
    '2018 Ram 4500 Service Truck', '2018 Ram 4500'],
  ['departed row: no state word', { year: '1996', make: 'Stoughton', model: '48 ft', trim: 'Dry Van Trailer', subcategory: 'Dry Van Trailer', listing_state: 'departed' },
    '1996 Stoughton 48 ft Dry Van Trailer', '1996 Stoughton 48 ft'],
  ['clean trim already names the type', { year: '2015', make: 'Morgan', model: '24', trim: 'Box Truck Body', subcategory: 'Box Truck' },
    '2015 Morgan 24 Box Truck Body', '2015 Morgan 24 Box Truck Body'],
];

test('HT-1: expected H1 text for every rule (edge twin)', async () => {
  const E = await loadEdgeTwin();
  for (const [label, row, want] of CASES) assert.equal(E.buildHeadingTitle(row), want, label);
});

test('HT-2: browser twin returns the same H1 text as the edge twin on every case', async () => {
  const E = await loadEdgeTwin();
  const B = loadBrowserTwin();
  assert.equal(typeof B.buildHeadingTitle, 'function');
  for (const [label, row, want] of CASES) {
    assert.equal(B.buildHeadingTitle(row), E.buildHeadingTitle(row), label);
    assert.equal(B.buildHeadingTitle(row), want, label);
  }
});

test('HT-3: the type is never repeated inside one H1', async () => {
  const E = await loadEdgeTwin();
  for (const [label, row] of CASES) {
    const h = E.buildHeadingTitle(row);
    const name = E.buildDisplayTitle(row);
    assert.ok(h === name || h.startsWith(name + ' '), label + ': H1 starts with the verified name');
    const added = h.slice(name.length).trim();
    if (added) assert.ok(!name.toLowerCase().endsWith(' ' + added.toLowerCase()), label + ': no tail duplicate');
  }
});

test('HT-4: buildDisplayTitle, buildSeoTitle and subcategoryLabel keep their outputs and twin parity', async () => {
  const E = await loadEdgeTwin();
  const B = loadBrowserTwin();
  for (const [label, row, , wantDisplay] of CASES) {
    assert.equal(E.buildDisplayTitle(row), wantDisplay, label);
    assert.equal(B.buildDisplayTitle(row), wantDisplay, label);
    assert.equal(B.buildSeoTitle(row, 'Dunn, NC'), E.buildSeoTitle(row, 'Dunn, NC'), label);
    assert.equal(B.subcategoryLabel(row), E.subcategoryLabel(row), label);
  }
  // pinned literals from the base helpers (unchanged behavior)
  const pj = CASES[2][1];
  assert.equal(E.buildSeoTitle(pj, 'Hope Mills, NC'), '2027 PJ Trailers 16+8ft Tilt Equipment Trailer for Sale');  // 65-char budget drops location
  assert.equal(E.subcategoryLabel(pj), 'Equipment Trailer');
  assert.equal(E.buildSeoTitle(CASES[7][1], ''), '2020 Ford Transit Connect Cargo Mini Van Cargo Van for Sale');  // title residual unchanged (out of scope)
});

test('HT-5: only the VDP H1 uses the new helper (edge emits it once; hydration sets it once)', () => {
  const edge = fs.readFileSync(path.join(ROOT, 'netlify/edge-functions/vehicle.js'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'vehicle.html'), 'utf8');
  assert.equal(edge.split('buildHeadingTitle(unit)').length - 1, 1);
  assert.equal(edge.split('${esc(heading)}').length - 1, 1);
  assert.equal(html.split('TITLE_HELPERS.buildHeadingTitle(unit)').length - 1, 1);
  assert.match(html, /hlTitle\.textContent = window\.TITLE_HELPERS\.buildHeadingTitle\(unit\)/);
});
