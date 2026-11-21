'use strict';
// finance-single-entry-server.test.js - FIN-SINGLE-ENTRY (Chief 1 directive, offline, synthetic). Runs the REAL
// submit-finance-lead handler with supabase-js and resend faked. Checks the server-verified vehicle_price
// returned for the H.I.L. (L001) "Price (estimate)" prefill. No network, database or email.
// Run: node --test netlify/functions/__tests__/finance-single-entry-server.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

let current = null;
const origLoad = Module._load;
Module._load = function (request) {
  if (request === '@supabase/supabase-js') return { createClient: () => current.client };
  if (request === 'resend') return { Resend: class { constructor() { this.emails = { send: async (o) => { current.emails.push(o); return { id: 'e' }; } }; } } };
  return origLoad.apply(this, arguments);
};
process.env.RESEND_API_KEY = 'synthetic-test-key';
process.env.SUPABASE_URL = 'https://example.invalid';
process.env.SUPABASE_SERVICE_KEY = 'synthetic';
const { handler } = require('../submit-finance-lead.js');

const ATC = 'Auto Connection 210 LLC';
const row = (o) => Object.assign({ dealer: ATC, sold: false, status: 'published', year: '2019', make: 'Synthetic', model: 'Truck', trim: '', vin: '', mileage: '', hours: '', photos: [] }, o);
const INVENTORY = [
  row({ id: 'a1', stock: 'ATC-OK', price: '25500' }),
  row({ id: 'a2', stock: 'ATC-FMT', price: '$45,000.00' }),
  row({ id: 'a3', stock: 'ATC-SOLD', price: '30000', sold: true }),
  row({ id: 'a4', stock: 'ATC-DRAFT', price: '30000', status: 'draft' }),
  row({ id: 'a5', stock: 'ATC-BLANK', price: '' }),
  row({ id: 'a6', stock: 'ATC-CALL', price: 'Call for price' }),
  row({ id: 'a7', stock: 'ATC-ZERO', price: '0' }),
  row({ id: 'a8', stock: 'ATC-DUP', price: '10000' }), row({ id: 'a9', stock: 'ATC-DUP', price: '11000', dealer: '' }),
  row({ id: 'a10', stock: 'ATC-NULLST', price: '10000', status: null }),
  row({ id: 'a11', stock: 'ATC-SOLDNULL', price: '10000', sold: null }), row({ id: 'a12', stock: 'ATC-SOLDUNDEF', price: '10000', sold: undefined }),
  row({ id: 'w1', stock: 'DAV-1', dealer: 'Davenport Motors', price: '25500' })
];
const ROUTES = [
  { code: 'L001', dealer_code: 'ATC', dealer_name: ATC, lender_name: 'Twaddle', status: 'active', is_default: false,
    lender_notification_email: 'lender1@example.test', dealer_notification_email: null },
  { code: 'L004', dealer_code: 'DAV', dealer_name: 'Davenport Motors', lender_name: 'WHEELHOUSE-BIANCO', status: 'active', is_default: false,
    lender_notification_email: 'ash@example.test', dealer_notification_email: null }
];
function makeWorld() {
  const w = { inserts: [], emails: [], selects: [] };
  w.client = { from(table) {
    const st = { filters: [], op: 'select', limit: null, sel: null };
    const run = (single) => {
      if (st.op === 'insert') { w.inserts.push(st.rows[0]); return { data: { id: 'lead-' + w.inserts.length }, error: null }; }
      if (st.op === 'update') return { data: null, error: null };
      if (table === 'inventory') w.selects.push(st.sel);
      const srcRows = table === 'inventory' ? INVENTORY : table === 'finance_routes' ? ROUTES : [];
      let rows = srcRows.filter((r) => st.filters.every(([c, v]) => r[c] === v));
      if (single) return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { code: 'PGRST116' } };
      if (st.limit !== null) rows = rows.slice(0, st.limit);
      return { data: rows, error: null };
    };
    const b = { select(s) { if (st.sel === null) st.sel = s; return b; }, eq(c, v) { st.filters.push([c, v]); return b; }, limit(n) { st.limit = n; return b; },
      insert(r) { st.op = 'insert'; st.rows = r; return b; }, update() { st.op = 'update'; return b; },
      single() { return Promise.resolve(run(true)); }, then(res, rej) { return Promise.resolve(run(false)).then(res, rej); } };
    return b; } };
  return w;
}
async function post(payload) {
  current = makeWorld();
  const oe = console.error, ow = console.warn; console.error = () => {}; console.warn = () => {};
  let res; try { res = await handler({ httpMethod: 'POST', headers: { origin: 'https://hub.torquedma.com' }, body: JSON.stringify(payload) }); }
  finally { console.error = oe; console.warn = ow; }
  current.res = res; current.body = JSON.parse(res.body || '{}'); return current;
}
const BUYER = { customer_name: 'Synthetic Buyer', customer_phone: '(000) 555-0100', customer_email: 'buyer@example.test', credit_score: 'Not sure' };
let sid = 0; const P = (o) => Object.assign({ submission_id: 'aaaaaaaa-bbbb-cccc-dddd-' + String(++sid).padStart(12, '0') }, BUYER, o);
const has = (b) => Object.prototype.hasOwnProperty.call(b, 'vehicle_price');

