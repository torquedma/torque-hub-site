'use strict';
// d1-d2-adjudicated-condition-receiver.test.js — BIQ DATA FIRST durability (Chief 2026-10-11, amended).
// D1: an existing row whose provenance.condition carries an Owner ADJUDICATION MARKER (created only by governed,
//     Owner-authorized SQL) is not overwritten or re-stamped by routine ingestion (update and D1 resurrection).
//     An ordinary human_admin stamp (every Admin Save & Close) is NOT an adjudication and stays feed-writable.
// D2: the receiver's INSERT default 'Used' is never stamped as a source claim.
// Runs the REAL receiver handler against an in-memory Supabase fake and a stubbed Apify fetch.
// Feed items are CAPTURED production payloads (fixtures/condition-adjudication-captured-items.json: Impex, Allied,
// Mid-Atlantic console exports 2026-10-11; DeBary A2 capture 2026-10-05). Where a test needs a condition the real
// feed did not carry, it changes exactly that one field on a copy of the captured item and says so.
// Row provenance.condition objects are copied verbatim from production (2026-10-11T21:45Z read).
// Markers below carry SYNTHETIC TEST values (1970-01-01 / "TEST-ONLY") — they are not authorization records.
// Run: node --test netlify/functions/__tests__/d1-d2-adjudicated-condition-receiver.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const FIX = require('./fixtures/condition-adjudication-captured-items.json');

const clone = (x) => JSON.parse(JSON.stringify(x));
const captured = (lid, over) => Object.assign(clone(FIX.items[lid].item), over || {});

function makeSupabase(rows, refuse) {
  const db = { tables: { inventory: clone(rows), unit_lifecycle_event: [] }, writes: [] };
  class Query {
    constructor(table) { this.table = table; this.op = 'select'; this.filters = []; this.payload = null; this.wantRows = false; }
    select() { this.wantRows = true; return this; }
    eq(k, v) { this.filters.push([k, v]); return this; }
    update(p) { this.op = 'update'; this.payload = clone(p); return this; }
    insert(arr) { this.op = 'insert'; this.payload = clone(arr); return this; }
    then(resolve, reject) { try { resolve(this.exec()); } catch (e) { reject(e); } }
    exec() {
      const t = db.tables[this.table] || (db.tables[this.table] = []);
      const hit = (r) => this.filters.every(([k, v]) => String(r[k]) === String(v));
      if (this.op === 'select') return { data: clone(t.filter(hit)), error: null };
      if (this.op === 'insert') { for (const r of this.payload) t.push(clone(r)); db.writes.push({ table: this.table, op: 'insert', payload: this.payload }); return { data: null, error: null }; }
      const matched = t.filter(hit);
      // The database guard (sql/05) refuses a whole statement with PT409: nothing is written.
      const refusal = refuse && this.table === 'inventory' && matched.length ? refuse(matched[0], this.payload) : null;
      if (refusal) { db.writes.push({ table: this.table, op: 'refused', filters: this.filters, payload: this.payload }); return { data: null, error: refusal }; }
      for (const r of matched) Object.assign(r, clone(this.payload));
      db.writes.push({ table: this.table, op: 'update', filters: this.filters, payload: this.payload });
      return { data: this.wantRows ? clone(matched) : null, error: null };
    }
  }
  return { db, client: { from: (t) => new Query(t) } };
}

const RECEIVER = path.resolve(__dirname, '../sync-truckpaper-background.js');
const SUPABASE_JS = require.resolve('@supabase/supabase-js', { paths: [path.dirname(RECEIVER)] });

