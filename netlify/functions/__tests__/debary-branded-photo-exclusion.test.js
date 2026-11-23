'use strict';
// debary-branded-photo-exclusion.test.js - Chief 1 DeBary photo removal ruling (2026-11-23): the receiver must not
// re-introduce the 17 branded DeBary photos (Fresh -757 manifest) on its Mon/Wed/Fri runs. Identity = md5 of the exact
// photos[].url string (contract verified read-only against production photos[].url on 2026-11-23: 17/17 match).
// Unit tests call excludeDbtBrandedPhotos directly; integration tests run the REAL handler against the in-memory
// Supabase fake copied from debary-draft-lifecycle-receiver.test.js (harness lines unchanged).
// Run: node --test netlify/functions/__tests__/debary-branded-photo-exclusion.test.js
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

const crypto = require('crypto');
const RX = require(RECEIVER);
const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');
// Two REAL banned URLs read from production photos[].url (DBT-096469 #3 Overfuel; DBT-7445 #3 Sandhills).
const BANNED_OF = 'https://static.overfuel.com/photos-overlay/1320/840702/04A44F06-DD7B-445D-8B63-84B9D07C03F5.webp?v=d59ad6d7';
const BANNED_SH = 'https://media.sandhills.com/img.axd?id=10005536813&wid=4326209787&rwl=False&p=&ext=&w=1200&h=900&t=&lp=&c=True&wt=False&sz=Max&rt=0&checksum=2OuSJ%2b8bwk%2bIgceXbRDd0mSZt7lAhcNohzmtLLkx%2bJ8%3d';
const MANIFEST = ['c02d5e1efa3946e78812bcfbec02c969','121f478662b4dd22f6acff75965c9513','af2fa0aaf95eaa526cd78a764ab07e5f',
  'f61062411deeed777b42ef464ad0ca30','9b1bd73850436af7a03d61d4e0086960','1f74aa281fb79ff343e46e585f25a011',
  '27deb5d4cb7c83fe3a80efaff1a7a7e7','7542c87dafbb084c7321b4fa2bdb55f5','87d4a97a9263f9542c706f63c1728db0',
  'f191f27cf998f41e9f52d96fe3b0346c','79cf42ce001a555b5f2e4088028fb5b6','ef8e6f268470d9e4c2a91d1d3004e50b',
  '57d842050a4999811e85d2ad99b2e25d','c52f571d87a422997e71fc37535d3ca0','8b0473da55c5b994308e8b9e58220d9e',
  'f72bb8b42c0414e7db4ea64b3c088ed3','e6ccb7476c213cfcbfc76f0f64a5f453'];
const ph = (url, i) => ({ url, sortorder: i, isstock: 0 });
const NORMAL = FIX.items[LID].item.photos.map((p) => p.url);

test('B0: the exclusion set is exactly the 17 Fresh -757 md5s; the two real URLs hash into it', () => {
  assert.deepEqual([...RX.DBT_BRANDED_PHOTO_URL_MD5].sort(), [...MANIFEST].sort());
  assert.equal(RX.DBT_BRANDED_PHOTO_URL_MD5.size, 17);
  assert.ok(RX.DBT_BRANDED_PHOTO_URL_MD5.has(md5(BANNED_OF)));
  assert.ok(RX.DBT_BRANDED_PHOTO_URL_MD5.has(md5(BANNED_SH)));
});

test('B1: banned URLs at non-hero positions are removed; every other photo keeps its object and order', () => {
  const photos = [ph(NORMAL[0], 1), ph(NORMAL[1], 2), ph(BANNED_OF, 3), ph(NORMAL[2], 4), ph(BANNED_SH, 5)];
  const out = RX.excludeDbtBrandedPhotos(photos, DEALER);
  assert.deepEqual(out, [photos[0], photos[1], photos[3]]);
  assert.ok(RX.excludeDbtBrandedPhotos([NORMAL[0], BANNED_OF], DEALER).length === 1, 'plain-string elements handled');
});

