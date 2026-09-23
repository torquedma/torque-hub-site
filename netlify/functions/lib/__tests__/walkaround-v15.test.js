'use strict';
// walkaround-v15.test.js — Run: node --test netlify/functions/lib/__tests__/walkaround-v15.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Module = require('module');

const S = require('../walkaround-v15-screens');
const FN = path.join(__dirname, '..', '..', 'generate-walkaround-v15-background.js');

// ---------- fixtures ----------
const C1 = '11111111-1111-1111-1111-111111111111';
const C2 = '22222222-2222-2222-2222-222222222222';
const P1 = '33333333-3333-3333-3333-333333333333';
const M1 = '44444444-4444-4444-4444-444444444444';
const BUNDLE = {
  stock: 'TST-1',
  buyer_questions: ['What is this configuration?'],
  items: [
    { claim_id: C1, tier: 'unit_fact_dealer_attributed', authority: 'dealer_attributed', text: '60 in cutting deck across 3 blades (dealer states)', conflict: 'none' },
    { claim_id: C2, tier: 'unit_fact_dealer_attributed', authority: 'dealer_attributed', text: 'The dealer lists 1,549 hours', conflict: 'none' },
    { claim_id: M1, tier: 'manufacturer_fact_applicable', authority: 'oem_published', text: 'Toro builds model 72513 with twin lever steering controls', conflict: 'none' },
    { claim_id: P1, tier: 'photo_observation', authority: 'visual_observed', text: 'Photo 1 shows a rear stand-on operator platform', conflict: 'none' },
  ],
  verify_on_unit: ['Check whether this platform has suspension.'],
};
const MX = [{ id: 'mx', subject_type: 'unit', subject_key: 'TST-1', value: { text: 'Platform suspension', assert_terms: ['suspension'] } }];
const GOOD = {
  version: '1.4',
  torque_take: ['You stand on a rear platform and steer with twin levers, as Toro builds the 72513 and as photo 1 shows.'],
  decision_factors: {
    makes_it_a_yes: ['Ask the dealer to run the 60 in deck with all 3 blades engaged.', 'Confirm the meter matches the 1,549 hours the dealer lists.', 'Work both levers through forward, reverse and turns.', 'Stand on the platform and check whether it has suspension.'],
    makes_it_a_yes_footer: 'Run it and check the levers before you call.',
  },
  uncertainty_type: 'config', buyer_question: 'What is this configuration?',
};
const GOOD_G = { torque_take: [[M1, P1]], checklist: [[C1], [C2], [M1], ['V1']], footer: [C1] };

// ---------- engine allowlist ----------
test('engine pin: exactly one production engine, fixed to Opus 5.5', () => {
  assert.deepEqual(Object.keys(S.ENGINES), ['walkaround-v1.5-opus-5-5-geb']);
  assert.equal(S.PRODUCTION_ENGINE, 'walkaround-v1.5-opus-5-5-geb');
  assert.deepEqual(S.resolveEngine('walkaround-v1.5-opus-5-5-geb'), { engine: 'walkaround-v1.5-opus-5-5-geb', model: 'claude-opus-5-5' });
  for (const bad of [undefined, null, '', '   ', 'walkaround-v1.5-fable-5-1-geb', 'claude-fable-5-1', 'claude-opus-5-5', 'walkaround-v1.4.3-fable-5-1-ep', 'walkaround-v1.5-haiku-geb', 'constructor', '__proto__']) {
    assert.throws(() => S.resolveEngine(bad), /unsupported engine/);
  }
});

// ---------- shape / grounding ----------
test('good output passes shape, grounding and every screen', () => {
  assert.deepEqual(S.validateShape(GOOD), []);
  assert.deepEqual(S.validateGrounding(GOOD, GOOD_G, BUNDLE), []);
  assert.deepEqual(S.screenContent(GOOD, GOOD_G, BUNDLE, MX), []);
});

test('grounding: ids outside the frozen snapshot are rejected', () => {
  const g = { ...GOOD_G, checklist: [[C1], [C2], ['99999999-9999-9999-9999-999999999999'], ['V1']] };
  assert.ok(S.validateGrounding(GOOD, g, BUNDLE).some(e => /not in frozen snapshot/.test(e)));
});

