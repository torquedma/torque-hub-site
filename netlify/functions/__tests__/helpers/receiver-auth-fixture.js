'use strict';
// receiver-auth-fixture.js — TEST-ONLY helper for the security 7c R1 receiver gate (2026-10-12).
// Tests that drive the real receiver handler use it to present an authorized delivery: the webhook
// secret header, an approved-task map naming the test's dealer, and a fake Apify metadata API that
// describes a recent SUCCEEDED run whose default dataset is the one the test names.
// Every value here is synthetic. No real secret, task, run or dataset ID belongs in this file.
const TEST_SECRET = 'test-only-webhook-secret-not-a-real-value';
const TEST_TASK = 'testTask0001';
const TEST_RUN = 'testRun0001';

function armReceiverAuth(dealer) {
  process.env.APIFY_WEBHOOK_SECRET = TEST_SECRET;
  process.env.APIFY_TASK_DEALERS = JSON.stringify({ [TEST_TASK]: dealer });
  delete process.env.RECEIVER_SECRET_MODE;
  delete process.env.RECEIVER_BINDING_MODE;
  delete process.env.RECEIVER_MAX_RUN_AGE_HOURS;
  if (!process.env.APIFY_API_TOKEN) process.env.APIFY_API_TOKEN = 'test';
}

// Wraps a test's own fake fetch. Answers the dataset-metadata and run endpoints; passes every other
// URL (dataset items, Anthropic) to the test's fetch unchanged.
function withApprovedRun(innerFetch) {
  let datasetId = null;
  return async (url, opts) => {
    const u = String(url);
    let m = u.match(/^https:\/\/api\.apify\.com\/v2\/datasets\/([^/?]+)$/);
    if (m) {
      datasetId = decodeURIComponent(m[1]);
      return { ok: true, status: 200, json: async () => ({ data: { id: datasetId, actRunId: TEST_RUN } }) };
    }
    m = u.match(/^https:\/\/api\.apify\.com\/v2\/actor-runs\/([^/?]+)$/);
    if (m) {
      return { ok: true, status: 200, json: async () => ({ data: { id: decodeURIComponent(m[1]), actorTaskId: TEST_TASK, actId: 'testActor0001', status: 'SUCCEEDED', defaultDatasetId: datasetId, finishedAt: new Date().toISOString() } }) };
    }
    return innerFetch(url, opts);
  };
}

function authedEvent(body) {
  return { httpMethod: 'POST', headers: { 'x-torque-webhook-secret': TEST_SECRET }, body: JSON.stringify(body) };
}

module.exports = { armReceiverAuth, withApprovedRun, authedEvent, TEST_SECRET, TEST_TASK, TEST_RUN };
