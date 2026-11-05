'use strict';
// mileage-adjudication-receiver.test.js - per-row Owner adjudication for MILEAGE (Chief 1 rollback ruling, 2026-11-04).
// The receiver's existing D1 guard (ADJUDICATED_GUARD_FIELDS) now covers 'mileage'. It protects ONLY a row whose
// provenance.mileage carries an adjudication marker (created and released only by governed SQL). Every other row,
// and every INSERT, keeps today's behaviour. A disagreeing feed reading on a marked row is logged, never written.
// Runs the REAL receiver handler against an in-memory Supabase fake and a stubbed Apify fetch (same harness as
// d1-d2-adjudicated-condition-receiver.test.js). The feed item is the CAPTURED Mid-Atlantic payload for listing
// 258245863 (real mileage "251727"); where a test needs a different reading it changes exactly that one field on a
// copy and says so. Markers carry SYNTHETIC TEST values (1970-01-01 / "TEST-ONLY"); they are not authorization records.
// Run: node --test netlify/functions/__tests__/mileage-adjudication-receiver.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const FIX = require('./fixtures/condition-adjudication-captured-items.json');
const AUTH = require('./helpers/receiver-auth-fixture');

const clone = (x) => JSON.parse(JSON.stringify(x));
const captured = (lid, over) => Object.assign(clone(FIX.items[lid].item), over || {});

