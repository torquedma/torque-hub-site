'use strict';
// vdp-finance-context-client.test.js - VDP-CONTEXT A (offline, synthetic, no network).
// Runs the real finance.html subject code (renderSubject, resolveCandidateStock, onPickerSelect,
// enrichPickedSubject) against a stub DOM and a stubbed fetch.
// Run: node --test netlify/functions/__tests__/vdp-finance-context-client.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..', '..');
const FIN = fs.readFileSync(path.join(ROOT, 'finance.html'), 'utf8');
const VDP = fs.readFileSync(path.join(ROOT, 'vehicle.html'), 'utf8');
const fnText = (t, name) => { const a = t.indexOf('function ' + name + '('); const b = t.indexOf('\n}\n', a); assert.ok(a >= 0 && b > a, name); return t.slice(a, b + 2); };
const slice = (from, to) => { const a = FIN.indexOf(from); const b = FIN.indexOf(to, a); assert.ok(a >= 0 && b > a, from); return FIN.slice(a, b); };

const SB_PHOTO = 'https://bxsikkmqasydosmblzov.supabase.co/storage/v1/object/public/vehicle-photos/x/1.jpg';
const ROW = { stock: 'SRS-111801', year: '', make: 'John Deere', model: '4760', trim: 'Tractor', price: '$42,500',
  dealer: 'Suttontown Repair Service', sold: false, photos: [{ dataUrl: 'data:x' }, { url: SB_PHOTO }, { url: 'https://example.test/2.jpg' }],
  vin: '', mileage: '', hours: '8,609.1' };

function world(urlParams, fetchRows) {
  const els = {};
  const el = (id) => els[id] || (els[id] = { id, style: {}, textContent: '', value: '', children: [], attrs: {},
    appendChild(c) { this.children.push(c); }, removeChild(c) { this.children = this.children.filter((x) => x !== c); },
    get firstChild() { return this.children[0] || null; }, removeAttribute(k) { delete this.attrs[k]; if (k === 'src') delete this.src; } });
  const fetches = [];
  const ctx = {
    document: { getElementById: el, createElement: (t) => ({ tag: t, style: {}, textContent: '' }), createTextNode: (t) => ({ text: t }) },
    console: { error() {}, warn() {}, log() {} }, Object, Array, String, Number, Math, isFinite, encodeURIComponent,
    SB_URL: 'https://sb.invalid', SB_HDRS: {},
    fetch: async (u) => { fetches.push(u); const rows = await (typeof fetchRows === 'function' ? fetchRows(u) : fetchRows); return { ok: true, json: async () => rows }; },
    stock: urlParams.stock || '', unit: urlParams.unit || '', price: urlParams.price || ''
  };
  const src = slice('let financeSubject', '\n// The ONLY read point for either flag.') + '\n'
    + slice('function candidateHasAuthority()', '\nasync function resolveCandidateStock') + '\n'
    + slice('async function resolveCandidateStock()', '\ndocument.getElementById("f-price")') + '\n'
    + slice('function hasUsableStock(', '\nfunction onChooseExternal()')
    + '\nthis.api = { renderSubject, resolveCandidateStock, onPickerSelect, enrichPickedSubject, setRows: (r) => { inventoryRows = r; }, state: () => financeSubject, contextMetaLines, primaryPhotoUrl, buildVdpSlideUrl, gen: () => pickerGeneration };';
  vm.runInNewContext(src, ctx);
  return { els, api: ctx.api, fetches };
}
const metaText = (els) => (els.contextMeta.children || []).filter((c) => c.text).map((c) => c.text);

test('A-1 transform parity: buildVdpSlideUrl in finance.html is byte-identical to vehicle.html', () => {
  assert.equal(fnText(FIN, 'buildVdpSlideUrl'), fnText(VDP, 'buildVdpSlideUrl'));
  assert.ok(VDP.includes("photos = (rawPhotos || []).filter(p => p && p.url);"), 'VDP selection rule unchanged');
});

test('A-2 resolved stock: photo = first entry WITH url (VDP rule) through the VDP transform; stock, dealer, hours shown', async () => {
  const w = world({ stock: 'SRS-111801', unit: 'fake-unit', price: '1' }, [ROW]);
  await w.api.resolveCandidateStock();
  assert.equal(w.els.contextPhoto.src, w.api.buildVdpSlideUrl(SB_PHOTO));
  assert.ok(w.els.contextPhoto.src.includes('/render/image/public/'));
  assert.equal(w.els.contextPhoto.style.display, 'block');
  assert.equal(w.els.contextPhoto.alt, 'John Deere 4760 Tractor');
  assert.equal(w.els.contextUnit.textContent, 'John Deere 4760 Tractor');
  assert.equal(w.els.contextPrice.textContent, '$42,500');
  assert.deepEqual(metaText(w.els), ['Stock # SRS-111801 · Suttontown Repair Service', '8,609.1 hrs']);
  assert.ok(w.fetches[0].includes('select=stock,year,make,model,trim,price,dealer,sold,photos,vin,mileage,hours'));
});