test('grounding: every paragraph, item and footer must carry ids', () => {
  assert.ok(S.validateGrounding(GOOD, { ...GOOD_G, footer: [] }, BUNDLE).some(e => /footer: no grounding/.test(e)));
  assert.ok(S.validateGrounding(GOOD, { ...GOOD_G, checklist: [[C1], [C2], [M1]] }, BUNDLE).some(e => /length mismatch/.test(e)));
  assert.deepEqual(S.validateGrounding(GOOD, null, BUNDLE), ['missing _grounding']);
});

// ---------- screens ----------
function withItem(i, text) { const p = JSON.parse(JSON.stringify(GOOD)); p.decision_factors.makes_it_a_yes[i] = text; return p; }
const cases = [
  ['M_X term stated as fact (not grounded to a verify item)', withItem(0, 'The platform has suspension for comfort.'), 'MX_AS_FACT'],
  ['number not in evidence', withItem(0, 'The deck cuts 1.5 to 5.0 inches.'), 'NUMBER_NOT_IN_EVIDENCE'],
  ['maintenance records without source activation', withItem(0, 'Ask for the service records.'), 'MAINTENANCE_7A'],
  ['cost / value', withItem(0, 'These options would cost real money to add later.'), 'COST_VALUE_MARKET'],
  ['reputation / durability', withItem(0, 'The platform is known for durability.'), 'REPUTATION_DURABILITY'],
  ['productivity / speed', withItem(0, 'A stand-on lets you work faster.'), 'PRODUCTIVITY_SPEED'],
  ['generalization / preference', withItem(0, 'Experienced crews prefer this layout.'), 'GENERALIZATION'],
  ['photo claim without a grounded photo observation', withItem(0, 'The photos show a clean deck.'), 'PHOTO_CLAIM_UNGROUNDED'],
  ['Markdown', withItem(0, '**Run** the deck.'), 'MARKDOWN'],
  ['age arithmetic', withItem(0, 'A 7-year-old mower.'), 'AGE_ARITHMETIC'],
];
for (const [name, p, screen] of cases) {
  test(`screen fires: ${name}`, () => {
    const f = S.screenContent(p, GOOD_G, BUNDLE, MX);
    assert.ok(f.some(x => x.screen === screen), `${screen} expected, got ${JSON.stringify(f)}`);
  });
}
test('M_X term IS allowed when the sentence is grounded to a verify item', () => {
  const f = S.screenContent(GOOD, GOOD_G, BUNDLE, MX); // item 4 mentions suspension, grounded to V1
  assert.ok(!f.some(x => x.screen === 'MX_AS_FACT'));
});
test('photo language IS allowed when grounded to an approved photo observation', () => {
  const f = S.screenContent(GOOD, GOOD_G, BUNDLE, MX); // torque_take mentions photo 1, grounded to P1
  assert.ok(!f.some(x => x.screen === 'PHOTO_CLAIM_UNGROUNDED'));
});

test('renderBundle sends only bundle material: tiers, ids, verify items, conflict flags', () => {
  const b = JSON.parse(JSON.stringify(BUNDLE)); b.items[0].conflict = 'conflict';
  const msg = S.renderBundle(b);
  for (const it of b.items) assert.ok(msg.includes(`[${it.claim_id}]`));
  assert.ok(msg.includes('[V1]'));
  assert.ok(msg.includes('CONFLICTS WITH OTHER EVIDENCE'));
  assert.ok(msg.includes('APPROVED PHOTO OBSERVATIONS'));
});

