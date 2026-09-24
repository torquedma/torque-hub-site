'use strict';
// taxonomy-parent-category.test.js — Allied taxonomy producer defect (2026-09-24).
// Run: node --test netlify/functions/lib/__tests__/taxonomy-parent-category.test.js
// 1. The generated parent map is an exact mirror of js/taxonomy-data.js (drift gate).
// 2. The receiver files every canonical Trucks-parent subcategory under 'Trucks' even when
//    the source item says 'Trailers' (Allied direct-site behavior) — for any dealer.
// 3. Every other category decision is unchanged (trailer / construction / farm / other
//    keyword branches, source category for subcategories without a Trucks parent, default).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const Module = require('module');
const fs = require('fs');

const gen = require('../../../../scripts/generate-taxonomy-parents.js');
const { SUBCATEGORY_PARENT, parentOf } = require('../taxonomy-parents.generated.js');
const FN = path.join(__dirname, '..', '..', 'sync-truckpaper-background.js');

process.env.SUPABASE_URL = 'http://x'; process.env.SUPABASE_SERVICE_KEY = 'x'; process.env.APIFY_API_TOKEN = 't'; delete process.env.ANTHROPIC_API_KEY;

test('generated parent map is an exact mirror of js/taxonomy-data.js', () => {
  const fresh = gen.render(gen.buildParentMap(gen.loadTaxonomyData()));
  assert.equal(fs.readFileSync(gen.OUT, 'utf8'), fresh, 'run: node scripts/generate-taxonomy-parents.js');
});

test('the six audited subcategories are Trucks-parent; trailer types are not', () => {
  for (const s of ['Box Truck', 'Cab & Chassis', 'Dump Truck', 'Flatbed Truck', 'Service Truck', 'Yard Spotter']) assert.equal(parentOf(s), 'Trucks', s);
  for (const s of ['Dump Trailer', 'Flatbed Trailer', 'Reefer Trailer']) assert.equal(parentOf(s), 'Trailers', s);
  assert.equal(parentOf('Not A Subcategory'), null);
  assert.equal(parentOf(undefined), null);
});

function run(dealer, item) {
  const writes = [];
  const client = { from() { const q = { op: 'select', p: null, f: [] }; const api = {
    select() { return api; }, eq(k, v) { q.f.push([k, v]); return api; }, in() { return api; },
    update(p) { q.op = 'update'; q.p = p; return api; }, insert(p) { q.op = 'insert'; q.p = p; return api; },
    then(res, rej) { if (q.op !== 'select') writes.push({ op: q.op, p: Array.isArray(q.p) ? q.p[0] : q.p }); return Promise.resolve({ data: q.op === 'select' ? [] : null, error: null }).then(res, rej); } }; return api; } };
  const orig = Module._load;
  Module._load = function (req) { if (req === '@supabase/supabase-js') return { createClient: () => client }; return orig.apply(this, arguments); };
  delete require.cache[require.resolve(FN)]; const h = require(FN).handler; Module._load = orig;
  global.fetch = async () => ({ ok: true, json: async () => [Object.assign({ dealer, stock: 'S1', source_listing_id: '260123456', source_url: 'https://dealer.example/inventory/?/listing/for-sale/260123456/x', year: 2015, make: 'Freightliner', model: 'M2 106', price: '40000', photos: ['a.jpg'] }, item)], text: async () => '' });
  const l = console.log, e = console.error, w = console.warn; console.log = console.error = console.warn = () => {};
  return h({ httpMethod: 'POST', body: JSON.stringify({ defaultDatasetId: 'DS', dealerName: dealer }) })
    .then(() => { console.log = l; console.error = e; console.warn = w; const ins = writes.find(x => x.op === 'insert'); return ins && ins.p; });
}

const TRUCK_SUBS = Object.keys(SUBCATEGORY_PARENT).filter(k => SUBCATEGORY_PARENT[k] === 'Trucks');

for (const dealer of ['Allied Truck & Trailer Sales', 'The Trailer Source']) {
  test(`${dealer}: every Trucks-parent subcategory lands under Trucks despite source category 'Trailers'`, async () => {
    for (const sub of TRUCK_SUBS) {
      const row = await run(dealer, { subcategory: sub, category: 'Trailers' });
      assert.equal(row.subcategory, sub);
      assert.equal(row.category, 'Trucks', sub);
    }
  });
}

test('unchanged: trailer subcategory stays Trailers even if the source says Trucks', async () => {
  const row = await run('HGR\'s Truck and Trailer', { subcategory: 'Dump Trailer', category: 'Trucks' });
  assert.equal(row.category, 'Trailers');
});
test('unchanged: construction subcategory stays Construction', async () => {
  const row = await run('Mid-Atlantic Power & Equipment', { subcategory: 'Wheel Loader', category: 'Trucks' });
  assert.equal(row.category, 'Construction');
});
test('unchanged: no subcategory → source category is still used', async () => {
  const row = await run('Allied Truck & Trailer Sales', { category: 'Trailers', make: 'Utility', model: 'VS2RA' });
  assert.equal(row.subcategory, '');
  assert.equal(row.category, 'Trailers');
});
test('unchanged: no subcategory and no source category → default Trucks', async () => {
  const row = await run('DeBary Truck Sales', { make: 'Kenworth', model: 'T880' });
  assert.equal(row.category, 'Trucks');
});