test('A-3 VIN and mileage shown when present; no-photo and malformed photos fall back to the placeholder', async () => {
  const row = Object.assign({}, ROW, { photos: [], vin: '1FUJGLDR0CLBP1234', mileage: '412,000', hours: '' });
  const w = world({ stock: 'SRS-111801' }, [row]);
  await w.api.resolveCandidateStock();
  assert.equal(w.els.contextPhoto.src, '/photos-coming-soon.png');
  assert.deepEqual(metaText(w.els), ['Stock # SRS-111801 · Suttontown Repair Service', '412,000 mi', 'VIN 1FUJGLDR0CLBP1234']);
  for (const bad of [null, 'not-an-array', [null, {}, { url: 5 }], [{ dataUrl: 'data:x' }]]) {
    assert.equal(w.api.primaryPhotoUrl(bad), null, JSON.stringify(bad));
  }
  w.els.contextPhoto.src = 'https://broken.test/x.jpg'; w.els.contextPhoto.onerror();
  assert.equal(w.els.contextPhoto.src, '/photos-coming-soon.png', 'load error -> placeholder');
});

test('A-4 spoof: URL unit slug and price are never displayed; failed lookup shows the stock hint only', async () => {
  const w = world({ stock: 'NOPE-1', unit: '2024-ferrari-f8', price: '1' }, []);
  w.api.renderSubject();
  assert.equal(w.els.contextUnit.textContent, 'Stock # NOPE-1');
  assert.equal(w.els.contextPrice.textContent, '');
  await w.api.resolveCandidateStock();
  assert.equal(w.api.state().mode, 'none');
  assert.ok(!/ferrari|\$1\b/i.test(w.els.contextUnit.textContent + w.els.contextPrice.textContent));
  assert.notEqual(w.els.contextPhoto.style.display, 'block');
  assert.ok(!FIN.includes('unit.replace(/-/g," ")'), 'slug-to-title hint removed');
});

test('A-5 sold unit keeps the warning and still shows photo and context', async () => {
  const w = world({ stock: 'SRS-111801' }, [Object.assign({}, ROW, { sold: true })]);
  await w.api.resolveCandidateStock();
  assert.equal(w.els['context-sold'].style.display, 'block');
  assert.equal(w.els.contextPhoto.style.display, 'block');
});

test('A-6 direct picker: light list; after a pick one row is fetched and applied only to the same unit', async () => {
  assert.ok(FIN.includes("inventory_cards?select=stock,year,make,model,trim,price,dealer'"), 'picker list select unchanged (no photos)');
  const w = world({}, (u) => (u.includes('stock=eq.SRS-111801') ? [{ stock: 'SRS-111801', dealer: ROW.dealer, photos: ROW.photos, vin: '', mileage: '', hours: '8,609.1' }] : []));
  const LIST_ROW = { stock: ROW.stock, year: ROW.year, make: ROW.make, model: ROW.model, trim: ROW.trim, price: ROW.price, dealer: ROW.dealer };
  w.api.setRows([LIST_ROW]);
  w.api.onPickerSelect('SRS-111801');
  assert.equal(w.els.contextPhoto.src, '/photos-coming-soon.png', 'placeholder until enrichment lands');
  await new Promise((r) => setImmediate(r));
  assert.equal(w.els.contextPhoto.src, w.api.buildVdpSlideUrl(SB_PHOTO));
  assert.ok(w.fetches.some((u) => u.includes('&dealer=eq.Suttontown%20Repair%20Service')));
});

// ---- F1 (Chief 2 -324): same-stock / out-of-order enrichment race ----
function deferredWorld() {
  const pending = [];
  const w = world({}, (u) => new Promise((resolve) => pending.push({ u, resolve })));
  return { w, pending };
}
const LIST = (stock, dealer) => ({ stock, year: '2020', make: 'Make', model: stock, trim: '', price: '1000', dealer });
const ENR = (stock, dealer, url) => [{ stock, dealer, photos: [{ url }], vin: '', mileage: '', hours: '' }];
const tick = () => new Promise((r) => setImmediate(r));
const P1 = 'https://example.test/p1.jpg', P2 = 'https://example.test/p2.jpg';

