'use strict';
// campaign-attribution-client.test.js - TH-HEAD_SITE_TECH-20261030-035, amended -036 (offline, synthetic).
// Extracts the CAMPAIGN-ATTRIBUTION regions from vehicle.html and finance.html and runs them in a
// vm sandbox with a fake sessionStorage and fixed clocks. Also checks that the shared region is
// byte-identical in both pages, that its character rule equals the server's, and that campaign
// data is wired only into the finance CTAs and the Phase 1 payload (never into Meta/GA4 events,
// the lender embed or Phase 2). -036: the snapshot is bound to the landing stock (one acquisition
// journey), and finance.html answers 409 identity_conflict with specific guidance.
// Run: node --test netlify/functions/__tests__/campaign-attribution-client.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..', '..');
const VDP = fs.readFileSync(path.join(ROOT, 'vehicle.html'), 'utf8');
const FIN = fs.readFileSync(path.join(ROOT, 'finance.html'), 'utf8');
const SERVER = fs.readFileSync(path.join(ROOT, 'netlify/functions/submit-finance-lead.js'), 'utf8');

function region(src, name) {
  const m = src.match(new RegExp('// CAMPAIGN-ATTRIBUTION-' + name + '-BEGIN[\\s\\S]*?// CAMPAIGN-ATTRIBUTION-' + name + '-END\\n'));
  assert.ok(m, 'region ' + name + ' missing');
  return m[0];
}

