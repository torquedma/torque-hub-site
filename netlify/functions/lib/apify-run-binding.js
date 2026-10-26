'use strict';
// apify-run-binding.js — approved run binding for the inventory receiver (security 7c R1, 2026-10-12).
// A delivery is processed only when the dataset it names is the default dataset of a recent, SUCCEEDED
// run of an approved Apify task. The dealer comes from the approved map (APIFY_TASK_DEALERS), never from
// the caller. Lookups send the server's Apify token in the Authorization header, never in a URL.
// Every lookup failure fails closed: there is no fallback to unbound processing here.

const APIFY = 'https://api.apify.com/v2';
// Approved run-age limit (Chief ruling 3, 2026-10-12): 24 h. RECEIVER_MAX_RUN_AGE_HOURS may only shorten it;
// a value above the limit, or any value that is not a positive number, fails closed (config_invalid).
const DEFAULT_MAX_AGE_HOURS = 24;
// A finish time later than now by more than ordinary clock skew is implausible and fails closed.
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
// Apify IDs are short alphanumeric strings; anything else is refused before it reaches a URL path.
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

// APIFY_TASK_DEALERS is a JSON object { "<actorTaskId>": "<dealer name exactly as stored>" }.
// A run started directly from an actor (no task) can be approved only by an explicit
// "actor:<actorId>" key. Any malformed entry invalidates the whole map (fail closed).
function readBindingConfig(env) {
  let map = null;
  try {
    const parsed = JSON.parse(env.APIFY_TASK_DEALERS || '');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const keys = Object.keys(parsed);
      const valid = keys.length > 0 && keys.every((k) => k.trim() && typeof parsed[k] === 'string' && parsed[k].trim());
      if (valid) map = parsed;
    }
  } catch (e) {
    map = null;
  }
  let maxAgeHours = DEFAULT_MAX_AGE_HOURS;
  let ageValid = true;
  const rawAge = env.RECEIVER_MAX_RUN_AGE_HOURS;
  if (rawAge !== undefined && String(rawAge).trim() !== '') {
    const n = Number(rawAge);
    if (Number.isFinite(n) && n > 0 && n <= DEFAULT_MAX_AGE_HOURS) maxAgeHours = n;
    else ageValid = false;
  }
  return { map, maxAgeHours, ageValid, valid: !!map && ageValid, tasks: map ? Object.keys(map).length : 0 };
}

// The same three payload shapes the receiver has always accepted.
function referencesFrom(body) {
  const b = body || {};
  const datasetId = b.defaultDatasetId || (b.eventData && b.eventData.defaultDatasetId) || (b.resource && b.resource.defaultDatasetId) || null;
  const runId = b.actorRunId || (b.eventData && b.eventData.actorRunId) || (b.resource && b.resource.id) || null;
  return { datasetId: datasetId ? String(datasetId) : null, runId: runId ? String(runId) : null };
}

async function apifyGet(fetchImpl, token, path) {
  let res;
  try {
    res = await fetchImpl(APIFY + path, { headers: { Authorization: 'Bearer ' + token } });
  } catch (e) {
    return { ok: false, detail: 'network' };
  }
  if (!res || !res.ok) return { ok: false, detail: 'http_' + (res && res.status) };
  try {
    const json = await res.json();
    return json && json.data ? { ok: true, data: json.data } : { ok: false, detail: 'no_data' };
  } catch (e) {
    return { ok: false, detail: 'bad_json' };
  }
}