test('F1-a same stock re-picked: the OLDER response arriving last is ignored; the newest pick wins', async () => {
  const { w, pending } = deferredWorld();
  w.api.setRows([LIST('X-1', 'Dealer A')]);
  w.api.onPickerSelect('X-1');           // gen 1
  w.api.onPickerSelect('X-1');           // gen 2, new selection object, same stock
  assert.equal(w.api.gen(), 2);
  pending[1].resolve(ENR('X-1', 'Dealer A', P2)); await tick();
  pending[0].resolve(ENR('X-1', 'Dealer A', P1)); await tick();
  assert.equal(w.api.state().torqueHub.photo, P2);
  assert.equal(w.els.contextPhoto.src, P2);
});

test('F1-b same stock, different dealer: a response for Dealer A never mutates an active Dealer B selection', async () => {
  const { w, pending } = deferredWorld();
  w.api.setRows([LIST('X-1', 'Dealer A')]);
  w.api.onPickerSelect('X-1');
  const before = w.api.state().torqueHub;
  w.api.state().torqueHub = Object.assign({}, before, { dealer: 'Dealer B', photo: null });   // another context, same stock
  pending[0].resolve(ENR('X-1', 'Dealer A', P1)); await tick();
  assert.equal(w.api.state().torqueHub.photo, null);
  assert.equal(before.photo, null, 'stale selection object not written either');
});

test('F1-c response row identity is checked: wrong stock, wrong dealer or 2 rows -> ignored', async () => {
  for (const bad of [ENR('X-2', 'Dealer A', P1), ENR('X-1', 'Dealer Z', P1), ENR('X-1', 'Dealer A', P1).concat(ENR('X-1', 'Dealer A', P2))]) {
    const { w, pending } = deferredWorld();
    w.api.setRows([LIST('X-1', 'Dealer A')]);
    w.api.onPickerSelect('X-1');
    pending[0].resolve(bad); await tick();
    assert.equal(w.api.state().torqueHub.photo, null, JSON.stringify(bad));
  }
});

test('F1-d picker change to another stock: the first response is ignored; the second applies', async () => {
  const { w, pending } = deferredWorld();
  w.api.setRows([LIST('X-1', 'Dealer A'), LIST('Y-1', 'Dealer A')]);
  w.api.onPickerSelect('X-1');
  w.api.onPickerSelect('Y-1');
  pending[0].resolve(ENR('X-1', 'Dealer A', P1)); await tick();
  assert.equal(w.api.state().torqueHub.stock, 'Y-1');
  assert.equal(w.api.state().torqueHub.photo, null);
  pending[1].resolve(ENR('Y-1', 'Dealer A', P2)); await tick();
  assert.equal(w.api.state().torqueHub.photo, P2);
});

test('F1-e switching to external mode (or clearing) before the response lands -> nothing applied', async () => {
  const { w, pending } = deferredWorld();
  w.api.setRows([LIST('X-1', 'Dealer A')]);
  w.api.onPickerSelect('X-1');
  const ref = w.api.state().torqueHub;
  w.api.state().mode = 'external'; w.api.state().torqueHub = null;
  pending[0].resolve(ENR('X-1', 'Dealer A', P1)); await tick();
  assert.equal(ref.photo, null);
  assert.equal(w.api.state().torqueHub, null);
});

test('F1-f the lookup stays on public inventory_cards with stock + dealer filters (no new source or privilege)', () => {
  const code = slice('async function enrichPickedSubject', '\nfunction onChooseExternal');
  assert.ok(code.includes("'/rest/v1/inventory_cards?select=stock,dealer,photos,vin,mileage,hours&stock=eq.'"));
  assert.ok(code.includes("'&dealer=eq.'"));
  assert.ok(!/\/rest\/v1\/inventory\?|service|Authorization: 'Bearer ' \+ (?!SB_ANON)/.test(code));
  assert.ok(FIN.indexOf('let pickerGeneration = 0;') < FIN.indexOf('function onPickerSelect('), 'declared before use (no TDZ)');
});

test('A-7 rendering uses text nodes only (no innerHTML in the new context code); no new URL parameters', () => {
  const code = slice('// VDP-PRIMARY-PHOTO-SHARED-BEGIN', 'function renderSubject()') + slice('async function enrichPickedSubject', '\nfunction onChooseExternal');
  assert.ok(!/innerHTML/.test(code));
  assert.ok(FIN.includes('<img id="contextPhoto" class="context-photo" alt="" style="display:none" decoding="async">'));
  assert.ok(/@media \(max-width: 600px\) \{ \.context-photo/.test(FIN), 'mobile rule present');
});
