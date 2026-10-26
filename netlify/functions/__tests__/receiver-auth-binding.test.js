'use strict';
// receiver-auth-binding.test.js — security 7c R1 (2026-10-12): caller secret + approved Apify run binding
// in sync-truckpaper-background. Runs the REAL receiver handler against an in-memory Supabase fake and a
// fake Apify / Anthropic fetch. No network, no database. Every value here is synthetic.
// Every rejection must happen before any dataset item read, any Supabase call and any Anthropic call.
// Run: node --test netlify/functions/__tests__/receiver-auth-binding.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const RECEIVER = path.resolve(__dirname, '../sync-truckpaper-background.js');
const SUPABASE_JS = require.resolve('@supabase/supabase-js', { paths: [path.dirname(RECEIVER)] });

const SECRET = 'S'.repeat(20) + '-synthetic-receiver-secret-value';        // 51 chars
const TOKEN = 'synthetic-apify-token-value-0001';
// Synthetic stand-in for the urlSigningSecretKey that Apify returns in dataset metadata to clients with write access.
const SIGNING_SENTINEL = 'SENTINEL-fake-url-signing-secret-key-not-real-0001';
const DEALER = 'Mid-Atlantic Power & Equipment';                             // live, unfrozen, not a lifecycle dealer
const OTHER_DEALER = 'Allied Truck & Trailer Sales';
const TASK = 'taskApproved01';
const DS = 'datasetGood01';
const RUN = 'runGood01';
const HOUR = 3600 * 1000;
const clone = (x) => JSON.parse(JSON.stringify(x));

const ITEM = {
  stock: 'S1', source_listing_id: '260123456', source_url: 'https://dealer.example/inventory/?/listing/for-sale/260123456/x',
  year: 2015, make: 'Freightliner', model: 'M2 106', price: '40000', category: 'Trucks', photos: ['a.jpg'], description: 'Clean truck.',
};

function makeSupabase() {
  const db = { calls: 0, writes: [] };
  class Query {
    constructor(table) { this.table = table; this.op = 'select'; this.payload = null; }
    select() { return this; }
    eq() { return this; }
    in() { return this; }
    update(p) { this.op = 'update'; this.payload = clone(p); return this; }
    insert(arr) { this.op = 'insert'; this.payload = clone(arr); return this; }
    then(resolve, reject) {
      try {
        if (this.op !== 'select') db.writes.push({ table: this.table, op: this.op, payload: this.payload });
        resolve({ data: this.op === 'select' ? [] : null, error: null });
      } catch (e) { reject(e); }
    }
  }
  return { db, client: { from: (t) => { db.calls++; return new Query(t); } } };
}

// apify: { dataset: {...}|'error'|'throw', run: {...}|'error' }; items: dataset items.
async function deliver({ headers, body, env = {}, apify = {}, items = [ITEM] }) {
  const { db, client } = makeSupabase();
  require.cache[SUPABASE_JS] = { id: SUPABASE_JS, filename: SUPABASE_JS, loaded: true, exports: { createClient: () => client } };
  delete require.cache[RECEIVER];
  const saved = Object.assign({}, process.env);
  for (const k of ['APIFY_WEBHOOK_SECRET', 'APIFY_TASK_DEALERS', 'RECEIVER_SECRET_MODE', 'RECEIVER_BINDING_MODE', 'RECEIVER_MAX_RUN_AGE_HOURS']) delete process.env[k];
  Object.assign(process.env, { APIFY_API_TOKEN: TOKEN, ANTHROPIC_API_KEY: 'synthetic-anthropic-key', APIFY_WEBHOOK_SECRET: SECRET, APIFY_TASK_DEALERS: JSON.stringify({ [TASK]: DEALER }) });
  for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }

  const calls = { datasetMeta: 0, run: 0, items: 0, anthropic: 0, urls: [], authHeaders: [] };
  const run = Object.assign({ id: RUN, actorTaskId: TASK, actId: 'actorX01', status: 'SUCCEEDED', defaultDatasetId: DS, finishedAt: new Date(Date.now() - HOUR).toISOString() }, apify.run && typeof apify.run === 'object' ? apify.run : {});
  const dataset = Object.assign({ id: DS, actRunId: RUN, urlSigningSecretKey: SIGNING_SENTINEL, itemCount: 1 }, apify.dataset && typeof apify.dataset === 'object' ? apify.dataset : {});
  const realFetch = global.fetch;
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    calls.urls.push(u);
    if (opts.headers && opts.headers.Authorization) calls.authHeaders.push(opts.headers.Authorization);
    if (/api\.apify\.com\/v2\/datasets\/[^/?]+\/items/.test(u)) { calls.items++; return { ok: true, status: 200, json: async () => clone(items), text: async () => '' }; }
    if (/api\.apify\.com\/v2\/datasets\/[^/?]+$/.test(u)) {
      calls.datasetMeta++;
      if (apify.dataset === 'throw') throw new Error('network down');
      if (apify.dataset === 'error') return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ data: dataset }) };
    }
    if (/api\.apify\.com\/v2\/actor-runs\/[^/?]+$/.test(u)) {
      calls.run++;
      if (apify.run === 'error') return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ data: run }) };
    }
    if (u.includes('api.anthropic.com')) { calls.anthropic++; return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'Mock overview sentence.' }] }) }; }
    throw new Error('unexpected fetch ' + u);
  };
  const logs = [];
  const quiet = [console.log, console.warn, console.error];
  console.log = console.warn = console.error = (...a) => logs.push(a.map(String).join(' '));
  let res;
  try {
    res = await require(RECEIVER).handler({ httpMethod: 'POST', headers: headers === undefined ? { 'x-torque-webhook-secret': SECRET } : headers, body: JSON.stringify(body === undefined ? { defaultDatasetId: DS } : body) });
  } finally {
    [console.log, console.warn, console.error] = quiet;
    global.fetch = realFetch;
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
  const inserts = db.writes.filter((w) => w.table === 'inventory' && w.op === 'insert').flatMap((w) => w.payload);
  return { res, db, calls, logs, inserts, reason: res.statusCode === 403 ? JSON.parse(res.body).reason : null };
}

