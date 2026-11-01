'use strict';
// finance-lead-attribution-identity.test.js - TH-HEAD_SITE_TECH-20261030-035, amended -036 and -037 (offline, synthetic).
// Runs the REAL submit-finance-lead handler with @supabase/supabase-js and resend replaced by
// in-memory fakes. No network, no database, no email. Every name, phone and address is synthetic.
// Covers: campaign fields (T1-T9, T12), stock/dealer identity (T10 + variants), lender routing
// preservation (L001 / L002 / ATC referral / unmatched), click-identifier stripping, the
// missing-column fallback, replay and the existing subject gates. -036 adds the four inventory
// states (resolved / no_match / ambiguous / error), the default-route boundary and the bounded
// PGRST204 diagnostic. -037: ambiguous needs an external subject or 400 (D2); an unresolved stock
// never persists or presents the client seller as the dealer (D3); a lookup failure is a retryable
// 503 (D4); the PGRST204 retry runs only for a verified approved utm column (D6).
// Run: node --test netlify/functions/__tests__/finance-lead-attribution-identity.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');

const HANDLER_PATH = require.resolve('../submit-finance-lead.js');

let current = null;
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '@supabase/supabase-js') return { createClient: () => current.client };
  if (request === 'resend') {
    return { Resend: class { constructor() { this.emails = { send: async (o) => { current.emails.push(o); return { id: 'e' }; } }; } } };
  }
  return origLoad.apply(this, arguments);
};
process.env.RESEND_API_KEY = 'synthetic-test-key';
process.env.SUPABASE_URL = 'https://example.invalid';
process.env.SUPABASE_SERVICE_KEY = 'synthetic';
const { handler } = require(HANDLER_PATH);

const INVENTORY = [
  { id: 'inv-atc', stock: 'ATC-100', dealer: 'Auto Connection 210 LLC', sold: false, price: '45000' },
  { id: 'inv-pps', stock: 'PPS-200', dealer: 'Private Party Seller', sold: false, price: '$12,500' },
  { id: 'inv-all', stock: 'ATT-300', dealer: 'Allied Truck & Trailer Sales', sold: false, price: '30000' },
  { id: 'inv-d1', stock: 'DUP-1', dealer: 'Davenport Motors', sold: false, price: '20000' },
  { id: 'inv-d2', stock: 'DUP-1', dealer: 'Wilson Trailer Sales & Service', sold: false, price: '9000' }
];
const BASE_ROUTES = [
  { code: 'L001', dealer_code: 'ATC', dealer_name: 'Auto Connection 210 LLC', lender_name: 'Twaddle', status: 'active', is_default: false,
    lender_notification_email: 'lender1@example.test', dealer_notification_email: 'dealer1@example.test' },
  { code: 'L002', dealer_code: 'PPS', dealer_name: 'Private Party Seller', lender_name: 'WHEELHOUSE-BIANCO', status: 'active', is_default: false,
    lender_notification_email: 'lender2@example.test', dealer_notification_email: null }
];
const ROUTES_WITH_DEFAULT = BASE_ROUTES.concat([{ code: 'L999', dealer_code: null, dealer_name: null, lender_name: 'Synthetic Default Lender', status: 'active',
  is_default: true, lender_notification_email: 'lender3@example.test', dealer_notification_email: null }]);

