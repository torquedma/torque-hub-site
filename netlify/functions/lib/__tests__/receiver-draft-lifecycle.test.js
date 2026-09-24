'use strict';
// receiver-draft-lifecycle.test.js — S1 of the Apify Draft-to-Live lifecycle.
// Run: node --test netlify/functions/lib/__tests__/receiver-draft-lifecycle.test.js
//
// Contract under test (Chief GO 2026-09-24, candidate only):
//   1. Allied / Impex NEW row → INSERT carries explicit status='draft' + one
//      'ingested_draft' audit event.
//   2. Allied / Impex feed_removed row returned by the feed → RESURRECT carries
//      status='draft' + one 'resurrected_draft' audit event (only when exactly one
//      row was revived).
//   3. UPDATE of an existing row never carries status (every dealer).
//   4. Every other dealer: no status key on any write, no audit event, no result change.
//   5. dryRun writes nothing (no inventory write, no audit event).
// Supabase, Apify fetch and the DX generator are stubbed; no network, no database.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const Module = require('module');

const FN = path.join(__dirname, '..', '..', 'sync-truckpaper-background.js');
const ALLIED = 'Allied Truck & Trailer Sales';
const IMPEX = 'Impex Heavy Metal';
const OTHERS = [
  'A F Sales & Service', 'Auto Connection 210 LLC', 'Davenport Motors', 'DeBary Truck Sales',
  'Dick Smith Equipment', 'Fannon Land & Auction Co.', "Fat Daddy's Truck Sales", "HGR's Truck and Trailer",
  "Joe's Tractor Sales", 'Mid-Atlantic Power & Equipment', 'Private Party Seller', 'Suttontown Repair Service',
  'The Trailer Source', 'Wilson Trailer Sales & Service',
];
const PREFIX = { [ALLIED]: 'ATT-', [IMPEX]: 'MPX-', 'Mid-Atlantic Power & Equipment': 'MAP-', 'The Trailer Source': 'TTS-', 'DeBary Truck Sales': 'DBT-' };

process.env.SUPABASE_URL = 'http://x';
process.env.SUPABASE_SERVICE_KEY = 'x';
process.env.APIFY_API_TOKEN = 't';
process.env.ANTHROPIC_API_KEY = 'k';