// ---------- handler-level tests (stubbed supabase + fetch) ----------
function loadHandler(state) {
  const origLoad = Module._load;
  Module._load = function (req, parent, isMain) {
    if (req === '@supabase/supabase-js') return { createClient: () => makeClient(state) };
    return origLoad.apply(this, arguments);
  };
  delete require.cache[require.resolve(FN)];
  const h = require(FN).handler;
  Module._load = origLoad;
  return h;
}
function makeClient(state) {
  return {
    from(table) {
      const q = { table, filters: [] };
      const resolveSelect = () => {
        const f = Object.fromEntries(q.filters.map(([k, v]) => [k, v]));
        if (table === 'inventory') return state.inventory;
        if (table === 'understanding_snapshot') return state.snapshots;
        if (table === 'walkaround_review_queue') return state.queue.filter(r => r.stock === f.stock && r.engine_version === f.engine_version);
        if (table === 'understanding_claim') return [...state.claims, ...state.mxAll].filter(c => (f.id || []).includes(c.id));
        return [];
      };
      const api = {
        select() { if (q.isWrite) q.returning = true; return api; },
        eq(k, v) { q.filters.push([k, v]); return api; },
        in(k, v) { q.filters.push([k, v]); return api; },
        is(k, v) { q.filters.push([k, v]); return api; },
        update(payload) { state.writes.push({ table, op: 'update', payload, filters: q.filters }); q.isWrite = true; return api; },
        upsert(payload) { state.writes.push({ table, op: 'upsert', payload }); return Promise.resolve({ error: null }); },
        insert(payload) {
          state.writes.push({ table, op: 'insert', payload });
          if (table === 'walkaround_review_queue' && state.insertConflict) return Promise.resolve({ error: { code: '23505', message: 'duplicate key' } });
          return Promise.resolve({ error: null });
        },
        delete() { state.writes.push({ table, op: 'delete' }); return api; },
        then(res, rej) {
          if (q.isWrite) return Promise.resolve({ data: q.returning ? state.updateResult : null, error: state.updateError }).then(res, rej);
          return Promise.resolve({ data: resolveSelect(), error: null }).then(res, rej);
        },
      };
      return api;
    },
  };
}
function baseState(overrides) {
  const snapFor = eng => ({ id: 'snap', stock: 'TST-1', engine_version: eng, bundle: BUNDLE, fingerprint: 'abc', bundle_md5: 'abc', claim_ids: [C1, C2, M1, P1], mx_claim_ids: ['mx'], grounding: null, generation_metrics: null });
  return Object.assign({
    writes: [], calls: [], queue: [], insertConflict: false, updateResult: [{ id: 'snap' }], updateError: null,
    inventory: [{ stock: 'TST-1', year: '2019', make: 'Toro', model: 'Grandstand 60', trim: '', category: 'Farm', subcategory: '' }],
    snapshots: [snapFor('walkaround-v1.5-opus-5-5-geb')],
    claims: [C1, C2, M1, P1].map(id => ({ id, review_state: 'approved' })),
    mxAll: [
      { id: 'mx', state: 'M_X', review_state: 'approved', value: { text: 'Platform suspension', assert_terms: ['suspension'] } },
      { id: 'mx-other', state: 'M_X', review_state: 'approved', value: { text: 'Unrelated component ratio set', assert_terms: ['levers'] } },
    ],
    snapFor,
  }, overrides || {});
}
function stubFetch(state, body) {
  global.fetch = async (url, opts) => { state.calls.push(JSON.parse(opts.body)); return { ok: true, json: async () => ({ model: JSON.parse(opts.body).model, usage: { input_tokens: 10, output_tokens: 20 }, stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(body) }] }) }; };
}
process.env.ANTHROPIC_API_KEY = 'test'; process.env.SUPABASE_URL = 'http://x'; process.env.SUPABASE_SERVICE_KEY = 'x';

test('handler: unsupported engine and ?model= are refused before any call', async () => {
  const st = baseState(); stubFetch(st, GOOD); const h = loadHandler(st);
  assert.equal((await h({ queryStringParameters: { engine: 'claude-opus-5-5', stocks: 'TST-1' } })).statusCode, 400);
  assert.equal((await h({ queryStringParameters: { engine: 'walkaround-v1.5-opus-5-5-geb', model: 'x', stocks: 'TST-1' } })).statusCode, 400);
  assert.equal(st.calls.length, 0); assert.equal(st.writes.length, 0);
});