function assertRejected(r, reason) {
  assert.equal(r.res.statusCode, 403, 'expected a rejection, got ' + r.res.statusCode + ' ' + r.res.body);
  assert.equal(r.reason, reason);
  assert.equal(r.db.calls, 0, 'no Supabase call on a rejection');
  assert.equal(r.calls.anthropic, 0, 'no Anthropic call on a rejection');
  assert.ok(r.logs.some((l) => l.includes('[RECEIVER-AUTH-REJECT] ' + reason)), 'rejection is logged with its reason');
}
function assertProcessed(r, dealer = DEALER) {
  assert.equal(r.res.statusCode, 200, 'expected processing, got ' + r.res.statusCode + ' ' + r.res.body);
  assert.ok(r.inserts.length >= 1, 'the approved run inserts its unit');
  for (const row of r.inserts) assert.equal(row.dealer, dealer);
}

test('A1: valid secret + recent SUCCEEDED run of an approved task (dataset reference) → processed as the mapped dealer', async () => {
  const r = await deliver({});
  assertProcessed(r);
  assert.equal(r.calls.datasetMeta, 1);
  assert.equal(r.calls.run, 1);
  assert.equal(r.calls.items, 1);
  assert.ok(r.calls.anthropic >= 1, 'the processed path reaches description generation (the Anthropic counter works)');
  assert.ok(r.logs.some((l) => l.includes(`[RECEIVER-AUTH] secret=ok binding=ok task=${TASK} dealer=${DEALER}`)));
  assert.ok(r.logs.some((l) => l.includes('[AUTH-CONFIG] secret_mode=enforce binding_mode=enforce secret=ok task_map=1 max_age_h=24')));
});

test('A2: Apify default webhook shape (eventData.actorRunId + resource.defaultDatasetId) → processed; no dataset lookup needed', async () => {
  const r = await deliver({ body: { eventType: 'ACTOR.RUN.SUCCEEDED', eventData: { actorRunId: RUN, actorTaskId: 'ignoredCallerValue' }, resource: { id: RUN, defaultDatasetId: DS } } });
  assertProcessed(r);
  assert.equal(r.calls.datasetMeta, 0);
  assert.equal(r.calls.run, 1);
});

test('A3: run ID only → processed; the dataset read is the run\'s own default dataset', async () => {
  const r = await deliver({ body: { actorRunId: RUN } });
  assertProcessed(r);
  assert.ok(r.calls.urls.some((u) => u.includes(`/v2/datasets/${DS}/items`)));
});

test('B1: stale run (older than 24 h) → run_too_old', async () => {
  const r = await deliver({ apify: { run: { finishedAt: new Date(Date.now() - 25 * HOUR).toISOString() } } });
  assertRejected(r, 'run_too_old');
  assert.equal(r.calls.items, 0, 'no dataset item read');
});