function makeWorld(opts) {
  opts = opts || {};
  const w = { inserts: [], updates: [], queries: [], emails: [], leads: opts.leads || [] };
  let insertCount = 0;
  w.client = {
    from(table) {
      const st = { table, filters: [], op: 'select', limit: null };
      const run = (single) => {
        if (st.op === 'insert') {
          insertCount += 1;
          const row = st.rows[0];
          w.inserts.push(row);
          const e = opts.insertError ? opts.insertError(row, insertCount) : null;
          if (e) return { data: null, error: e };
          return { data: { id: 'lead-' + insertCount }, error: null };
        }
        if (st.op === 'update') { w.updates.push({ patch: st.patch, filters: st.filters }); return { data: null, error: null }; }
        w.queries.push({ table, filters: st.filters.slice() });
        if (opts.inventoryError && table === 'inventory') return { data: null, error: { message: 'synthetic lookup failure' } };
        const src = table === 'inventory' ? INVENTORY : table === 'finance_routes' ? (opts.routes || BASE_ROUTES) : table === 'leads' ? w.leads : [];
        let rows = src.filter((r) => st.filters.every(([c, v]) => r[c] === v));
        if (single) return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { code: 'PGRST116' } };
        if (st.limit !== null) rows = rows.slice(0, st.limit);
        return { data: rows, error: null };
      };
      const b = {
        select() { return b; },
        eq(c, v) { st.filters.push([c, v]); return b; },
        limit(n) { st.limit = n; return b; },
        insert(rows) { st.op = 'insert'; st.rows = rows; return b; },
        update(p) { st.op = 'update'; st.patch = p; return b; },
        single() { return Promise.resolve(run(true)); },
        then(res, rej) { return Promise.resolve(run(false)).then(res, rej); }
      };
      return b;
    }
  };
  return w;
}

async function post(payload, opts) {
  current = makeWorld(opts);
  const logs = { warn: [], error: [] };
  const ow = console.warn, oe = console.error;
  console.warn = (...a) => { logs.warn.push(a.map(String).join(' ')); };
  console.error = (...a) => { logs.error.push(a.map(String).join(' ')); };
  let res;
  try {
    res = await handler({ httpMethod: 'POST', headers: { origin: 'https://hub.torquedma.com' }, body: JSON.stringify(payload) });
  } finally { console.warn = ow; console.error = oe; }
  current.logs = logs;
  current.res = res;
  current.body = JSON.parse(res.body || '{}');
  return current;
}

const BUYER = { customer_name: 'Synthetic Buyer', customer_phone: '(000) 000-0000', customer_email: 'buyer@example.test', submission_id: '11111111-2222-3333-4444-555555555555' };
const PAID = { utm_source: 'facebook', utm_medium: 'cpc', utm_campaign: 'torque_hub_vdp_financing_test', utm_content: 'atc-100' };
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
const hasUtmKeys = (row) => UTM_KEYS.some((k) => Object.prototype.hasOwnProperty.call(row, k));
const allEmailText = (w) => w.emails.map((e) => [e.subject, e.text, e.to].join('\n')).join('\n----\n');
const to = (w, addr) => w.emails.filter((e) => e.to === addr);
const EXT = { external_vehicle_year: '2018', external_vehicle_make: 'Synthetic', external_vehicle_model: 'Hauler', external_vehicle_price: '15000' };
const internal = (w) => w.emails.find((e) => e.to === 'leads@torquedma.com');

test('T1 paid VDP primary CTA (src=listing): five campaign fields stored, L001 route, canonical identity', async () => {
  const w = await post(Object.assign({}, BUYER, PAID, { stock_number: 'ATC-100', listing_title: '2019 Synthetic Truck',
    dealer_name: 'Auto Connection 210 LLC', source: 'torque_hub_listing', source_url: 'https://hub.torquedma.com/finance.html?stock=ATC-100&src=listing&utm_source=facebook' }));
  assert.equal(w.res.statusCode, 200);
  assert.deepEqual(Object.keys(w.body).sort(), ['dealer_code', 'lead_id', 'route_code', 'success']);
  assert.equal(w.body.route_code, 'L001');
  assert.equal(w.inserts.length, 1);
  const r = w.inserts[0];
  assert.deepEqual(UTM_KEYS.map((k) => r[k]), ['facebook', 'cpc', 'torque_hub_vdp_financing_test', 'atc-100', null]);
  assert.equal(r.source, 'torque_hub_listing');
  assert.equal(r.stock, 'ATC-100'); assert.equal(r.listing_id, 'inv-atc');
  assert.equal(r.dealer_name, 'Auto Connection 210 LLC'); assert.equal(r.dealer_code, 'ATC');
  assert.equal(r.route_code, 'L001'); assert.equal(r.route_basis, 'matched');
});

