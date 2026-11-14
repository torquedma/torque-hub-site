'use strict';
// debary-draft-lifecycle-receiver.test.js - DeBary joins Draft-to-Live (Chief 1 -521 Decision 2, implementing the
// Chief 2026-10-08 ruling "DeBary joins Draft-to-Live now"). Runs the REAL receiver handler against an in-memory
// Supabase fake that enforces the three production UNIQUE indexes on inventory ((stock, dealer),
// (dealer, source_listing_id) where not null, (dealer, source_url) where non-empty) and rejects a violating INSERT
// with code 23505, as Postgres does. The feed item is the CAPTURED DeBary Overfuel payload for listing 2024795
// (fixtures/condition-adjudication-captured-items.json); where a case needs another identity it changes only the
// identity fields (stock, source_listing_id, source_url, vin) on a copy and says so. Row values are SYNTHETIC.
// Run: node --test netlify/functions/__tests__/debary-draft-lifecycle-receiver.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const FIX = require('./fixtures/condition-adjudication-captured-items.json');
const AUTH = require('./helpers/receiver-auth-fixture');

const clone = (x) => JSON.parse(JSON.stringify(x));
const DEALER = 'DeBary Truck Sales';
const LID = '2024795';
const MAP = 'Mid-Atlantic Power & Equipment';
const MAP_LID = '258245863';
const dbtUrl = (lid) => 'https://www.debarytrucksales.com/inventory/test-' + lid; // SYNTHETIC identity URL
// Copy of the captured item with only the identity fields changed (stock, listing id, URL, optional VIN).
function itemAs(lid, stock, over) {
  const it = clone(FIX.items[LID].item);
  return Object.assign(it, { source_listing_id: String(lid), stock: String(stock), source_url: dbtUrl(lid) }, over || {});
}
function row(stock, lid, over) {
  return Object.assign({ stock, dealer: DEALER, status: 'published', sold: false, sold_type: null, source_listing_id: String(lid),
    source_url: dbtUrl(lid), subcategory_locked: false, model_locked: false, vin_locked: false, vin: null, condition: 'Used',
    mileage: '', provenance: null, price: '1' }, over || {});
}

function project(r, cols) {
  if (!cols) return clone(r);
  const out = {};
  for (const c of cols) if (Object.prototype.hasOwnProperty.call(r, c)) out[c] = clone(r[c]);
  return out;
}
const UNIQUE = [
  { name: 'inventory_stock_dealer_unique', key: (r) => (r.stock != null ? r.stock + '|' + r.dealer : null) },
  { name: 'inventory_dealer_source_listing_id_unique', key: (r) => (r.source_listing_id != null ? r.dealer + '|' + r.source_listing_id : null) },
  { name: 'inventory_dealer_source_url_idx', key: (r) => (r.source_url ? r.dealer + '|' + r.source_url : null) },
];
function makeSupabase(rows, opts) {
  const o = opts || {};
  const db = { tables: { inventory: clone(rows), unit_lifecycle_event: [] }, writes: [], rejected: [] };
  class Query {
    constructor(table) { this.table = table; this.op = 'select'; this.filters = []; this.payload = null; this.wantRows = false; this.cols = null; }
    select(cols) {
      this.wantRows = true;
      this.cols = (typeof cols === 'string' && cols.trim() !== '' && cols.trim() !== '*') ? cols.split(',').map((c) => c.trim()) : null;
      return this;
    }
    eq(k, v) { this.filters.push([k, v]); return this; }
    update(p) { this.op = 'update'; this.payload = clone(p); return this; }
    insert(arr) { this.op = 'insert'; this.payload = clone(arr); return this; }
    then(resolve, reject) { try { resolve(this.exec()); } catch (e) { reject(e); } }
    exec() {
      const t = db.tables[this.table] || (db.tables[this.table] = []);
      const hit = (r) => this.filters.every(([k, v]) => String(r[k]) === String(v));
      if (this.op === 'select') return { data: t.filter(hit).map((r) => project(r, this.cols)), error: null };
      if (this.op === 'insert') {
        if (this.table === 'inventory') {
          if (o.failInsert) { db.rejected.push({ payload: this.payload, reason: 'simulated' }); return { data: null, error: { message: 'simulated insert failure' } }; }
          for (const r of this.payload) {
            const withDefaults = Object.assign({ status: 'published' }, r); // DB column default for status
            for (const u of UNIQUE) {
              const k = u.key(withDefaults);
              if (k && t.some((x) => u.key(x) === k)) {
                db.rejected.push({ payload: this.payload, reason: u.name });
                return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "' + u.name + '"' } };
              }
            }
          }
          for (const r of this.payload) t.push(Object.assign({ status: 'published' }, clone(r)));
        } else {
          for (const r of this.payload) t.push(clone(r));
        }
        db.writes.push({ table: this.table, op: 'insert', payload: this.payload });
        return { data: null, error: null };
      }
      const matched = t.filter(hit);
      for (const r of matched) Object.assign(r, clone(this.payload));
      db.writes.push({ table: this.table, op: 'update', filters: this.filters, payload: this.payload });
      return { data: this.wantRows ? matched.map((r) => project(r, this.cols)) : null, error: null };
    }
  }
  return { db, client: { from: (t) => new Query(t) } };
}