function fakeStorage(opts) {
  opts = opts || {};
  const m = new Map();
  return {
    map: m,
    getItem(k) { if (opts.throwGet) throw new Error('blocked'); return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { if (opts.throwSet) throw new Error('quota'); m.set(k, String(v)); },
    removeItem(k) { m.delete(k); }
  };
}

function loadVdp() {
  const ctx = { URLSearchParams, JSON, window: {} };
  vm.createContext(ctx);
  vm.runInContext(region(VDP, 'SHARED') + region(VDP, 'VDP') +
    ';this.api={resolveVdpCampaign,appendCampaignParams,campaignFromSearch,cleanUtmValue,vdpStockFromSearch,CAMPAIGN_SNAPSHOT_KEY,CAMPAIGN_SNAPSHOT_TTL_MS};', ctx);
  return ctx.api;
}
function loadFinance() {
  const ctx = { URLSearchParams, JSON };
  vm.createContext(ctx);
  vm.runInContext(region(FIN, 'SHARED') + ';this.api={campaignFromSearch,hasCampaignValue};', ctx);
  return ctx.api;
}
const plain = (o) => JSON.parse(JSON.stringify(o));

const PAID = '?stock=DBT-7915&utm_source=facebook&utm_medium=cpc&utm_campaign=torque_hub_vdp_financing_test&utm_content=dbt-7915&fbclid=SYNTHCLICK';
const T0 = 1793000000000;
const BASE = '/finance.html?stock=DBT-7915&unit=2019-synthetic&price=45000';

test('C1 paid VDP arrival: snapshot taken; both CTAs carry exactly the four present utm fields; src and stock kept; no click id', () => {
  const a = loadVdp(); const st = fakeStorage();
  const c = a.resolveVdpCampaign(PAID, st, T0);
  assert.deepEqual(plain(c), { utm_source: 'facebook', utm_medium: 'cpc', utm_campaign: 'torque_hub_vdp_financing_test', utm_content: 'dbt-7915', utm_term: null });
  for (const src of ['listing', 'vdp_nav']) {
    const u = a.appendCampaignParams(BASE + '&src=' + src, c);
    assert.equal(u, BASE + '&src=' + src + '&utm_source=facebook&utm_medium=cpc&utm_campaign=torque_hub_vdp_financing_test&utm_content=dbt-7915');
    assert.ok(!/fbclid|SYNTHCLICK|utm_term/.test(u));
  }
  const stored = JSON.parse(st.map.get(a.CAMPAIGN_SNAPSHOT_KEY));
  assert.equal(stored.t, T0);
  assert.equal(stored.s, 'DBT-7915', 'snapshot is bound to the landing stock');
  assert.deepEqual(Object.keys(stored).sort(), ['c', 's', 't']);
  assert.ok(!/fbclid|SYNTHCLICK/.test(JSON.stringify(stored)), 'snapshot holds only the stock, utm fields and the time');
});

test('C2 organic VDP: no campaign, nothing stored, CTA URL unchanged', () => {
  const a = loadVdp(); const st = fakeStorage();
  const c = a.resolveVdpCampaign('?stock=DBT-7915', st, T0);
  assert.equal(c, null);
  assert.equal(st.map.size, 0);
  assert.equal(a.appendCampaignParams(BASE + '&src=listing', c), BASE + '&src=listing');
});

test('C3 first touch within one journey: a later campaign URL for the SAME stock never overwrites; reload keeps it (T11)', () => {
  const a = loadVdp(); const st = fakeStorage();
  a.resolveVdpCampaign(PAID, st, T0);
  const later = a.resolveVdpCampaign('?stock=DBT-7915&utm_source=google&utm_campaign=other', st, T0 + 60 * 1000);
  assert.equal(later.utm_source, 'facebook');
  assert.equal(later.utm_campaign, 'torque_hub_vdp_financing_test');
  const back = a.resolveVdpCampaign('?stock=DBT-7915', st, T0 + 5 * 60 * 1000);
  assert.equal(back.utm_content, 'dbt-7915', 'returning to the landing unit in the same tab keeps the campaign');
  const reload = a.resolveVdpCampaign(PAID, st, T0 + 10 * 1000);
  assert.deepEqual(plain(reload), plain(later));
});

test('C3b F5 no cross-unit contamination: another stock browsed organically gets NO campaign; the snapshot survives', () => {
  const a = loadVdp(); const st = fakeStorage();
  a.resolveVdpCampaign(PAID, st, T0);
  assert.equal(a.resolveVdpCampaign('?stock=X-2', st, T0 + 1000), null, 'unrelated stock must not inherit the landing campaign');
  assert.equal(a.resolveVdpCampaign('?stock=dbt-7915', st, T0 + 2000), null, 'stock match is exact (a different string is a different unit)');
  assert.equal(JSON.parse(st.map.get(a.CAMPAIGN_SNAPSHOT_KEY)).s, 'DBT-7915', 'organic visits elsewhere do not erase the journey');
  assert.equal(a.resolveVdpCampaign('?stock=DBT-7915', st, T0 + 3000).utm_content, 'dbt-7915');
});

test('C3c F5 a campaign URL for a different stock starts a new journey and replaces the snapshot', () => {
  const a = loadVdp(); const st = fakeStorage();
  a.resolveVdpCampaign(PAID, st, T0);
  const b = a.resolveVdpCampaign('?stock=X-2&utm_source=facebook&utm_content=x-2', st, T0 + 1000);
  assert.equal(b.utm_content, 'x-2');
  assert.equal(JSON.parse(st.map.get(a.CAMPAIGN_SNAPSHOT_KEY)).s, 'X-2');
  assert.equal(a.resolveVdpCampaign('?stock=DBT-7915', st, T0 + 2000), null, 'the earlier unit no longer carries the old campaign');
  assert.equal(a.resolveVdpCampaign('?stock=X-2', st, T0 + 3000).utm_content, 'x-2');
});

test('C3d F5 a page without exactly one usable stock parameter gets no campaign and writes nothing', () => {
  const a = loadVdp();
  for (const q of ['?utm_source=facebook', '?stock=&utm_source=facebook', '?stock=A&stock=B&utm_source=facebook', '?stock=' + 'A'.repeat(65) + '&utm_source=facebook']) {
    const st = fakeStorage();
    assert.equal(a.resolveVdpCampaign(q, st, T0), null, q.slice(0, 40));
    assert.equal(st.map.size, 0, q.slice(0, 40));
  }
  assert.equal(a.vdpStockFromSearch('?stock=%20DBT-7915%20'), 'DBT-7915');
});

test('C4 bounded lifetime: an expired snapshot is discarded, never applied to a later visit', () => {
  const a = loadVdp(); const st = fakeStorage();
  a.resolveVdpCampaign(PAID, st, T0);
  const ttl = a.CAMPAIGN_SNAPSHOT_TTL_MS;
  assert.equal(ttl, 2 * 60 * 60 * 1000);
  assert.equal(a.resolveVdpCampaign('?stock=X-2', st, T0 + ttl), null);
  assert.equal(st.map.size, 0, 'expired snapshot removed');
  a.resolveVdpCampaign(PAID, st, T0);
  const fresh = a.resolveVdpCampaign('?stock=X-3&utm_source=google', st, T0 + ttl + 1);
  assert.equal(fresh.utm_source, 'google');
  assert.equal(JSON.parse(st.map.get(a.CAMPAIGN_SNAPSHOT_KEY)).t, T0 + ttl + 1);
  st.map.set(a.CAMPAIGN_SNAPSHOT_KEY, JSON.stringify({ t: T0 + 10000, s: 'X-4', c: { utm_source: 'facebook' } }));
  assert.equal(a.resolveVdpCampaign('?stock=X-4', st, T0), null, 'a snapshot from the future is not trusted');
});

test('C5 storage unavailable or throwing: the current URL alone is used, no exception', () => {
  const a = loadVdp();
  assert.equal(a.resolveVdpCampaign(PAID, null, T0).utm_source, 'facebook');
  assert.equal(a.resolveVdpCampaign(PAID, fakeStorage({ throwGet: true }), T0).utm_source, 'facebook');
  assert.equal(a.resolveVdpCampaign(PAID, fakeStorage({ throwSet: true }), T0).utm_source, 'facebook');
  assert.equal(a.resolveVdpCampaign('?stock=1', fakeStorage({ throwGet: true }), T0), null);
});

test('C6 tampered snapshot: values are re-validated; a snapshot with nothing valid is dropped', () => {
  const a = loadVdp(); const st = fakeStorage();
  st.map.set(a.CAMPAIGN_SNAPSHOT_KEY, JSON.stringify({ t: T0, s: '1', c: { utm_source: 'evil@example.test', utm_medium: '<x>' } }));
  assert.equal(a.resolveVdpCampaign('?stock=1', st, T0 + 1), null);
  assert.equal(st.map.size, 0);
  st.map.set(a.CAMPAIGN_SNAPSHOT_KEY, JSON.stringify({ t: T0, c: { utm_source: 'facebook' } }));
  assert.equal(a.resolveVdpCampaign('?stock=1', st, T0 + 1), null, 'a snapshot without a bound stock is never applied');
  assert.equal(st.map.size, 0);
  st.map.set(a.CAMPAIGN_SNAPSHOT_KEY, '{not json');
  assert.equal(a.resolveVdpCampaign(PAID, st, T0).utm_source, 'facebook');
});

test('C7 URL edge cases: repeated key, malformed percent-encoding, PII-shaped and oversize values -> null', () => {
  const a = loadVdp();
  const c = a.campaignFromSearch('?utm_source=facebook&utm_source=google&utm_medium=%E0%A4%A&utm_campaign=' + 'a'.repeat(129) +
    '&utm_content=buyer%40example.test&utm_term=9195550123');
  assert.deepEqual(plain(c), { utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null, utm_term: null });
  assert.equal(a.campaignFromSearch('?utm_campaign=Fall%20%20Promo').utm_campaign, 'Fall Promo');
  assert.equal(a.campaignFromSearch('').utm_source, null);
  assert.equal(a.appendCampaignParams('/finance.html', { utm_source: 'a b', utm_medium: null }), '/finance.html?utm_source=a%20b');
});

test('C8 finance page reads only its own URL: direct visit -> all null; CTA-carried values -> values', () => {
  const f = loadFinance();
  const direct = f.campaignFromSearch('?src=autoconnection210');
  assert.equal(f.hasCampaignValue(direct), false);
  const carried = f.campaignFromSearch('?stock=DBT-7915&src=listing&utm_source=facebook&utm_medium=cpc&utm_campaign=torque_hub_vdp_financing_test&utm_content=dbt-7915');
  assert.deepEqual(plain(carried), { utm_source: 'facebook', utm_medium: 'cpc', utm_campaign: 'torque_hub_vdp_financing_test', utm_content: 'dbt-7915', utm_term: null });
  assert.ok(!/sessionStorage|localStorage/.test(region(FIN, 'SHARED')), 'finance page keeps no storage');
});

test('C9 one rule everywhere: shared region identical in both pages; character rule and checks equal the server', () => {
  assert.equal(region(VDP, 'SHARED'), region(FIN, 'SHARED'));
  const re = /const UTM_VALUE_RE = (\/.*\/);/;
  assert.equal(region(VDP, 'SHARED').match(re)[1], SERVER.match(re)[1]);
  const keys = /const UTM_KEYS = (\[.*\]);/;
  assert.equal(region(VDP, 'SHARED').match(keys)[1], SERVER.match(keys)[1]);
  for (const check of ['/\\d{10,}/.test(s)', '/\\b\\d{3}-\\d{2}-\\d{4}\\b/.test(s)', ".trim().replace(/ {2,}/g, ' ')"]) {
    assert.ok(region(VDP, 'SHARED').includes(check) && SERVER.includes(check), 'missing ' + check);
  }
});

test('C10 wiring: campaign goes to both VDP finance CTAs and the Phase 1 payload only', () => {
  assert.ok(VDP.includes('appendCampaignParams(`${financeBase}&src=listing`, VDP_CAMPAIGN)'));
  assert.ok(VDP.includes('appendCampaignParams(`${financeBase}&src=vdp_nav`, VDP_CAMPAIGN)'));
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
    assert.ok(FIN.includes(k + ':' + ' '.repeat(Math.max(1, 17 - k.length - 1)) + 'FINANCE_CAMPAIGN.' + k), 'payload field ' + k);
  }
  const canonical = FIN.slice(FIN.indexOf('const canonical = {'), FIN.indexOf('const handlePhase1Failure'));
  assert.ok(canonical.length > 0 && !/utm_|CAMPAIGN/.test(canonical), 'lender canonical object must not carry campaign');
  const afterPayload = FIN.slice(FIN.indexOf('const handlePhase1Failure'));
  assert.ok(!/utm_|FINANCE_CAMPAIGN/.test(afterPayload), 'events, lender embed and Phase 2 must not carry campaign');
  const vdpScript = VDP.slice(VDP.indexOf('// CAMPAIGN-ATTRIBUTION-SHARED-BEGIN'));
  assert.ok(!/fbq\([^)]*(utm|CAMPAIGN)|gtag\([^)]*(utm|CAMPAIGN)/.test(vdpScript), 'no analytics event carries campaign');
});

test('C11 F3 finance.html: 409 identity_conflict gets specific guidance; conversion events stay behind r.ok', () => {
  const fetchAt = FIN.indexOf('fetch("/.netlify/functions/submit-finance-lead"');
  const okGate = FIN.indexOf('if (!r.ok) {', fetchAt);
  const leadEvt = FIN.indexOf("fbq('track', 'Lead'", fetchAt);
  const gaEvt = FIN.indexOf("gtag('event', 'generate_lead'", fetchAt);
  assert.ok(fetchAt > 0 && okGate > fetchAt && leadEvt > okGate && gaEvt > okGate, 'Lead and generate_lead fire only after the !r.ok exit');
  const gate = FIN.slice(okGate, leadEvt);
  assert.ok(/r\.status === 409/.test(gate) && /failure\.error === 'identity_conflict'/.test(gate) && /handleIdentityConflict\(\)/.test(gate) && /return;/.test(gate));
  const h = FIN.slice(FIN.indexOf('const handleIdentityConflict'), fetchAt);
  assert.ok(/Nothing was submitted/.test(h) && /Reload the page/.test(h) && /identity-conflict-reload/.test(h));
  assert.ok(!/innerHTML/.test(h), 'guidance is built with textContent / DOM nodes only');
});