test('B2: RECEIVER_MAX_RUN_AGE_HOURS can only shorten the 24 h window; above 24 or invalid fails closed', async () => {
  const at = (h) => ({ run: { finishedAt: new Date(Date.now() - h * HOUR).toISOString() } });
  assertProcessed(await deliver({ apify: at(23), env: { RECEIVER_MAX_RUN_AGE_HOURS: '24' } }));
  assertRejected(await deliver({ apify: at(13), env: { RECEIVER_MAX_RUN_AGE_HOURS: '12' } }), 'run_too_old');
  assertProcessed(await deliver({ apify: at(11), env: { RECEIVER_MAX_RUN_AGE_HOURS: '12' } }));
  for (const v of ['48', '24.5', '25', 'Infinity', 'abc', '-1', '0']) {
    assertRejected(await deliver({ apify: at(1), env: { RECEIVER_MAX_RUN_AGE_HOURS: v } }), 'config_invalid');
  }
});

test('B3: missing or unparseable finishedAt → run_finished_at_invalid', async () => {
  assertRejected(await deliver({ apify: { run: { finishedAt: null } } }), 'run_finished_at_invalid');
});

test('C1: task not in the approved map → task_not_approved', async () => {
  const r = await deliver({ apify: { run: { actorTaskId: 'taskForeign99' } } });
  assertRejected(r, 'task_not_approved');
  assert.equal(r.calls.items, 0);
});

test('C2: direct actor run (actorTaskId null) → task_not_approved, unless the map names that actor explicitly', async () => {
  assertRejected(await deliver({ apify: { run: { actorTaskId: null } } }), 'task_not_approved');
  assertProcessed(await deliver({ apify: { run: { actorTaskId: null } }, env: { APIFY_TASK_DEALERS: JSON.stringify({ 'actor:actorX01': DEALER }) } }));
});

test('C3: a task run is never approved through an actor key', async () => {
  assertRejected(await deliver({ apify: { run: { actorTaskId: 'taskForeign99' } }, env: { APIFY_TASK_DEALERS: JSON.stringify({ 'actor:actorX01': DEALER }) } }), 'task_not_approved');
});

test('D1: run not SUCCEEDED (FAILED, RUNNING, TIMED-OUT, ABORTED) → run_not_succeeded', async () => {
  for (const status of ['FAILED', 'RUNNING', 'TIMED-OUT', 'ABORTED']) {
    const r = await deliver({ apify: { run: { status } } });
    assertRejected(r, 'run_not_succeeded');
    assert.equal(r.calls.items, 0, status);
  }
});

test('D2: dataset not created by a run → dataset_has_no_run', async () => {
  const r = await deliver({ apify: { dataset: { actRunId: null } } });
  assertRejected(r, 'dataset_has_no_run');
  assert.equal(r.calls.run, 0);
});

test('E1: run ID paired with another run\'s dataset → run_dataset_mismatch', async () => {
  const r = await deliver({ body: { actorRunId: RUN, defaultDatasetId: 'datasetOther02' } });
  assertRejected(r, 'run_dataset_mismatch');
  assert.equal(r.calls.items, 0);
});

test('E2: dataset whose creating run reports a different default dataset → run_dataset_mismatch', async () => {
  assertRejected(await deliver({ apify: { run: { defaultDatasetId: 'datasetOther02' } } }), 'run_dataset_mismatch');
});

test('F1: an item naming another dealer stops the whole run before any Supabase call → dealer_mismatch', async () => {
  const r = await deliver({ items: [Object.assign({}, ITEM, { dealer: DEALER }), Object.assign({}, ITEM, { stock: 'S2', source_listing_id: '260123457', source_url: ITEM.source_url.replace('260123456', '260123457'), dealer: OTHER_DEALER })] });
  assertRejected(r, 'dealer_mismatch');
  assert.ok(r.logs.some((l) => l.includes(`item_dealer=${OTHER_DEALER}`)));
});

test('F2: body.dealerName is ignored for a bound run; the mapped dealer is used', async () => {
  const r = await deliver({ body: { defaultDatasetId: DS, dealerName: OTHER_DEALER } });
  assertProcessed(r, DEALER);
  assert.ok(r.logs.some((l) => l.includes('body.dealerName ignored')));
});