// ---------- stubs ----------
function makeClient(state) {
  return {
    from(table) {
      const q = { table, filters: [], op: 'select', payload: null, returning: false };
      const api = {
        select() { if (q.op !== 'select') q.returning = true; return api; },
        eq(k, v) { q.filters.push([k, v]); return api; },
        in(k, v) { q.filters.push([k, v]); return api; },
        update(p) { q.op = 'update'; q.payload = p; return api; },
        insert(p) { q.op = 'insert'; q.payload = p; return api; },
        then(res, rej) {
          const f = Object.fromEntries(q.filters);
          if (q.op !== 'select') {
            state.writes.push({ table, op: q.op, payload: q.payload, filters: q.filters, returning: q.returning });
            const error = state.failTable === table ? { message: 'simulated failure' } : null;
            let data = null;
            if (q.returning && table === 'inventory' && f.sold_type === 'feed_removed') {
              data = state.resurrectReturns !== undefined
                ? state.resurrectReturns
                : state.buried.filter(r => r.dealer === f.dealer && String(r.source_listing_id) === String(f.source_listing_id)).map(r => ({ stock: r.stock }));
            }
            return Promise.resolve({ data, error }).then(res, rej);
          }
          let rows = [];
          if (table === 'inventory' && f.sold === false) rows = state.live.filter(r => r.dealer === f.dealer);
          if (table === 'inventory' && f.sold === true) rows = state.buried.filter(r => r.dealer === f.dealer);
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
    if (req === './lib/generate-description.generated') return { generateDescription: async (u) => 'AI DX for ' + (u.stock || '?') };
    return origLoad.apply(this, arguments);
  };
  delete require.cache[require.resolve(FN)];
  const h = require(FN).handler;
  Module._load = origLoad;
  global.fetch = async (url) => ({ ok: true, json: async () => state.items, text: async () => '' });
  return h;
}

const url = id => `https://www.truckpaper.com/listing/for-sale/${id}/2019-freightliner-m2`;
function item(dealer, id, extra) {
  return Object.assign({ dealer, stock: 'S' + id, source_listing_id: String(id), source_url: url(id), year: 2019,
    make: 'Freightliner', model: 'M2 106', price: '45000', category: 'Trucks', photos: ['p1.jpg'], description: 'Clean truck.' }, extra || {});
}
function liveRow(dealer, stock, id) { return { dealer, stock, source_listing_id: String(id), source_url: url(id), provenance: null, vin: '', condition: 'Used' }; }

async function run(dealer, { items, live = [], buried = [], dryRun = false, failTable = null, resurrectReturns } = {}) {
  const state = { items, live, buried, writes: [], failTable, resurrectReturns };
  const h = loadHandler(state);
  const res = await h({ httpMethod: 'POST', body: JSON.stringify({ defaultDatasetId: 'DS-TEST', dealerName: dealer, dryRun }) });
  return { res, body: JSON.parse(res.body), writes: state.writes,
    inv: state.writes.filter(w => w.table === 'inventory'), events: state.writes.filter(w => w.table === 'unit_lifecycle_event') };
}

// Quiet the receiver's logging during tests.
const quiet = fn => async () => { const l = console.log, e = console.error, w = console.warn; console.log = console.error = console.warn = () => {}; try { await fn(); } finally { console.log = l; console.error = e; console.warn = w; } };

// ---------- 1. INSERT → draft (Allied + Impex) ----------
for (const dealer of [ALLIED, IMPEX]) {
  test(`${dealer}: new listing INSERTs with status='draft' and one ingested_draft event`, quiet(async () => {
    const r = await run(dealer, { items: [item(dealer, 912345)] });
    const ins = r.inv.filter(w => w.op === 'insert');
    assert.equal(ins.length, 1);
    const row = ins[0].payload[0];
    assert.equal(row.status, 'draft');
    assert.equal(row.dealer, dealer);
    assert.equal(r.events.length, 1);
    const ev = r.events[0].payload[0];
    assert.equal(ev.event_type, 'ingested_draft');
    assert.equal(ev.stock, row.stock);
    assert.equal(ev.dealer, dealer);
    assert.equal(ev.from_state, null);
    assert.equal(ev.to_state, 'draft');
    assert.equal(ev.reason, 'receiver_insert');
    assert.equal(ev.source, 'truckpaper_apify');
    assert.equal(ev.actor, 'sync-truckpaper-background');
    assert.deepEqual(ev.evidence, { dataset_id: 'DS-TEST', actor_run_id: null, source_listing_id: '912345', source_url: url(912345) });
    assert.ok(!('status' in ev) && !('published' in ev), 'event carries no publication field');
    assert.deepEqual(r.body.lifecycle, { drafts_inserted: 1, drafts_resurrected: 0, events_written: 1, event_write_errors: 0, audit_failures: [], clean: true });
    assert.equal(r.body.errors, 0);
    assert.equal(r.body.synced, 1);
  }));
}

// ---------- 2. RESURRECT → draft (Allied + Impex) ----------
for (const dealer of [ALLIED, IMPEX]) {
  test(`${dealer}: feed_removed row returned by the feed resurrects as draft with one resurrected_draft event`, quiet(async () => {
    const stock = PREFIX[dealer] + '777001';
    const r = await run(dealer, { items: [item(dealer, 260777001)], buried: [liveRow(dealer, stock, 260777001)] });
    const up = r.inv.filter(w => w.op === 'update');
    assert.equal(up.length, 1);
    assert.equal(up[0].payload.status, 'draft');
    assert.equal(up[0].payload.sold, false);
    assert.equal(up[0].payload.sold_type, null);
    assert.ok(!('stock' in up[0].payload), 'identity guard still strips stock');
    assert.deepEqual(up[0].filters, [['source_listing_id', '260777001'], ['dealer', dealer], ['sold', true], ['sold_type', 'feed_removed']]);
    assert.equal(up[0].returning, true);
    assert.equal(r.inv.filter(w => w.op === 'insert').length, 0);
    assert.equal(r.events.length, 1);
    const ev = r.events[0].payload[0];
    assert.equal(ev.event_type, 'resurrected_draft');
    assert.equal(ev.stock, stock);
    assert.equal(ev.from_state, 'feed_removed');
    assert.equal(ev.to_state, 'draft');
    assert.equal(ev.reason, 'receiver_resurrect');
    assert.equal(r.body.resurrected, 1);
    assert.deepEqual(r.body.lifecycle, { drafts_inserted: 0, drafts_resurrected: 1, events_written: 1, event_write_errors: 0, audit_failures: [], clean: true });
    assert.equal(r.body.errors, 0);
  }));
}

test('resurrection that revives zero rows writes no event (Allied)', quiet(async () => {
  const r = await run(ALLIED, { items: [item(ALLIED, 260777002)], buried: [liveRow(ALLIED, 'ATT-777002', 260777002)], resurrectReturns: [] });
  assert.equal(r.inv.filter(w => w.op === 'update')[0].payload.status, 'draft');
  assert.equal(r.events.length, 0);
  assert.equal(r.body.lifecycle.drafts_resurrected, 0);
  assert.equal(r.body.lifecycle.clean, true, 'no transition happened, so nothing is missing');
  assert.equal(r.body.errors, 0);
}));

test('resurrection that revives two rows for one listing id: both draft, audit failure names both stocks, run not clean', quiet(async () => {
  const r = await run(IMPEX, { items: [item(IMPEX, 260777003)], buried: [liveRow(IMPEX, 'MPX-777003', 260777003)],
    resurrectReturns: [{ stock: 'MPX-777003' }, { stock: 'MPX-777003B' }] });
  assert.equal(r.inv.filter(w => w.op === 'update')[0].payload.status, 'draft');
  assert.equal(r.events.length, 0);
  assert.equal(r.body.lifecycle.drafts_resurrected, 2);
  assert.equal(r.body.lifecycle.clean, false);
  assert.deepEqual(r.body.lifecycle.audit_failures.map(f => [f.stock, f.dealer, f.event_type]),
    [['MPX-777003', IMPEX, 'resurrected_draft'], ['MPX-777003B', IMPEX, 'resurrected_draft']]);
  assert.equal(r.body.errors, 2);
}));

// ---------- 3. UPDATE preserves status (every dealer) ----------
for (const dealer of [ALLIED, IMPEX, ...OTHERS]) {
  test(`${dealer}: existing-row UPDATE never carries status and writes no event`, quiet(async () => {
    const id = 260555001;
    const stock = (PREFIX[dealer] || '') + (PREFIX[dealer] ? '555001' : 'S' + id);
    const r = await run(dealer, { items: [item(dealer, id)], live: [liveRow(dealer, stock, id)] });
    const up = r.inv.filter(w => w.op === 'update' && !(w.payload && w.payload.sold_type === 'feed_removed'));
    assert.ok(up.length >= 1);
    for (const w of up) assert.ok(!('status' in w.payload), JSON.stringify(w.payload).slice(0, 120));
    assert.equal(r.inv.filter(w => w.op === 'insert').length, 0);
    assert.equal(r.events.length, 0);
  }));
}

// ---------- 4. every other dealer unchanged on INSERT / RESURRECT ----------
for (const dealer of OTHERS) {
  test(`${dealer}: INSERT and RESURRECT carry no status key, no audit event, no lifecycle result`, quiet(async () => {
    const stock = (PREFIX[dealer] || '') + '888002';
    const r = await run(dealer, { items: [item(dealer, 260888001), item(dealer, 260888002)], buried: [liveRow(dealer, stock, 260888002)] });
    for (const w of r.inv.filter(w => w.op !== 'select')) {
      const p = Array.isArray(w.payload) ? w.payload[0] : w.payload;
      assert.ok(!('status' in p), dealer + ' ' + w.op);
    }
    for (const w of r.inv.filter(w => w.op === 'update')) assert.equal(w.returning, false, 'no RETURNING added for other dealers');
    assert.equal(r.events.length, 0);
    assert.ok(!('lifecycle' in r.body));
  }));
}

// ---------- 5. dryRun writes nothing ----------
test('dryRun (Allied): zero writes, zero events; log marks insert/resurrect as draft', quiet(async () => {
  const r = await run(ALLIED, { dryRun: true, items: [item(ALLIED, 260999001), item(ALLIED, 260999002)], buried: [liveRow(ALLIED, 'ATT-999002', 260999002)] });
  assert.equal(r.writes.length, 0);
  const byPath = Object.fromEntries(r.body.dryRunLog.map(e => [e.path, e.lifecycle]));
  assert.deepEqual(byPath.insert, { status: 'draft', event_type: 'ingested_draft' });
  assert.deepEqual(byPath.resurrect, { status: 'draft', event_type: 'resurrected_draft' });
}));

test('dryRun (other dealer): log entries carry no lifecycle annotation', quiet(async () => {
  const r = await run('The Trailer Source', { dryRun: true, items: [item('The Trailer Source', 260999003)] });
  assert.equal(r.writes.length, 0);
  assert.ok(r.body.dryRunLog.every(e => !('lifecycle' in e)));
}));

// ---------- guards and failure handling ----------
test('Allied presentation-held listing: no insert, no event', quiet(async () => {
  const r = await run(ALLIED, { items: [item(ALLIED, 260299567)] });
  assert.equal(r.inv.filter(w => w.op === 'insert').length, 0);
  assert.equal(r.events.length, 0);
}));

test('audit write failure: unit stays draft, nothing publishes, run is NOT clean and names the stock', async () => {
  const logged = [];
  const l = console.log, e = console.error, w = console.warn;
  console.log = console.warn = () => {}; console.error = (...a) => logged.push(a.join(' '));
  let r;
  try { r = await run(IMPEX, { items: [item(IMPEX, 260444001)], failTable: 'unit_lifecycle_event' }); }
  finally { console.log = l; console.error = e; console.warn = w; }
  const ins = r.inv.filter(w => w.op === 'insert');
  assert.equal(ins.length, 1);
  assert.equal(ins[0].payload[0].status, 'draft', 'unit remains draft');
  const stock = ins[0].payload[0].stock;
  for (const w of r.inv) { const p = Array.isArray(w.payload) ? w.payload[0] : w.payload; assert.notEqual(p && p.status, 'published', 'no publication'); }
  assert.equal(r.inv.filter(w => w.op === 'update').length, 0, 'inventory write is not undone or rewritten');
  assert.equal(r.body.errors, 1, 'overall result reports an error');
  assert.equal(r.body.synced, 1, 'the inventory write itself succeeded');
  assert.equal(r.body.lifecycle.clean, false);
  assert.equal(r.body.lifecycle.event_write_errors, 1);
  assert.equal(r.body.lifecycle.events_written, 0);
  assert.equal(r.body.lifecycle.drafts_inserted, 1);
  assert.deepEqual(r.body.lifecycle.audit_failures, [{ stock, dealer: IMPEX, event_type: 'ingested_draft', message: 'simulated failure' }]);
  assert.ok(logged.some(m => m.includes('[LIFECYCLE-AUDIT-FAILURE]') && m.includes('stock=' + stock)), 'failure log names the stock');
  assert.ok(logged.some(m => m.includes('[LIFECYCLE-RUN-NOT-CLEAN]') && m.includes(stock)), 'run-level log names the stock');
});

test('failed INSERT writes no event', quiet(async () => {
  const r = await run(ALLIED, { items: [item(ALLIED, 260444002)], failTable: 'inventory' });
  assert.equal(r.events.length, 0);
  assert.equal(r.body.lifecycle.drafts_inserted, 0);
  assert.equal(r.body.errors, 1);
}));