test('SS-1 L001 published unsold unit with a numeric price -> vehicle_price from inventory (normalized)', async () => {
  let w = await post(P({ stock_number: 'ATC-OK' })); assert.equal(w.res.statusCode, 200); assert.equal(w.body.route_code, 'L001');
  assert.equal(w.body.vehicle_price, '25500');
  assert.ok(!isNaN(Date.parse(w.body.vehicle_price_as_of)) && Math.abs(Date.parse(w.body.vehicle_price_as_of) - Date.now()) < 60000, 'as-of timestamp at submission');
  w = await post(P({ stock_number: 'ATC-FMT' })); assert.equal(w.body.vehicle_price, '45000');
});

test('SS-2 never trusts the client: listing price / listing title / vehicle_price in the payload are ignored', async () => {
  const w = await post(P({ stock_number: 'ATC-OK', listing_price: '1', vehicle_price: '1', price: '1', listing_title: 'Spoof' }));
  assert.equal(w.body.vehicle_price, '25500');
});

test('SS-3 omitted: sold, sold null/unknown, draft, null status, blank, non-numeric, zero, ambiguous stock', async () => {
  for (const s of ['ATC-SOLD', 'ATC-SOLDNULL', 'ATC-SOLDUNDEF', 'ATC-DRAFT', 'ATC-NULLST', 'ATC-BLANK', 'ATC-CALL', 'ATC-ZERO', 'ATC-DUP']) {
    const w = await post(P({ stock_number: s }));
    assert.equal(has(w.body), false, s);
  }
});

test('SS-4 omitted: Wheelhouse route, unknown stock, external unit, replayed submission', async () => {
  let w = await post(P({ stock_number: 'DAV-1' })); assert.equal(w.body.route_code, 'L004'); assert.equal(has(w.body), false);
  const ext = { external_vehicle_year: '2018', external_vehicle_make: 'S', external_vehicle_model: 'H', external_vehicle_price: '15000', dealer_name: ATC };
  w = await post(P(Object.assign({ stock_number: 'NOPE' }, ext))); assert.equal(has(w.body), false);
  w = await post(P(ext)); assert.equal(has(w.body), false);
});

test('SS-5 vehicle_price is a plain numeric string; vehicle_price_as_of the only other new key', async () => {
  const w = await post(P({ stock_number: 'ATC-OK' }));
  assert.match(w.body.vehicle_price, /^\d{1,9}(\.\d{1,2})?$/);
  assert.deepEqual(Object.keys(w.body).sort(), ['dealer_code', 'lead_id', 'route_code', 'success', 'vehicle_price', 'vehicle_price_as_of']);
});