async function runSync({ dealer, rows, items, dryRun = false, refuse = null }) {
  const { db, client } = makeSupabase(rows, refuse);
  const logs = [];
  require.cache[SUPABASE_JS] = { id: SUPABASE_JS, filename: SUPABASE_JS, loaded: true, exports: { createClient: () => client } };
  delete require.cache[RECEIVER];
  process.env.APIFY_API_TOKEN = 'test';
  delete process.env.ANTHROPIC_API_KEY;
  const realFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes('api.apify.com/v2/datasets/')) return { ok: true, json: async () => clone(items) };
    throw new Error('unexpected fetch ' + url);
  };
  const quiet = [console.log, console.warn, console.error];
  const errs = [];
  console.log = (...a) => logs.push(a.join(' ')); console.warn = console.error = (...a) => errs.push(a.join(' '));
  let body;
  try {
    const res = await require(RECEIVER).handler({ httpMethod: 'POST', body: JSON.stringify({ defaultDatasetId: 'ds-test', dealerName: dealer, dryRun }) });
    assert.equal(res.statusCode, 200, 'handler returned ' + res.statusCode + ' ' + res.body);
    body = JSON.parse(res.body);
  } finally {
    [console.log, console.warn, console.error] = quiet;
    global.fetch = realFetch;
  }
  const inv = db.writes.filter((w) => w.table === 'inventory');
  return { db, logs, errs, body, refused: inv.filter((w) => w.op === 'refused'), updates: inv.filter((w) => w.op === 'update'), inserts: inv.filter((w) => w.op === 'insert').flatMap((w) => w.payload) };
}
const onlyUpdate = (r) => { assert.equal(r.updates.length, 1, 'expected exactly one update'); return r.updates[0].payload; };
const logged = (r, tag) => r.logs.some((l) => l.includes(tag));

// ---------- markers (SYNTHETIC TEST values) ----------
function testMarker(value, basis, over) {
  return Object.assign({ v: 1, value, authority: 'owner', authorized_by: 'TEST-ONLY', authorized_on: '1970-01-01',
    basis: basis || 'owner_confirmation', evidence: [{ kind: 'test', ref: 'TEST-ONLY' }], ruling: 'TEST-ONLY',
    recorded_by: 'governed_sql', recorded_at: '1970-01-01T00:00:00Z' }, over || {});
}
const marked = (fact, over) => Object.assign(clone(fact), { adjudication: testMarker(fact.value, undefined, over) });