// The fake enforces PostgREST projection semantics: a select('a,b') returns ONLY those columns, so a field the
// receiver does not SELECT is absent from the row it reasons about, exactly as in production (Chief 2 AMEND, -040).
function project(row, cols) {
  if (!cols) return clone(row);
  const out = {};
  for (const c of cols) if (Object.prototype.hasOwnProperty.call(row, c)) out[c] = clone(row[c]);
  return out;
}
function makeSupabase(rows) {
  const db = { tables: { inventory: clone(rows), unit_lifecycle_event: [] }, writes: [], selects: [] };
  class Query {
    constructor(table) { this.table = table; this.op = 'select'; this.filters = []; this.payload = null; this.wantRows = false; this.cols = null; }
    select(cols) {
      this.wantRows = true;
      this.cols = (typeof cols === 'string' && cols.trim() !== '' && cols.trim() !== '*') ? cols.split(',').map((c) => c.trim()) : null;
      if (this.op === 'select') db.selects.push({ table: this.table, cols: this.cols });
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
      if (this.op === 'insert') { for (const r of this.payload) t.push(clone(r)); db.writes.push({ table: this.table, op: 'insert', payload: this.payload }); return { data: null, error: null }; }
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

async function runSync({ dealer, rows, items }) {
  const { db, client } = makeSupabase(rows);
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
  const errs = [];
  console.log = (...a) => logs.push(a.join(' ')); console.warn = console.error = (...a) => errs.push(a.join(' '));
  try {
    const res = await require(RECEIVER).handler(AUTH.authedEvent({ defaultDatasetId: 'ds-test', dealerName: dealer, dryRun: false }));
    assert.equal(res.statusCode, 200, 'handler returned ' + res.statusCode + ' ' + res.body);
  } finally {
    [console.log, console.warn, console.error] = quiet;
    global.fetch = realFetch;
  }
  const inv = db.writes.filter((w) => w.table === 'inventory');
  return { db, logs, errs, updates: inv.filter((w) => w.op === 'update'), inserts: inv.filter((w) => w.op === 'insert').flatMap((w) => w.payload) };
}
const onlyUpdate = (r) => { assert.equal(r.updates.length, 1, 'expected exactly one update'); return r.updates[0].payload; };
const logLine = (r, tag) => r.logs.find((l) => l.includes(tag));

function testMarker(value, over) {
  return Object.assign({ v: 1, value, authority: 'owner', authorized_by: 'TEST-ONLY', authorized_on: '1970-01-01',
    basis: 'owner_confirmation', evidence: [{ kind: 'odometer_photo', ref: 'TEST-ONLY' }], ruling: 'TEST-ONLY',
    recorded_by: 'governed_sql', recorded_at: '1970-01-01T00:00:00Z' }, over || {});
}

const DEALER = 'Mid-Atlantic Power & Equipment';
const LID = '258245863';
// Shape of the governed Owner-adjudicated mileage fact (Addendum 1 Draft B), with SYNTHETIC values.
const ADJ_FACT = { value: '200000', source: 'human_admin', trust: 'attributed', as_of: '1970-01-01',
  notes: ['TEST-ONLY Owner decision from the cluster photo.'],
  claims: [{ value: '251727', source: 'sandhills_direct', trust: 'attributed', relation: 'disputes', note: 'TEST-ONLY dealer structured field.' }],
  adjudication: testMarker('200000') };
// Ordinary feed-primary fact (no marker).
const FEED_FACT = { value: '200000', source: 'sandhills_direct', trust: 'attributed', as_of: '1970-01-01' };

function row(mileage, mileageFact) {
  return { stock: 'MAP-245863', dealer: DEALER, sold: false, sold_type: null, source_listing_id: LID,
    source_url: FIX.items[LID].item.source_url, subcategory_locked: false, model_locked: false, vin_locked: false,
    vin: null, condition: 'Used', mileage, provenance: { mileage: clone(mileageFact) } };
}

test('F0: the fake honours projections (an unselected field is unavailable, as in PostgREST)', async () => {
  const { client } = makeSupabase([{ stock: 'X', dealer: 'D', mileage: '1', provenance: {} }]);
  const { data } = await client.from('inventory').select('stock,provenance').eq('dealer', 'D');
  assert.deepEqual(Object.keys(data[0]).sort(), ['provenance', 'stock']);
  assert.ok(!('mileage' in data[0]));
});

test('M0: the captured item carries a real mileage reading (the feed shape this guard sees)', () => {
  assert.equal(FIX.items[LID].item.mileage, '251727');
  assert.equal(FIX.items[LID].item.dealer, DEALER);
});

test('M1: MARKED row + disagreeing feed reading -> column not written, provenance.mileage byte-stable, HOLD logged with the incoming value', async () => {
  const r = await runSync({ dealer: DEALER, rows: [row('200000', ADJ_FACT)], items: [captured(LID)] });
  const p = onlyUpdate(r);
  assert.ok(!('mileage' in p), 'mileage must not be in the update payload');
  assert.deepEqual(p.provenance.mileage, ADJ_FACT, 'provenance.mileage unchanged, marker intact, no new claim');
  assert.equal(r.db.tables.inventory[0].mileage, '200000');
  const l = logLine(r, '[ADJUDICATED-HOLD]');
  assert.ok(l && l.includes('mileage') && l.includes('"200000"') && l.includes('"251727"'), 'hold log names the kept and incoming values: ' + l);
});

test('M2: ORDINARY twin (no marker) + same feed reading -> mileage written exactly as today', async () => {
  const r = await runSync({ dealer: DEALER, rows: [row('200000', FEED_FACT)], items: [captured(LID)] });
  const p = onlyUpdate(r);
  assert.equal(p.mileage, '251727', 'an unmarked row stays feed-writable');
  assert.ok(!logLine(r, '[ADJUDICATED-HOLD]') && !logLine(r, '[ADJUDICATION-'), 'no guard log on an ordinary row');
});

test('M3: MARKED row + agreeing feed reading -> not written, no HOLD log (nothing to report)', async () => {
  const r = await runSync({ dealer: DEALER, rows: [row('251727', Object.assign(clone(ADJ_FACT), { value: '251727', adjudication: testMarker('251727') }))], items: [captured(LID)] });
  const p = onlyUpdate(r);
  assert.ok(!('mileage' in p));
  assert.ok(!logLine(r, '[ADJUDICATED-HOLD]'));
});

test('M4: MARKED row + feed carries NO mileage (one field changed: mileage "") -> not written, no HOLD log', async () => {
  const r = await runSync({ dealer: DEALER, rows: [row('200000', ADJ_FACT)], items: [captured(LID, { mileage: '' })] });
  const p = onlyUpdate(r);
  assert.ok(!('mileage' in p));
  assert.ok(!logLine(r, '[ADJUDICATED-HOLD]'));
});

test('M5: MALFORMED marker (null) -> held and logged for governed reconcile, never silently ordinary', async () => {
  const r = await runSync({ dealer: DEALER, rows: [row('200000', Object.assign(clone(ADJ_FACT), { adjudication: null }))], items: [captured(LID)] });
  const p = onlyUpdate(r);
  assert.ok(!('mileage' in p));
  assert.ok(logLine(r, '[ADJUDICATION-MALFORMED]'), 'malformed marker logged');
});

test('M6: template marker (unreplaced <CHIEF_RULING_REF>) -> malformed: held and logged, cannot silently protect or release', async () => {
  const f = Object.assign(clone(ADJ_FACT), { adjudication: testMarker('200000', { ruling: '<CHIEF_RULING_REF>' }) });
  const r = await runSync({ dealer: DEALER, rows: [row('200000', f)], items: [captured(LID)] });
  const p = onlyUpdate(r);
  assert.ok(!('mileage' in p));
  assert.ok(logLine(r, '[ADJUDICATION-MALFORMED]'));
});

test('M7: INCONSISTENT (valid marker, column moved off the adjudicated value) -> held and logged ON THE PRODUCTION SELECT PATH', async () => {
  // Regression for Chief 2 AMEND (-040): the receiver can only see a column it SELECTs. With mileage missing from the
  // existing-row projection this test fails (no INCONSISTENT log); with mileage selected it passes.
  const r = await runSync({ dealer: DEALER, rows: [row('19884', ADJ_FACT)], items: [captured(LID)] });
  const p = onlyUpdate(r);
  assert.ok(!('mileage' in p));
  assert.ok(logLine(r, '[ADJUDICATION-INCONSISTENT]'), 'stored column/marker disagreement must be detected');
});

test('M10: every existing-row inventory SELECT that feeds the guard projects mileage (live and feed_removed rows)', async () => {
  const r = await runSync({ dealer: DEALER, rows: [row('200000', ADJ_FACT)], items: [captured(LID)] });
  const guardSelects = r.db.selects.filter((s) => s.table === 'inventory' && s.cols && s.cols.includes('provenance'));
  assert.ok(guardSelects.length >= 2, 'expected the live and feed_removed existing-row selects');
  for (const s of guardSelects) assert.ok(s.cols.includes('mileage'), 'select missing mileage: ' + s.cols.join(','));
});

test('M8: INSERT (no existing row) -> mileage written from the feed exactly as today', async () => {
  const r = await runSync({ dealer: DEALER, rows: [], items: [captured(LID)] });
  assert.equal(r.inserts.length, 1);
  assert.equal(r.inserts[0].mileage, '251727');
});

test('M9: a marked MILEAGE fact does not hold CONDITION (guard is per field)', async () => {
  const r = await runSync({ dealer: DEALER, rows: [row('200000', ADJ_FACT)], items: [captured(LID, { condition: 'New' })] });
  const p = onlyUpdate(r);
  assert.ok(!('mileage' in p));
  assert.equal(p.condition, 'New', 'condition on the same row stays feed-writable');
});