const RECEIVER = path.resolve(__dirname, '../sync-truckpaper-background.js');
const SUPABASE_JS = require.resolve('@supabase/supabase-js', { paths: [path.dirname(RECEIVER)] });

async function runSync({ dealer, rows, items, opts }) {
  const { db, client } = makeSupabase(rows, opts);
  const logs = [];
  require.cache[SUPABASE_JS] = { id: SUPABASE_JS, filename: SUPABASE_JS, loaded: true, exports: { createClient: () => client } };
  delete require.cache[RECEIVER];
  process.env.APIFY_API_TOKEN = 'test';
  delete process.env.ANTHROPIC_API_KEY;
  AUTH.armReceiverAuth(dealer);
  const realFetch = global.fetch;
  global.fetch = AUTH.withApprovedRun(async (url) => {
    if (String(url).includes('api.apify.com/v2/datasets/')) return { ok: true, json: async () => clone(items) };
    throw new Error('unexpected fetch ' + url);
  });
  const quiet = [console.log, console.warn, console.error];
  console.log = console.warn = console.error = (...a) => logs.push(a.join(' '));
  let body;
  try {
    const res = await require(RECEIVER).handler(AUTH.authedEvent({ defaultDatasetId: 'ds-test', dealerName: dealer, dryRun: false }));
    assert.equal(res.statusCode, 200, 'handler returned ' + res.statusCode + ' ' + res.body);
    body = JSON.parse(res.body);
  } finally {
    [console.log, console.warn, console.error] = quiet;
    global.fetch = realFetch;
  }
  const inv = db.writes.filter((w) => w.table === 'inventory');
  return { db, logs, body, updates: inv.filter((w) => w.op === 'update'), inserts: inv.filter((w) => w.op === 'insert').flatMap((w) => w.payload),
    events: db.tables.unit_lifecycle_event };
}
const byStock = (db, s) => db.tables.inventory.find((r) => r.stock === s);

const SOLD_FIVE = [['DBT-7896', '1914404'], ['DBT-7907', '1968877'], ['DBT-7908', '1968855'], ['DBT-7956', '2132741'], ['DBT-7963', '2144795']];

test('D0: the captured item is a DeBary Overfuel payload (the shape this lifecycle sees)', () => {
  const it = FIX.items[LID].item;
  assert.equal(it.dealer, DEALER);
  assert.equal(it.source_listing_id, LID);
  assert.equal(it.overfuel_status, 'active');
  assert.ok(!('status' in it), 'the payload carries no Torque Hub status');
});

test('D1: a NEW DeBary listing INSERTs as draft with one ingested_draft event; nothing is published', async () => {
  const r = await runSync({ dealer: DEALER, rows: [], items: [clone(FIX.items[LID].item)] });
  assert.equal(r.inserts.length, 1);
  assert.equal(r.inserts[0].status, 'draft');
  assert.equal(r.inserts[0].stock, 'DBT-7926');
  assert.equal(byStock(r.db, 'DBT-7926').status, 'draft');
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].event_type, 'ingested_draft');
  assert.equal(r.events[0].stock, 'DBT-7926');
  assert.deepEqual(r.body.lifecycle, { drafts_inserted: 1, drafts_resurrected: 0, events_written: 1, event_write_errors: 0, audit_failures: [], clean: true });
  assert.equal(r.body.errors, 0);
});

test('D2: an existing PUBLISHED unsold DeBary row is updated without a status key and stays published (no backfill)', async () => {
  const r = await runSync({ dealer: DEALER, rows: [row('DBT-7926', LID, { source_url: FIX.items[LID].item.source_url })], items: [clone(FIX.items[LID].item)] });
  assert.equal(r.inserts.length, 0);
  assert.equal(r.updates.length, 1);
  assert.ok(!('status' in r.updates[0].payload));
  assert.deepEqual(r.updates[0].filters, [['source_listing_id', LID], ['dealer', DEALER], ['sold', false]]);
  assert.equal(byStock(r.db, 'DBT-7926').status, 'published');
  assert.equal(r.events.length, 0);
  assert.deepEqual(r.body.lifecycle, { drafts_inserted: 0, drafts_resurrected: 0, events_written: 0, event_write_errors: 0, audit_failures: [], clean: true });
});

