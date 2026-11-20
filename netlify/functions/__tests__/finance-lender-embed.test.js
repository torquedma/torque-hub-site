'use strict';
// finance-lender-embed.test.js - HST -319 (Wheelhouse L002 Jotform embed), offline, synthetic.
// Checks finance.html's route_code-keyed lender config: L001 (Twaddle/H.I.L., Formstack) is
// unchanged, L002 (Wheelhouse Lease and Finance, Jotform) passes nothing to the lender URL, skips
// the Torque Hub business step, makes no soft-pull claim, and resizes only on Jotform's exact
// height message from form.jotform.com. There is no default route. No network.
// Run: node --test netlify/functions/__tests__/finance-lender-embed.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FIN = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'finance.html'), 'utf8');

function slice(from, to) {
  const a = FIN.indexOf(from);
  const b = FIN.indexOf(to, a);
  assert.ok(a >= 0 && b > a, 'missing ' + from);
  return FIN.slice(a, b);
}
function configs() {
  const src = slice('const LENDER_FORM_CONFIGS = {', '\nlet pendingLender');
  return vm.runInNewContext(src + '\nLENDER_FORM_CONFIGS');
}

const ASH_CODES = ['L003', 'L004', 'L005', 'L006', 'L007', 'L008', 'L009', 'L010', 'L011', 'L012', 'L013'];

test('LE-1: exactly L001, L002 and the eleven Ash codes; L001 Formstack config = ATC baseline + Seller Information page; no default route', () => {
  const C = configs();
  assert.deepEqual(Object.keys(C), ['L001', 'L002'].concat(ASH_CODES));
  assert.deepEqual(JSON.parse(JSON.stringify(C.L001)), {
    lenderName: 'H.I.L. Financial', provider: 'formstack', formUrl: 'https://twaddle.formstack.com/forms/vehiclenetwork',
    fieldMap: {
      source: 'field196509669', dealer: ['field196509670', 'field157837213'], stock_number: 'field196509673',
      vehicle_title: ['field196509672', 'field157943120'], vehicle_price: 'field157943199',
      buyer_name: 'field196509676', buyer_email: 'field196509677', buyer_phone: 'field196509678', lead_id: 'field196509679',
      business_type: 'field157836337', business_name: 'field157805829', time_in_business: 'field157805830',
      business_street: 'field157805832-address', business_city: 'field157805832-city',
      business_state: 'field157805832-state', business_zip: 'field157805832-zip'
    },
    prefillNotice: { dealer: 'seller', vehicle_title: 'equipment', vehicle_price: 'price estimate' }
  });
  assert.ok(FIN.includes('const cfg = (res && res.route_code) ? LENDER_FORM_CONFIGS[res.route_code] : null;\n  if (!cfg) { showSuccess(); return; }'),
    'an unmapped route still falls through to showSuccess');
  assert.ok(FIN.includes('>H.I.L. Financial starts with a soft credit check that will not affect your credit score.</p>'), 'L001 default copy kept');
});

test('LE-2: L002 is the Wheelhouse Jotform with no prefill, no business step and no soft-pull claim', () => {
  const L = configs().L002;
  assert.equal(L.provider, 'jotform');
  assert.equal(L.lenderName, 'Wheelhouse Lease and Finance');
  assert.equal(L.formUrl, 'https://form.jotform.com/211335844728156');
  assert.equal(L.jotformId, '211335844728156');
  assert.ok(L.formUrl.endsWith('/' + L.jotformId) && !L.formUrl.includes('?'));
  assert.deepEqual(Object.keys(L.fieldMap), [], 'nothing from Torque Hub goes into the lender URL');
  assert.equal(L.skipBusinessInfo, true);
  const copy = Object.values(L.embedCopy).join(' ');
  assert.ok(!/soft (credit )?(check|pull)/i.test(copy), 'no soft-pull claim for Wheelhouse');
  assert.ok(/not complete until you submit/i.test(L.embedCopy.intro), 'inquiry vs application distinguished');
  assert.ok(/not received or stored by Torque Hub/.test(L.embedCopy.note));
});

