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

test('LE-1: exactly L001, L002 and the eleven Ash codes; L001 Formstack config = single-entry map; no default route', () => {
  const C = configs();
  assert.deepEqual(Object.keys(C), ['L001', 'L002'].concat(ASH_CODES));
  assert.deepEqual(JSON.parse(JSON.stringify(C.L001)), {
    lenderName: 'H.I.L. Financial', provider: 'formstack', formUrl: 'https://twaddle.formstack.com/forms/vehiclenetwork',
    fieldMap: {
      source: 'field196509669', dealer: ['field196509670', 'field157837213'], stock_number: 'field196509673',
      vehicle_title: ['field196509672', 'field157943120'], listing_price: 'field157943199', price_estimate: 'field157943199',
      buyer_name: 'field196509676', buyer_email: 'field196509677', buyer_phone: 'field196509678',
      lead_id: 'field196509679',
      contact_name_first: 'field157805831-first', contact_name_last: 'field157805831-last',
      owner_name_first: 'field157836339-first', owner_name_last: 'field157836339-last', owner_phone: 'field157836480',
      company_phone: 'field157836335', company_email: 'field157836336',
      business_type: 'field157836337', business_name: 'field157805829', time_in_business: 'field157805830',
      business_street: 'field157805832-address', business_city: 'field157805832-city',
      business_state: 'field157805832-state', business_zip: 'field157805832-zip'
    },
    prefillNotice: { owner_name_first: 'owner name', owner_phone: 'cell phone', dealer: 'seller', vehicle_title: 'equipment',
      listing_price: 'price as listed when you submitted', price_estimate: 'price estimate' },
    softCheckClaim: true
  });
  assert.ok(FIN.includes('const cfg = (res && res.route_code) ? LENDER_FORM_CONFIGS[res.route_code] : null;\n  if (!cfg) { showSuccess(); return; }'),
    'an unmapped route still falls through to showSuccess');
  assert.ok(FIN.includes('>H.I.L. Financial starts with a soft credit check that will not affect your credit score.</p>'), 'L001 default copy kept');
});

test('LE-2: L002 is the Wheelhouse Jotform with single-entry prefill, owner-only business step and no soft-pull claim', () => {
  const L = configs().L002;
  assert.equal(L.provider, 'jotform');
  assert.equal(L.lenderName, 'Wheelhouse Lease and Finance');
  assert.equal(L.formUrl, 'https://form.jotform.com/211335844728156');
  assert.equal(L.jotformId, '211335844728156');
  assert.ok(L.formUrl.endsWith('/' + L.jotformId) && !L.formUrl.includes('?'));
  assert.deepEqual(JSON.parse(JSON.stringify(L.fieldMap)), { name_first: 'name[first]', name_last: 'name[last]',
    buyer_phone: 'phoneNumber185[full]', buyer_email: 'email', business_name: 'businessName', employer_name: 'presentEmployer29',
    employer_phone: 'phoneNumber', employer_addr_line1: 'address[addr_line1]', employer_addr_line2: 'address[addr_line2]',
    employer_city: 'address[city]', employer_state: 'address[state]', employer_zip: 'address[postal]',
    down_payment_label: 'howMuch' }, 'only values the buyer already gave Torque Hub (employer values only via the owner Yes)');
  assert.equal(L.refPrefill.label, 'equipment type');
  assert.equal(L.businessStepWhen, 'owner_with_business');
  assert.equal(L.softCheckClaim, undefined, 'Wheelhouse makes no soft-check claim');
  assert.ok(!/skipBusinessInfo/.test(FIN), 'old skip flag deleted');
  const copy = Object.values(L.embedCopy).join(' ');
  assert.ok(!/soft (credit )?(check|pull)/i.test(copy), 'no soft-pull claim for Wheelhouse');
  assert.ok(/not complete until you submit/i.test(L.embedCopy.intro), 'inquiry vs application distinguished');
  assert.ok(/not received or stored by Torque Hub/.test(L.embedCopy.note));
});