test('handler: fingerprint mismatch refuses the stock (no model call, no write)', async () => {
  const st = baseState(); st.snapshots[0].bundle_md5 = 'tampered';
  stubFetch(st, GOOD); const h = loadHandler(st);
  const r = JSON.parse((await h({ queryStringParameters: { engine: 'walkaround-v1.5-opus-5-5-geb', stocks: 'TST-1' } })).body);
  assert.deepEqual(r.refused, [{ stock: 'TST-1', reason: 'fingerprint_mismatch' }]);
  assert.equal(st.calls.length, 0); assert.equal(st.writes.length, 0);
});

test('handler: engine label fixes the model; writes queue + snapshot only, never inventory; _grounding stripped', async () => {
  const st = baseState(); stubFetch(st, { ...GOOD, _grounding: GOOD_G }); const h = loadHandler(st);
  const r = JSON.parse((await h({ queryStringParameters: { engine: 'walkaround-v1.5-opus-5-5-geb', stocks: 'TST-1' } })).body);
  assert.equal(st.calls[0].model, 'claude-opus-5-5');
  assert.equal(st.calls[0].max_tokens, 4096);
  assert.ok(!st.writes.some(w => w.table === 'inventory'), 'no inventory write');
  const q = st.writes.find(w => w.table === 'walkaround_review_queue');
  assert.equal(q.op, 'insert', 'queue write must be an INSERT');
  assert.ok(!st.writes.some(w => w.op === 'upsert'), 'no upsert anywhere');
  const su = st.writes.find(w => w.table === 'understanding_snapshot');
  assert.ok(su.filters.some(([k, v]) => k === 'grounding' && v === null) && su.filters.some(([k, v]) => k === 'generation_metrics' && v === null), 'snapshot write is guarded write-once');
  assert.equal(q.payload.engine_version, 'walkaround-v1.5-opus-5-5-geb');
  assert.ok(!('_grounding' in q.payload.generated_bi));
  assert.match(q.payload.review_notes, /checks PASS/);
  assert.equal(r.generated[0].pass, true);
});

test('handler: the Fable comparison engine is refused before any call or write', async () => {
  const st = baseState(); stubFetch(st, { ...GOOD, _grounding: GOOD_G }); const h = loadHandler(st);
  const res = await h({ queryStringParameters: { engine: 'walkaround-v1.5-fable-5-1-geb', stocks: 'TST-1' } });
  assert.equal(res.statusCode, 400); assert.equal(st.calls.length, 0); assert.equal(st.writes.length, 0);
});
test('handler: a missing engine parameter is refused before any call or write', async () => {
  const st = baseState(); stubFetch(st, { ...GOOD, _grounding: GOOD_G }); const h = loadHandler(st);
  for (const qs of [{ stocks: 'TST-1' }, { engine: '', stocks: 'TST-1' }]) {
    assert.equal((await h({ queryStringParameters: qs })).statusCode, 400);
  }
  assert.equal(st.calls.length, 0); assert.equal(st.writes.length, 0);
});
test('handler: the pinned Opus engine label runs on claude-opus-5-5', async () => {
  const st = baseState(); stubFetch(st, { ...GOOD, _grounding: GOOD_G }); const h = loadHandler(st);
  const r = JSON.parse((await h({ queryStringParameters: { engine: 'walkaround-v1.5-opus-5-5-geb', stocks: 'TST-1' } })).body);
  assert.equal(r.engine, 'walkaround-v1.5-opus-5-5-geb'); assert.equal(st.calls[0].model, 'claude-opus-5-5');
});

test('v1.4.3 producer and prompt are byte-identical to production 1738e02', () => {
  const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  const fnDir = path.join(__dirname, '..', '..');
  assert.equal(sha(path.join(fnDir, 'generate-walkaround-background.js')), '6197f06dd929756b994d5397765a49d09397de49a2ec860e49e9269dad9d5848');
  assert.equal(sha(path.join(fnDir, 'lib', 'walkaround-prompt.js')), '24ae58afab8f5c5686f7015cf6d9cd260c5e3ff882748a94060c9520d8230178');
});

