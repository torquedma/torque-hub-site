'use strict';
// vdp-finance-context-c.test.js - VDP-CONTEXT C (Owner YES) + F2 recut (Chief 2 -324, Chief 1
// disclosure policy). The server returns a non-PII vehicle_ref ONLY for a publicly listed unit
// (status exactly 'published', sold or unsold - same predicate as public inventory_cards) whose
// stock matched exactly one inventory row and whose matched route is an Ash route L003-L013.
// finance.html adds it as the ONLY Jotform URL parameter (whatType). Synthetic; no network.
// Run: node --test netlify/functions/__tests__/vdp-finance-context-c.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Module = require('module');

const FIN = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'finance.html'), 'utf8');
const SRV = fs.readFileSync(path.join(__dirname, '..', 'submit-finance-lead.js'), 'utf8');
const slice = (from, to) => { const a = FIN.indexOf(from); const b = FIN.indexOf(to, a); assert.ok(a >= 0 && b > a, from); return FIN.slice(a, b); };

let current = null;
const origLoad = Module._load;
Module._load = function (request) {
  if (request === '@supabase/supabase-js') return { createClient: () => current.client };
  if (request === 'resend') return { Resend: class { constructor() { this.emails = { send: async () => ({ id: 'e' }) }; } } };
  return origLoad.apply(this, arguments);
};
process.env.RESEND_API_KEY = 'k'; process.env.SUPABASE_URL = 'https://example.invalid'; process.env.SUPABASE_SERVICE_KEY = 's';
const { handler } = require('../submit-finance-lead.js');

const LONG = 'Extended Super Long Model Name '.repeat(6).trim();
const U = (stock, dealer, o) => Object.assign({ id: 'i-' + stock, stock, dealer, sold: false, price: '1000', status: 'published',
  year: '2020', make: 'Make', model: 'Model', trim: '', vin: '1XYZVIN000000001', mileage: '', hours: '', photos: [] }, o || {});
const INV = [
  U('SRS-111801', 'Suttontown Repair Service', { year: '', make: 'John Deere', model: '4760', trim: 'Tractor', hours: '8,609.1' }),
  U('DAV-1&2', 'Davenport Motors', { year: '2013', make: 'Chevy "K&W"', model: '3500 #1?' }),
  U('MPX-L', 'Impex Heavy Metal', { make: 'Big', model: LONG }),
  U('DAV-SOLD', 'Davenport Motors', { sold: true }),
  U('DBT-DRAFT', 'DeBary Truck Sales', { status: 'draft' }),
  U('DBT-NULL', 'DeBary Truck Sales', { status: null }),
  U('DBT-EMPTY', 'DeBary Truck Sales', { status: '' }),
  U('DBT-UNL', 'DeBary Truck Sales', { status: 'unlisted' }),
  U('DBT-ARCH', 'DeBary Truck Sales', { status: 'archived' }),
  U('DBT-CASE', 'DeBary Truck Sales', { status: 'Published' }),
  U('ATC-1', 'Auto Connection 210 LLC'),
  U('PPS-1', 'Private Party Seller'),
  U('HGR-1', "HGR's Truck and Trailer"),
  U('AMB-1', 'Davenport Motors'), U('AMB-1', null)
];
const R = (code, d, lender) => ({ code, dealer_code: code, dealer_name: d, lender_name: lender || 'WHEELHOUSE-BIANCO', status: 'active', is_default: false,
  lender_notification_email: 'ash@example.test', dealer_notification_email: null });
const ROUTES = [R('L001', 'Auto Connection 210 LLC', 'Twaddle'), R('L002', 'Private Party Seller'), R('L004', 'Davenport Motors'), R('L005', 'DeBary Truck Sales'),
  R('L011', 'Impex Heavy Metal'), R('L012', 'Suttontown Repair Service')];
function client(leads) { return { from(t) { const f = []; let op = 'select', lim = null;
  const run = (single) => {
    if (op === 'insert') return leads.dupe ? { data: null, error: { code: '23505' } } : { data: { id: 'lead-1' }, error: null };
    if (op === 'update') return { data: null, error: null };
    let rows = (t === 'inventory' ? INV : t === 'finance_routes' ? ROUTES : t === 'leads' ? (leads.rows || []) : []).filter((r) => f.every(([c, v]) => r[c] === v));
    if (single) return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { code: 'PGRST116' } };
    return { data: lim ? rows.slice(0, lim) : rows, error: null }; };
  const b = { select() { return b; }, eq(c, v) { f.push([c, v]); return b; }, limit(n) { lim = n; return b; }, insert() { op = 'insert'; return b; }, update() { op = 'update'; return b; },
    single() { return Promise.resolve(run(true)); }, then(a, r) { return Promise.resolve(run(false)).then(a, r); } }; return b; } }; }
