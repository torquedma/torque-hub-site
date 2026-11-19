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

test('LE-1: exactly L001, L002 and the eleven Ash codes; L001 Formstack config unchanged; no default route', () => {
  const C = configs();
  assert.deepEqual(Object.keys(C), ['L001', 'L002'].concat(ASH_CODES));
  assert.deepEqual(JSON.parse(JSON.stringify(C.L001)), {
    lenderName: 'H.I.L. Financial', provider: 'formstack', formUrl: 'https://twaddle.formstack.com/forms/vehiclenetwork',
    fieldMap: {
      source: 'field196509669', dealer: 'field196509670', stock_number: 'field196509673', vehicle_title: 'field196509672',
      buyer_name: 'field196509676', buyer_email: 'field196509677', buyer_phone: 'field196509678', lead_id: 'field196509679',
      business_type: 'field157836337', business_name: 'field157805829', time_in_business: 'field157805830',
      business_street: 'field157805832-address', business_city: 'field157805832-city',
      business_state: 'field157805832-state', business_zip: 'field157805832-zip'
    }
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