test('B2: zero false positives — all 26 captured real DeBary photos pass unchanged (same array returned)', () => {
  const photos = FIX.items[LID].item.photos;
  assert.equal(photos.length, 26);
  assert.equal(RX.excludeDbtBrandedPhotos(photos, DEALER), photos);
});

test('B3: near-miss URLs (different query string, case, whitespace, another id) are NOT removed', () => {
  const near = [BANNED_OF.replace('?v=d59ad6d7', ''), BANNED_OF.toLowerCase(), BANNED_OF + ' ', BANNED_OF + '&x=1',
    BANNED_SH.replace('10005536813', '10005536814')];
  const photos = [ph(NORMAL[0], 1)].concat(near.map((u, i) => ph(u, i + 2)));
  assert.equal(RX.excludeDbtBrandedPhotos(photos, DEALER), photos);
});

test('B4: hero (index 0) is never removed and a gallery is never emptied, even if the hero is a banned URL', () => {
  const one = [ph(BANNED_OF, 1)];
  assert.equal(RX.excludeDbtBrandedPhotos(one, DEALER), one);
  const two = [ph(BANNED_OF, 1), ph(BANNED_SH, 2)];
  assert.deepEqual(RX.excludeDbtBrandedPhotos(two, DEALER), [two[0]]);
});

test('B5: other dealers and non-array inputs are untouched', () => {
  const photos = [ph(NORMAL[0], 1), ph(BANNED_OF, 2)];
  assert.equal(RX.excludeDbtBrandedPhotos(photos, MAP), photos);
  assert.equal(RX.excludeDbtBrandedPhotos(null, DEALER), null);
  assert.deepEqual(RX.excludeDbtBrandedPhotos([], DEALER), []);
  assert.equal(RX.excludeDbtBrandedPhotos([ph(NORMAL[0], 1), {}, null, 7], DEALER).length, 4, 'malformed entries kept');
});

test('B6: REAL handler — existing live DeBary row: the UPDATE payload carries every ordinary photo but not the banned one', async () => {
  const it = clone(FIX.items[LID].item);
  // feed source order A B C ...; reorderDbtPhotos -> C B D E ...; banned URL injected at source position 5 (stored #4)
  it.photos.splice(4, 0, { url: BANNED_OF, sortorder: 99, isstock: 0 });
  const r = await runSync({ dealer: DEALER, rows: [row('DBT-7926', LID, { source_url: it.source_url })], items: [it] });
  assert.equal(r.updates.length, 1);
  const urls = r.updates[0].payload.photos.map((p) => p.url);
  assert.ok(!urls.includes(BANNED_OF));
  const src = FIX.items[LID].item.photos.map((p) => p.url);
  assert.deepEqual(urls, [src[2], src[1]].concat(src.slice(3)), 'identical to the pre-fix result for the clean feed');
  assert.deepEqual(byStock(r.db, 'DBT-7926').photos.map((p) => p.url), urls);
});

test('B7: REAL handler — clean feed produces exactly the pre-fix photo array (no behaviour change)', async () => {
  const it = clone(FIX.items[LID].item);
  const r = await runSync({ dealer: DEALER, rows: [row('DBT-7926', LID, { source_url: it.source_url })], items: [it] });
  const src = it.photos.map((p) => p.url);
  assert.deepEqual(r.updates[0].payload.photos.map((p) => p.url), [src[2], src[1]].concat(src.slice(3)));
});

test('B8: REAL handler — a NEW DeBary draft INSERT also excludes the banned URL', async () => {
  const it = clone(FIX.items[LID].item);
  it.photos.push({ url: BANNED_SH, sortorder: 99, isstock: 0 });
  const r = await runSync({ dealer: DEALER, rows: [], items: [it] });
  assert.equal(r.inserts.length, 1);
  assert.ok(!r.inserts[0].photos.some((p) => p.url === BANNED_SH));
  assert.equal(r.inserts[0].photos.length, 25);
});
