'use strict';
// title-helpers-subcategory.test.js — Owner 2026-10-02: subcategory says what a unit is,
// trim is optional extra detail, and the code keeps the type from showing twice.
//   - buildSeoTitle: clean trim + canonical subcategory (subcategory skipped when the trim
//     already contains it).
//   - subcategoryLabel: the label shown under a display title ('' when the trim contains it).
// Loads the REAL browser twin (js/title-helpers.js via vm, with the generated
// js/taxonomy.browser.js) and the REAL edge twin (netlify/edge-functions/lib/title-helpers.js,
// copied with its generated taxonomy.esm.js to a temp dir as .mjs) and proves both twins
// return identical results. No network, no database.
// Run: node --test netlify/functions/lib/__tests__/title-helpers-subcategory.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '../../../..');

function browserTwin() {
  const ctx = { window: {} };
  ctx.window.window = ctx.window;
  vm.createContext(ctx);
  for (const f of ['js/taxonomy.browser.js', 'js/title-helpers.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  return ctx.window.TITLE_HELPERS;
}

async function edgeTwin() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'title-helpers-'));
  const lib = path.join(ROOT, 'netlify/edge-functions/lib');
  fs.writeFileSync(path.join(dir, 'taxonomy.esm.mjs'), fs.readFileSync(path.join(lib, 'taxonomy.esm.js'), 'utf8'));
  fs.writeFileSync(path.join(dir, 'title-helpers.mjs'),
    fs.readFileSync(path.join(lib, 'title-helpers.js'), 'utf8').replace("'./taxonomy.esm.js'", "'./taxonomy.esm.mjs'"));
  return import(pathToFileURL(path.join(dir, 'title-helpers.mjs')).href);
}

const U = {
  peerless:   { year: '2017', make: 'Peerless', model: '', trim: "45' Flat Floor", subcategory: 'Chip Trailer' },
  peerlessDup:{ year: '2017', make: 'Peerless', model: '', trim: "45' Flat Floor Chip Trailer", subcategory: 'Chip Trailer' },
  moffett:    { year: '2006', make: 'Moffett', model: 'M55', trim: 'Truck-Mounted', subcategory: 'Forklift' },
  echo:       { year: '2020', make: 'Ford', model: 'F-550', trim: 'Dump Truck', subcategory: 'Dump Truck' },
  noTrim:     { year: '2016', make: 'Wabash', model: 'DuraPlate', trim: '', subcategory: 'Dry Van Trailer' },
  golf:       { year: '2024', make: 'Evolution', model: 'D5', trim: 'Street Legal 4-Passenger Electric Golf Cart', subcategory: 'Golf Cart' },
  noSub:      { year: '2015', make: 'Ram', model: '5500', trim: 'Crew Cab', subcategory: '' },
  bare:       { year: '', make: '', model: '', trim: '', subcategory: '' },
};

const EXPECT_LABEL = {
  peerless: 'Chip Trailer', peerlessDup: '', moffett: 'Forklift', echo: 'Dump Truck',
  noTrim: 'Dry Van Trailer', golf: '', noSub: '', bare: '',
};
const EXPECT_SEO = {
  peerless:    "2017 Peerless 45' Flat Floor Chip Trailer for Sale in Wilson, NC",
  peerlessDup: "2017 Peerless 45' Flat Floor Chip Trailer for Sale in Wilson, NC",
  moffett:     '2006 Moffett M55 Truck-Mounted Forklift for Sale in Madison, NC',
  echo:        '2020 Ford F-550 Dump Truck for Sale in Wilson, NC | Torque Hub',
  noTrim:      '2016 Wabash DuraPlate Dry Van Trailer for Sale in Wilson, NC',
  noSub:       '2015 Ram 5500 Crew Cab for Sale in Wilson, NC | Torque Hub',
};
const CITY = { moffett: 'Madison, NC' };

test('T1: browser twin — subcategoryLabel hides the type only when the trim already contains it', () => {
  const T = browserTwin();
  for (const [k, u] of Object.entries(U)) assert.equal(T.subcategoryLabel(u), EXPECT_LABEL[k], k);
});

test('T2: browser twin — SEO title carries the subcategory after a trim, never twice', () => {
  const T = browserTwin();
  for (const [k, want] of Object.entries(EXPECT_SEO)) assert.equal(T.buildSeoTitle(U[k], CITY[k] || 'Wilson, NC'), want, k);
});

test('T3: display title unchanged — still year make model + clean trim, no subcategory', () => {
  const T = browserTwin();
  assert.equal(T.buildDisplayTitle(U.peerless), "2017 Peerless 45' Flat Floor");
  assert.equal(T.buildDisplayTitle(U.echo), '2020 Ford F-550');
  assert.equal(T.buildDisplayTitle(U.moffett), '2006 Moffett M55 Truck-Mounted');
  assert.equal(T.buildDisplayTitle(U.bare), 'Unit Available');
});

test('T4: edge twin returns exactly what the browser twin returns (SSR = hydration)', async () => {
  const T = browserTwin();
  const E = await edgeTwin();
  for (const [k, u] of Object.entries(U)) {
    for (const city of ['Wilson, NC', 'Madison, NC', '']) {
      assert.equal(E.buildSeoTitle(u, city), T.buildSeoTitle(u, city), `seo ${k} ${city}`);
    }
    assert.equal(E.subcategoryLabel(u), T.subcategoryLabel(u), `label ${k}`);
    assert.equal(E.buildDisplayTitle(u), T.buildDisplayTitle(u), `display ${k}`);
    assert.equal(E.cleanTrim(u), T.cleanTrim(u), `trim ${k}`);
  }
});
