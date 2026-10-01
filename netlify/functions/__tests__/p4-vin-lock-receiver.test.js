'use strict';
// p4-vin-lock-receiver.test.js — P4 Stage 1 (Chief 2026-10-01): vin_locked + VIN decisions before
// provenance/DX in sync-truckpaper-background. Runs the REAL receiver handler against an in-memory
// Supabase fake and stubbed Apify/Anthropic fetches. No network, no database.
// Run: node --test netlify/functions/__tests__/p4-vin-lock-receiver.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const DEALER = 'Mid-Atlantic Power & Equipment';          // live, unfrozen, not a lifecycle dealer
const REAL_VIN = '1XKDD49X8TJ123456';                     // passes isValidVin (shape)
const REAL_VIN_2 = '1FUJGLDR7CLBP8834';
const PIN = 'CAT00D6KTDHA01351';                          // 17-char equipment PIN, passes isValidVin
const clone = (x) => JSON.parse(JSON.stringify(x));

// ---------- in-memory supabase-js fake (only the calls the receiver makes) ----------
function makeSupabase(rows) {
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
      for (const r of matched) Object.assign(r, clone(this.payload));
      db.writes.push({ table: this.table, op: 'update', filters: this.filters, payload: this.payload });
      return { data: this.wantRows ? clone(matched) : null, error: null };
    }
  }
  return { db, client: { from: (t) => new Query(t) } };
}

const RECEIVER = path.resolve(__dirname, '../sync-truckpaper-background.js');
const SUPABASE_JS = require.resolve('@supabase/supabase-js', { paths: [path.dirname(RECEIVER)] });

async function runSync({ rows, items, anthropic = false }) {
  const { db, client } = makeSupabase(rows);
  const prompts = [];
  require.cache[SUPABASE_JS] = { id: SUPABASE_JS, filename: SUPABASE_JS, loaded: true, exports: { createClient: () => client } };
  delete require.cache[RECEIVER];
  process.env.APIFY_API_TOKEN = 'test';
  if (anthropic) process.env.ANTHROPIC_API_KEY = 'test'; else delete process.env.ANTHROPIC_API_KEY;
  const realFetch = global.fetch;
  global.fetch = async (url, opts = {}) => {
    if (String(url).includes('api.apify.com/v2/datasets/')) return { ok: true, json: async () => clone(items) };
    if (String(url).includes('api.anthropic.com')) {
      prompts.push(JSON.parse(opts.body).messages[0].content);
      return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'Mock overview sentence.' }] }) };
    }
    throw new Error('unexpected fetch ' + url);
  };
  const quiet = [console.log, console.warn, console.error];
  console.log = console.warn = console.error = () => {};
  try {
    const { handler } = require(RECEIVER);
    const res = await handler({ httpMethod: 'POST', body: JSON.stringify({ defaultDatasetId: 'ds-test', dealerName: DEALER }) });
    assert.equal(res.statusCode, 200, 'handler returned ' + res.statusCode + ' ' + res.body);
  } finally {
    [console.log, console.warn, console.error] = quiet;
    global.fetch = realFetch;
  }
  const inv = db.writes.filter((w) => w.table === 'inventory');
  return { db, prompts, updates: inv.filter((w) => w.op === 'update'), inserts: inv.filter((w) => w.op === 'insert').flatMap((w) => w.payload) };
}

const LID = '241999001';
const SRC = 'https://www.midatlanticnc.com/inventory/?/listing/for-sale/241999001/test';
function row(over) {
  return Object.assign({ stock: 'MAP-999001', dealer: DEALER, sold: false, sold_type: null, source_listing_id: LID, source_url: SRC,
    subcategory_locked: false, model_locked: false, vin_locked: false, vin: null, provenance: {}, condition: 'Used' }, over);
}
function item(over) {
  return Object.assign({ dealer: DEALER, source_listing_id: LID, source_url: SRC, stock: LID, year: '2015', make: 'Caterpillar',
    model: 'D6K', category: 'Construction', subcategory: 'Crawler Dozer', price: '50000',
    description: 'Clean dozer, runs and works.' }, over);
}
const onlyUpdate = (r) => { assert.equal(r.updates.length, 1, 'expected exactly one update'); return r.updates[0].payload; };

test('T1: unlocked row, real 17-char VIN arrives → written and stamped (existing behavior)', async () => {
  const p = onlyUpdate(await runSync({ rows: [row()], items: [item({ vin: REAL_VIN })] }));
  assert.equal(p.vin, REAL_VIN);
  assert.equal(p.provenance.vin.value, REAL_VIN);
});

test('T1b: INSERT with a real 17-char VIN → stored, stamped, and shown in DX (existing behavior)', async () => {
  const r = await runSync({ rows: [], items: [item({ vin: REAL_VIN })], anthropic: true });
  assert.equal(r.inserts.length, 1);
  assert.equal(r.inserts[0].vin, REAL_VIN);
  assert.equal(r.inserts[0].provenance.vin.value, REAL_VIN);
  assert.match(r.inserts[0].description, new RegExp('- VIN: ' + REAL_VIN));
});

test('T2: missing VIN → existing stored VIN untouched; INSERT stores NULL (existing behavior)', async () => {
  const prov = { vin: { value: REAL_VIN, source: 'sandhills_direct', trust: 'attributed', as_of: '2026-07-06' } };
  const p = onlyUpdate(await runSync({ rows: [row({ vin: REAL_VIN, provenance: prov })], items: [item({})] }));
  assert.ok(!('vin' in p), 'vin must not be in the UPDATE payload');
  assert.deepEqual(p.provenance.vin, prov.vin);
  const ins = await runSync({ rows: [], items: [item({})] });
  assert.equal(ins.inserts[0].vin, null);
});