test('T2 paid VDP nav CTA (src=vdp_nav): same campaign, src kept distinct from utm_source', async () => {
  const w = await post(Object.assign({}, BUYER, PAID, { stock_number: 'ATC-100', dealer_name: 'Auto Connection 210 LLC', source: 'torque_hub_vdp_nav' }));
  assert.equal(w.res.statusCode, 200);
  const r = w.inserts[0];
  assert.equal(r.source, 'torque_hub_vdp_nav');
  assert.equal(r.utm_source, 'facebook');
  assert.equal(r.route_code, 'L001');
});

test('T3 organic VDP: no campaign columns written at all; routing unchanged', async () => {
  const w = await post(Object.assign({}, BUYER, { stock_number: 'ATC-100', dealer_name: 'Auto Connection 210 LLC', source: 'torque_hub_listing',
    utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null, utm_term: null }));
  assert.equal(w.res.statusCode, 200);
  assert.equal(hasUtmKeys(w.inserts[0]), false);
  assert.equal(w.body.route_code, 'L001');
});

test('T4 direct finance, external unit, non-routed seller: Torque-only, no campaign, no lender email', async () => {
  const w = await post(Object.assign({}, BUYER, { external_vehicle_year: '2018', external_vehicle_make: 'Synthetic', external_vehicle_model: 'Hauler',
    external_vehicle_price: '15000', dealer_name: 'Davenport Motors', source: 'torque_hub_direct' }));
  assert.equal(w.res.statusCode, 200);
  assert.equal(w.body.route_code, null);
  assert.equal(hasUtmKeys(w.inserts[0]), false);
  assert.deepEqual(w.emails.map((e) => e.to), ['leads@torquedma.com']);
});

test('T5 ATC referral (?src=autoconnection210), external unit: Branch 2 still routes to L001; no invented campaign', async () => {
  const w = await post(Object.assign({}, BUYER, { external_vehicle_year: '2020', external_vehicle_make: 'Synthetic', external_vehicle_model: 'Dump',
    external_vehicle_price: '$38,000', dealer_name: 'Auto Connection 210 LLC', source: 'torque_hub_autoconnection210' }));
  assert.equal(w.res.statusCode, 200);
  assert.equal(w.body.route_code, 'L001');
  assert.equal(w.inserts[0].source, 'torque_hub_autoconnection210');
  assert.equal(hasUtmKeys(w.inserts[0]), false);
  assert.equal(to(w, 'lender1@example.test').length, 1);
});

test('T6 L001 notifications: lender and dealer emails carry no campaign or click identifiers', async () => {
  const w = await post(Object.assign({}, BUYER, PAID, { stock_number: 'ATC-100', dealer_name: 'Auto Connection 210 LLC', source: 'torque_hub_listing',
    source_url: 'https://hub.torquedma.com/finance.html?stock=ATC-100&fbclid=SYNTHCLICK1' }));
  assert.equal(to(w, 'lender1@example.test').length, 1);
  assert.equal(to(w, 'dealer1@example.test').length, 1);
  const ext = to(w, 'lender1@example.test').concat(to(w, 'dealer1@example.test')).map((e) => e.text).join('\n');
  assert.ok(!/torque_hub_vdp_financing_test/.test(ext), 'campaign value reached an external email');
  assert.ok(!/SYNTHCLICK1/.test(ext), 'click identifier reached an external email');
});

test('T7 L002 Wheelhouse (PPS stock): lender-only email, seller gets nothing, campaign stored', async () => {
  const w = await post(Object.assign({}, BUYER, PAID, { stock_number: 'PPS-200', dealer_name: 'Private Party Seller', source: 'torque_hub_listing' }));
  assert.equal(w.res.statusCode, 200);
  assert.equal(w.body.route_code, 'L002');
  assert.deepEqual(w.emails.map((e) => e.to).sort(), ['leads@torquedma.com', 'lender2@example.test']);
  assert.equal(w.inserts[0].utm_campaign, 'torque_hub_vdp_financing_test');
});