let n = 0;
async function post(p, leads) { current = { client: client(leads || {}) }; const oe = console.error; console.error = () => {};
  try { const res = await handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify(Object.assign({ customer_name: 'Synthetic Buyer',
    customer_phone: '(000) 555-0100', customer_email: 'buyer@example.test', credit_score: 'Not sure', submission_id: 'aaaaaaaa-bbbb-cccc-dddd-' + String(++n).padStart(12, '0') }, p)) });
    return { status: res.statusCode, body: JSON.parse(res.body) }; } finally { console.error = oe; } }
const hasRef = (b) => Object.prototype.hasOwnProperty.call(b, 'vehicle_ref');

function embedUrl(routeCode, res) {
  const els = {}; const el = (id) => els[id] || (els[id] = { style: {}, textContent: '', children: [], appendChild(c) { this.children.push(c); }, scrollIntoView() {} });
  const made = [];
  const ctx = { document: { getElementById: el, createElement: (t) => { const e = { tag: t, style: {}, children: [], appendChild(c) { this.children.push(c); } }; made.push(e); return e; } },
    window: { scrollTo() {}, addEventListener() {} }, encodeURIComponent, Object, Math, parseInt, console, Date };
  vm.runInNewContext(slice('const LENDER_FORM_CONFIGS = {', '\nlet pendingLender') + '\nlet pendingLender = null;\n'
    + slice('function showSuccess()', 'function submitBusinessInfo()') + '\nthis.go = handleLeadCreated; this.C = LENDER_FORM_CONFIGS;', ctx);
  ctx.go(Object.assign({ lead_id: 'lead-1', route_code: routeCode }, res),
    { customer_name: 'Synthetic Buyer', customer_phone: '(000) 555-0100', customer_email: 'buyer@example.test', stock_number: 'SRS-111801', vehicle_title: 'Spoofed Client Title', dealer: 'Suttontown Repair Service' });
  const f = made.find((e) => e.tag === 'iframe'); const a = made.find((e) => e.tag === 'a');
  return { src: f && f.src, fallback: a && a.href, C: ctx.C, biz: els['business-info'] && els['business-info'].style.display };
}

test('F2-1 POSITIVE: published unit + Ash route (L012) -> vehicle_ref = inventory title + stock + Torque Hub; no VIN/PII/client title', async () => {
  const { status, body } = await post({ stock_number: 'SRS-111801', listing_title: 'Spoofed Client Title', vehicle_ref: 'client-injected' });
  assert.equal(status, 200); assert.equal(body.route_code, 'L012');
  assert.equal(body.vehicle_ref, 'John Deere 4760 Tractor — Stock SRS-111801 — Torque Hub');
  for (const x of ['1XYZVIN', 'Synthetic Buyer', '555', 'buyer@', 'Not sure', 'Spoofed', 'client-injected', 'lead-1']) assert.ok(!body.vehicle_ref.includes(x), x);
});

test('F2-2 sold + published (still in the public inventory_cards view) -> emitted, by explicit policy test', async () => {
  const { body } = await post({ stock_number: 'DAV-SOLD' });
  assert.equal(body.route_code, 'L004');
  assert.equal(body.vehicle_ref, '2020 Make Model — Stock DAV-SOLD — Torque Hub');
});

test('F2-3 NEGATIVE: Draft / null / empty / unlisted / archived / wrong-case status -> key omitted (route still L005)', async () => {
  for (const s of ['DBT-DRAFT', 'DBT-NULL', 'DBT-EMPTY', 'DBT-UNL', 'DBT-ARCH', 'DBT-CASE']) {
    const { status, body } = await post({ stock_number: s, listing_title: 'Client Title' });
    assert.equal(status, 200, s); assert.equal(body.route_code, 'L005', s + ' internal routing preserved');
    assert.equal(hasRef(body), false, s);
  }
});

test('F2-4 NEGATIVE: L001 Formstack, PPS (L002) and no-route (HGR) published units -> key omitted', async () => {
  for (const [s, code] of [['ATC-1', 'L001'], ['PPS-1', 'L002'], ['HGR-1', null]]) {
    const { body } = await post({ stock_number: s });
    assert.equal(body.route_code, code, s); assert.equal(hasRef(body), false, s);
  }
});

test('F2-5 NEGATIVE: ambiguous source (2 raw rows, one dealer-less) / unknown stock / external unit / no stock -> key omitted', async () => {
  const ext = { external_vehicle_year: '2018', external_vehicle_make: 'S', external_vehicle_model: 'H', external_vehicle_price: '15000' };
  for (const p of [Object.assign({ stock_number: 'AMB-1' }, ext), Object.assign({ stock_number: 'NOPE' }, ext), Object.assign({}, ext)]) {
    const { status, body } = await post(p);
    assert.equal(status, 200, JSON.stringify(p)); assert.equal(hasRef(body), false, JSON.stringify(p));
  }
});