test('LE-3: the skip happens before the business step is shown; L001 still gets it', () => {
  const h = slice('function handleLeadCreated(', 'function attachJotformResize(');
  const skip = h.indexOf('if (cfg.skipBusinessInfo) { revealLenderEmbed(); return; }');
  const show = h.indexOf('document.getElementById("business-info").style.display = "block";');
  assert.ok(skip > 0 && show > skip);
});

test('LE-4: resize only on "setHeight:<px>:<formId>" from https://form.jotform.com, clamped', () => {
  const src = slice('function attachJotformResize(', '\nfunction revealLenderEmbed');
  let listener = null;
  const ctx = { window: { addEventListener: (t, fn) => { assert.equal(t, 'message'); listener = fn; } }, Math, parseInt };
  vm.runInNewContext(src + '\nthis.attach = attachJotformResize;', ctx);
  const frame = { style: { height: '' } };
  ctx.attach(frame, '211335844728156');
  const send = (origin, data) => listener({ origin, data });
  send('https://evil.example', 'setHeight:5637:211335844728156');
  send('https://form.jotform.com', 'setHeight:5637:999');
  send('https://form.jotform.com', { setHeight: 5637 });
  send('https://form.jotform.com', 'setHeight:5637:211335844728156;x');
  assert.equal(frame.style.height, '', 'ignored');
  send('https://form.jotform.com', 'setHeight:5637:211335844728156');
  assert.equal(frame.style.height, '5657px');
  send('https://form.jotform.com', 'setHeight:100:211335844728156');
  assert.equal(frame.style.height, '620px', 'lower clamp');
  send('https://form.jotform.com', 'setHeight:99999:211335844728156');
  assert.equal(frame.style.height, '20020px', 'upper clamp');
});

// WH-VDP (Chief 1 WH-001): L003-L013 reuse the exact L002 Wheelhouse config.
test('LE-5: every Ash code L003-L013 maps to the SAME L002 object; nothing else is added', () => {
  const C = configs();
  for (const code of ASH_CODES) assert.strictEqual(C[code], C.L002, code + ' is L002');
  assert.notStrictEqual(C.L001, C.L002);
  for (const code of ['L000', 'L014', 'L099', 'l004', 'DEFAULT', '']) assert.equal(C[code], undefined, code + ' unmapped');
  const ids = (FIN.match(/jotformId:\s*"\d+"/g) || []);
  assert.deepEqual(ids, ['jotformId: "211335844728156"'], 'no new Jotform id');
  assert.equal((FIN.match(/form\.jotform\.com\/\d+/g) || []).length, 1, 'no new form URL');
});

// Runs the real handleLeadCreated / revealLenderEmbed / showSuccess against a stub DOM.
function runFlow(routeCode) {
  const els = {};
  const el = (id) => els[id] || (els[id] = { id, style: {}, textContent: '', children: [], appendChild(c) { this.children.push(c); }, scrollIntoView() {} });
  const created = [];
  const listeners = [];
  const ctx = {
    document: { getElementById: el, createElement: (t) => { const e = { tag: t, style: {}, children: [], appendChild(c) { this.children.push(c); } }; created.push(e); return e; } },
    window: { scrollTo() {}, addEventListener: (t, fn) => listeners.push(t) },
    encodeURIComponent, Object, Math, parseInt, console
  };
  const src = slice('const LENDER_FORM_CONFIGS = {', '\nlet pendingLender') + '\nlet pendingLender = null;\n' +
    slice('function showSuccess()', 'function submitBusinessInfo()') +
    '\nthis.go = handleLeadCreated;';
  vm.runInNewContext(src, ctx);
  ctx.go({ lead_id: 'synthetic-lead', route_code: routeCode, success: true },
    { source: 'torque_hub_listing', dealer: 'Davenport Motors', stock_number: 'DAV-032411', buyer_name: 'TEST' });
  const iframe = created.find((e) => e.tag === 'iframe');
  return { els, iframe, listeners };
}

