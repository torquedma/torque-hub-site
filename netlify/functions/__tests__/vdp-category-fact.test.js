'use strict';
// vdp-category-fact.test.js - VDP-CAT-001 (Chief 1 -388, HST -318/-320).
// The category label (subcategoryLabel) is no longer a badge under the VDP H1; it is one KEY DETAILS bullet
// 'Category: <label>' right after the Model bullet (fallback: first bullet; no list: a one-item list in front).
// It is skipped when the label is empty, when a 'Category:' bullet exists, or when any bullet's value equals
// the label ignoring case. The edge ESM twin and the browser IIFE twin must agree. No network.
// Run: node --test netlify/functions/__tests__/vdp-category-fact.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '../../..');
const EDGE_DIR = path.join(ROOT, 'netlify/edge-functions');
const TEMPLATE = fs.readFileSync(path.join(ROOT, 'vehicle.html'), 'utf8');
const EDGE_SRC = fs.readFileSync(path.join(EDGE_DIR, 'vehicle.js'), 'utf8');

const loadEdge = () => import(pathToFileURL(path.join(EDGE_DIR, 'lib/desc-render.js')).href);
function loadBrowser() {
  const win = {};
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/desc-render.js'), 'utf8'), vm.createContext({ window: win }));
  return win.DESC_RENDER;
}
const UL = '<ul class="desc-list">';

// [label, stored description, category label, expected KEY DETAILS body]
const CASES = [
  ['after Model', 'Key Details\n- Year: 2027\n- Make: Covered Wagon\n- Model: 7x16 Vnose\n- Stock #: HGR-1\n\nOverview\nTrailer.', 'Enclosed Trailer',
    UL + '<li>Year: 2027</li><li>Make: Covered Wagon</li><li>Model: 7x16 Vnose</li><li>Category: Enclosed Trailer</li><li>Stock #: HGR-1</li></ul><div class="desc-heading">Overview</div><p class="desc-para">Trailer.</p>'],
  ['no Model: first bullet', 'Key Details\n- Year: 2018\n- Stock #: ATC-1\n\nOverview\nTruck.', 'Service Truck',
    UL + '<li>Category: Service Truck</li><li>Year: 2018</li><li>Stock #: ATC-1</li></ul><div class="desc-heading">Overview</div><p class="desc-para">Truck.</p>'],
  ['no list: one-item list in front', 'Overview\nTest.', 'Box Truck',
    UL + '<li>Category: Box Truck</li></ul><div class="desc-heading">Overview</div><p class="desc-para">Test.</p>'],
  ['more specific Type kept, Category added', 'Key Details\n- Make: John Deere\n- Model: 6120M\n- Type: Row-Crop Tractor\n', 'Tractor',
    UL + '<li>Make: John Deere</li><li>Model: 6120M</li><li>Category: Tractor</li><li>Type: Row-Crop Tractor</li></ul>'],
  ['Type equal to the category (case-insensitive): suppressed', 'Key Details\n- Model: 7x16\n- Type: enclosed trailer\n', 'Enclosed Trailer',
    UL + '<li>Model: 7x16</li><li>Type: enclosed trailer</li></ul>'],
  ['existing Category bullet: suppressed', 'Key Details\n- Model: X\n- Category: Something Else\n', 'Enclosed Trailer',
    UL + '<li>Model: X</li><li>Category: Something Else</li></ul>'],
  ['empty category: unchanged', 'Key Details\n- Model: X\n', '',
    UL + '<li>Model: X</li></ul>'],
  ['null category: unchanged', 'Key Details\n- Model: X\n', null,
    UL + '<li>Model: X</li></ul>'],
  ['escaping', 'Key Details\n- Model: 5500\n', 'Cab & Chassis',
    UL + '<li>Model: 5500</li><li>Category: Cab &amp; Chassis</li></ul>'],
  ['escaped Type value still matches', 'Key Details\n- Model: 5500\n- Type: Cab & Chassis\n', 'Cab & Chassis',
    UL + '<li>Model: 5500</li><li>Type: Cab &amp; Chassis</li></ul>'],
  ['Model as a value elsewhere does not anchor', 'Key Details\n- Year: 2020\n- Model: 4500\n- Notes: Model: none\n', 'Service Truck',
    UL + '<li>Year: 2020</li><li>Model: 4500</li><li>Category: Service Truck</li><li>Notes: Model: none</li></ul>'],
];

test('CF-1: edge twin - expected KEY DETAILS body for every rule', async () => {
  const E = await loadEdge();
  for (const [label, text, cat, want] of CASES) assert.equal(E.addCategoryFact(E.buildKeyDetailsCardHtml(text), cat), want, label);
  assert.equal(E.addCategoryFact('', 'Enclosed Trailer'), '', 'an empty body stays empty');
  const hist = 'Price: $1\nCall 919-555-0100'; // historical page without Key Details renders no body (2B)
  assert.equal(E.addCategoryFact(E.buildKeyDetailsCardHtml(hist, { historical: true }), 'Box Truck'), '');
});

test('CF-2: browser twin returns the same body as the edge twin on every case', async () => {
  const E = await loadEdge();
  const B = loadBrowser();
  assert.equal(typeof B.addCategoryFact, 'function');
  for (const [label, text, cat, want] of CASES) {
    assert.equal(B.addCategoryFact(B.buildKeyDetailsCardHtml(text), cat), E.addCategoryFact(E.buildKeyDetailsCardHtml(text), cat), label);
    assert.equal(B.addCategoryFact(B.buildKeyDetailsCardHtml(text), cat), want, label);
  }
});

test('CF-3: Category appears at most once and never twice for the same value', async () => {
  const E = await loadEdge();
  for (const [label, text, cat] of CASES) {
    const out = E.addCategoryFact(E.buildKeyDetailsCardHtml(text), cat);
    assert.ok((out.match(/<li>Category: /g) || []).length <= 1, label);
    assert.equal(E.addCategoryFact(out, cat), out, label + ': idempotent');
  }
});

test('CF-4: the badge under the H1 is gone from the template, the edge and the hydration code', () => {
  for (const s of ['hl-badge', 'hl-subcat', 'subcat-badge']) {
    assert.equal(TEMPLATE.split(s).length - 1, 0, 'vehicle.html: ' + s);
    assert.equal(EDGE_SRC.split(s).length - 1, 0, 'vehicle.js: ' + s);
  }
  assert.equal(TEMPLATE.split('window.DESC_RENDER.addCategoryFact(window.DESC_RENDER.buildKeyDetailsCardHtml(unit.description), subcatBadge)').length - 1, 1);
  assert.equal(EDGE_SRC.split('addCategoryFact(buildKeyDetailsCardHtml(unit.description, { historical }), subcat)').length - 1, 1);
});