// ---------- verbatim production provenance.condition objects ----------
// The seven Impex units (md5 b54e63f08338fbb456c6d5f8a8a12186).
const SEVEN_PRESTATE_COND = { as_of: '2026-09-13', trust: 'attributed', value: 'New', claims: [{ note: 'Source sandhills_direct reported Used.', trust: 'attributed', value: 'Used', source: 'sandhills_direct', relation: 'contextualizes' }], source: 'sandhills_direct' };
// The three owner-confirmed golf carts today (md5 4286ee4c6cd611d01f276f43aff28808) — human_admin, NO marker.
const GOLF_NOW = { as_of: '2026-10-01', notes: ['Owner confirmed this golf cart is a new unit.'], trust: 'attributed', value: 'New', claims: [{ note: 'Source sandhills_direct reported Used.', trust: 'attributed', value: 'Used', source: 'sandhills_direct', relation: 'contextualizes' }], source: 'human_admin' };
// After the proposed backfill: the same object plus the marker (only key the backfill adds).
const GOLF_MARKED = marked(GOLF_NOW);
// Ordinary Admin Save & Close stamps (Allied ATT-947549 / MAP-245863 / DeBary DBT-7926 shapes).
const ADMIN_SAVED_ALLIED = { as_of: '2026-09-05', notes: ['Set by ryan.davis@torquedma.com.'], trust: 'attributed', value: 'Used', source: 'human_admin' };
const ADMIN_SAVED_MAP = { as_of: '2026-07-21', notes: ['Set by ryan.davis@torquedma.com.'], trust: 'attributed', value: 'Used', source: 'human_admin' };
const ADMIN_SAVED_DBT = { as_of: '2026-10-07', notes: ['Set by ryan.davis@torquedma.com.'], trust: 'attributed', value: 'Used', source: 'human_admin' };
const FEED_USED = { as_of: '2026-09-13', trust: 'attributed', value: 'Used', source: 'sandhills_direct' };
const FEED_NEW_NO_CLAIM = { as_of: '2026-09-13', trust: 'attributed', value: 'New', source: 'sandhills_direct' };
// Post-correction MPX-4LA0826 exactly as emitted by design/promote-seven-condition.js with TEST values
// (args 1970-01-01 1970-01-01 "TEST-ONLY synthetic ruling (not an authorization)" 0x64; recorded_at as SQL would set it).
const SEVEN_POST_COND = {"value": "New", "source": "human_admin", "trust": "attributed", "as_of": "1970-01-01", "claims": [{"note": "Source sandhills_direct reported Used.", "trust": "attributed", "value": "Used", "source": "sandhills_direct", "relation": "contextualizes"}, {"value": "New", "source": "sandhills_direct", "trust": "attributed", "relation": "states", "note": "Prior primary (as_of 2026-09-13). Seller listing 233857493 captured 2026-10-11T20:13:21Z: structured Condition \"New\"; description \"Condition: Brand new and job ready.\""}], "notes": ["Condition Used -> New: Chief-reviewed (TEST-ONLY synthetic ruling (not an authorization)) and Owner-authorized 1970-01-01 (Ryan Davis); executed by Claude Code from Site Tech brief sha256 0000000000000000000000000000000000000000000000000000000000000000.", "Seller evidence: https://impexheavymetal.com/inventory/?/listing/for-sale/233857493/2023-landhonor-gm-12-96w-other-blades?dlr=1&dscompanyid=94878&settingscrmid=17294228 captured 2026-10-11T20:13:21Z by Site Tech (Claude-in-Chrome); record 1y1wuAQvTih5vdN3gzeQHnbTNITSShSrBFqN3aQucqwo.", "Audit: the existing claim \"Source sandhills_direct reported Used.\" is retained, not deleted, and is not treated as seller evidence. Before D2 the receiver stamped its 'Used' default as a source claim whenever the feed carried no condition; whether this claim came from that default or from an explicit feed value is not established."], "adjudication": {"v": 1, "value": "New", "authority": "owner", "authorized_by": "Ryan Davis", "authorized_on": "1970-01-01", "basis": "seller_listing_capture", "evidence": [{"kind": "seller_listing", "ref": "https://impexheavymetal.com/inventory/?/listing/for-sale/233857493/2023-landhonor-gm-12-96w-other-blades?dlr=1&dscompanyid=94878&settingscrmid=17294228", "captured_at": "2026-10-11T20:13:21Z", "record": "1y1wuAQvTih5vdN3gzeQHnbTNITSShSrBFqN3aQucqwo"}], "ruling": "TEST-ONLY synthetic ruling (not an authorization)", "recorded_by": "governed_sql", "recorded_at": "1970-01-01T00:00:00Z"}};

// ---------- rows (production shapes) ----------
const IMPEX = 'Impex Heavy Metal';
function sevenRow(over) {   // MPX-4LA0826 / listing 233857493 (subcategory_locked, per production)
  return Object.assign({ stock: 'MPX-4LA0826', dealer: IMPEX, sold: false, sold_type: null, source_listing_id: '233857493',
    source_url: FIX.items['233857493'].item.source_url, subcategory_locked: true, model_locked: false, vin_locked: false,
    vin: 'HL-00826', condition: 'Used', provenance: { condition: clone(SEVEN_PRESTATE_COND) } }, over);
}
function golfRow(over) {    // MPX-230981 / listing 260230981 (subcategory_locked + model_locked, per production)
  return Object.assign({ stock: 'MPX-230981', dealer: IMPEX, sold: false, sold_type: null, source_listing_id: '260230981',
    source_url: FIX.items['260230981'].item.source_url, subcategory_locked: true, model_locked: true, vin_locked: false,
    vin: 'LQ202501718', condition: 'New', provenance: { condition: clone(GOLF_NOW) } }, over);
}

// ---------- A. MISSING incoming condition (the real Impex / Allied / MAP payload: condition null) ----------
test('A0: the captured Impex, Allied and Mid-Atlantic items carry condition null (the real feed shape)', () => {
  for (const lid of ['233857493', '260230981', '259947549', '258245863']) assert.equal(FIX.items[lid].item.condition, null, lid);
  assert.equal(FIX.items['2024795'].item.condition, 'Used', 'DeBary carries condition explicitly');
});

