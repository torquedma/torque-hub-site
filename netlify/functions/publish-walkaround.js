// netlify/functions/publish-walkaround.js
//
// Promote a HUMAN-APPROVED Walkaround from walkaround_review_queue into
// inventory.buyer_intelligence. Deterministic governance — no AI, no
// generation, no editing, no inference. The only thing this function does is
// move reviewed content into production.
//
// WRITE BOUNDARIES (audited explicitly at the bottom of this file):
//   - This function writes to `inventory` in EXACTLY ONE place (step 6), and
//     the only column it touches there is `buyer_intelligence`.
//   - All other writes are to `walkaround_review_queue` (success update or
//     failure-path publish_error breadcrumb).
//
// INPUT: ?id=<queue.id>  OR  ?stock=<stock>&engine_version=<engine_version>

const { createClient } = require('@supabase/supabase-js');

// ── Helpers ──────────────────────────────────────────────────────────────────

function respond(statusCode, body) {
  return { statusCode, body: JSON.stringify(body) };
}

// Validate the payload shape per the spec. Returns an array of error strings;
// empty array means the payload is publishable.
function validatePayload(payload) {
  const errs = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    errs.push('payload is not an object');
    return errs; // bail; subsequent checks would just NPE
  }
  if (payload.abstain === true) errs.push('cannot publish an abstain object');
  if (typeof payload.title !== 'string' || !payload.title.trim())             errs.push('missing or empty title');
  if (typeof payload.meet_title !== 'string' || !payload.meet_title.trim())   errs.push('missing or empty meet_title');
  if (typeof payload.meet !== 'string' || !payload.meet.trim())               errs.push('missing or empty meet');
  if (!Array.isArray(payload.torque_take))                                    errs.push('torque_take is not an array');
  const df = payload.decision_factors;
  if (!df || typeof df !== 'object' || Array.isArray(df)) {
    errs.push('missing decision_factors object');
  } else {
    if (!Array.isArray(df.makes_it_a_yes)) errs.push('decision_factors.makes_it_a_yes is not an array');
    const footer = df.makes_it_a_yes_footer;
    if (footer == null || (typeof footer === 'string' && !footer.trim())) {
      errs.push('missing or empty decision_factors.makes_it_a_yes_footer');
    }
  }
  return errs;
}

// Write a publish_error breadcrumb on the queue row WITHOUT touching status,
// then return a 500. Used when the inventory write goes sideways and we have
// to surface the failure for review.
async function recordPublishError(supabase, queueId, message) {
  // Best-effort — if THIS write also fails, log it but still surface the
  // original error to the caller. We do not retry.
  const { error: errWriteErr } = await supabase
    .from('walkaround_review_queue')
    .update({ publish_error: message })
    .eq('id', queueId);
  if (errWriteErr) {
    console.error(`[PUBLISH] failed to record publish_error on id=${queueId}: ${errWriteErr.message}`);
  }
  return respond(500, { ok: false, error: message });
}

