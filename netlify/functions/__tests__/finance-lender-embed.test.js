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

test('LE-1: exactly L001 and L002; L001 Formstack config unchanged; no default route', () => {
  const C = configs();
  assert.deepEqual(Object.keys(C), ['L001', 'L002']);
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