test('A1 (D2): existing feed-primary row + captured item (no condition) → no column write, NO default "reported Used" claim', async () => {
  const p = onlyUpdate(await runSync({ dealer: IMPEX, rows: [sevenRow({ condition: 'New', provenance: { condition: clone(FEED_NEW_NO_CLAIM) } })], items: [captured('233857493')] }));
  assert.ok(!('condition' in p));
  assert.deepEqual(p.provenance.condition, FEED_NEW_NO_CLAIM);
});

test('A2 (D2): INSERT of a captured item (no condition) → column keeps the Used default; provenance carries NO condition', async () => {
  const r = await runSync({ dealer: IMPEX, rows: [], items: [captured('233857493')] });
  assert.equal(r.inserts.length, 1);
  assert.equal(r.inserts[0].condition, 'Used', 'INSERT default unchanged (separate decision)');
  assert.ok(!('condition' in r.inserts[0].provenance), 'the default is not attributed to the source');
  assert.equal(r.inserts[0].status, 'draft', 'Impex lifecycle unchanged');
});

test('A3: golf cart today (human_admin, no marker) + captured item → nothing written (absence), provenance unchanged', async () => {
  const r = await runSync({ dealer: IMPEX, rows: [golfRow()], items: [captured('260230981')] });
  const p = onlyUpdate(r);
  assert.ok(!('condition' in p));
  assert.deepEqual(p.provenance.condition, GOLF_NOW);
  assert.ok(!logged(r, '[ADJUDICAT'), 'no marker → no adjudication logging');
});

test('A4: the seven prestate + captured item → column stays Used, provenance unchanged (D2 adds nothing)', async () => {
  const p = onlyUpdate(await runSync({ dealer: IMPEX, rows: [sevenRow()], items: [captured('233857493')] }));
  assert.ok(!('condition' in p));
  assert.deepEqual(p.provenance.condition, SEVEN_PRESTATE_COND);
});

// ---------- B. PRESENT incoming condition ----------
test('B1: feed-primary Used + incoming Used (captured item, condition set) → written as before, provenance unchanged', async () => {
  const p = onlyUpdate(await runSync({ dealer: IMPEX, rows: [sevenRow({ provenance: { condition: clone(FEED_USED) } })], items: [captured('233857493', { condition: 'Used' })] }));
  assert.equal(p.condition, 'Used');
  assert.deepEqual(p.provenance.condition, FEED_USED);
});

test('B2: INSERT with incoming New → column New, provenance primary New/sandhills_direct (existing behavior)', async () => {
  const r = await runSync({ dealer: IMPEX, rows: [], items: [captured('233857493', { condition: 'New' })] });
  assert.equal(r.inserts[0].condition, 'New');
  assert.equal(r.inserts[0].provenance.condition.value, 'New');
  assert.equal(r.inserts[0].provenance.condition.source, 'sandhills_direct');
});

// ---------- C. CONTRADICTORY incoming condition: ordinary human_admin vs adjudicated ----------
test('C1: feed-primary New + incoming Used → overwritten as before; a TRUE source claim is recorded', async () => {
  const p = onlyUpdate(await runSync({ dealer: IMPEX, rows: [sevenRow({ condition: 'New', provenance: { condition: clone(FEED_NEW_NO_CLAIM) } })], items: [captured('233857493', { condition: 'Used' })] }));
  assert.equal(p.condition, 'Used');
  assert.deepEqual(p.provenance.condition.claims.map((c) => [c.value, c.source]), [['Used', 'sandhills_direct']]);
});

test('C2 (amendment core): ORDINARY human_admin New (golf cart today, no marker) + incoming Used → WRITTEN; human_admin alone is not feed-immune', async () => {
  const r = await runSync({ dealer: IMPEX, rows: [golfRow()], items: [captured('260230981', { condition: 'Used' })] });
  const p = onlyUpdate(r);
  assert.equal(p.condition, 'Used', 'unprotected until the governed marker backfill');
  assert.equal(p.provenance.condition.source, 'human_admin', 'fill-empty keeps the primary; the column moved');
  assert.ok(!logged(r, '[ADJUDICATED-HOLD]'));
});