test('F2-6 NEGATIVE: replayed submission response never carries vehicle_ref', async () => {
  const { body } = await post({ stock_number: 'SRS-111801' }, { dupe: true, rows: [{ id: 'lead-0', dealer_code: 'L012', route_code: 'L012', submission_id: 'x' }] });
  assert.equal(hasRef(body), false);
});

test('F2-7 server Ash-route set equals the finance.html codes that share the L002 config, minus PPS/L002', () => {
  const C = embedUrl('L012', {}).C;
  const shared = Object.keys(C).filter((k) => k !== 'L002' && C[k] === C.L002).sort();
  const m = /WHEELHOUSE_PREFILL_ROUTES = new Set\(\[([^\]]+)\]\)/.exec(SRV);
  const srv = m[1].match(/'L\d{3}'/g).map((x) => x.slice(1, -1)).sort();
  assert.deepEqual(srv, shared);
  assert.ok(/e\.inv\.status === 'published'/.test(SRV), 'exact, case-sensitive public predicate');
});

test('C-2 vehicle_ref capped at 120 characters', async () => {
  const { body } = await post({ stock_number: 'MPX-L' });
  assert.ok(body.vehicle_ref.length <= 120 && body.vehicle_ref.endsWith('…'));
});

test('C-3 Ash routes: whatType comes only from the server value; no other parameter without buyer-entered fieldMap keys', () => {
  const res = { vehicle_ref: 'John Deere 4760 Tractor — Stock SRS-111801 — Torque Hub' };
  const expected = 'https://form.jotform.com/211335844728156?whatType=' + encodeURIComponent(res.vehicle_ref);
  for (const code of ['L003', 'L004', 'L008', 'L012', 'L013']) {
    const r = embedUrl(code, res);
    assert.equal(r.src, expected, code); assert.equal(r.fallback, expected, code + ' fallback link');
    const q = new URL(r.src).searchParams;
    assert.deepEqual([...q.keys()], ['whatType'], code); assert.equal(q.get('whatType'), res.vehicle_ref);
  }
  // FIN-SINGLE-ENTRY: L002 fieldMap carries buyer-entered keys (covered by finance-lender-embed SE-*). This harness passes
  // customer_* keys, which are not fieldMap keys, so whatType stays the ONLY parameter here.
  assert.deepEqual(Object.keys(embedUrl('L002', res).C.L002.fieldMap), ['name_first', 'name_last', 'buyer_phone', 'buyer_email', 'business_name', 'employer_name', 'down_payment_label']);
});

test('C-4 special characters are URL-encoded and round-trip exactly; client-side title never used', async () => {
  const { body } = await post({ stock_number: 'DAV-1&2' });
  const r = embedUrl('L004', body);
  assert.equal(new URL(r.src).searchParams.get('whatType'), body.vehicle_ref);
  assert.ok(!r.src.includes('Spoofed') && !/[ "#]/.test(r.src.split('?')[1]));
});

test('C-5 omitted / empty / non-string vehicle_ref -> bare form URL (Draft, PPS, replay cases render bare)', async () => {
  for (const res of [{}, { vehicle_ref: '' }, { vehicle_ref: 42 }, { vehicle_ref: null }]) {
    assert.equal(embedUrl('L012', res).src, 'https://form.jotform.com/211335844728156', JSON.stringify(res));
  }
  const draft = (await post({ stock_number: 'DBT-DRAFT' })).body;
  assert.equal(embedUrl('L005', draft).src, 'https://form.jotform.com/211335844728156');
  const pps = (await post({ stock_number: 'PPS-1' })).body;
  assert.equal(embedUrl('L002', pps).src, 'https://form.jotform.com/211335844728156');
});

test('C-6 L001 H.I.L. Formstack unchanged (no refPrefill; business step first); unmapped routes unchanged', () => {
  const r = embedUrl('L001', { vehicle_ref: 'X — Stock Y — Torque Hub' });
  assert.equal(r.src, undefined); assert.equal(r.biz, 'block');
  assert.equal(r.C.L001.refPrefill, undefined);
  assert.equal(embedUrl('L014', { vehicle_ref: 'X' }).src, undefined);
});

test('C-7 the iframe URL never contains buyer contact data, VIN, credit answers or lead id', async () => {
  const { body } = await post({ stock_number: 'SRS-111801' });
  const src = embedUrl('L012', body).src;
  for (const x of ['Synthetic', 'Buyer', '555', 'buyer%40', 'buyer@', 'Not%20sure', '1XYZVIN', 'lead-1']) assert.ok(!src.includes(x), x);
});