test('T8a F1 confirmed no-match stock without an external unit: existing subject rule -> 400, nothing saved or sent', async () => {
  const w = await post(Object.assign({}, BUYER, PAID, { stock_number: 'NOPE-1', dealer_name: 'Private Party Seller', source: 'torque_hub_listing' }));
  assert.equal(w.res.statusCode, 400);
  assert.equal(w.body.error, 'financing subject required');
  assert.equal(w.inserts.length, 0);
  assert.equal(w.emails.length, 0);
  assert.equal(w.queries.filter((q) => q.table === 'finance_routes').length, 0, 'no route lookup from client seller text');
  const w2 = await post(Object.assign({}, BUYER, { stock_number: 'NOPE-1', external_vehicle_year: '2018', external_vehicle_make: 'S', external_vehicle_model: 'M', external_vehicle_price: '70k' }));
  assert.equal(w2.res.statusCode, 400);
  assert.equal(w2.body.error, 'external_vehicle_price must be a dollar amount', 'the named price error still applies to a no-match stock');
});

test('T8b F1/D3 confirmed no-match stock WITH a complete external unit: Torque-only, no route, client seller never stored or shown as the dealer', async () => {
  const w = await post(Object.assign({}, BUYER, PAID, EXT, { stock_number: 'NOPE-1', dealer_name: 'Private Party Seller', source: 'torque_hub_listing' }));
  assert.equal(w.res.statusCode, 200);
  assert.equal(w.body.route_code, null);
  const r = w.inserts[0];
  assert.equal(r.stock, 'NOPE-1'); assert.equal(r.listing_id, null);
  assert.equal(r.route_code, null); assert.equal(r.route_basis, null); assert.equal(r.dealer_code, null);
  assert.equal(r.dealer_name, null, 'D3: unverified client seller is not persisted as the dealer');
  assert.equal(r.external_vehicle_make, 'Synthetic'); assert.equal(r.external_vehicle_price, 15000);
  assert.equal(r.utm_source, 'facebook');
  assert.deepEqual(w.emails.map((e) => e.to), ['leads@torquedma.com']);
  const t = w.emails[0].text;
  assert.match(t, /Stock not found in Torque Hub inventory - Torque-only, manual review/);
  assert.doesNotMatch(t, /^Dealer: /m, 'D3: no authoritative Dealer line');
  assert.match(t, /^Seller named by buyer \(unverified, not used for routing\): Private Party Seller$/m);
  assert.equal(w.queries.filter((q) => q.table === 'finance_routes').length, 0);
});
test('T9 missing / malformed / hostile campaign values become null and never block the lead', async () => {
  const cases = [
    ['a'.repeat(129), null], ['a'.repeat(128), 'a'.repeat(128)], ['x%20y', null], ['buyer@example.test', null],
    ['<script>', null], ['a\u0000b', null], ['line\nbreak', null], ['9195550123', null], ['123-45-6789', null],
    [['facebook'], null], [{ v: 1 }, null], [42, null], ['', null], ['   ', null],
    ['  facebook  ', 'facebook'], ['Fall   Promo', 'Fall Promo'], ['tr\u00fcck', null], ['a=b&c=d', null]
  ];
  for (const [input, expected] of cases) {
    const w = await post(Object.assign({}, BUYER, { stock_number: 'ATT-300', dealer_name: 'Allied Truck & Trailer Sales', utm_term: input, utm_source: 'facebook' }));
    assert.equal(w.res.statusCode, 200, 'lead blocked for ' + JSON.stringify(input));
    assert.equal(w.inserts[0].utm_term, expected, 'utm_term for ' + JSON.stringify(input));
    assert.equal(w.inserts[0].utm_source, 'facebook');
  }
});

test('T10 contradictory identity: resolved stock + different client dealer -> 409, nothing saved or sent', async () => {
  const w = await post(Object.assign({}, BUYER, PAID, { stock_number: 'ATC-100', dealer_name: 'Private Party Seller' }));
  assert.equal(w.res.statusCode, 409);
  assert.equal(w.body.error, 'identity_conflict');
  assert.equal(w.inserts.length, 0);
  assert.equal(w.emails.length, 0);
  assert.equal(w.queries.filter((q) => q.table === 'finance_routes').length, 0);
  assert.deepEqual(Object.keys(w.body).sort(), ['detail', 'error']);
  assert.ok(!/Auto Connection|Synthetic Buyer|example\.test|000/.test(w.res.body), '409 body must not echo inventory identity or buyer data');
});