test('C3 (D1): golf cart AFTER backfill (marker) + incoming Used → NOT written, provenance byte-stable, hold logged', async () => {
  const r = await runSync({ dealer: IMPEX, rows: [golfRow({ provenance: { condition: clone(GOLF_MARKED) } })], items: [captured('260230981', { condition: 'Used' })] });
  const p = onlyUpdate(r);
  assert.ok(!('condition' in p));
  assert.deepEqual(p.provenance.condition, GOLF_MARKED);
  assert.ok(r.logs.some((l) => l.includes('[ADJUDICATED-HOLD] MPX-230981') && l.includes('kept "New"') && l.includes('incoming "Used"')));
});

test('C4 (D1): marked + incoming New (agrees) → nothing written, no hold log', async () => {
  const r = await runSync({ dealer: IMPEX, rows: [golfRow({ provenance: { condition: clone(GOLF_MARKED) } })], items: [captured('260230981', { condition: 'New' })] });
  assert.ok(!('condition' in onlyUpdate(r)));
  assert.ok(!logged(r, '[ADJUDICAT'));
});

test('C5 (D1): marked + captured item (condition missing) → nothing written, marker byte-stable, no log', async () => {
  const r = await runSync({ dealer: IMPEX, rows: [golfRow({ provenance: { condition: clone(GOLF_MARKED) } })], items: [captured('260230981')] });
  assert.deepEqual(onlyUpdate(r).provenance.condition, GOLF_MARKED);
  assert.ok(!logged(r, '[ADJUDICAT'));
});

// ---------- M. Marker integrity: malformed / inconsistent / null ----------
test('M1: malformed marker (unreplaced placeholder date) → HELD (fail closed) and logged MALFORMED; provenance byte-stable', async () => {
  const bad = marked(GOLF_NOW, { authorized_on: '<OWNER_AUTH_DATE>' });
  const r = await runSync({ dealer: IMPEX, rows: [golfRow({ provenance: { condition: clone(bad) } })], items: [captured('260230981', { condition: 'Used' })] });
  const p = onlyUpdate(r);
  assert.ok(!('condition' in p));
  assert.deepEqual(p.provenance.condition, bad);
  assert.ok(logged(r, '[ADJUDICATION-MALFORMED] MPX-230981'));
});

test('M2: marker New but provenance primary Used → HELD, logged INCONSISTENT', async () => {
  const f = Object.assign(clone(GOLF_MARKED), { value: 'Used' });
  const r = await runSync({ dealer: IMPEX, rows: [golfRow({ condition: 'Used', provenance: { condition: f } })], items: [captured('260230981', { condition: 'Used' })] });
  assert.ok(!('condition' in onlyUpdate(r)));
  assert.ok(logged(r, '[ADJUDICATION-INCONSISTENT] MPX-230981'));
});

test('M3: marker and primary agree but the COLUMN disagrees → HELD, logged INCONSISTENT (no silent repair either way)', async () => {
  const r = await runSync({ dealer: IMPEX, rows: [golfRow({ condition: 'Used', provenance: { condition: clone(GOLF_MARKED) } })], items: [captured('260230981', { condition: 'New' })] });
  assert.ok(!('condition' in onlyUpdate(r)));
  assert.ok(r.logs.some((l) => l.includes('[ADJUDICATION-INCONSISTENT] MPX-230981') && l.includes('column "Used"')));
});

test('M4: a marker on a non-human_admin primary (feed source) → HELD, logged INCONSISTENT', async () => {
  const f = Object.assign(clone(FEED_NEW_NO_CLAIM), { adjudication: testMarker('New') });
  const r = await runSync({ dealer: IMPEX, rows: [sevenRow({ condition: 'New', provenance: { condition: f } })], items: [captured('233857493', { condition: 'Used' })] });
  assert.ok(!('condition' in onlyUpdate(r)));
  assert.ok(logged(r, '[ADJUDICATION-INCONSISTENT] MPX-4LA0826'));
});