// ── Handler ──────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  // Auth/identity for v1: published_by stays null. TODO: wire Supabase JWT
  // (Authorization: Bearer …) decoding so we can stamp who clicked Publish.
  const publishedBy = null;

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const qs = event.queryStringParameters || {};
  const idParam = qs.id ? String(qs.id).trim() : '';
  const stockParam = qs.stock ? String(qs.stock).trim() : '';
  const evParam = qs.engine_version ? String(qs.engine_version).trim() : '';

  const haveId = !!idParam;
  const haveStockPair = !!stockParam && !!evParam;
  if (!haveId && !haveStockPair) {
    return respond(400, { error: 'Provide ?id=<queue.id> or ?stock=<stock>&engine_version=<engine_version>' });
  }

  // ── 1. Fetch the queue row ────────────────────────────────────────────────
  let fetchQuery = supabase.from('walkaround_review_queue').select('*');
  if (haveId) {
    fetchQuery = fetchQuery.eq('id', idParam);
  } else {
    fetchQuery = fetchQuery.eq('stock', stockParam).eq('engine_version', evParam);
  }
  const { data: rows, error: fetchErr } = await fetchQuery;
  if (fetchErr) {
    console.error(`[PUBLISH] queue fetch error: ${fetchErr.message}`);
    return respond(500, { ok: false, error: 'queue fetch failed: ' + fetchErr.message });
  }
  if (!rows || rows.length === 0) {
    return respond(404, { ok: false, error: 'queue row not found' });
  }
  if (rows.length > 1) {
    // (stock, engine_version) is unique by index; id is unique. Two matches = data integrity bug.
    return respond(500, { ok: false, error: 'multiple queue rows matched the input — data integrity issue' });
  }
  const row = rows[0];

  // ── 2. Hard gate (no writes have happened yet) ────────────────────────────
  if (row.status !== 'approved') {
    return respond(400, { ok: false, error: `only approved rows can be published (status='${row.status}')` });
  }
  if (row.generated_bi == null && row.edited_bi == null) {
    return respond(400, { ok: false, error: 'both generated_bi and edited_bi are null — nothing to publish' });
  }

  // ── 3. Payload selection: edited_bi wins if present, else generated_bi ───
  const usedField = row.edited_bi != null ? 'edited_bi' : 'generated_bi';
  const payload = row.edited_bi != null ? row.edited_bi : row.generated_bi;

  // ── 4. Payload shape validation ───────────────────────────────────────────
  const shapeErrs = validatePayload(payload);
  if (shapeErrs.length) {
    return respond(400, { ok: false, error: 'payload failed shape validation', details: shapeErrs, used: usedField });
  }

  // ── 5. Snapshot existing inventory.buyer_intelligence for rollback ───────
  // This is a READ, not a write. The result (which may be null) is what we'll
  // store into queue.previous_buyer_intelligence after the successful update.
  const { data: invRows, error: snapErr } = await supabase
    .from('inventory')
    .select('buyer_intelligence')
    .eq('stock', row.stock);
  if (snapErr) {
    console.error(`[PUBLISH] snapshot read failed for stock=${row.stock}: ${snapErr.message}`);
    return recordPublishError(supabase, row.id, 'snapshot read failed: ' + snapErr.message);
  }
  if (!invRows || invRows.length === 0) {
    return recordPublishError(supabase, row.id, `inventory has no row for stock='${row.stock}'`);
  }
  if (invRows.length > 1) {
    return recordPublishError(supabase, row.id, `inventory has ${invRows.length} rows for stock='${row.stock}' (expected 1)`);
  }
  const snapshot = invRows[0].buyer_intelligence; // may be null — that is the correct rollback value

  // ── 6. THE ONLY WRITE TO `inventory` IN THIS FUNCTION ────────────────────
  // Updates exactly one column (buyer_intelligence). RETURNING via .select() so
  // we can verify exactly one row was affected — if not, we abort and refuse
  // to update queue status, so the system never enters a partial state.
  const { data: updated, error: writeErr } = await supabase
    .from('inventory')
    .update({ buyer_intelligence: payload })
    .eq('stock', row.stock)
    .select('stock');
  if (writeErr) {
    console.error(`[PUBLISH] inventory update failed for stock=${row.stock}: ${writeErr.message}`);
    return recordPublishError(supabase, row.id, 'inventory update failed: ' + writeErr.message);
  }
  if (!updated || updated.length === 0) {
    // Race: row existed in step 5 but vanished before step 6. Abort.
    return recordPublishError(supabase, row.id, `inventory update affected 0 rows for stock='${row.stock}'`);
  }
  if (updated.length > 1) {
    // Should never happen if stock is unique. Hard data-integrity stop.
    return recordPublishError(supabase, row.id, `inventory update affected ${updated.length} rows for stock='${row.stock}' (expected 1)`);
  }

  // ── 7. Mark the queue row published, clear publish_error ─────────────────
  const publishedAt = new Date().toISOString();
  const queuePatch = {
    status:                      'published',
    published_at:                publishedAt,
    previous_buyer_intelligence: snapshot,        // null is a valid snapshot value
    published_by:                publishedBy,     // null for v1 (see TODO above)
    publish_error:               null,            // clear any prior failure breadcrumb
  };
  const { error: queueWriteErr } = await supabase
    .from('walkaround_review_queue')
    .update(queuePatch)
    .eq('id', row.id);
  if (queueWriteErr) {
    // Inventory is already updated, so we can't cleanly roll back from here.
    // Surface the queue-write failure loudly; an operator may need to manually
    // reconcile the queue row. Inventory state IS the published state.
    console.error(`[PUBLISH] inventory was updated but queue update failed for id=${row.id}: ${queueWriteErr.message}`);
    return respond(500, {
      ok: false,
      error: 'inventory updated but queue write failed — queue row needs manual reconciliation',
      detail: queueWriteErr.message,
      stock: row.stock,
      id: row.id,
    });
  }

  // ── 8. Success ────────────────────────────────────────────────────────────
  console.log(`[PUBLISH] OK stock=${row.stock} id=${row.id} used=${usedField}`);
  return respond(200, {
    ok: true,
    stock: row.stock,
    id: row.id,
    published_at: publishedAt,
    used: usedField,
  });
};

// ── Write-boundary audit ─────────────────────────────────────────────────────
// Grep this file for `.from('inventory')` — it should appear in exactly TWO
// places: one .select() (step 5 snapshot read) and one .update({ buyer_intelligence: ... })
// (step 6, the sole inventory write). No other inventory column is ever named.
// All other writes target walkaround_review_queue.