test('T10b resolved-stock identity variants: placeholder seller, absent seller, padded stock', async () => {
  let w = await post(Object.assign({}, BUYER, { stock_number: 'ATC-100', dealer_name: 'Torque Hub Finance Lead' }));
  assert.equal(w.res.statusCode, 200); assert.equal(w.body.route_code, 'L001'); assert.equal(w.inserts[0].dealer_name, 'Auto Connection 210 LLC');
  w = await post(Object.assign({}, BUYER, { stock_number: 'ATC-100' }));
  assert.equal(w.res.statusCode, 200); assert.equal(w.body.route_code, 'L001');
  w = await post(Object.assign({}, BUYER, { stock_number: ' ATC-100 ', dealer_name: 'Auto Connection 210 LLC' }));
  assert.equal(w.res.statusCode, 200); assert.equal(w.inserts[0].stock, 'ATC-100');
});

test('T10c D2 ambiguous stock WITHOUT an external subject: 400 for every client-dealer variant; nothing saved, sent or routed', async () => {
  for (const dealer of [undefined, 'Davenport Motors', 'Wilson Trailer Sales & Service', 'Allied Truck & Trailer Sales', 'Torque Hub Finance Lead']) {
    const p = Object.assign({}, BUYER, PAID, { stock_number: 'DUP-1' });
    if (dealer) p.dealer_name = dealer;
    const w = await post(p);
    const tag = 'dealer=' + String(dealer);
    assert.equal(w.res.statusCode, 400, tag);
    assert.equal(w.body.error, 'financing subject required', tag);
    assert.equal(w.inserts.length, 0, tag); assert.equal(w.emails.length, 0, tag);
    assert.equal(w.queries.filter((q) => q.table === 'finance_routes').length, 0, tag + ' no route lookup');
  }
  const bad = await post(Object.assign({}, BUYER, { stock_number: 'DUP-1', dealer_name: 'Davenport Motors', external_vehicle_year: '2018',
    external_vehicle_make: 'S', external_vehicle_model: 'M', external_vehicle_price: '70k' }));
  assert.equal(bad.res.statusCode, 400);
  assert.equal(bad.body.error, 'external_vehicle_price must be a dollar amount', 'the named price error applies to an ambiguous stock too');
});