test('M5: an explicit adjudication: null is a PRESENT, MALFORMED marker → HELD (fail closed), logged MALFORMED for reconcile; the null key stays byte-stable', async () => {
  const f = Object.assign(clone(GOLF_NOW), { adjudication: null });
  const r = await runSync({ dealer: IMPEX, rows: [golfRow({ provenance: { condition: clone(f) } })], items: [captured('260230981', { condition: 'Used' })] });
  const p = onlyUpdate(r);
  assert.ok(!('condition' in p), 'condition column not written');
  assert.deepEqual(p.provenance.condition, f, 'provenance.condition (null key included) unchanged');
  assert.ok(Object.prototype.hasOwnProperty.call(p.provenance.condition, 'adjudication') && p.provenance.condition.adjudication === null);
  assert.ok(r.logs.some((l) => l.includes('[ADJUDICATION-MALFORMED] MPX-230981') && l.includes('marker is null')));
});

test('M6: the same row with NO adjudication key stays ordinary and feed-writable (no key ≠ null key)', async () => {
  const r = await runSync({ dealer: IMPEX, rows: [golfRow({ provenance: { condition: clone(GOLF_NOW) } })], items: [captured('260230981', { condition: 'Used' })] });
  const p = onlyUpdate(r);
  assert.equal(p.condition, 'Used');
  assert.ok(!r.logs.some((l) => l.includes('[ADJUDICATION-')));
});

// ---------- D. The seven after the proposed correction ----------
test('D1: seven post-correction + captured item (no condition) → stays New, provenance byte-stable', async () => {
  const p = onlyUpdate(await runSync({ dealer: IMPEX, rows: [sevenRow({ condition: 'New', provenance: { condition: clone(SEVEN_POST_COND) } })], items: [captured('233857493')] }));
  assert.ok(!('condition' in p));
  assert.deepEqual(p.provenance.condition, SEVEN_POST_COND);
});

test('D2: seven post-correction + incoming Used → stays New, provenance byte-stable, hold logged', async () => {
  const r = await runSync({ dealer: IMPEX, rows: [sevenRow({ condition: 'New', provenance: { condition: clone(SEVEN_POST_COND) } })], items: [captured('233857493', { condition: 'Used' })] });
  const p = onlyUpdate(r);
  assert.ok(!('condition' in p));
  assert.deepEqual(p.provenance.condition, SEVEN_POST_COND);
  assert.ok(logged(r, '[ADJUDICATED-HOLD] MPX-4LA0826'));
});

test('D3: the marker survives an update of OTHER fields (price and hours change; condition object untouched)', async () => {
  const row = sevenRow({ condition: 'New', price: '4900', provenance: { condition: clone(SEVEN_POST_COND), hours: { as_of: '2026-09-13', trust: 'attributed', value: '10', source: 'sandhills_direct' } } });
  const p = onlyUpdate(await runSync({ dealer: IMPEX, rows: [row], items: [captured('233857493', { price: '4500', hours: '12' })] }));
  assert.equal(p.price, '4500');
  assert.deepEqual(p.provenance.condition, SEVEN_POST_COND);
  assert.ok(p.provenance.hours, 'other facts are still stamped as before');
});

// ---------- E. RESURRECTION ----------
test('E1 (D1): Impex feed_removed MARKED golf cart + incoming Used → resurrected as draft, condition untouched, marker byte-stable', async () => {
  const r = await runSync({ dealer: IMPEX, rows: [golfRow({ sold: true, sold_type: 'feed_removed', provenance: { condition: clone(GOLF_MARKED) } })], items: [captured('260230981', { condition: 'Used' })] });
  const p = onlyUpdate(r);
  assert.equal(p.sold, false, 'D1 resurrection path');
  assert.equal(p.status, 'draft');
  assert.ok(!('condition' in p));
  assert.deepEqual(p.provenance.condition, GOLF_MARKED);
});

test('E2: Impex feed_removed ORDINARY human_admin row + incoming Used → resurrected AND written (not protected)', async () => {
  const p = onlyUpdate(await runSync({ dealer: IMPEX, rows: [golfRow({ sold: true, sold_type: 'feed_removed' })], items: [captured('260230981', { condition: 'Used' })] }));
  assert.equal(p.sold, false);
  assert.equal(p.condition, 'Used');
});