test('static: the v1.5 producer contains no inventory write path', () => {
  const src = fs.readFileSync(FN, 'utf8');
  const invCalls = src.split(".from('inventory')").slice(1).map(s => s.slice(0, 120));
  for (const c of invCalls) assert.ok(!/\.(update|insert|upsert|delete)\(/.test(c.split(';')[0]), 'inventory write found');
});

// ---------- one-shot / non-overwriting ----------
async function runOnce(st) {
  stubFetch(st, { ...GOOD, _grounding: GOOD_G }); const h = loadHandler(st);
  return JSON.parse((await h({ queryStringParameters: { engine: 'walkaround-v1.5-opus-5-5-geb', stocks: 'TST-1' } })).body);
}
test('one-shot: existing queue row for (stock, engine) → refused, model NOT called, nothing written', async () => {
  const st = baseState({ queue: [{ id: 'q', stock: 'TST-1', engine_version: 'walkaround-v1.5-opus-5-5-geb' }] });
  const r = await runOnce(st);
  assert.deepEqual(r.refused, [{ stock: 'TST-1', reason: 'queue_row_exists' }]);
  assert.equal(st.calls.length, 0); assert.equal(st.writes.length, 0);
});
test('one-shot: the preserved Fable comparison row does not block production (per-engine key)', async () => {
  const st = baseState({ queue: [{ id: 'q', stock: 'TST-1', engine_version: 'walkaround-v1.5-fable-5-1-geb' }] });
  const r = await runOnce(st);
  assert.equal(r.generated.length, 1); assert.equal(st.calls.length, 1);
});
test('one-shot: snapshot generation_metrics already set → refused before the model call', async () => {
  const st = baseState(); st.snapshots[0].generation_metrics = { duration_ms: 1 };
  const r = await runOnce(st);
  assert.deepEqual(r.refused, [{ stock: 'TST-1', reason: 'snapshot_already_consumed' }]);
  assert.equal(st.calls.length, 0); assert.equal(st.writes.length, 0);
});
test('one-shot: snapshot grounding already set → refused before the model call', async () => {
  const st = baseState(); st.snapshots[0].grounding = { torque_take: [] };
  const r = await runOnce(st);
  assert.deepEqual(r.refused, [{ stock: 'TST-1', reason: 'snapshot_already_consumed' }]);
  assert.equal(st.calls.length, 0);
});
test('snapshot with an unapproved claim → refused before the model call', async () => {
  const st = baseState(); st.claims[0].review_state = 'proposed';
  const r = await runOnce(st);
  assert.deepEqual(r.refused, [{ stock: 'TST-1', reason: 'snapshot_claims_not_all_approved' }]);
  assert.equal(st.calls.length, 0);
});
test('duplicate insert (race) → failure; nothing overwritten; snapshot not written', async () => {
  const st = baseState({ insertConflict: true });
  const r = await runOnce(st);
  assert.deepEqual(r.failed, [{ stock: 'TST-1', reason: 'queue_row_exists_at_insert' }]);
  assert.ok(!st.writes.some(w => w.op === 'upsert' || w.op === 'update'), 'no overwrite of any kind');
});
test('static: the producer has no upsert and guards both snapshot writes', () => {
  const src = fs.readFileSync(FN, 'utf8');
  assert.ok(!src.includes('.upsert('), 'upsert present');
  assert.ok(src.includes('.insert({'));
  assert.ok((src.match(/\.is\('generation_metrics', null\)/g) || []).length >= 2, 'both snapshot writes must be write-once');
});

// ---------- claim-set integrity ----------
test('claim-set: bundle item not in claim_ids → refused, no model call', async () => {
  const st = baseState(); st.snapshots[0].claim_ids = [C1, C2, M1];
  const r = await runOnce(st);
  assert.deepEqual(r.refused, [{ stock: 'TST-1', reason: 'snapshot_claim_set_mismatch' }]); assert.equal(st.calls.length, 0);
});
test('claim-set: claim_ids has an extra id not in the bundle → refused', async () => {
  const st = baseState(); st.snapshots[0].claim_ids = [C1, C2, M1, P1, '55555555-5555-5555-5555-555555555555'];
  const r = await runOnce(st);
  assert.deepEqual(r.refused, [{ stock: 'TST-1', reason: 'snapshot_claim_set_mismatch' }]); assert.equal(st.calls.length, 0);
});
test('claim-set: duplicate claim id (in claim_ids or in bundle) → refused', async () => {
  const st = baseState(); st.snapshots[0].claim_ids = [C1, C2, M1, P1, C1];
  assert.deepEqual((await runOnce(st)).refused, [{ stock: 'TST-1', reason: 'snapshot_claim_set_mismatch' }]);
  const st2 = baseState(); const b = JSON.parse(JSON.stringify(BUNDLE)); b.items.push(b.items[0]); st2.snapshots[0].bundle = b;
  assert.deepEqual((await runOnce(st2)).refused, [{ stock: 'TST-1', reason: 'snapshot_claim_set_mismatch' }]);
  assert.equal(st.calls.length + st2.calls.length, 0);
});

// ---------- M_X snapshot scope ----------
test('M_X scope: an unrelated approved M_X (not linked to this snapshot) cannot fail this stock', async () => {
  const st = baseState(); // mx-other asserts "levers", which GOOD uses; it is NOT in mx_claim_ids
  const r = await runOnce(st);
  assert.equal(r.generated[0].pass, true);
});
test('M_X scope control: the same claim DOES fire once linked to this snapshot', async () => {
  const st = baseState(); st.snapshots[0].mx_claim_ids = ['mx', 'mx-other'];
  const r = await runOnce(st);
  assert.equal(r.generated[0].pass, false);
  const q = st.writes.find(w => w.table === 'walkaround_review_queue');
  assert.match(q.payload.review_notes, /checks FAIL/);
});
test('M_X scope: a linked id that is not an approved M_X claim → refused', async () => {
  const st = baseState(); st.snapshots[0].mx_claim_ids = [C1];
  assert.deepEqual((await runOnce(st)).refused, [{ stock: 'TST-1', reason: 'snapshot_mx_link_invalid' }]);
  assert.equal(st.calls.length, 0);
});

// ---------- verified audit write ----------
test('audit write affecting zero rows → loud failure; queue row preserved; not reported generated', async () => {
  const st = baseState({ updateResult: [] });
  const r = await runOnce(st);
  assert.deepEqual(r.failed, [{ stock: 'TST-1', reason: 'snapshot_audit_write_failed_after_queue_insert' }]);
  assert.equal(r.generated.length, 0);
  assert.ok(st.writes.some(w => w.table === 'walkaround_review_queue' && w.op === 'insert'), 'queue row was inserted and is left for reconciliation');
  assert.ok(!st.writes.some(w => w.op === 'upsert' || w.op === 'delete'));
});
test('audit write returning an error → same loud failure', async () => {
  const st = baseState({ updateError: { message: 'boom' }, updateResult: null });
  const r = await runOnce(st);
  assert.deepEqual(r.failed, [{ stock: 'TST-1', reason: 'snapshot_audit_write_failed_after_queue_insert' }]);
});
test('parse failure whose consumption record cannot be written is surfaced explicitly', async () => {
  const st = baseState({ updateResult: [] });
  global.fetch = async (u, o) => { st.calls.push(JSON.parse(o.body)); return { ok: true, json: async () => ({ model: 'm', usage: {}, content: [{ type: 'text', text: 'not json at all' }] }) }; };
  const h = loadHandler(st);
  const r = JSON.parse((await h({ queryStringParameters: { engine: 'walkaround-v1.5-opus-5-5-geb', stocks: 'TST-1' } })).body);
  assert.deepEqual(r.failed, [{ stock: 'TST-1', reason: 'parse_fail_and_consumption_record_write_failed' }]);
});

// ---------- raw scoring before sanitization ----------
test('raw scoring: Markdown returned by the model is recorded even though storage strips it', async () => {
  const st = baseState();
  const md = JSON.parse(JSON.stringify(GOOD)); md.decision_factors.makes_it_a_yes[0] = '**Ask** the dealer to run the 60 in deck with all 3 blades engaged.';
  stubFetch(st, { ...md, _grounding: GOOD_G }); const h = loadHandler(st);
  const r = JSON.parse((await h({ queryStringParameters: { engine: 'walkaround-v1.5-opus-5-5-geb', stocks: 'TST-1' } })).body);
  const q = st.writes.find(w => w.table === 'walkaround_review_queue');
  assert.ok(!q.payload.generated_bi.decision_factors.makes_it_a_yes[0].includes('**'), 'stored text is normalized');
  const su = st.writes.find(w => w.table === 'understanding_snapshot' && w.op === 'update');
  assert.equal(su.payload.generation_metrics.checks.scored_on, 'raw_model_output');
  assert.ok(su.payload.generation_metrics.checks.screens.some(f => f.screen === 'MARKDOWN'), 'raw Markdown recorded');
  assert.match(q.payload.review_notes, /checks FAIL/);
  assert.equal(r.generated[0].pass, false);
});

// ---------- cost/value screen: accepted idioms vs genuine claims ----------
const costScreen = text => S.screenContent(withItem(0, text), GOOD_G, BUNDLE, []).filter(f => f.screen === 'COST_VALUE_MARKET');
test('accepted idiom (verbatim, Fable MPX-645867): "worth seeing in person" does not fire', () => {
  assert.deepEqual(costScreen('Because the platform is shown folded, the listing photos do not show it in the down position you would actually work from, which is worth seeing in person.'), []);
});
test('accepted idiom (verbatim, Opus ATT footer): "part of the deal" does not fire', () => {
  assert.deepEqual(costScreen('Once the dealer confirms whether the bed and crane are part of the deal, you know which truck you are actually weighing against those ratings.'), []);
});
test('ONLY the two accepted phrasings are exempt: other "worth …" idioms still fire', () => {
  for (const s of ['That is worth checking on the unit.', 'It is worth confirming on the plate.', 'It is worth asking about the platform.']) assert.ok(costScreen(s).length >= 1, s);
});
const genuine = [
  'This truck is worth the money.',
  'At this price it is worth paying for.',
  'It is worth every penny.',
  'That makes it a good deal.',
  'A great deal for a crane truck.',
  'These choices would cost real money to add later.',
  'The rear lockers are costly to retrofit.',
  'It holds strong resale value.',
  'It is priced below market.',
  'The market for these is strong.',
  'You get it at a discount.',
  'A discounted crane truck.',
  'An affordable way into a stand-on.',
  'This is a bargain.',
  'It will save you on fuel.',
  // a genuine claim is NOT hidden by an accepted idiom in the same sentence
  'It is worth seeing in person and worth the money.',
  'The crane is part of the deal and a great deal at that.',
  // CC independent review (2026-09-23): value claims that leaked through the broader exemption
  'The best part of the deal is the price.',
  'Honestly the machine is worth seeing, and the price reflects it.',
  'Part of the deal is a lower price.',
];
for (const s of genuine) {
  test(`genuine cost/value claim still fires: ${s}`, () => { assert.ok(costScreen(s).length >= 1, s); });
}
test('idiom exemption is local to the cost screen: other screens still see the full text', () => {
  const f = S.screenContent(withItem(0, 'It is worth seeing in person how much faster it is.'), GOOD_G, BUNDLE, []);
  assert.ok(f.some(x => x.screen === 'PRODUCTIVITY_SPEED'));
  assert.ok(!f.some(x => x.screen === 'COST_VALUE_MARKET'));
});

test('documented behavior: "market" wording fires even when innocent (known, accepted false-positive surface)', () => {
  assert.ok(costScreen('This model is new to the market.').length >= 1);
});
test('the six accepted comparison outputs contain no newly screened word (replay facts pinned)', () => {
  // Verbatim sentences carrying the only cost/value-adjacent words in the six outputs.
  assert.deepEqual(costScreen('Ask the dealer directly whether the flatbed body and knuckle-boom crane shown in photos 2 to 5 are included in the sale, or whether the offering is the bare cab and chassis shown in photo 1, and get the answer in writing with the price.'), []);
});