test('T10c2 D2/D3 ambiguous stock WITH a complete external unit: accepted Torque-only; client dealer text neither selects a row nor becomes the dealer', async () => {
  const rows = [];
  for (const dealer of [undefined, 'Davenport Motors', 'Wilson Trailer Sales & Service', 'Allied Truck & Trailer Sales', 'Torque Hub Finance Lead']) {
    const p = Object.assign({}, BUYER, PAID, EXT, { stock_number: 'DUP-1' });
    if (dealer) p.dealer_name = dealer;
    const w = await post(p);
    const tag = 'dealer=' + String(dealer);
    assert.equal(w.res.statusCode, 200, tag);
    assert.equal(w.body.route_code, null, tag);
    const r = w.inserts[0];
    assert.equal(r.listing_id, null, tag + ' must not resolve to a row');
    assert.equal(r.dealer_name, null, tag + ' D3');
    assert.equal(r.dealer_code, null, tag); assert.equal(r.route_code, null, tag); assert.equal(r.route_basis, null, tag);
    assert.equal(r.external_vehicle_model, 'Hauler', tag);
    assert.equal(w.queries.filter((q) => q.table === 'finance_routes').length, 0, tag + ' no route lookup');
    assert.deepEqual(w.emails.map((e) => e.to), ['leads@torquedma.com'], tag);
    const t = w.emails[0].text;
    assert.match(t, /Stock matches more than one inventory dealer - seller not verified; Torque-only, manual review/, tag);
    assert.doesNotMatch(t, /^Dealer: /m, tag + ' D3');
    if (dealer && dealer !== 'Torque Hub Finance Lead') assert.match(t, new RegExp('^Seller named by buyer \\(unverified, not used for routing\\): ' + dealer + '$', 'm'), tag);
    else assert.doesNotMatch(t, /Seller named by buyer/, tag + ' placeholder or absent seller is not shown');
    const strip = Object.assign({}, r); delete strip.dealer_name; rows.push(JSON.stringify(strip));
  }
  assert.equal(new Set(rows).size, 1, 'the stored row is identical whatever client dealer text was sent');
});
test('T10d D4 inventory lookup FAILURE: retryable 503, nothing saved, sent or routed; distinct from a confirmed no-match (400)', async () => {
  const variants = [
    Object.assign({}, BUYER, PAID, { stock_number: 'ATC-100', dealer_name: 'Auto Connection 210 LLC' }),
    Object.assign({}, BUYER, PAID, EXT, { stock_number: 'ATC-100', dealer_name: 'Auto Connection 210 LLC' }),
    Object.assign({}, BUYER, { stock_number: 'ATC-100', dealer_name: 'Private Party Seller', lender: 'Twaddle' })
  ];
  for (const p of variants) {
    const w = await post(p, { inventoryError: true, routes: ROUTES_WITH_DEFAULT });
    assert.equal(w.res.statusCode, 503);
    assert.deepEqual(Object.keys(w.body).sort(), ['detail', 'error']);
    assert.equal(w.body.error, 'inventory_lookup_unavailable');
    assert.equal(w.res.headers['Retry-After'], '5');
    assert.equal(w.res.headers['Access-Control-Allow-Origin'], 'https://hub.torquedma.com', 'CORS kept so the browser can read the 503');
    assert.ok(!/Auto Connection|Private Party|Synthetic|example\.test/.test(w.res.body), 'no identity or buyer data echoed');
    assert.equal(w.inserts.length, 0); assert.equal(w.emails.length, 0);
    assert.equal(w.queries.filter((q) => q.table === 'finance_routes').length, 0, 'no lender routing of any kind');
    assert.deepEqual(w.logs.error, ['submit-finance-lead: inventory lookup failed; 503 returned, nothing saved'], 'one bounded log line, no payload');
  }
  const np = await post(Object.assign({}, BUYER, PAID, { stock_number: 'NOPE-1', dealer_name: 'Auto Connection 210 LLC' }));
  assert.equal(np.res.statusCode, 400, 'the same request with a CONFIRMED no-match is a 400, not a 503');
});
test('T10e default-route boundary: unresolved stocks never take the platform default; Branch 3 itself is preserved', async () => {
  const opts = { routes: ROUTES_WITH_DEFAULT };
  const cases = [
    ['no_match + external', Object.assign({}, BUYER, EXT, { stock_number: 'NOPE-1' })],
    ['ambiguous + external', Object.assign({}, BUYER, EXT, { stock_number: 'DUP-1' })]
  ];
  for (const [tag, p] of cases) {
    const w = await post(p, opts);
    assert.equal(w.res.statusCode, 200, tag);
    assert.equal(w.body.route_code, null, tag);
    assert.equal(to(w, 'lender3@example.test').length, 0, tag + ' reached the default lender');
  }
  const pres = await post(Object.assign({}, BUYER, EXT, { dealer_name: 'Davenport Motors' }), opts);
  assert.equal(pres.body.route_code, 'L999', 'no-stock external unit with a non-routed seller still takes the default (unchanged)');
  assert.equal(to(pres, 'lender3@example.test').length, 1);
  assert.equal(pres.inserts[0].dealer_name, 'Davenport Motors', 'no-stock request: buyer-selected seller stored as today (outside D3, disclosed)');
  const res = await post(Object.assign({}, BUYER, { stock_number: 'ATT-300' }), opts);
  assert.equal(res.body.route_code, 'L999', 'resolved stock with no dealer route still takes the default (unchanged)');
  assert.equal(res.inserts[0].dealer_name, 'Allied Truck & Trailer Sales', 'resolved stock: inventory dealer');
});
test('T12 privacy: click identifiers stripped from stored URLs and every email; clean values unchanged', async () => {
  const src = 'https://hub.torquedma.com/finance.html?stock=ATC-100&src=listing&utm_source=facebook&fbclid=SYNTHCLICK1&gclid=SYNTHCLICK2';
  const ref = 'https://hub.torquedma.com/vehicle.html?stock=ATC-100&FBCLID=SYNTHCLICK3&utm_medium=cpc';
  const w = await post(Object.assign({}, BUYER, PAID, { stock_number: 'ATC-100', dealer_name: 'Auto Connection 210 LLC', source_url: src, submission_url: src, referrer: ref }));
  const r = w.inserts[0];
  for (const f of ['source_url', 'submission_url', 'referrer']) {
    assert.ok(!/SYNTHCLICK/i.test(r[f]), f + ' kept a click id');
    assert.match(r[f], /utm_/);
    assert.match(r[f], /stock=ATC-100/);
  }
  assert.ok(!/SYNTHCLICK/.test(allEmailText(w)), 'click id in an email');
  assert.ok(!UTM_KEYS.some((k) => /SYNTHCLICK|@/.test(String(r[k]))));
  const clean = 'https://hub.torquedma.com/finance.html?unit=a%20b&src=listing';
  const w2 = await post(Object.assign({}, BUYER, { stock_number: 'ATC-100', source_url: clean, referrer: 'Direct' }));
  assert.equal(w2.inserts[0].source_url, clean, 'a URL without click ids must be byte-identical');
  assert.equal(w2.inserts[0].referrer, 'Direct');
  assert.ok(!/utm_/.test(w2.res.body));
});