test('LE-6: each Ash code shows the L002 Wheelhouse embed after acceptance, no business step, no prefill', () => {
  const ref = runFlow('L002');
  assert.equal(ref.iframe.src, 'https://form.jotform.com/211335844728156');
  for (const code of ASH_CODES) {
    const r = runFlow(code);
    assert.ok(r.iframe, code + ' iframe');
    assert.equal(r.iframe.src, ref.iframe.src, code + ' same form, no URL params');
    assert.equal(r.els['lender-embed'].style.display, 'block');
    assert.notEqual(r.els['business-info'].style.display, 'block', code + ' skips business step');
    assert.equal(r.els['form-success'] && r.els['form-success'].style.display, undefined, code + ' not the plain success screen');
    assert.equal(r.els['lender-embed-title'].textContent, ref.els['lender-embed-title'].textContent);
    assert.equal(r.els['lender-embed-note'].textContent, ref.els['lender-embed-note'].textContent);
    assert.deepEqual(r.listeners, ['message'], code + ' Jotform resize listener only');
  }
});

test('LE-7: L001 path unchanged (business step); unmapped / missing route falls to showSuccess', () => {
  const a = runFlow('L001');
  assert.equal(a.iframe, undefined, 'L001 waits for business info');
  assert.equal(a.els['business-info'].style.display, 'block');
  for (const code of ['L014', 'L000', null, undefined, '']) {
    const r = runFlow(code);
    assert.equal(r.iframe, undefined, String(code) + ' no embed');
    assert.equal(r.els['form-success'].style.display, 'block', String(code) + ' plain success');
  }
});

// WH-COPY (Chief 1, before WH-001): no soft-credit claim before submission, because the
// route (and lender) is decided by the server after submit. L001-only and L002 copy unchanged.
test('FC-1: no soft-credit claim anywhere before the business step; replacement copy present', () => {
  const pre = slice('<ul class="benefits">', '<div id="business-info"');
  assert.ok(!/soft credit/i.test(pre), 'no soft-credit claim pre-submit');
  assert.ok(!/affect your credit score/i.test(pre), 'no credit-score promise pre-submit');
  assert.ok(pre.includes('>Starting your request does not check your credit</li>'));
  assert.ok(pre.includes('>Submitting this request does not run a credit check.</p>'));
  assert.ok(pre.includes('If a lender needs a hard credit pull, you should be notified first.'), 'existing trust line kept');
});

test('FC-2: the only soft-credit statements left are the L001-only business step and L001 embed default', () => {
  const hits = FIN.match(/soft credit check that will not affect your credit score/g) || [];
  assert.equal(hits.length, 2);
  const biz = slice('<div id="business-info"', '<select id="f-business-type"');
  assert.ok(biz.includes('>Financing starts with a soft credit check that will not affect your credit score.</p>'), 'L001 business step unchanged');
  assert.ok(FIN.includes('id="lender-embed-note" style="color:#86efac;text-align:center;font-size:12px;font-style:italic;margin-bottom:14px">H.I.L. Financial starts with a soft credit check that will not affect your credit score.</p>'), 'L001 embed default unchanged');
  const L2 = configs().L002;
  assert.ok(!/soft (credit )?(check|pull)/i.test(Object.values(L2.embedCopy).join(' ')), 'Wheelhouse copy still makes no soft-pull claim');
});