test('F3: items carrying the approved dealer are processed normally', async () => {
  assertProcessed(await deliver({ items: [Object.assign({}, ITEM, { dealer: DEALER })] }));
});

test('G1: Apify metadata error or network failure → binding_unavailable (fail closed)', async () => {
  assertRejected(await deliver({ apify: { dataset: 'error' } }), 'binding_unavailable');
  assertRejected(await deliver({ apify: { dataset: 'throw' } }), 'binding_unavailable');
  assertRejected(await deliver({ apify: { run: 'error' } }), 'binding_unavailable');
});

test('G2: task map missing, invalid JSON, array, empty or with a blank dealer → config_invalid', async () => {
  for (const v of [undefined, 'not json', '[]', '{}', JSON.stringify({ [TASK]: '' }), JSON.stringify({ [TASK]: 5 })]) {
    const r = await deliver({ env: { APIFY_TASK_DEALERS: v } });
    assertRejected(r, 'config_invalid');
    assert.equal(r.calls.datasetMeta + r.calls.run + r.calls.items, 0, 'no Apify call without a valid map: ' + v);
  }
});

test('G3: Apify token missing → config_invalid', async () => {
  assertRejected(await deliver({ env: { APIFY_API_TOKEN: undefined } }), 'config_invalid');
});

test('H1: no reference, or a reference that is not an Apify ID shape → rejected before any fetch', async () => {
  const none = await deliver({ body: { dealerName: DEALER } });
  assertRejected(none, 'no_reference');
  for (const bad of ['../datasets/x', 'a/b', 'x?token=y', 'a'.repeat(65)]) {
    const r = await deliver({ body: { defaultDatasetId: bad } });
    assertRejected(r, 'bad_reference');
    assert.equal(r.calls.urls.length, 0, 'no fetch for ' + bad);
  }
});

test('S1: secret missing → rejected in enforce (the default); passes in log mode', async () => {
  const r = await deliver({ headers: {} });
  assertRejected(r, 'secret_missing');
  assert.equal(r.calls.urls.length, 0, 'no Apify call without the secret in enforce');
  const logMode = await deliver({ headers: {}, env: { RECEIVER_SECRET_MODE: 'log' } });
  assertProcessed(logMode);
  assert.ok(logMode.logs.some((l) => l.includes('secret_mode=log') && l.includes('secret=missing')));
});

test('S2: wrong secret, same length and different length → secret_mismatch', async () => {
  const sameLength = SECRET.slice(0, -1) + (SECRET.endsWith('e') ? 'f' : 'e');
  assert.equal(sameLength.length, SECRET.length);
  assertRejected(await deliver({ headers: { 'x-torque-webhook-secret': sameLength } }), 'secret_mismatch');
  assertRejected(await deliver({ headers: { 'x-torque-webhook-secret': 'short' } }), 'secret_mismatch');
  assertRejected(await deliver({ headers: { 'x-torque-webhook-secret': SECRET + 'x' } }), 'secret_mismatch');
});

test('S3: header name is case-insensitive', async () => {
  assertProcessed(await deliver({ headers: { 'X-Torque-Webhook-Secret': SECRET } }));
});

test('S4: configured secret missing or shorter than 32 characters → not_configured, even when the caller presents it', async () => {
  assertRejected(await deliver({ env: { APIFY_WEBHOOK_SECRET: undefined } }), 'secret_not_configured');
  const shortSecret = 'x'.repeat(31);
  assertRejected(await deliver({ headers: { 'x-torque-webhook-secret': shortSecret }, env: { APIFY_WEBHOOK_SECRET: shortSecret } }), 'secret_not_configured');
});

test('S5: stockReconcileDealer without a valid secret is rejected even in log mode', async () => {
  const r = await deliver({ headers: {}, env: { RECEIVER_SECRET_MODE: 'log' }, body: { defaultDatasetId: DS, stockReconcileDealer: 'Impex Heavy Metal' } });
  assertRejected(r, 'armed_flag_requires_secret');
  assert.equal(r.calls.urls.length, 0);
});

test('S6: a mode value other than "log" (typo, "enforce", blank) enforces', async () => {
  for (const v of ['logg', 'enforce', '', 'off', 'false']) {
    assertRejected(await deliver({ headers: {}, env: { RECEIVER_SECRET_MODE: v } }), 'secret_missing');
  }
  assertProcessed(await deliver({ headers: {}, env: { RECEIVER_SECRET_MODE: ' LOG ' } }));
});

