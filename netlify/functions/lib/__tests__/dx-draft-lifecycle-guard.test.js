'use strict';
// dx-draft-lifecycle-guard.test.js — S2 of the Apify Draft-to-Live lifecycle.
// Run: node --test netlify/functions/lib/__tests__/dx-draft-lifecycle-guard.test.js
//
// Contract under test (Chief GO 2026-09-24):
//   1. generate-dx-background never changes status 'draft' → 'published' for
//      Allied Truck & Trailer Sales or Impex Heavy Metal, on the legacy
//      (completion_state NULL) branch or the completion-lifecycle branch.
//   2. DX is still written/refreshed for those dealers.
//   3. Every other dealer, including HGR, keeps today's status behavior.
//   4. Already-published rows never receive a status key (unchanged).
//   5. The unbounded-write containment (409, no writes) is unchanged.
// Supabase, the generator and the publication gate are stubbed; nothing
// here touches the network or a database.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const Module = require('module');

const L = require('../draft-lifecycle-dealers');
const FN = path.join(__dirname, '..', '..', 'generate-dx-background.js');

const ALLIED = 'Allied Truck & Trailer Sales';
const IMPEX = 'Impex Heavy Metal';
const HGR = "HGR's Truck and Trailer";
const OTHERS = [
  'A F Sales & Service', 'Auto Connection 210 LLC', 'Davenport Motors', 'DeBary Truck Sales',
  'Dick Smith Equipment', 'Fannon Land & Auction Co.', "Fat Daddy's Truck Sales", "Joe's Tractor Sales",
  'Mid-Atlantic Power & Equipment', 'Private Party Seller', 'Suttontown Repair Service',
  'The Trailer Source', 'Wilson Trailer Sales & Service',
];

process.env.ANTHROPIC_API_KEY = 'test';
process.env.SUPABASE_URL = 'http://x';
process.env.SUPABASE_SERVICE_KEY = 'x';

// ---------- stubs ----------
function makeClient(state) {
  return {
    from(table) {
      const q = { table, filters: [], isWrite: false, payload: null };
      const api = {
        select() { return api; },
        eq(k, v) { q.filters.push([k, v]); return api; },
        in(k, v) { q.filters.push([k, v]); return api; },
        update(payload) { q.isWrite = true; q.payload = payload; return api; },
        then(res, rej) {
          if (q.isWrite) {
            state.writes.push({ table, payload: q.payload, filters: q.filters });
            return Promise.resolve({ error: null }).then(res, rej);
          }
          if (table === 'dealers') return Promise.resolve({ data: state.dealers.map(name => ({ name })), error: null }).then(res, rej);
          const f = q.filters;
          let rows = state.inventory.filter(r => r.sold === false && r.dx_locked === false);
          for (const [k, v] of f) {
            if (k === 'stock' && Array.isArray(v)) rows = rows.filter(r => v.includes(r.stock));
            else if (k === 'stock') rows = rows.filter(r => r.stock === v);
          }
          return Promise.resolve({ data: rows, error: null }).then(res, rej);
        },
      };
      return api;
    },
  };
}

function loadHandler(state) {
  const origLoad = Module._load;
  Module._load = function (req) {
    if (req === '@supabase/supabase-js') return { createClient: () => makeClient(state) };
    if (req === './lib/generate-description.generated') {
      return { generateDescription: async (unit) => {
        const o = state.outcome[unit.stock] || 'text';
        if (o === 'text') return 'Canonical DX for ' + unit.stock;
        if (o === 'empty') return '';
        const e = new Error(o);
        if (o === 'INSUFFICIENT_EVIDENCE' || o === 'OVERVIEW_GROUNDING_FAILED') e.code = o;
        throw e;
      } };
    }
    if (req === './lib/publication-eligibility') {
      return { checkPublicationEligibility: (u) => (state.ineligible.has(u.stock)
        ? { eligible: false, failedCheck: 'TEST' } : { eligible: true, failedCheck: null }) };
    }
    return origLoad.apply(this, arguments);
  };
  delete require.cache[require.resolve(FN)];
  const h = require(FN).handler;
  Module._load = origLoad;
  return h;
}

function unit(stock, dealer, status, completionState) {
  return { stock, dealer, status, sold: false, dx_locked: false, vin: '', created_at: '2026-09-24T00:00:00Z',
    completion_state: completionState === undefined ? null : completionState, completion_attempts: 0,
    description_source: null };
}