// Returns { ok, reason, datasetId?, runId?, taskId?, dealer?, detail? }. Reasons: ok | config_invalid |
// no_reference | bad_reference | binding_unavailable | dataset_has_no_run | run_metadata_inconsistent |
// run_not_succeeded | run_dataset_mismatch | task_not_approved | run_finished_at_invalid |
// run_finished_at_future | run_too_old. Missing, malformed, implausibly future, expired or inconsistent
// run metadata all fail closed (Chief ruling 3, 2026-10-12).
async function bindApifyRun({ body, env, token, fetchImpl, now }) {
  const cfg = readBindingConfig(env || {});
  if (!cfg.valid || !token) return { ok: false, reason: 'config_invalid' };
  const ref = referencesFrom(body);
  if (!ref.datasetId && !ref.runId) return { ok: false, reason: 'no_reference' };
  for (const id of [ref.datasetId, ref.runId]) {
    if (id && !ID_RE.test(id)) return { ok: false, reason: 'bad_reference' };
  }

  let runId = ref.runId;
  if (!runId) {
    // Dataset only: the dataset object names the run that created it. Read with the server token, that object
    // also carries sensitive fields such as urlSigningSecretKey: only id and actRunId are used, and the object
    // is never logged, returned or stored.
    const ds = await apifyGet(fetchImpl, token, '/datasets/' + encodeURIComponent(ref.datasetId));
    if (!ds.ok) return { ok: false, reason: 'binding_unavailable', detail: 'dataset ' + ds.detail };
    if (String(ds.data.id) !== ref.datasetId) return { ok: false, reason: 'run_metadata_inconsistent', detail: 'dataset id' };
    if (!ds.data.actRunId) return { ok: false, reason: 'dataset_has_no_run' };
    runId = String(ds.data.actRunId);
    if (!ID_RE.test(runId)) return { ok: false, reason: 'run_metadata_inconsistent', detail: 'actRunId shape' };
  }

  const r = await apifyGet(fetchImpl, token, '/actor-runs/' + encodeURIComponent(runId));
  if (!r.ok) return { ok: false, reason: 'binding_unavailable', detail: 'run ' + r.detail, runId };
  const run = r.data;
  const taskId = run.actorTaskId ? String(run.actorTaskId) : (run.actId ? 'actor:' + run.actId : null);
  const dealer = taskId && Object.prototype.hasOwnProperty.call(cfg.map, taskId) ? cfg.map[taskId] : null;
  const ctx = { runId, taskId, dealer };

  // The run object must describe the run that was asked for.
  if (String(run.id) !== runId) return Object.assign({ ok: false, reason: 'run_metadata_inconsistent', detail: 'run id' }, ctx);
  if (run.status !== 'SUCCEEDED') return Object.assign({ ok: false, reason: 'run_not_succeeded' }, ctx);
  // The named dataset must be this run's own default dataset (covers a run ID paired with another run's dataset).
  if (!run.defaultDatasetId || !ID_RE.test(String(run.defaultDatasetId)) || (ref.datasetId && String(run.defaultDatasetId) !== ref.datasetId)) {
    return Object.assign({ ok: false, reason: 'run_dataset_mismatch' }, ctx);
  }
  if (!dealer) return Object.assign({ ok: false, reason: 'task_not_approved' }, ctx);
  const finished = typeof run.finishedAt === 'string' ? Date.parse(run.finishedAt) : NaN;
  if (!Number.isFinite(finished)) return Object.assign({ ok: false, reason: 'run_finished_at_invalid' }, ctx);
  if (run.startedAt !== undefined && run.startedAt !== null) {
    const started = typeof run.startedAt === 'string' ? Date.parse(run.startedAt) : NaN;
    if (!Number.isFinite(started) || started > finished) return Object.assign({ ok: false, reason: 'run_metadata_inconsistent', detail: 'startedAt' }, ctx);
  }
  if (finished - now > MAX_FUTURE_SKEW_MS) return Object.assign({ ok: false, reason: 'run_finished_at_future' }, ctx);
  if (now - finished > cfg.maxAgeHours * 3600 * 1000) return Object.assign({ ok: false, reason: 'run_too_old' }, ctx);
  return Object.assign({ ok: true, reason: 'ok', datasetId: String(run.defaultDatasetId) }, ctx);
}

// The first item dealer that disagrees with the approved dealer, or null. Items without a dealer are fine.
function itemsDealerMismatch(items, dealer) {
  for (const item of items || []) {
    if (item && item.dealer && String(item.dealer) !== dealer) return String(item.dealer);
  }
  return null;
}

module.exports = { bindApifyRun, readBindingConfig, referencesFrom, itemsDealerMismatch, DEFAULT_MAX_AGE_HOURS, MAX_FUTURE_SKEW_MS };