test('D3: an existing DRAFT unsold DeBary row is updated without a status key and stays draft', async () => {
  const r = await runSync({ dealer: DEALER, rows: [row('DBT-7926', LID, { status: 'draft', source_url: FIX.items[LID].item.source_url })], items: [clone(FIX.items[LID].item)] });
  assert.equal(r.updates.length, 1);
  assert.ok(!('status' in r.updates[0].payload));
  assert.equal(byStock(r.db, 'DBT-7926').status, 'draft');
  assert.equal(r.inserts.length, 0);
});

test('D4: the five SOLD draft rows (sold_type NULL) present as active: every INSERT is rejected by a unique index; rows unchanged; no event', async () => {
  const rows = SOLD_FIVE.map(([s, lid]) => row(s, lid, { status: 'draft', sold: true, sold_type: null }));
  const items = SOLD_FIVE.map(([s, lid]) => itemAs(lid, s.slice(4)));
  const r = await runSync({ dealer: DEALER, rows, items });
  assert.equal(r.inserts.length, 0, 'no row added');
  assert.equal(r.db.rejected.length, 5);
  for (const x of r.db.rejected) assert.match(x.reason, /^inventory_/);
  assert.equal(r.updates.length, 0, 'no update reaches a sold row');
  assert.deepEqual(r.db.tables.inventory, rows, 'all five rows byte-identical');
  assert.equal(r.events.length, 0);
  assert.equal(r.body.errors, 5);
  assert.equal(r.body.synced, 0);
  assert.equal(r.body.markedSold, 0);
  assert.equal(r.body.lifecycle.clean, true, 'no transition happened, so no audit is missing');
});

test('D5: a relist of a SOLD unit under a NEW listing id, URL and stock (same VIN) INSERTs as DRAFT, not published; the sold row is untouched', async () => {
  const sold = row('DBT-7896', '1914404', { status: 'draft', sold: true, vin: '1FVACWDT0HHJA0001' });
  const relist = itemAs('9914404', 'DB7896R', { vin: '1FVACWDT0HHJA0001' }); // new identity, same VIN (SYNTHETIC)
  const r = await runSync({ dealer: DEALER, rows: [sold], items: [relist] });
  assert.equal(r.inserts.length, 1);
  assert.equal(r.inserts[0].status, 'draft');
  assert.equal(r.inserts[0].stock, 'DBT-DB7896R');
  assert.equal(byStock(r.db, 'DBT-DB7896R').status, 'draft', 'not buyer-live');
  assert.deepEqual(byStock(r.db, 'DBT-7896'), sold);
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].event_type, 'ingested_draft');
});

test('D6: a feed_removed DeBary row returned by the feed is skipped by FROZEN_DEALERS: no resurrection, no insert, no event', async () => {
  const buried = row('DBT-7926', LID, { sold: true, sold_type: 'feed_removed', source_url: FIX.items[LID].item.source_url });
  const r = await runSync({ dealer: DEALER, rows: [buried], items: [clone(FIX.items[LID].item)] });
  assert.equal(r.updates.length, 0);
  assert.equal(r.inserts.length, 0);
  assert.equal(r.db.rejected.length, 0, 'the item is skipped before any write');
  assert.deepEqual(byStock(r.db, 'DBT-7926'), buried);
  assert.equal(r.events.length, 0);
  assert.ok(r.logs.some((l) => l.includes('FREEZE ' + DEALER + ': skip resurrection')));
});

test('D7: a failed INSERT writes no event and publishes nothing', async () => {
  const r = await runSync({ dealer: DEALER, rows: [], items: [clone(FIX.items[LID].item)], opts: { failInsert: true } });
  assert.equal(r.db.tables.inventory.length, 0);
  assert.equal(r.db.rejected[0].payload[0].status, 'draft', 'the attempted row was a draft');
  assert.equal(r.events.length, 0);
  assert.equal(r.body.errors, 1);
  assert.equal(r.body.lifecycle.drafts_inserted, 0);
});

test('D8: mark-sold stays frozen for DeBary: a live row absent from the feed is not sold', async () => {
  const absent = row('DBT-1000', '1000001');
  const r = await runSync({ dealer: DEALER, rows: [absent], items: [clone(FIX.items[LID].item)] });
  assert.equal(r.updates.filter((w) => w.payload.sold === true).length, 0);
  assert.deepEqual(byStock(r.db, 'DBT-1000'), absent);
  assert.equal(r.body.markedSold, 0);
});

test('D9: control: a non-lifecycle dealer (captured Mid-Atlantic item) still INSERTs with no status key and no event', async () => {
  const r = await runSync({ dealer: MAP, rows: [], items: [clone(FIX.items[MAP_LID].item)] });
  assert.equal(r.inserts.length, 1);
  assert.ok(!('status' in r.inserts[0]), 'DB default applies, as before');
  assert.equal(r.events.length, 0);
  assert.ok(!('lifecycle' in r.body));
});