test('L1: binding_mode=log lets a failing binding through on the legacy path, logged as WOULD-REJECT', async () => {
  const r = await deliver({ apify: { run: { actorTaskId: 'taskForeign99' } }, env: { RECEIVER_BINDING_MODE: 'log' }, body: { defaultDatasetId: DS, dealerName: DEALER } });
  assert.equal(r.res.statusCode, 200);
  assert.ok(r.logs.some((l) => l.includes('[RECEIVER-AUTH-WOULD-REJECT] task_not_approved')));
  assert.ok(!r.logs.some((l) => l.includes('[RECEIVER-AUTH-REJECT]')));
  assert.ok(r.inserts.length >= 1);
});

test('T1: the secret and the Apify token never appear in logs, URLs or the response; the token travels only in Authorization', async () => {
  const runs = [
    await deliver({}),
    await deliver({ headers: { 'x-torque-webhook-secret': 'wrong-value' } }),
    await deliver({ apify: { run: { status: 'FAILED' } } }),
    await deliver({ env: { RECEIVER_BINDING_MODE: 'log' }, apify: { run: { actorTaskId: 'taskForeign99' } }, body: { actorRunId: RUN } }),
  ];
  for (const r of runs) {
    const everything = r.logs.join('\n') + '\n' + r.calls.urls.join('\n') + '\n' + String(r.res.body);
    assert.ok(!everything.includes(SECRET), 'secret leaked');
    assert.ok(!everything.includes(TOKEN), 'token leaked');
    assert.ok(!r.calls.urls.some((u) => u.includes('token=')), 'no token query parameter');
    for (const h of r.calls.authHeaders) assert.equal(h, 'Bearer ' + TOKEN);
  }
  assert.ok(runs[0].calls.authHeaders.length >= 3, 'metadata and item reads all carry the Authorization header');
});

// Chief ruling 3 (2026-10-12): missing, malformed, implausibly future, expired or inconsistent run metadata fails closed.
test('R1: finishedAt implausibly in the future → run_finished_at_future; ordinary clock skew (2 min) is accepted', async () => {
  assertRejected(await deliver({ apify: { run: { finishedAt: new Date(Date.now() + HOUR).toISOString() } } }), 'run_finished_at_future');
  assertProcessed(await deliver({ apify: { run: { finishedAt: new Date(Date.now() + 2 * 60 * 1000).toISOString() } } }));
});

test('R2: finishedAt missing, non-string or malformed → run_finished_at_invalid', async () => {
  for (const v of [undefined, 1760000000000, 'yesterday', '']) {
    assertRejected(await deliver({ apify: { run: { finishedAt: v } } }), 'run_finished_at_invalid');
  }
});

test('R3: run object for a different run, or dataset object for a different dataset → run_metadata_inconsistent', async () => {
  assertRejected(await deliver({ apify: { run: { id: 'runSomeoneElse' } } }), 'run_metadata_inconsistent');
  assertRejected(await deliver({ apify: { dataset: { id: 'datasetSomeoneElse' } } }), 'run_metadata_inconsistent');
});

test('R4: startedAt after finishedAt, or malformed startedAt → run_metadata_inconsistent', async () => {
  const fin = Date.now() - HOUR;
  assertRejected(await deliver({ apify: { run: { finishedAt: new Date(fin).toISOString(), startedAt: new Date(fin + 60000).toISOString() } } }), 'run_metadata_inconsistent');
  assertRejected(await deliver({ apify: { run: { startedAt: 'not a date' } } }), 'run_metadata_inconsistent');
  assertProcessed(await deliver({ apify: { run: { finishedAt: new Date(fin).toISOString(), startedAt: new Date(fin - 600000).toISOString() } } }));
});

test('R5: run default dataset missing or malformed → run_dataset_mismatch; malformed actRunId → run_metadata_inconsistent', async () => {
  assertRejected(await deliver({ apify: { run: { defaultDatasetId: null } } }), 'run_dataset_mismatch');
  assertRejected(await deliver({ body: { actorRunId: RUN }, apify: { run: { defaultDatasetId: '../x' } } }), 'run_dataset_mismatch');
  assertRejected(await deliver({ apify: { dataset: { actRunId: 'bad/run' } } }), 'run_metadata_inconsistent');
});

test('R6: status missing or not a string → run_not_succeeded', async () => {
  assertRejected(await deliver({ apify: { run: { status: undefined } } }), 'run_not_succeeded');
  assertRejected(await deliver({ apify: { run: { status: ['SUCCEEDED'] } } }), 'run_not_succeeded');
});