// FIN-PREFILL A (Chief 1 offline order as narrowed by Chief 2 -329 and the Owner/Chief 1 'ATC baseline,
// minimum privacy correction' direction): non-borrower Seller Information only; no new buyer PII anywhere.
function flow(routeCode, canonical, business, res) {
  const els = {};
  const el = (id) => els[id] || (els[id] = { id, style: {}, textContent: '', children: [], appendChild(c) { this.children.push(c); }, scrollIntoView() {} });
  const made = [];
  const ctx = {
    document: { getElementById: el, createElement: (t) => { const e = { tag: t, style: {}, children: [], appendChild(c) { this.children.push(c); } }; made.push(e); return e; } },
    window: { scrollTo() {}, addEventListener() {} }, encodeURIComponent, Object, Math, parseInt, String, console
  };
  vm.runInNewContext(slice('const LENDER_FORM_CONFIGS = {', '\nlet pendingLender') + '\nlet pendingLender = null;\n' +
    slice('function showSuccess()', 'function submitBusinessInfo()') +
    '\nthis.go = handleLeadCreated; this.reveal = revealLenderEmbed; this.setBiz = function (b) { pendingLender.business = b; };', ctx);
  ctx.go(Object.assign({ lead_id: 'lead-synthetic-1', route_code: routeCode, success: true }, res || {}), canonical);
  if (business) { ctx.setBiz(business); ctx.reveal(); }
  const iframe = made.find((e) => e.tag === 'iframe'); const a = made.find((e) => e.tag === 'a');
  return { els, iframe, a, q: iframe ? [...new URL(iframe.src).searchParams.entries()] : null };
}
const CANON = { source: 'torque_hub_listing', dealer: 'Auto Connection 210 LLC', stock_number: 'ATC-000001', vehicle_title: '2019 Synthetic Truck',
  buyer_name: 'Pat Q Tester', buyer_email: 'pat@example.test', buyer_phone: '(000) 555-0100', business_name: 'Tester Hauling LLC', vehicle_price: '25500' };
const BIZ = { business_type: 'LLC', time_in_business: '3-5 years', business_street: '1 Test St Ste 9', business_city: 'Testville', business_state: 'NC', business_zip: '00000' };
const BASELINE_KEYS = ['field196509669', 'field196509670', 'field196509673', 'field196509672', 'field196509676', 'field196509677', 'field196509678', 'field196509679',
  'field157836337', 'field157805829', 'field157805830', 'field157805832-address', 'field157805832-city', 'field157805832-state', 'field157805832-zip'];

test('FA-1 L001: ATC baseline parameters unchanged + exactly three Seller Information params; note shown', () => {
  const r = flow('L001', CANON, BIZ);
  const keys = r.q.map(([k]) => k);
  assert.deepEqual(keys.filter((k) => !BASELINE_KEYS.includes(k)).sort(), ['field157837213', 'field157943120', 'field157943199'], 'only the seller page is new');
  assert.equal(new Set(keys).size, keys.length, 'no duplicate parameter');
  const m = Object.fromEntries(r.q);
  assert.equal(m.field157837213, 'Auto Connection 210 LLC'); assert.equal(m.field157943120, '2019 Synthetic Truck'); assert.equal(m.field157943199, '25500');
  assert.equal(m.field196509670, m.field157837213); assert.equal(m.field196509672, m.field157943120);
  assert.equal(m['field157805832-address'], '1 Test St Ste 9', 'suite rides with the already-mapped business street');
  assert.equal(r.els['lender-embed-prefill-note'].style.display, 'block');
  assert.equal(r.els['lender-embed-prefill-note'].textContent, 'We filled in the seller, equipment, and price estimate from your Torque Hub request. Check them before you submit.');
});

test('FA-2 no new borrower PII: principal, cell, contact, company phone/email, SSN, EIN, ownership, home address never sent', () => {
  const r = flow('L001', CANON, BIZ);
  const keys = r.q.map(([k]) => k);
  for (const bad of ['field157836339-first', 'field157836339-last', 'field157836480', 'field157805831-first', 'field157805831-last',
    'field157836335', 'field157836336', 'field157836479', 'field196511541', 'field157939678', 'field157836481-address', 'field157942589-first', 'field157837359[]'])
    assert.ok(!keys.includes(bad), bad);
  const pii = Object.entries(r.q).filter(([, [k, v]]) => /Pat|pat@|555-0100/.test(v)).map(([, [k]]) => k).sort();
  assert.deepEqual(pii, ['field196509676', 'field196509677', 'field196509678'], 'buyer PII only in the pre-existing ATC hidden fields');
});