async function run(rows, { outcome = {}, ineligible = [] } = {}) {
  const state = { inventory: rows, dealers: [ALLIED, IMPEX, HGR, ...OTHERS], writes: [], outcome, ineligible: new Set(ineligible) };
  const h = loadHandler(state);
  const res = await h({ queryStringParameters: { stocks: rows.map(r => r.stock).join(',') } });
  const byStock = {};
  for (const w of state.writes) {
    const s = (w.filters.find(([k]) => k === 'stock') || [])[1];
    byStock[s] = w.payload;
  }
  return { res, body: JSON.parse(res.body), writes: state.writes, byStock };
}

// ---------- lib ----------
test('lib: the lifecycle list is exactly Allied and Impex', () => {
  assert.deepEqual([...L.DRAFT_LIFECYCLE_DEALERS], [ALLIED, IMPEX]);
  assert.ok(Object.isFrozen(L.DRAFT_LIFECYCLE_DEALERS));
});

test('lib: predicate blocks Allied/Impex (fail-closed on case/whitespace), allows everyone else', () => {
  for (const d of [ALLIED, IMPEX, ' Impex Heavy Metal ', 'allied truck & trailer sales']) {
    assert.equal(L.isDraftLifecycleDealer(d), true, d);
    assert.equal(L.dxMayPromoteDraft({ dealer: d }), false, d);
  }
  for (const d of [HGR, ...OTHERS]) {
    assert.equal(L.isDraftLifecycleDealer(d), false, d);
    assert.equal(L.dxMayPromoteDraft({ dealer: d }), true, d);
  }
  for (const d of [undefined, null, '', 42]) assert.equal(L.isDraftLifecycleDealer(d), false);
});

// ---------- 1 + 2: Allied / Impex drafts are never promoted; DX still written ----------
test('legacy branch: Allied and Impex drafts get DX but keep status draft', async () => {
  const r = await run([unit('ATT-1', ALLIED, 'draft'), unit('MPX-1', IMPEX, 'draft')]);
  for (const s of ['ATT-1', 'MPX-1']) {
    const p = r.byStock[s];
    assert.equal(p.description, 'Canonical DX for ' + s);
    assert.equal(p.description_source, 'torque_hub_dx');
    assert.ok(!('status' in p), s + ' must not carry a status key');
  }
  assert.equal(r.body.draft_promotion_withheld, 2);
  assert.equal(r.body.processed, 2);
});

test('lifecycle branch: eligible Allied and Impex drafts complete DX but keep status draft', async () => {
  const r = await run([unit('ATT-2', ALLIED, 'draft', 'pending'), unit('MPX-2', IMPEX, 'draft', 'retryable')]);
  for (const s of ['ATT-2', 'MPX-2']) {
    const p = r.byStock[s];
    assert.equal(p.description, 'Canonical DX for ' + s);
    assert.equal(p.completion_state, 'complete');
    assert.equal(p.completion_reason, null);
    assert.ok(!('status' in p), s + ' must not carry a status key');
  }
  assert.equal(r.body.draft_promotion_withheld, 2);
  assert.equal(r.body.lifecycle_complete, 2);
});

test('lifecycle branch: ineligible / evidence / error outcomes for Allied and Impex never carry status', async () => {
  const rows = [
    unit('ATT-3', ALLIED, 'draft', 'pending'), unit('MPX-3', IMPEX, 'draft', 'pending'),
    unit('ATT-4', ALLIED, 'draft', 'pending'), unit('MPX-4', IMPEX, 'draft', 'pending'),
    unit('ATT-5', ALLIED, 'draft', 'pending'), unit('MPX-5', IMPEX, 'draft', 'pending'),
  ];
  const r = await run(rows, { ineligible: ['ATT-3', 'MPX-3'],
    outcome: { 'ATT-4': 'INSUFFICIENT_EVIDENCE', 'MPX-4': 'empty', 'ATT-5': 'Boom', 'MPX-5': 'OVERVIEW_GROUNDING_FAILED' } });
  for (const w of r.writes) assert.ok(!('status' in w.payload), JSON.stringify(w.payload));
  assert.equal(r.byStock['ATT-3'].completion_state, 'hold');
  assert.equal(r.byStock['ATT-4'].completion_state, 'hold');
  assert.equal(r.byStock['MPX-4'].completion_state, 'retryable');
  assert.equal(r.byStock['ATT-5'].completion_state, 'retryable');
});

// ---------- 4: already-published Allied / Impex unchanged ----------
test('already-published Allied and Impex rows: DX refresh only, no status key, nothing withheld', async () => {
  const r = await run([unit('ATT-6', ALLIED, 'published'), unit('MPX-6', IMPEX, 'published', 'complete')]);
  for (const s of ['ATT-6', 'MPX-6']) assert.ok(!('status' in r.byStock[s]));
  assert.equal(r.body.draft_promotion_withheld, 0);
});

