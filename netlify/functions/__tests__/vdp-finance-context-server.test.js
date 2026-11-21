'use strict';
// vdp-finance-context-server.test.js - VDP-CONTEXT B (offline, synthetic). Runs the REAL
// submit-finance-lead handler with supabase-js and resend replaced by in-memory fakes.
// No network, database or email. All buyer data is synthetic.
// Run: node --test netlify/functions/__tests__/vdp-finance-context-server.test.js
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

const PHOTO = 'https://bxsikkmqasydosmblzov.supabase.co/storage/v1/object/public/vehicle-photos/srs/1.jpg';
const INVENTORY = [
  { id: 'inv-srs', stock: 'SRS-111801', dealer: 'Suttontown Repair Service', sold: false, price: '$42,500', status: 'published',
    year: '', make: 'John Deere', model: '4760', trim: 'Tractor', vin: '', mileage: '', hours: '8,609.1', photos: [{ dataUrl: 'x' }, { url: PHOTO }] },
  { id: 'inv-dav', stock: 'DAV-032411', dealer: 'Davenport Motors', sold: false, price: '25500', status: 'published',
    year: '2013', make: 'Chevrolet', model: 'Silverado 3500HD', trim: 'Service Truck', vin: '1GB4KZC80DF100001', mileage: '187,000', hours: null, photos: [] },
  { id: 'inv-atc', stock: 'ATC-100', dealer: 'Auto Connection 210 LLC', sold: true, price: '45000', status: 'published',
    year: '2019', make: 'Synthetic', model: 'Truck', trim: '', vin: '', mileage: '', hours: '', photos: [{ url: 'http://insecure.test/a.jpg' }] },
  { id: 'inv-drf', stock: 'DBT-9999', dealer: 'DeBary Truck Sales', sold: false, price: '', status: 'draft',
    year: '2020', make: 'Kenworth', model: 'T880', trim: '', vin: '', mileage: '', hours: '', photos: null },
  { id: 'inv-bad', stock: 'MPX-1', dealer: 'Impex Heavy Metal', sold: false, price: '9000', status: 'published',
    year: '2015', make: 'Line\nBreak', model: 'Model\u0007X', trim: '', vin: '', mileage: '', hours: '', photos: 'not-an-array' },
  { id: 'inv-hgr', stock: 'HGR-5', dealer: "HGR's Truck and Trailer", sold: false, price: '7000', status: 'published',
    year: '2010', make: 'Utility', model: 'Reefer', trim: '', vin: '', mileage: '', hours: '', photos: [] }
];
const ROUTES = [
  { code: 'L001', dealer_code: 'ATC', dealer_name: 'Auto Connection 210 LLC', lender_name: 'Twaddle', status: 'active', is_default: false,
    lender_notification_email: 'lender1@example.test', dealer_notification_email: 'dealer1@example.test' },
  { code: 'L004', dealer_code: 'DAV', dealer_name: 'Davenport Motors', lender_name: 'WHEELHOUSE-BIANCO', status: 'active', is_default: false,
    lender_notification_email: 'ash@example.test', dealer_notification_email: null },
  { code: 'L005', dealer_code: 'DBT', dealer_name: 'DeBary Truck Sales', lender_name: 'WHEELHOUSE-BIANCO', status: 'active', is_default: false,
    lender_notification_email: 'ash@example.test', dealer_notification_email: null },
  { code: 'L011', dealer_code: 'MPX', dealer_name: 'Impex Heavy Metal', lender_name: 'WHEELHOUSE-BIANCO', status: 'active', is_default: false,
    lender_notification_email: 'ash@example.test', dealer_notification_email: null },
  { code: 'L012', dealer_code: 'SRS', dealer_name: 'Suttontown Repair Service', lender_name: 'WHEELHOUSE-BIANCO', status: 'active', is_default: false,
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
const toAddr = (w, a) => w.emails.filter((e) => e.to === a);
const internal = (w) => toAddr(w, 'leads@torquedma.com')[0];

test('B-1 inventory select carries the context columns', async () => {
  const w = await post(P({ stock_number: 'SRS-111801', source: 'torque_hub_listing' }));
  assert.equal(w.res.statusCode, 200);
  assert.equal(w.selects[0], 'id, dealer, sold, price, status, year, make, model, trim, vin, mileage, hours');
});

test('B-2 (T4) spoofed client listing_title is ignored for a resolved stock: persisted and emailed title come from inventory', async () => {
  const w = await post(P({ stock_number: 'SRS-111801', listing_title: '2024 Ferrari F8 Tributo', source: 'torque_hub_listing' }));
  assert.equal(w.inserts[0].unit_title, 'John Deere 4760 Tractor');
  const all = w.emails.map((e) => e.subject + '\n' + e.text).join('\n');
  assert.ok(!/Ferrari/.test(all));
  assert.ok(internal(w).text.includes('Unit: John Deere 4760 Tractor'));
});

test('B-3 (T5) Ash email: subject = title (stock) — buyer; Hours and Listing link; NO photo URL (Owner 11-21); Listing Price kept', async () => {
  const w = await post(P({ stock_number: 'SRS-111801', source: 'torque_hub_listing' }));
  const ash = toAddr(w, 'ash@example.test');
  assert.equal(ash.length, 1);
  assert.equal(ash[0].subject, 'Finance Lead — John Deere 4760 Tractor (SRS-111801) — Synthetic Buyer');
  const t = ash[0].text.split('\n');
  for (const line of ['Unit: John Deere 4760 Tractor', 'Stock: SRS-111801', 'Listing Price: $42,500', 'Hours: 8,609.1',
    'Listing: https://hub.torquedma.com/vehicle.html?stock=SRS-111801']) assert.ok(t.includes(line), line);
  assert.ok(!t.some((l) => /^Photo:/.test(l)) && !ash[0].text.includes(PHOTO), 'no Photo line, no photo URL anywhere');
  assert.ok(!t.some((l) => /^VIN:|^Mileage:/.test(l)), 'absent fields omitted');
  assert.ok(internal(w).text.includes('Listing: https://hub.torquedma.com/vehicle.html?stock=SRS-111801') && !internal(w).text.includes(PHOTO) && !/\nPhoto:/.test(internal(w).text), 'internal email: Listing link, no photo');
  assert.equal(w.body.route_code, 'L012');
});

test('B-4 VIN + mileage present; no Photo line; subject and route L004', async () => {
  const w = await post(P({ stock_number: 'DAV-032411', source: 'torque_hub_vdp_nav' }));
  const t = toAddr(w, 'ash@example.test')[0].text.split('\n');
  assert.ok(t.includes('VIN: 1GB4KZC80DF100001') && t.includes('Mileage: 187,000') && !t.some((l) => l.startsWith('Photo:')));
  assert.ok(!t.some((l) => l.startsWith('Hours:')));
  assert.equal(w.body.route_code, 'L004');
});

test('B-5 sold unit flagged; no photo line; L001 lender + dealer copy keep working with server title', async () => {
  const w = await post(P({ stock_number: 'ATC-100', listing_title: 'Spoofed', source: 'torque_hub_listing' }));
  assert.equal(w.body.route_code, 'L001');
  const l1 = toAddr(w, 'lender1@example.test')[0];
  assert.ok(l1.text.includes('Listing status: SOLD - may no longer be available'));
  assert.ok(!/(^|\n)Photo:/.test(l1.text), 'no Photo line');
  assert.equal(toAddr(w, 'dealer1@example.test')[0].subject, 'New Finance Lead — 2019 Synthetic Truck (ATC-100)');
});

test('B-6 Draft stock: routes as today, flagged not public; no Photo line', async () => {
  const w = await post(P({ stock_number: 'DBT-9999', source: 'torque_hub_listing' }));
  const t = toAddr(w, 'ash@example.test')[0].text;
  assert.ok(t.includes('Listing status: not public (Draft)') && !/(^|\n)Photo:/.test(t));
});

test('B-7 control characters in inventory text are flattened; malformed photos field is safe', async () => {
  const w = await post(P({ stock_number: 'MPX-1', source: 'torque_hub_listing' }));
  assert.equal(w.inserts[0].unit_title, '2015 Line Break Model X');
  const ash = toAddr(w, 'ash@example.test')[0];
  assert.ok(!/[\u0000-\u0008\u000b-\u001f]/.test(ash.subject));
  assert.ok(!/(^|\n)Photo:/.test(ash.text));
});

test('B-8 invariants kept: dealer contradiction 409 (nothing saved/sent); unresolved stock keeps today\'s path; no route = internal only', async () => {
  let w = await post(P({ stock_number: 'SRS-111801', dealer_name: 'Davenport Motors', source: 'torque_hub_listing' }));
  assert.equal(w.res.statusCode, 409); assert.equal(w.inserts.length, 0); assert.equal(w.emails.length, 0);
  w = await post(P({ stock_number: 'HGR-5', source: 'torque_hub_listing' }));
  assert.equal(w.emails.length, 1); assert.equal(w.emails[0].to, 'leads@torquedma.com');
  assert.ok(w.emails[0].text.includes('Unit: 2010 Utility Reefer') && w.emails[0].text.includes('Listing: https://hub.torquedma.com/vehicle.html?stock=HGR-5'));
  w = await post(P({ stock_number: 'NOPE', listing_title: 'Client Title', external_vehicle_year: '2018', external_vehicle_make: 'Synthetic',
    external_vehicle_model: 'Hauler', external_vehicle_price: '15000', source: 'torque_hub_listing' }));
  assert.equal(w.res.statusCode, 200);
  assert.ok(!internal(w).text.includes('Listing: '), 'no context lines for an unresolved stock');
});

test('B-9 no buyer data in any new line or URL; UTM/conversion behaviour untouched (only C vehicle_ref added to the response)', async () => {
  const w = await post(P({ stock_number: 'SRS-111801', source: 'torque_hub_listing', utm_source: 'facebook' }));
  const ctx = toAddr(w, 'ash@example.test')[0].text.split('\n').filter((l) => /^(VIN|Mileage|Hours|Listing status|Listing|Photo):/.test(l)).join('\n');
  for (const pii of ['Synthetic Buyer', '555-0100', 'buyer@example.test', 'Not sure']) assert.ok(!ctx.includes(pii), pii);
  assert.deepEqual(Object.keys(w.body).sort(), ['dealer_code', 'lead_id', 'route_code', 'success', 'vehicle_ref']);
  assert.equal(w.inserts[0].utm_source, 'facebook');
});