test('FA-3 Wheelhouse unchanged: empty fieldMap; whatType only from the server; fallback link identical; no note', () => {
  for (const code of ['L002'].concat(ASH_CODES)) {
    const r = flow(code, CANON, null, { vehicle_ref: '2019 Synthetic Truck — Stock X-1 — Torque Hub' });
    assert.deepEqual(r.q, [['whatType', '2019 Synthetic Truck — Stock X-1 — Torque Hub']], code);
    assert.equal(r.a.href, r.iframe.src, code);
    assert.notEqual(r.els['lender-embed-prefill-note'] && r.els['lender-embed-prefill-note'].style.display, 'block', code);
  }
});

test('FA-4 (-330 F2) price: never for a Torque Hub unit; external = trimmed buyer estimate; nothing otherwise', () => {
  const canon = slice('const canonical = {', '\n  };');
  const expr = canon.split('vehicle_price:')[1].trim();
  assert.ok(!/listingPrice|torqueHub/.test(expr), 'no inventory price path');
  const fn = vm.runInNewContext('(function (financeSubject) { return ' + expr.replace(/\n\s*/g, ' ') + '; })');
  for (const th of [{ listingPrice: '25500', sold: false }, { listingPrice: '25500', sold: true }, { listingPrice: 'Call' }])
    assert.equal(fn({ mode: 'torque_hub', torqueHub: th, external: { externalPrice: '9' } }), '', JSON.stringify(th));
  assert.equal(fn({ mode: 'external', external: { externalPrice: ' 15000 ' } }), '15000');
  assert.equal(fn({ mode: 'external', external: { externalPrice: '' } }), '');
  assert.equal(fn({ mode: 'none', external: { externalPrice: '15000' } }), '');
});

test('FA-8 (-330 F1) notice appears only when a Seller Information field was filled, and names exactly those fields', () => {
  const t = (c) => { const r = flow('L001', Object.assign({}, CANON, c), BIZ); const n = r.els['lender-embed-prefill-note'];
    return n && n.style.display === 'block' ? n.textContent : null; };
  assert.equal(t({ vehicle_price: '' }), 'We filled in the seller and equipment from your Torque Hub request. Check them before you submit.');
  assert.equal(t({ dealer: '', vehicle_price: '' }), 'We filled in the equipment from your Torque Hub request. Check it before you submit.');
  assert.equal(t({ dealer: '', vehicle_title: '' }), 'We filled in the price estimate from your Torque Hub request. Check it before you submit.');
  assert.equal(t({ dealer: '', vehicle_title: '', vehicle_price: '' }), null, 'baseline-only params (source, lead_id, business) -> no notice');
  assert.equal(t({ dealer: null, vehicle_title: undefined, vehicle_price: '' }), null);
});

test('FA-5 empty / missing values are skipped; nothing new when the subject is unknown', () => {
  const r = flow('L001', { source: 'torque_hub_listing', dealer: '', stock_number: '', vehicle_title: '', vehicle_price: '', buyer_name: 'Pat' },
    { business_type: 'LLC', time_in_business: '', business_street: '', business_city: '', business_state: '', business_zip: '' });
  assert.deepEqual(Object.fromEntries(r.q), { field196509669: 'torque_hub_listing', field196509676: 'Pat', field196509679: 'lead-synthetic-1', field157836337: 'LLC' });
});

test('FA-6 special characters encode and round-trip; injection cannot add a parameter', () => {
  const r = flow('L001', Object.assign({}, CANON, { dealer: 'A&B Sales #1', vehicle_title: '2020 Make "X" & Co=1 / 100%' }), BIZ);
  const m = Object.fromEntries(r.q);
  assert.equal(m.field157837213, 'A&B Sales #1'); assert.equal(m.field157943120, '2020 Make "X" & Co=1 / 100%');
  assert.equal(r.q.length, BASELINE_KEYS.length + 3);
});

test('FA-7 business step: suite appended only for the lender form; stored suite field unchanged', () => {
  const biz = slice('pendingLender.business = {', 'revealLenderEmbed();');
  assert.ok(biz.includes('business_street: business_street2 ? business_street + " " + business_street2 : business_street'));
  const upd = slice('fetch("/.netlify/functions/update-finance-lead"', '}).then(');
  assert.ok(upd.includes('business_street2: business_street2 || null'));
});