test('E3: Impex feed_removed feed-primary row + captured item (no condition) → resurrected; no condition write, no default claim', async () => {
  const p = onlyUpdate(await runSync({ dealer: IMPEX, rows: [sevenRow({ sold: true, sold_type: 'feed_removed', condition: 'New', provenance: { condition: clone(FEED_NEW_NO_CLAIM) } })], items: [captured('233857493')] }));
  assert.equal(p.sold, false);
  assert.ok(!('condition' in p));
  assert.deepEqual(p.provenance.condition, FEED_NEW_NO_CLAIM);
});

// ---------- F. DEBARY (frozen dealer; P2 writer lane coexistence) ----------
const DEBARY = 'DeBary Truck Sales';
function dbtRow(over) {   // DBT-7926 / listing 2024795 — ordinary Admin save on condition (production)
  return Object.assign({ stock: 'DBT-7926', dealer: DEBARY, sold: false, sold_type: null, source_listing_id: '2024795',
    source_url: FIX.items['2024795'].item.source_url, subcategory_locked: false, model_locked: false, vin_locked: false,
    vin: null, condition: 'Used', provenance: { condition: clone(ADMIN_SAVED_DBT) } }, over);
}

test('F1: DeBary feed_removed row → resurrection still skipped entirely by FROZEN_DEALERS (no write at all)', async () => {
  const r = await runSync({ dealer: DEBARY, rows: [dbtRow({ sold: true, sold_type: 'feed_removed', provenance: { condition: marked(ADMIN_SAVED_DBT) } })], items: [captured('2024795', { condition: 'New' })] });
  assert.equal(r.updates.length + r.inserts.length, 0);
});

test('F2: live DeBary ORDINARY human_admin row + captured item (Used) → written exactly as production does today; no adjudication logging', async () => {
  const r = await runSync({ dealer: DEBARY, rows: [dbtRow()], items: [captured('2024795')] });
  const p = onlyUpdate(r);
  assert.equal(p.condition, 'Used');
  assert.deepEqual(p.provenance.condition, ADMIN_SAVED_DBT);
  assert.ok(!logged(r, '[ADJUDICAT'));
});

test('F2b: live DeBary ORDINARY human_admin Used + incoming New (one field changed) → written (the DeBary writer lane owns this, not D1)', async () => {
  const p = onlyUpdate(await runSync({ dealer: DEBARY, rows: [dbtRow()], items: [captured('2024795', { condition: 'New' })] }));
  assert.equal(p.condition, 'New');
});

test('F3: a DeBary row WITH a marker is held like any other dealer (mechanism is dealer-agnostic; 0 DeBary rows are marked)', async () => {
  const f = marked(ADMIN_SAVED_DBT);
  const r = await runSync({ dealer: DEBARY, rows: [dbtRow({ provenance: { condition: f } })], items: [captured('2024795', { condition: 'New' })] });
  const p = onlyUpdate(r);
  assert.ok(!('condition' in p));
  assert.deepEqual(p.provenance.condition, f);
});

test('F4: DeBary presentation-held listing (1910079) → still no write at all', async () => {
  const r = await runSync({ dealer: DEBARY, rows: [dbtRow({ stock: 'DBT-7892', source_listing_id: '1910079' })], items: [captured('2024795', { source_listing_id: '1910079', stock: '7892', condition: 'New' })] });
  assert.equal(r.updates.length + r.inserts.length, 0);
});

// ---------- G. ALLIED / MID-ATLANTIC coexistence (captured items) ----------
test('G1: Allied ATT-947549 ordinary human_admin + captured item → condition not written (feed absent), provenance unchanged', async () => {
  const row = { stock: 'ATT-947549', dealer: 'Allied Truck & Trailer Sales', sold: false, sold_type: null, source_listing_id: '259947549',
    source_url: FIX.items['259947549'].item.source_url, subcategory_locked: true, model_locked: false, vin_locked: false, vin: null,
    condition: 'Used', provenance: { condition: clone(ADMIN_SAVED_ALLIED) } };
  const r = await runSync({ dealer: 'Allied Truck & Trailer Sales', rows: [row], items: [captured('259947549')] });
  const p = onlyUpdate(r);
  assert.ok(!('condition' in p));
  assert.deepEqual(p.provenance.condition, ADMIN_SAVED_ALLIED);
});