test('L2: log lines name the approved dealer and report each configuration part separately', async () => {
  const ok = await deliver({ body: { defaultDatasetId: DS, dealerName: OTHER_DEALER } });
  assert.ok(ok.logs.some((l) => l === `Syncing 1 items for ${DEALER}`), 'the sync line names the approved dealer, not body.dealerName');
  const badAge = await deliver({ env: { RECEIVER_MAX_RUN_AGE_HOURS: 'abc' } });
  assert.ok(badAge.logs.some((l) => l.includes('task_map=1 max_age_h=invalid')));
  const badMap = await deliver({ env: { APIFY_TASK_DEALERS: 'not json' } });
  assert.ok(badMap.logs.some((l) => l.includes('task_map=invalid max_age_h=24')));
});

// Chief ruling (Addendum 2, 2026-10-12): urlSigningSecretKey from Apify dataset metadata must never be logged,
// returned, persisted or propagated. Every dataset-metadata response in this file carries SIGNING_SENTINEL.
test('K1: the dataset urlSigningSecretKey never reaches logs, responses or database writes', async () => {
  const runs = [
    await deliver({}),
    await deliver({ apify: { dataset: { actRunId: null } } }),
    await deliver({ apify: { dataset: { id: 'datasetSomeoneElse' } } }),
    await deliver({ apify: { dataset: { actRunId: 'bad/run' } } }),
    await deliver({ apify: { run: { status: 'FAILED' } } }),
    await deliver({ apify: { run: { actorTaskId: 'taskForeign99' } } }),
    await deliver({ items: [Object.assign({}, ITEM, { dealer: OTHER_DEALER })] }),
    await deliver({ env: { RECEIVER_BINDING_MODE: 'log' }, apify: { run: { actorTaskId: 'taskForeign99' } } }),
  ];
  assert.ok(runs.every((r) => r.calls.datasetMeta === 1), 'every case read the sentinel-bearing dataset metadata');
  for (const r of runs) {
    const everything = r.logs.join('\n') + '\n' + String(r.res.body) + '\n' + JSON.stringify(r.db.writes);
    assert.ok(!everything.includes(SIGNING_SENTINEL), 'signing key leaked: ' + r.res.statusCode);
  }
});

test('K2: bindApifyRun returns only binding fields, never the dataset metadata object or its signing key', async () => {
  const { bindApifyRun } = require('../lib/apify-run-binding');
  const env = { APIFY_TASK_DEALERS: JSON.stringify({ [TASK]: DEALER }) };
  const okRun = { id: RUN, actorTaskId: TASK, status: 'SUCCEEDED', defaultDatasetId: DS, finishedAt: new Date(Date.now() - HOUR).toISOString() };
  const fetchWith = (dataset, run) => async (url) => {
    if (/\/datasets\/[^/]+$/.test(String(url))) return { ok: true, status: 200, json: async () => ({ data: dataset }) };
    return { ok: true, status: 200, json: async () => ({ data: run }) };
  };
  const signed = (over) => Object.assign({ id: DS, actRunId: RUN, urlSigningSecretKey: SIGNING_SENTINEL }, over || {});
  const cases = [
    [signed(), okRun, 'ok'],
    [signed({ actRunId: null }), okRun, 'dataset_has_no_run'],
    [signed({ id: 'datasetSomeoneElse' }), okRun, 'run_metadata_inconsistent'],
    [signed(), Object.assign({}, okRun, { status: 'FAILED' }), 'run_not_succeeded'],
    [signed(), Object.assign({}, okRun, { actorTaskId: 'taskForeign99' }), 'task_not_approved'],
  ];
  const allowed = new Set(['ok', 'reason', 'datasetId', 'runId', 'taskId', 'dealer', 'detail']);
  for (const [dataset, run, reason] of cases) {
    const b = await bindApifyRun({ body: { defaultDatasetId: DS }, env, token: TOKEN, fetchImpl: fetchWith(dataset, run), now: Date.now() });
    assert.equal(b.reason, reason);
    assert.ok(Object.keys(b).every((k) => allowed.has(k)), 'unexpected field in binding result: ' + Object.keys(b).join(','));
    assert.ok(!JSON.stringify(b).includes(SIGNING_SENTINEL), 'signing key in binding result for ' + reason);
  }
});