test('LE-3: the skip decision happens before the business step is shown; L001 still always gets it', () => {
  const h = slice('function handleLeadCreated(', 'function attachJotformResize(');
  const skip = h.indexOf('if (!businessStepNeeded(cfg, canonical)) { revealLenderEmbed(); return; }');
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
    encodeURIComponent, Object, Math, parseInt, console, Date
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

test('LE-6: each Ash code shows the L002 Wheelhouse embed after acceptance; non-owner buyer: no business step, same prefill', () => {
  const ref = runFlow('L002');
  assert.equal(ref.iframe.src, 'https://form.jotform.com/211335844728156?name[first]=TEST', 'one-word name -> first only');
  for (const code of ASH_CODES) {
    const r = runFlow(code);
    assert.ok(r.iframe, code + ' iframe');
    assert.equal(r.iframe.src, ref.iframe.src, code + ' same form, same params');
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

// FIN-SINGLE-ENTRY (Chief 1 Owner-decision directive): the buyer types nothing twice. Owner/guarantor and
// employer values only on an owner Yes; Torque Hub unit price only from the server. Synthetic values only.
function flow(routeCode, canonical, business, res, revealAfterMs) {
  const clock = { t: 1795000000000 };
  const els = {};
  const el = (id) => els[id] || (els[id] = { id, style: {}, textContent: '', children: [], appendChild(c) { this.children.push(c); }, scrollIntoView() {} });
  const made = [];
  const ctx = {
    document: { getElementById: el, createElement: (t) => { const e = { tag: t, style: {}, children: [], appendChild(c) { this.children.push(c); } }; made.push(e); return e; } },
    window: { scrollTo() {}, addEventListener() {} }, encodeURIComponent, Object, Math, parseInt, String, console,
    Date: { now: () => clock.t, parse: Date.parse }
  };
  vm.runInNewContext(slice('const LENDER_FORM_CONFIGS = {', '\nlet pendingLender') + '\nlet pendingLender = null;\n' +
    slice('function showSuccess()', 'function submitBusinessInfo()') +
    '\nthis.go = handleLeadCreated; this.reveal = revealLenderEmbed; this.setBiz = function (b) { pendingLender.business = b; }; this.split = splitName; this.pv = prefillValues; this.need = businessStepNeeded;', ctx);
  ctx.go(Object.assign({ lead_id: 'lead-synthetic-1', route_code: routeCode, success: true }, res || {}), canonical);
  if (business) { clock.t += (revealAfterMs || 0); ctx.setBiz(business); ctx.reveal(); }
  const iframe = made.find((e) => e.tag === 'iframe'); const a = made.find((e) => e.tag === 'a');
  const note = els['lender-embed-prefill-note'];
  return { els, iframe, a, q: iframe ? [...new URL(iframe.src).searchParams.entries()] : null, note: note && note.style.display === 'block' ? note.textContent : null, ctx };
}
const CANON = { source: 'torque_hub_listing', dealer: 'Auto Connection 210 LLC', stock_number: 'ATC-000001', vehicle_title: '2019 Synthetic Truck',
  buyer_name: 'Pat Q Tester', buyer_email: 'pat@example.test', buyer_phone: '(000) 555-0100', business_name: 'Tester Hauling LLC',
  owner_confirmed: true, down_payment_label: '$2,500 - $5,000', vehicle_price: '' };
const BIZ = { business_type: 'LLC', time_in_business: '3-5 years', business_street: '1 Test St Ste 9', business_city: 'Testville', business_state: 'NC', business_zip: '00000' };
const C2 = (o) => Object.assign({}, CANON, o);
// v4: the business object exactly as submitBusinessInfo stores it (combined street for H.I.L., lines kept for Wheelhouse).
const BIZW = Object.assign({}, BIZ, { business_street_line1: '1 Test St', business_street_line2: 'Ste 9' });
const T0 = 1795000000000;                       // flow() clock start = response receipt time
const AS_OF = new Date(T0).toISOString();       // server snapshot stamped at the same instant

test('SE-1 L001 owner Yes: principal name/cell, contact name, company phone/email, seller page, verified price; exact params', () => {
  const r = flow('L001', CANON, BIZ, { vehicle_price: '25500', vehicle_price_as_of: AS_OF });
  assert.deepEqual(Object.fromEntries(r.q), {
    field196509669: 'torque_hub_listing', field196509670: 'Auto Connection 210 LLC', field157837213: 'Auto Connection 210 LLC',
    field196509673: 'ATC-000001', field196509672: '2019 Synthetic Truck', field157943120: '2019 Synthetic Truck', field157943199: '25500',
    field196509676: 'Pat Q Tester', field196509677: 'pat@example.test', field157836336: 'pat@example.test',
    field196509678: '(000) 555-0100', field157836335: '(000) 555-0100', field196509679: 'lead-synthetic-1',
    'field157805831-first': 'Pat Q', 'field157805831-last': 'Tester',
    'field157836339-first': 'Pat Q', 'field157836339-last': 'Tester', field157836480: '(000) 555-0100',
    field157836337: 'LLC', field157805829: 'Tester Hauling LLC', field157805830: '3-5 years',
    'field157805832-address': '1 Test St Ste 9', 'field157805832-city': 'Testville', 'field157805832-state': 'NC', 'field157805832-zip': '00000'
  });
  assert.equal(new Set(r.q.map(([k]) => k)).size, r.q.length, 'no duplicate parameter');
  assert.equal(r.note, "To save you retyping, Torque Hub filled in H.I.L. Financial's form with details from your Torque Hub request: owner name, cell phone, seller, equipment, and price as listed when you submitted. Check them before you submit.");
});

test('SE-2 L001 owner No (or anything but boolean true): Principal Ownership and Company Phone/Email left blank; contact name + hidden buyer fields kept', () => {
  for (const o of [false, undefined, 'yes', 1]) {
    const r = flow('L001', C2({ owner_confirmed: o }), BIZ, { vehicle_price: '25500', vehicle_price_as_of: AS_OF });
    const keys = r.q.map(([k]) => k);
    for (const k of ['field157836339-first', 'field157836339-last', 'field157836480', 'field157836335', 'field157836336']) assert.ok(!keys.includes(k), String(o) + ' ' + k);
    for (const k of ['field157805831-first', 'field157805831-last', 'field196509676', 'field196509677', 'field196509678']) assert.ok(keys.includes(k), String(o) + ' ' + k);
    assert.equal(r.note, "To save you retyping, Torque Hub filled in H.I.L. Financial's form with details from your Torque Hub request: seller, equipment, and price as listed when you submitted. Check them before you submit.");
  }
});

test('SE-3 Wheelhouse (all 12 codes) owner Yes: name/phone/email/business/employer/employer phone+address/down payment + whatType; note exact', () => {
  for (const code of ['L002'].concat(ASH_CODES)) {
    const r = flow(code, C2({ credit_score: 'Not sure', monthly_revenue: '$50,000+', timeframe: 'asap' }), BIZW, { vehicle_ref: '2019 Synthetic Truck — Stock X-1 — Torque Hub' });
    assert.deepEqual(r.q, [['name[first]', 'Pat Q'], ['name[last]', 'Tester'], ['phoneNumber185[full]', '(000) 555-0100'], ['email', 'pat@example.test'],
      ['businessName', 'Tester Hauling LLC'], ['presentEmployer29', 'Tester Hauling LLC'], ['phoneNumber', '0005550100'],
      ['address[addr_line1]', '1 Test St'], ['address[addr_line2]', 'Ste 9'], ['address[city]', 'Testville'], ['address[state]', 'NC'], ['address[postal]', '00000'],
      ['howMuch', '$2,500 - $5,000'], ['whatType', '2019 Synthetic Truck — Stock X-1 — Torque Hub']], code);
    assert.equal(r.note, "To save you retyping, Torque Hub filled in Wheelhouse Lease and Finance's form with details from your Torque Hub request: name, phone, email, business name, present employer, employer/business phone, employer address, down payment, and equipment type. Check them before you submit.", code);
    assert.equal(r.a.href, 'https://form.jotform.com/211335844728156?whatType=' + encodeURIComponent('2019 Synthetic Truck — Stock X-1 — Torque Hub'), code + ' new-tab fallback carries no buyer data');
  }
});

test('SE-4 Wheelhouse owner No: no Present Employer; everything else still filled', () => {
  const r = flow('L012', C2({ owner_confirmed: false }), null, {});
  assert.deepEqual(r.q.map(([k]) => k), ['name[first]', 'name[last]', 'phoneNumber185[full]', 'email', 'businessName', 'howMuch']);
  assert.equal(r.a.href, 'https://form.jotform.com/211335844728156');
});

test('SE-5 price: server value only for a Torque Hub unit; invalid server values ignored; external = buyer estimate', () => {
  const p = (canon, res) => Object.fromEntries(flow('L001', C2(canon), BIZ, res).q).field157943199;
  assert.equal(p({}, { vehicle_price: '45000', vehicle_price_as_of: AS_OF }), '45000');
  for (const bad of ['', 'Call', '$45,000', '0x10', '1e9', 45000, null]) assert.equal(p({}, { vehicle_price: bad, vehicle_price_as_of: AS_OF }), undefined, String(bad));
  assert.equal(p({ vehicle_price: '15000' }, {}), '15000', 'external estimate (canonical only carries it in external mode)');
  assert.equal(flow('L001', C2({ vehicle_price: '15000' }), BIZ, {}).note.includes('price estimate'), true);
  assert.equal(p({ vehicle_price: '15000' }, { vehicle_price: '45000', vehicle_price_as_of: AS_OF }), '45000', 'a verified server price wins');
  const age = (ms) => Object.fromEntries(flow('L001', C2({}), BIZ, { vehicle_price: '45000', vehicle_price_as_of: AS_OF }, ms).q).field157943199;
  assert.equal(age(14 * 60 * 1000), '45000', '14 min: used'); assert.equal(age(15 * 60 * 1000), '45000', 'exactly 15 min: used');
  assert.equal(age(15 * 60 * 1000 + 1), undefined, 'older than 15 min: omitted'); assert.equal(age(-5000), undefined, 'clock went backwards: omitted');
  assert.ok(!flow('L001', C2({}), BIZ, { vehicle_price: '45000', vehicle_price_as_of: AS_OF }, 20 * 60 * 1000).note.includes('price'), 'stale price not named in the notice');
  const canon = slice('const canonical = {', '\n  };');
  assert.ok(/vehicle_price: financeSubject\.mode === 'external'/.test(canon) && !/listingPrice/.test(canon.split('vehicle_price:')[1]), 'no cached browser price');
});

test('SE-6 never sensitive: no SSN/DOB/EIN/income/home address/ownership %/consent/credit in any map or URL', () => {
  const C = configs();
  const deny = /ssn|social|dob|birth|ein|tax|income|gross|revenue|credit|consent|privacy|ihereby|percent|home|bankrupt|collection|timeframe/i;
  const ids = ['157836479', '157942591', '196511541', '157836481', '157939678', '157942590', '157942593', '157942589', '157837359', '157836548',
    'socialSecurity', 'eintaxId', 'grossMonthly80', 'address76', 'dataPrivacy', 'iHereby', 'ownership', 'homeOwnership', 'howLong77', 'llcWas'];
  for (const code of ['L001', 'L002']) for (const [k, v] of Object.entries(C[code].fieldMap)) {
    assert.ok(!deny.test(k), code + ' key ' + k);
    for (const f of [].concat(v)) for (const bad of ids) assert.ok(!f.includes(bad), code + ' ' + f);
  }
  for (const code of ['L001', 'L012']) {
    const r = flow(code, C2({ credit_score: 'Below 600', monthly_revenue: '$5,000 – $10,000', timeframe: '30days', ssn: '000-00-0000', dob: '1990-01-01' }), code === 'L001' ? BIZ : BIZW, {});
    for (const x of ['Below', '10,000', '30days', '000-00-0000', '1990-01-01']) assert.ok(!decodeURIComponent(r.iframe.src).includes(x), code + ' ' + x);
  }
  assert.ok(!flow('L012', CANON, BIZW, {}).iframe.src.includes('lead-synthetic-1'), 'no lead id to Wheelhouse');
});

test('SE-7 empty values skipped; nothing entered -> bare URL and no note', () => {
  const r = flow('L004', { buyer_name: 'Cher', buyer_email: '', buyer_phone: '', business_name: null, owner_confirmed: true, down_payment_label: '' }, null, {});
  assert.deepEqual(r.q, [['name[first]', 'Cher']]);
  assert.equal(r.note, "To save you retyping, Torque Hub filled in Wheelhouse Lease and Finance's form with details from your Torque Hub request: name. Check it before you submit.");
  const z = flow('L004', { buyer_name: '' }, null, {});
  assert.equal(z.iframe.src, 'https://form.jotform.com/211335844728156'); assert.equal(z.note, null);
  const v = flow('L004', { buyer_name: '' }, null, { vehicle_ref: 'X — Stock Y — Torque Hub' });
  assert.equal(v.note, "To save you retyping, Torque Hub filled in Wheelhouse Lease and Finance's form with details from your Torque Hub request: equipment type. Check it before you submit.");
});

test('SE-8 splitName: last word is the last name; one word = first only; extra spaces trimmed', () => {
  const s = flow('L004', { buyer_name: 'x' }, null, {}).ctx.split; const j = (v) => JSON.parse(JSON.stringify(v));
  assert.deepEqual(j(s('Pat Tester')), { first: 'Pat', last: 'Tester' });
  assert.deepEqual(j(s('  Mary  Ann   de   Vries ')), { first: 'Mary Ann de', last: 'Vries' });
  assert.deepEqual(j(s('Cher')), { first: 'Cher', last: '' });
  assert.deepEqual(j(s('John Smith Jr.')), { first: 'John', last: 'Smith Jr.' });
  assert.deepEqual(j(s('Pat Q Tester III')), { first: 'Pat Q', last: 'Tester III' });
  assert.deepEqual(j(s('Pat Jr')), { first: 'Pat', last: 'Jr' }, 'two words: plain split');
  for (const v of ['', null, undefined, '   ']) assert.deepEqual(j(s(v)), { first: '', last: '' });
});

test('SE-9 special characters encode and round-trip; injection cannot add a parameter', () => {
  const r = flow('L007', C2({ buyer_name: "José O'Neil-Smith", business_name: 'A&B #1 Hauling/Repair 100%', buyer_email: 'a+b@example.test' }),
    Object.assign({}, BIZW, { business_street_line1: '5 Elm & Oak #2', business_street_line2: '' }), {});
  const m = Object.fromEntries(r.q);
  assert.equal(m['name[first]'], 'José'); assert.equal(m['name[last]'], "O'Neil-Smith");
  assert.equal(m.businessName, 'A&B #1 Hauling/Repair 100%'); assert.equal(m.presentEmployer29, 'A&B #1 Hauling/Repair 100%'); assert.equal(m.email, 'a+b@example.test');
  assert.equal(m['address[addr_line1]'], '5 Elm & Oak #2');
  assert.equal(r.q.length, 12, '7 v3 params + employer phone + 4 address parts (empty suite skipped)');
});

test('SE-10 Phase 1: owner question present and required; answer kept in the page only (not sent to the server)', () => {
  assert.ok(FIN.includes('<select id="f-owner" required>') && FIN.includes('<option value="yes">Yes: I\'m the owner/principal applying, this is my current business, and my phone and email above are its contact details</option>') && FIN.includes('<option value="no">No</option>'));
  assert.ok(FIN.includes('Are you the business owner applying for this loan?'));
  assert.ok(FIN.includes('if (ownerAnswer !== "yes" && ownerAnswer !== "no") { alert('), 'must be answered');
  const canon = slice('const canonical = {', '\n  };');
  assert.ok(canon.includes('owner_confirmed: ownerAnswer === "yes"'));
  assert.ok(canon.includes('down_payment_label: downPayment ? document.getElementById("f-down-payment").selectedOptions[0].text : ""'));
  const pay = slice('function submitFinance()', 'const canonical = {');
  assert.ok(!/owner_confirmed|owner:/.test(pay), 'no owner key added to the server payload');
});

test('SE-11 business step: suite appended only for the lender form; stored suite field unchanged', () => {
  const biz = slice('const handoff = {', 'if (pendingLender.cfg');
  assert.ok(biz.includes('business_street: business_street2 ? business_street + " " + business_street2 : business_street'));
  const upd = slice('fetch("/.netlify/functions/update-finance-lead"', '}).then(');
  assert.ok(upd.includes('business_street2: business_street2 || null'));
});

test('SE-12 owner Yes with no business name: no employer / Company Name; help text explains what Yes means', () => {
  const r = flow('L012', C2({ business_name: '' }), null, {});
  assert.ok(!r.q.some(([k]) => k === 'presentEmployer29' || k === 'businessName'));
  const l1 = flow('L001', C2({ business_name: '' }), Object.assign({}, BIZ), {});
  assert.ok(!l1.q.some(([k]) => k === 'field157805829'));
  assert.ok(FIN.includes('<p id="f-owner-help"') && FIN.includes('No leaves those fields for you to complete.'));
});

test('SE-13 -332 P1: iframe sends no referrer; no analytics call or log line touches the lender URL or prefill values', () => {
  const r = flow('L012', CANON, BIZW, {});
  assert.equal(r.iframe.referrerPolicy, 'no-referrer');
  const reveal = slice('function revealLenderEmbed()', 'function submitBusinessInfo()');
  assert.ok(!/gtag\(|fbq\(|dataLayer|console\.(log|info|warn|error)/.test(reveal), 'no telemetry inside the lender handoff');
  for (const m of FIN.matchAll(/(gtag|fbq)\([^;]*;/g)) assert.ok(!/allParams|iframe|\.src|prefill|buyer_|name\[first\]/.test(m[0]), m[0].slice(0, 60));
});

test('SE-14 -333 F3: price age is measured from the SERVER vehicle_price_as_of stamp; boundaries and malformed stamps fail closed', () => {
  const price = (asOf, revealAfterMs) => Object.fromEntries(flow('L001', C2({}), BIZ, { vehicle_price: '45000', vehicle_price_as_of: asOf }, revealAfterMs).q).field157943199;
  const iso = (ms) => new Date(ms).toISOString();
  const M = 15 * 60 * 1000;
  // snapshot stamped earlier than receipt (slow response / queued tab): server age governs
  assert.equal(price(iso(T0 - M), 0), '45000', 'snapshot exactly 15 min old at handoff: used');
  assert.equal(price(iso(T0 - M - 1), 0), undefined, 'snapshot 15 min + 1 ms old: omitted even though just received');
  assert.equal(price(iso(T0 - 5 * 60 * 1000), 10 * 60 * 1000), '45000', '5 min before receipt + 10 min business step = 15 min: used');
  assert.equal(price(iso(T0 - 5 * 60 * 1000), 10 * 60 * 1000 + 1), undefined, '15 min + 1 ms total: omitted');
  // future stamp (server ahead of the browser clock) -> omitted
  assert.equal(price(iso(T0 + 1), 0), undefined, 'stamp 1 ms in the future: omitted');
  // missing / malformed / non-UTC / non-string stamps -> omitted
  for (const bad of [undefined, null, '', 'yesterday', '2026-11-20', '2026-11-20T21:00:00', '2026-11-20T21:00:00+00:00', '2026-13-45T99:99:99Z', 1795000000000])
    assert.equal(price(bad, 0), undefined, String(bad));
  // same instant, wrong format (not the server's UTC 'Z' ISO form) -> omitted by the format check alone
  for (const v of [iso(T0).replace('Z', '+00:00'), iso(T0).slice(0, 19), ' ' + iso(T0), iso(T0).toLowerCase()]) assert.equal(price(v, 0), undefined, v);
  // the receipt-time safeguard still applies on its own
  assert.equal(price(iso(T0), M + 1), undefined, 'fresh stamp but response held > 15 min: omitted');
  // a fresh stamp names the price in the notice; an expired one does not
  assert.ok(flow('L001', C2({}), BIZ, { vehicle_price: '45000', vehicle_price_as_of: iso(T0) }, 0).note.includes('price as listed when you submitted'));
  assert.ok(!flow('L001', C2({}), BIZ, { vehicle_price: '45000', vehicle_price_as_of: iso(T0 - M - 1) }, 0).note.includes('price'));
});

// FIN-SINGLE-ENTRY v4 (Chief 1 bounded offline GO): Wheelhouse Employer/Business phone (q94) and Employer Address
// (q92) from what the buyer already gave Torque Hub, only on owner Yes with a named business. q89 (years/months
// with the Company) and q178 (Ownership %) are never sent. Synthetic values only.
const WH = "Wheelhouse Lease and Finance's form";
const whKeys = (r) => r.q.map(([k]) => k);

test('V4-1 Wheelhouse owner Yes + business: business step shown WITHOUT the soft-check line; L001 shows it', () => {
  for (const code of ['L002'].concat(ASH_CODES)) {
    const r = flow(code, CANON, null, {});
    assert.equal(r.iframe, undefined, code + ' waits for business info');
    assert.equal(r.els['business-info'].style.display, 'block', code);
    assert.equal(r.els['business-soft-check'].style.display, 'none', code + ' no soft-check claim for Wheelhouse');
  }
  const h = flow('L001', CANON, null, {});
  assert.equal(h.els['business-info'].style.display, 'block');
  assert.equal(h.els['business-soft-check'].style.display, 'block', 'H.I.L. keeps its soft-check line');
  assert.ok(FIN.includes('<p id="business-soft-check" style="display:none;'), 'hidden by default in the HTML');
});

test('V4-2 Wheelhouse owner No / not boolean true / no business name: business step skipped; URL identical to v3', () => {
  for (const o of [false, undefined, 'yes', 1, null]) {
    const r = flow('L012', C2({ owner_confirmed: o }), null, {});
    assert.ok(r.iframe, String(o) + ' straight to the lender form');
    assert.notEqual(r.els['business-info'].style.display, 'block');
    assert.deepEqual(whKeys(r), ['name[first]', 'name[last]', 'phoneNumber185[full]', 'email', 'businessName', 'howMuch'], String(o));
  }
  // (Phase 1 trims the business name, so a whitespace-only name never reaches here; V4-3 covers it at the gate.)
  for (const b of ['', null, undefined]) {
    const r = flow('L012', C2({ business_name: b }), null, {});
    assert.ok(r.iframe, JSON.stringify(b) + ' skipped');
    assert.deepEqual(whKeys(r), ['name[first]', 'name[last]', 'phoneNumber185[full]', 'email', 'howMuch'], JSON.stringify(b) + ' no employer values');
  }
});

test('V4-3 gates hold inside prefillValues even if business data were present (owner No / blank business)', () => {
  const pv = flow('L012', C2({ owner_confirmed: false }), null, {}).ctx.pv;
  const emp = ['employer_phone', 'employer_addr_line1', 'employer_addr_line2', 'employer_city', 'employer_state', 'employer_zip'];
  for (const canon of [C2({ owner_confirmed: false }), C2({ owner_confirmed: 'yes' }), C2({ business_name: '' }), C2({ business_name: '  ' })]) {
    const v = pv(canon, BIZW, {}, 0, T0);
    for (const k of emp) assert.equal(v[k], '', JSON.stringify(canon.owner_confirmed) + '/' + JSON.stringify(canon.business_name) + ' ' + k);
  }
  const yes = pv(CANON, BIZW, {}, 0, T0);
  assert.equal(yes.employer_phone, '0005550100'); assert.equal(yes.employer_addr_line1, '1 Test St');
});

test('V4-4 q94 phone: digits only, exactly 10 (leading US 1 dropped); anything else omitted and not named', () => {
  const ph = (p) => Object.fromEntries(flow('L012', C2({ buyer_phone: p }), BIZW, {}).q).phoneNumber;
  assert.equal(ph('(919) 555-1234'), '9195551234');
  assert.equal(ph('919.555.1234'), '9195551234');
  assert.equal(ph('+1 (919) 555-1234'), '9195551234');
  assert.equal(ph('19195551234'), '9195551234');
  for (const bad of ['', null, undefined, '555-1234', '29195551234', '+44 20 7946 0958', '919555123', '9195551234 x22', 'call me'])
    assert.equal(ph(bad), undefined, String(bad));
  const r = flow('L012', C2({ buyer_phone: '555-1234' }), BIZW, {});
  assert.ok(!r.note.includes('employer/business phone'), 'omitted phone is not claimed');
  assert.equal(Object.fromEntries(r.q)['phoneNumber185[full]'], '555-1234', 'applicant phone field unchanged (v3)');
});

test('V4-5 q92 address: business-step address only, all-or-nothing, suite as line 2; incomplete -> omitted and not named', () => {
  const r = flow('L012', CANON, BIZW, {});
  const m = Object.fromEntries(r.q);
  assert.deepEqual([m['address[addr_line1]'], m['address[addr_line2]'], m['address[city]'], m['address[state]'], m['address[postal]']], ['1 Test St', 'Ste 9', 'Testville', 'NC', '00000']);
  for (const drop of ['business_street_line1', 'business_city', 'business_state', 'business_zip']) {
    const x = flow('L012', CANON, Object.assign({}, BIZW, { [drop]: '' }), {});
    assert.ok(!whKeys(x).some((k) => k.startsWith('address[')), drop + ' missing -> no address params');
    assert.ok(!x.note.includes('employer address'), drop + ' missing -> not named');
  }
  const noSuite = Object.fromEntries(flow('L012', CANON, Object.assign({}, BIZW, { business_street_line2: '' }), {}).q);
  assert.equal(noSuite['address[addr_line2]'], undefined);
  // never from any other address: the combined H.I.L. street, canonical/dealer/home-like keys are not read
  const other = flow('L012', C2({ address: '9 Home Rd', home_address: '9 Home Rd', buyer_address: '9 Home Rd', dealer_address: '7 Lot Way', business_street: 'X' }),
    { business_street: '1 Test St Ste 9', business_city: 'Testville', business_state: 'NC', business_zip: '00000' }, {});
  assert.ok(!whKeys(other).some((k) => k.startsWith('address[')), 'no business_street_line1 -> no address (combined street not reused)');
  assert.ok(!/Home Rd|Lot Way/.test(decodeURIComponent(other.iframe.src)));
  assert.ok(!decodeURIComponent(r.iframe.src).includes('address76'), 'residence field never touched');
});

test('V4-6 q89 / q178: no time-in-business range and no ownership value ever reaches Wheelhouse (no false precision)', () => {
  const L = configs().L002;
  const fields = Object.values(L.fieldMap).flat().join(' ');
  for (const bad of ['yearsmonthsWith', 'q89', 'ownership', 'q178', 'howLong', 'address76']) assert.ok(!fields.includes(bad), bad);
  assert.ok(!('time_in_business' in L.fieldMap) && !('business_type' in L.fieldMap));
  for (const t of ['Less than 1 year', '1-2 years', '3-5 years', '5-10 years', '10+ years']) {
    const r = flow('L012', CANON, Object.assign({}, BIZW, { time_in_business: t }), {});
    assert.ok(!r.q.some(([, v]) => v === t), t + ' not sent');
    assert.ok(!r.q.some(([k]) => /yearsmonths|ownership/i.test(k)), t);
    assert.ok(!/years|ownership/i.test(r.note), t + ' notice names neither');
  }
});

test('V4-7 notice names only what is in the URL: every notice key is a mapped field, and named <=> sent (both lenders)', () => {
  const C = configs();
  for (const code of ['L001', 'L002']) for (const k of Object.keys(C[code].prefillNotice)) assert.ok(k in C[code].fieldMap, code + ' ' + k);
  const L = C.L002; const variants = [];
  for (const owner of [true, false]) for (const bn of ['Tester Hauling LLC', '']) for (const phone of ['(919) 555-1234', '555-1234', ''])
    for (const biz of [BIZW, Object.assign({}, BIZW, { business_zip: '' })]) variants.push([C2({ owner_confirmed: owner, business_name: bn, buyer_phone: phone }), biz]);
  for (const [canon, biz] of variants) {
    const r = flow('L012', canon, biz, {});
    const sent = new Set(whKeys(r));
    for (const [k, label] of Object.entries(L.prefillNotice)) {
      const params = [].concat(L.fieldMap[k]);
      const isSent = params.some((p) => sent.has(p));
      assert.equal(r.note ? r.note.includes(' ' + label + (label === 'name' ? ',' : '')) || r.note.includes(': ' + label) : false, isSent && !!r.note,
        JSON.stringify([canon.owner_confirmed, canon.business_name, canon.buyer_phone, biz.business_zip, k]));
    }
  }
});

test('V4-8 privacy carried forward: fallback link whatType-only, no-referrer, no lead id, nothing sensitive, L001 untouched by Wheelhouse keys', () => {
  const r = flow('L012', CANON, BIZW, { vehicle_ref: 'X — Stock Y — Torque Hub', lead_id: 'lead-synthetic-1' });
  assert.equal(r.a.href, 'https://form.jotform.com/211335844728156?whatType=' + encodeURIComponent('X — Stock Y — Torque Hub'));
  assert.equal(r.iframe.referrerPolicy, 'no-referrer');
  assert.ok(!r.iframe.src.includes('lead-synthetic-1'));
  const h = flow('L001', CANON, BIZW, {});
  assert.ok(!whKeys(h).some((k) => /^address\[|^phoneNumber$/.test(k)), 'no Jotform names in the H.I.L. URL');
  assert.equal(Object.fromEntries(h.q)['field157805832-address'], '1 Test St Ste 9', 'H.I.L. still gets the combined street');
});

test('V4-9 business step code: lines stored separately for Wheelhouse, update-finance-lead payload unchanged, step gate exact', () => {
  const biz = slice('const handoff = {', 'if (pendingLender.cfg');
  assert.ok(biz.includes('business_street_line1: business_street, business_street_line2: business_street2'));
  const upd = slice('fetch("/.netlify/functions/update-finance-lead"', '}).then(');
  assert.deepEqual((upd.match(/^\s+(\w+):/gm) || []).map((x) => x.trim().replace(':', '')),
    ['method', 'headers', 'body', 'lead_id', 'business_type', 'time_in_business', 'business_street', 'business_street2', 'business_city', 'business_state', 'business_zip']);
  const need = flow('L012', CANON, null, {}).ctx.need;
  const C = configs();
  assert.equal(need(C.L001, {}), true, 'L001 always');
  assert.equal(need(C.L012, CANON), true);
  for (const c of [{}, null, C2({ owner_confirmed: false }), C2({ business_name: ' ' })]) assert.equal(need(C.L012, c), false);
  assert.equal(need({ businessStepWhen: 'something-else' }, CANON), false, 'unknown rule fails closed (skip)');
});

// -335 AMEND (Chief 1 F1/F2): Wheelhouse business-step details are handoff-only. Runs the REAL submitBusinessInfo
// with stubbed fetch / fbq against the stub DOM. Synthetic values only.
async function bizFlow(code, canonical, fields) {
  const vals = Object.assign({ 'f-business-type': 'LLC', 'f-time-in-business': '3-5 years', 'f-business-street': '1 Test St',
    'f-business-street2': 'Ste 9', 'f-business-city': 'Testville', 'f-business-state': 'NC', 'f-business-zip': '00000' }, fields || {});
  const els = {};
  const el = (id) => els[id] || (els[id] = { id, value: vals[id] !== undefined ? vals[id] : '', style: {}, textContent: '', children: [],
    appendChild(c) { this.children.push(c); }, scrollIntoView() {} });
  const made = []; const fetches = []; const fbqs = [];
  const ctx = {
    document: { getElementById: el, createElement: (t) => { const e = { tag: t, style: {}, children: [], appendChild(c) { this.children.push(c); } }; made.push(e); return e; } },
    window: { scrollTo() {}, addEventListener() {} }, encodeURIComponent, Object, Math, parseInt, String, JSON, Date, Promise,
    console: { log() {}, info() {}, warn() {}, error() {} },
    fetch: (url, opt) => { fetches.push({ url, body: JSON.parse(opt.body) }); return Promise.resolve({ ok: true }); },
    fbq: function () { fbqs.push([].slice.call(arguments)); },
    financeSubject: { mode: 'torque_hub', torqueHub: { stock: 'X-1' } }, newEventId: () => 'evt-synthetic-1'
  };
  vm.runInNewContext(slice('const LENDER_FORM_CONFIGS = {', '\nlet pendingLender') + '\nlet pendingLender = null;\n' +
    slice('function showSuccess()', '\n</script>') + '\nthis.go = handleLeadCreated; this.submit = submitBusinessInfo;', ctx);
  ctx.go({ lead_id: '00000000-0000-4000-8000-000000000001', route_code: code, success: true }, canonical);
  const stepShown = els['business-info'] && els['business-info'].style.display === 'block';
  if (stepShown) { ctx.submit(); for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); }
  const iframe = made.find((e) => e.tag === 'iframe');
  return { stepShown, fetches, fbqs, iframe, q: iframe ? Object.fromEntries(new URL(iframe.src).searchParams.entries()) : null };
}

test('V4-10 -335 F1/F2: Wheelhouse L002-L013 owner Yes: no update-finance-lead call, no Meta event; q94/q92 still prefilled', async () => {
  for (const code of ['L002'].concat(ASH_CODES)) {
    const r = await bizFlow(code, CANON);
    assert.equal(r.stepShown, true, code + ' step shown (owner Yes + business)');
    assert.equal(r.fetches.length, 0, code + ' nothing sent to update-finance-lead');
    assert.equal(r.fbqs.length, 0, code + ' no SubmitApplication (or any Meta call)');
    assert.ok(r.iframe, code + ' lender form shown');
    assert.equal(r.q.phoneNumber, '0005550100', code);
    assert.deepEqual([r.q['address[addr_line1]'], r.q['address[addr_line2]'], r.q['address[city]'], r.q['address[state]'], r.q['address[postal]']],
      ['1 Test St', 'Ste 9', 'Testville', 'NC', '00000'], code);
    assert.equal(r.q.yearsmonthsWith, undefined, code); assert.equal(r.q.ownership, undefined, code);
  }
});

test('V4-11 L001 unchanged: one update-finance-lead call with the exact v3 payload, then exactly one SubmitApplication', async () => {
  const r = await bizFlow('L001', CANON);
  assert.equal(r.fetches.length, 1);
  assert.equal(r.fetches[0].url, '/.netlify/functions/update-finance-lead');
  assert.deepEqual(r.fetches[0].body, { lead_id: '00000000-0000-4000-8000-000000000001', business_type: 'LLC', time_in_business: '3-5 years',
    business_street: '1 Test St', business_street2: 'Ste 9', business_city: 'Testville', business_state: 'NC', business_zip: '00000' });
  assert.deepEqual(JSON.parse(JSON.stringify(r.fbqs)), [['track', 'SubmitApplication', { subject_mode: 'torque_hub', content_type: 'product', content_ids: ['X-1'] }, { eventID: 'evt-synthetic-1' }]]);
  assert.ok(r.iframe, 'H.I.L. form shown after save');
  assert.equal(r.q['field157805832-address'], '1 Test St Ste 9');
  assert.equal(r.q.phoneNumber, undefined, 'no Jotform keys on H.I.L.');
});

test('V4-12 all 13 routes x owner Yes/No: Meta and storage calls exactly as v3 (L001 only); owner No Wheelhouse skips the step', async () => {
  for (const code of ['L001', 'L002'].concat(ASH_CODES)) for (const owner of [true, false]) {
    const r = await bizFlow(code, C2({ owner_confirmed: owner }));
    const tag = code + ' owner=' + owner;
    if (code === 'L001') { assert.equal(r.fetches.length, 1, tag); assert.equal(r.fbqs.length, 1, tag); }
    else {
      assert.equal(r.stepShown, owner, tag + ' step only on owner Yes');
      assert.equal(r.fetches.length, 0, tag); assert.equal(r.fbqs.length, 0, tag);
      if (!owner) assert.ok(!('phoneNumber' in r.q) && !Object.keys(r.q).some((k) => k.startsWith('address[')), tag + ' no employer values');
    }
  }
});

test('V4-13 no new PII persistence or logging path: handoff branch precedes the fetch/event id; no storage APIs or console in the business step', () => {
  const sb = slice('function submitBusinessInfo()', '\n</script>');
  const handoffAt = sb.indexOf('if (pendingLender.cfg && pendingLender.cfg.businessStepHandoffOnly === true) {');
  assert.ok(handoffAt > 0 && handoffAt < sb.indexOf('newEventId()') && handoffAt < sb.indexOf('fetch('), 'handoff return happens before any id, fetch or Meta call');
  const branch = sb.slice(handoffAt, sb.indexOf('}', sb.indexOf('return;', handoffAt)) + 1);
  assert.ok(!/fetch|fbq|gtag|dataLayer|Storage|console|newEventId/.test(branch), 'handoff branch only stores in page state and reveals');
  assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(sb + slice('function revealLenderEmbed()', 'function submitBusinessInfo()')), 'no browser persistence');
  assert.equal((FIN.match(/businessStepHandoffOnly/g) || []).length, 2, 'flag defined once (L002) and read once');
  assert.equal(configs().L001.businessStepHandoffOnly, undefined, 'L001 keeps persistence');
  for (const code of ['L002'].concat(ASH_CODES)) assert.equal(configs()[code].businessStepHandoffOnly, true, code);
});

test('V4-14 -336 copy: business-step explainer is the approved universal wording; old routing claim gone; L001 soft-check line kept', () => {
  const biz = slice('<div id="business-info"', '<select id="f-business-type"');
  assert.ok(biz.includes(">These details help fill in your lender application so you don't have to enter them again. Review them on the lender's form.</p>"));
  assert.ok(!/helps route your request/.test(FIN), 'old wording removed');
  assert.ok(biz.includes('<p id="business-soft-check" style="display:none;') && biz.includes('>Financing starts with a soft credit check that will not affect your credit score.</p>'));
  assert.equal((FIN.match(/These details help fill in your lender application/g) || []).length, 1, 'one explainer, shared by both lenders');
});