test('Release-order safety: missing campaign columns (PGRST204) -> lead saved without them; organic never retried', async () => {
  const missingCols = (row) => (hasUtmKeys(row) ? { code: 'PGRST204', message: "Could not find the 'utm_source' column" } : null);
  let w = await post(Object.assign({}, BUYER, PAID, { stock_number: 'ATC-100' }), { insertError: missingCols });
  assert.equal(w.res.statusCode, 200);
  assert.equal(w.inserts.length, 2);
  assert.equal(hasUtmKeys(w.inserts[1]), false);
  assert.equal(w.body.route_code, 'L001');
  w = await post(Object.assign({}, BUYER, { stock_number: 'ATC-100' }), { insertError: missingCols });
  assert.equal(w.res.statusCode, 200);
  assert.equal(w.inserts.length, 1);
  w = await post(Object.assign({}, BUYER, PAID, { stock_number: 'ATC-100' }), { insertError: () => ({ code: '42501', message: 'denied' }) });
  assert.equal(w.res.statusCode, 500);
  assert.equal(w.inserts.length, 1, 'no retry for other errors');
});

test('F6/D6 PGRST204: retry ONLY for a verified approved utm column; one bounded diagnostic line; no private data', async () => {
  const PRIVATE = /Synthetic Buyer|000\) 000|example\.test|facebook|cpc|torque_hub_vdp|atc-100|https?:|SYNTH/;
  const missingUtm = (col) => (row) => (hasUtmKeys(row) ? { code: 'PGRST204', message: "Could not find the '" + col + "' column of 'leads' in the schema cache" } : null);
  const paid = Object.assign({}, BUYER, PAID, { stock_number: 'ATC-100', source_url: 'https://hub.torquedma.com/finance.html?stock=ATC-100&fbclid=SYNTHCLICK' });

  for (const col of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
    const w = await post(paid, { insertError: missingUtm(col) });
    assert.equal(w.res.statusCode, 200, col);
    assert.equal(w.inserts.length, 2, col + ': exactly one retry');
    assert.equal(hasUtmKeys(w.inserts[1]), false, col);
    assert.deepEqual(JSON.parse(w.logs.warn[0]), { event: 'finance_lead_campaign_fallback', code: 'PGRST204', column: col, retry: 'saved', retry_code: null });
    assert.equal(w.logs.warn.length, 1);
    assert.ok(w.logs.warn[0].length <= 200, 'bounded length');
    assert.ok(!PRIVATE.test(w.logs.warn.concat(w.logs.error).join('\n')), 'no private or campaign data');
    assert.match(internal(w).text, /Campaign attribution not stored: database columns unavailable \(PGRST204\)/);
    assert.ok(!/Campaign attribution not stored/.test(w.emails.filter((e) => e.to !== 'leads@torquedma.com').map((e) => e.text).join('\n')), 'internal email only');
  }

  const unverified = [
    ['another column', { code: 'PGRST204', message: "Could not find the 'route_basis' column of 'leads' in the schema cache" }],
    ['utm look-alike', { code: 'PGRST204', message: "Could not find the 'utm_sourcex' column of 'leads' in the schema cache" }],
    ['utm name elsewhere in text', { code: 'PGRST204', message: "Could not find the 'route_basis' column; see utm_source" }],
    ['no message', { code: 'PGRST204' }],
    ['non-string message', { code: 'PGRST204', message: { utm_source: 1 } }],
    ['hostile', { code: 'PGRST204', message: "Could not find the 'buyer@example.test' column " + 'x'.repeat(5000) }]
  ];
  for (const [tag, err] of unverified) {
    const w = await post(paid, { insertError: () => err });
    assert.equal(w.res.statusCode, 500, tag + ': fails exactly as before');
    assert.equal(w.inserts.length, 1, tag + ': NOT retried');
    assert.equal(w.emails.length, 0, tag);
    assert.deepEqual(JSON.parse(w.logs.warn[0]), { event: 'finance_lead_campaign_fallback', code: 'PGRST204', column: 'unverified', retry: 'skipped', retry_code: null }, tag);
    assert.ok(!/example\.test|xxxx|route_basis|utm_sourcex/.test(w.logs.warn.join('\n')), tag + ': raw message never logged');
  }

  const stillFails = (row, n) => (n === 1 ? { code: 'PGRST204', message: "Could not find the 'utm_term' column of 'leads' in the schema cache" }
    : { code: 'PGRST204', message: "Could not find the 'route_basis' column of 'leads' in the schema cache" });
  let w = await post(paid, { insertError: stillFails });
  assert.equal(w.res.statusCode, 500); assert.equal(w.inserts.length, 2);
  assert.deepEqual(JSON.parse(w.logs.warn[0]), { event: 'finance_lead_campaign_fallback', code: 'PGRST204', column: 'utm_term', retry: 'failed', retry_code: 'PGRST204' });

  w = await post(Object.assign({}, BUYER, { stock_number: 'ATC-100' }), { insertError: missingUtm('utm_source') });
  assert.equal(w.logs.warn.length, 0, 'organic lead: no fallback, no diagnostic');
  assert.equal(w.inserts.length, 1);
});
test('Replay (unchanged): duplicate submission_id resolves to the prior lead with no new email', async () => {
  const w = await post(Object.assign({}, BUYER, PAID, { stock_number: 'ATC-100' }), {
    insertError: () => ({ code: '23505', message: 'duplicate' }),
    leads: [{ id: 'prior-lead', submission_id: BUYER.submission_id, dealer_code: 'ATC', route_code: 'L001' }]
  });
  assert.equal(w.res.statusCode, 200);
  assert.equal(w.body.lead_id, 'prior-lead');
  assert.equal(w.body.replay, true);
  assert.equal(w.emails.length, 0);
});

test('Existing gates unchanged: no subject -> 400; bad external price -> 400; missing name -> 400', async () => {
  let w = await post(Object.assign({}, BUYER, { dealer_name: 'Davenport Motors', external_vehicle_year: '2018' }));
  assert.equal(w.res.statusCode, 400); assert.equal(w.body.error, 'financing subject required');
  w = await post(Object.assign({}, BUYER, { external_vehicle_year: '2018', external_vehicle_make: 'S', external_vehicle_model: 'M', external_vehicle_price: '70k' }));
  assert.equal(w.res.statusCode, 400); assert.equal(w.body.error, 'external_vehicle_price must be a dollar amount');
  w = await post({ customer_phone: '(000) 000-0000', stock_number: 'ATC-100' });
  assert.equal(w.res.statusCode, 400);
  assert.equal(w.inserts.length, 0);
});