test('G2: Mid-Atlantic MAP-245863 MARKED (hypothetical) + incoming New (one field changed) → held; ordinary twin → written', async () => {
  const base = { stock: 'MAP-245863', dealer: 'Mid-Atlantic Power & Equipment', sold: false, sold_type: null, source_listing_id: '258245863',
    source_url: FIX.items['258245863'].item.source_url, subcategory_locked: false, model_locked: false, vin_locked: false, vin: null, condition: 'Used' };
  const f = marked(ADMIN_SAVED_MAP);
  const held = onlyUpdate(await runSync({ dealer: 'Mid-Atlantic Power & Equipment', rows: [Object.assign({}, base, { provenance: { condition: f } })], items: [captured('258245863', { condition: 'New' })] }));
  assert.ok(!('condition' in held));
  assert.deepEqual(held.provenance.condition, f);
  const open = onlyUpdate(await runSync({ dealer: 'Mid-Atlantic Power & Equipment', rows: [Object.assign({}, base, { provenance: { condition: clone(ADMIN_SAVED_MAP) } })], items: [captured('258245863', { condition: 'New' })] }));
  assert.equal(open.condition, 'New');
});

// ---------- S. SCOPE ----------
test('S1: an ENGINE marker is ignored (engine is not in ADJUDICATED_GUARD_FIELDS) — the list, not the marker, sets scope', async () => {
  const prov = { engine: { as_of: '2026-09-30', trust: 'attributed', value: 'Electric', source: 'human_admin', adjudication: testMarker('Electric') } };
  const p = onlyUpdate(await runSync({ dealer: IMPEX, rows: [golfRow({ engine: 'Electric', provenance: prov })], items: [captured('260230981', { engine: 'Electric Engine' })] }));
  assert.equal(p.engine, 'Electric Engine');
});

// ---------- DB. The database guard's refusal (real-database interleavings: Site Tech harness, not this fake) ----------
test('DB1: the database guard refuses ONE unit (PT409, e.g. a marker created after the receiver read its rows) → logged and counted; the other unit syncs; the refused row is untouched', async () => {
  const golf = golfRow(); const seven = sevenRow();
  const PT409 = { code: 'PT409', details: null, hint: null, message: 'condition_adjudication_guard: MPX-230981 (Impex Heavy Metal) carries an Owner-adjudication marker; this write would change inventory.condition or provenance.condition (a stale read or an ungoverned write). Nothing was written.' };
  const r = await runSync({ dealer: IMPEX, rows: [golf, seven], items: [captured('260230981'), captured('233857493')], refuse: (row) => (row.stock === 'MPX-230981' ? PT409 : null) });
  assert.equal(r.body.errors, 1);
  assert.equal(r.body.synced, 1);
  assert.equal(r.refused.length, 1);
  assert.ok(r.errs.some((l) => l.startsWith('Error MPX-230981:') && l.includes('condition_adjudication_guard')), 'the refusal is logged with the stock');
  assert.deepEqual(r.db.tables.inventory.find((x) => x.stock === 'MPX-230981'), golf, 'refused row untouched');
  assert.equal(r.updates.length, 1, 'the other unit was written');
});

// ---------- H. DRY RUN ----------
test('H1: dry run reports the same D1 decision the real write would make', async () => {
  const r = await runSync({ dealer: IMPEX, rows: [golfRow({ provenance: { condition: clone(GOLF_MARKED) } })], items: [captured('260230981', { condition: 'Used' })], dryRun: true });
  assert.equal(r.db.writes.length, 0, 'dry run writes nothing');
  assert.ok(!('condition' in r.body.dryRunLog[0].unit));
});