test('T3: unlocked existing row, legitimate short serial arrives → written (current behavior preserved)', async () => {
  const p = onlyUpdate(await runSync({ rows: [row()], items: [item({ vin: '63972' })] }));
  assert.equal(p.vin, '63972');
  assert.equal(p.provenance.vin.value, '63972');
});

test('T4: unlocked existing row, manufacturer PIN arrives → written (current behavior preserved)', async () => {
  const p = onlyUpdate(await runSync({ rows: [row()], items: [item({ vin: PIN })] }));
  assert.equal(p.vin, PIN);
});

test('T5: LOCKED NULL + the same placeholder returns → dropped; provenance not stamped', async () => {
  const p = onlyUpdate(await runSync({ rows: [row({ vin_locked: true })], items: [item({ vin: 'DB6899' })] }));
  assert.ok(!('vin' in p));
  assert.ok(!('vin' in p.provenance));
});

test('T6: LOCKED NULL + a different placeholder returns → dropped', async () => {
  const p = onlyUpdate(await runSync({ rows: [row({ vin_locked: true })], items: [item({ vin: '001' })] }));
  assert.ok(!('vin' in p));
  assert.ok(!('vin' in p.provenance));
});

test('T7: LOCKED NULL + a genuine 17-char VIN returns → dropped until a human unlocks (strict lock)', async () => {
  const p = onlyUpdate(await runSync({ rows: [row({ vin_locked: true })], items: [item({ vin: REAL_VIN })] }));
  assert.ok(!('vin' in p));
  assert.ok(!('vin' in p.provenance));
});

test('T8: stored valid VIN + invalid incoming identifier → VIN AND provenance both unchanged', async () => {
  const prov = { vin: { value: REAL_VIN, source: 'sandhills_direct', trust: 'attributed', as_of: '2026-07-06' } };
  const p = onlyUpdate(await runSync({ rows: [row({ vin: REAL_VIN, provenance: prov })], items: [item({ vin: 'BOXBODY1' })] }));
  assert.ok(!('vin' in p));
  assert.deepEqual(p.provenance.vin, prov.vin, 'provenance.vin must not gain a claim or change');
});

test('T9: stored short identifier + feed omits identifier → preserved', async () => {
  const p = onlyUpdate(await runSync({ rows: [row({ vin: '63972' })], items: [item({})] }));
  assert.ok(!('vin' in p));
});

test('T10: LOCKED stored identifier + feed sends a different identifier → unchanged', async () => {
  const prov = { vin: { value: '63972', source: 'human_admin', trust: 'attributed', as_of: '2026-10-01' } };
  const p = onlyUpdate(await runSync({ rows: [row({ vin: '63972', vin_locked: true, provenance: prov })], items: [item({ vin: '64000' })] }));
  assert.ok(!('vin' in p));
  assert.deepEqual(p.provenance.vin, prov.vin);
});

test('T11: INSERT invalid VIN → NULL as in production, and provenance, DX and prompt no longer carry it', async () => {
  const r = await runSync({ rows: [], items: [item({ vin: '63972' })], anthropic: true });
  assert.equal(r.inserts.length, 1);
  const ins = r.inserts[0];
  assert.equal(ins.vin, null, 'column semantics unchanged: non-valid VIN stored as NULL on INSERT');
  assert.ok(!('vin' in ins.provenance), 'provenance must not record a VIN the row does not persist');
  assert.doesNotMatch(ins.description, /- VIN:/, 'DX must not show a VIN the row does not persist');
  assert.equal(r.prompts.length, 1);
  assert.doesNotMatch(r.prompts[0], /63972/, 'generator prompt must not carry the rejected value');
});

test('T15: LOCKED feed_removed row resurrected by an unfrozen dealer → lock still honored', async () => {
  const p = onlyUpdate(await runSync({ rows: [row({ sold: true, sold_type: 'feed_removed', vin_locked: true })], items: [item({ vin: REAL_VIN_2 })] }));
  assert.equal(p.sold, false, 'this is the D1 resurrection path');
  assert.ok(!('vin' in p));
  assert.ok(!('vin' in p.provenance));
});

test('T16: dry run reports the same VIN decision the real write would make', async () => {
  const { db, client } = makeSupabase([row({ vin_locked: true })]);
  require.cache[SUPABASE_JS] = { id: SUPABASE_JS, filename: SUPABASE_JS, loaded: true, exports: { createClient: () => client } };
  delete require.cache[RECEIVER];
  delete process.env.ANTHROPIC_API_KEY;
  const realFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => [item({ vin: 'DB6899' })] });
  const quiet = [console.log, console.warn, console.error]; console.log = console.warn = console.error = () => {};
  let body;
  try {
    const res = await require(RECEIVER).handler({ httpMethod: 'POST', body: JSON.stringify({ defaultDatasetId: 'ds', dealerName: DEALER, dryRun: true }) });
    body = JSON.parse(res.body);
  } finally { [console.log, console.warn, console.error] = quiet; global.fetch = realFetch; }
  assert.equal(db.writes.length, 0, 'dry run writes nothing');
  assert.ok(!('vin' in body.dryRunLog[0].unit), 'dry-run log shows the locked VIN dropped');
});