// ---------- 3: every other dealer keeps today's behavior ----------
test('every non-lifecycle dealer: legacy draft is promoted exactly as before', async () => {
  const rows = OTHERS.map((d, i) => unit('OTH-L' + i, d, 'draft'));
  const r = await run(rows);
  for (const row of rows) assert.equal(r.byStock[row.stock].status, 'published', row.dealer);
  assert.equal(r.body.draft_promotion_withheld, 0);
});

test('every non-lifecycle dealer: lifecycle draft promoted when eligible, held when not', async () => {
  const rows = OTHERS.flatMap((d, i) => [unit('OTH-E' + i, d, 'draft', 'pending'), unit('OTH-I' + i, d, 'draft', 'pending')]);
  const r = await run(rows, { ineligible: OTHERS.map((_, i) => 'OTH-I' + i) });
  OTHERS.forEach((d, i) => {
    assert.equal(r.byStock['OTH-E' + i].status, 'published', d);
    assert.equal(r.byStock['OTH-E' + i].completion_state, 'complete', d);
    assert.ok(!('status' in r.byStock['OTH-I' + i]), d);
    assert.equal(r.byStock['OTH-I' + i].completion_reason, 'VALIDATION:TEST', d);
  });
});

test('non-lifecycle published rows never receive a status key', async () => {
  const rows = OTHERS.map((d, i) => unit('OTH-P' + i, d, 'published'));
  const r = await run(rows);
  for (const row of rows) assert.ok(!('status' in r.byStock[row.stock]), row.dealer);
});

// ---------- HGR regression ----------
test('HGR: completion lifecycle unchanged (eligible → published+complete; ineligible → hold; errors → hold/retryable)', async () => {
  const rows = [
    unit('HGR-A', HGR, 'draft', 'pending'), unit('HGR-B', HGR, 'draft', 'retryable'),
    unit('HGR-C', HGR, 'draft', 'pending'), unit('HGR-D', HGR, 'draft', 'pending'),
    unit('HGR-E', HGR, 'draft', 'pending'), unit('HGR-F', HGR, 'published', 'complete'),
    unit('HGR-G', HGR, 'draft'),
  ];
  const r = await run(rows, { ineligible: ['HGR-C'],
    outcome: { 'HGR-D': 'OVERVIEW_GROUNDING_FAILED', 'HGR-E': 'Boom' } });
  assert.equal(r.byStock['HGR-A'].status, 'published'); assert.equal(r.byStock['HGR-A'].completion_state, 'complete');
  assert.equal(r.byStock['HGR-B'].status, 'published'); assert.equal(r.byStock['HGR-B'].completion_state, 'complete');
  assert.ok(!('status' in r.byStock['HGR-C'])); assert.equal(r.byStock['HGR-C'].completion_state, 'hold');
  assert.ok(!('status' in r.byStock['HGR-D'])); assert.equal(r.byStock['HGR-D'].completion_state, 'hold');
  assert.ok(!('status' in r.byStock['HGR-E'])); assert.equal(r.byStock['HGR-E'].completion_state, 'retryable');
  assert.ok(!('status' in r.byStock['HGR-F']));
  assert.equal(r.byStock['HGR-G'].status, 'published');
  assert.equal(r.body.draft_promotion_withheld, 0);
});

test('mixed ?stocks batch: HGR draft promoted, Allied/Impex drafts in the same call are not', async () => {
  const r = await run([unit('HGR-M', HGR, 'draft', 'pending'), unit('ATT-M', ALLIED, 'draft'), unit('MPX-M', IMPEX, 'draft', 'pending')]);
  assert.equal(r.byStock['HGR-M'].status, 'published');
  assert.ok(!('status' in r.byStock['ATT-M']));
  assert.ok(!('status' in r.byStock['MPX-M']));
  assert.equal(r.body.draft_promotion_withheld, 2);
});

// ---------- containment unchanged ----------
test('unbounded write (e.g. nightly ?limit=all) is still refused with 409 and zero writes', async () => {
  const state = { inventory: [unit('ATT-U', ALLIED, 'draft'), unit('OTH-U', 'DeBary Truck Sales', 'draft')],
    dealers: [ALLIED, 'DeBary Truck Sales'], writes: [], outcome: {}, ineligible: new Set() };
  const h = loadHandler(state);
  const res = await h({ queryStringParameters: { limit: 'all' } });
  assert.equal(res.statusCode, 409);
  assert.equal(JSON.parse(res.body).error, 'UNBOUNDED_DX_WRITE_BLOCKED');
  assert.equal(state.writes.length, 0);
});
