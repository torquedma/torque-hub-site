// netlify/functions/unpublish-walkaround.js
//
// Roll a published Walkaround back: restore inventory.buyer_intelligence to
// the snapshot taken at publish time, then revert the queue row to
// 'approved'. Deterministic, no AI.
//
// WRITE BOUNDARIES (audited explicitly at the bottom of this file):
//   - This function writes to `inventory` in EXACTLY ONE place (step 2), and
//     the only column it touches there is `buyer_intelligence`.
//   - All other writes are to `walkaround_review_queue` (revert update, or
//     failure-path publish_error breadcrumb).
//
// INPUT: ?id=<queue.id>

const { createClient } = require('@supabase/supabase-js');

// ── Helpers ──────────────────────────────────────────────────────────────────

function respond(statusCode, body) {
  return { statusCode, body: JSON.stringify(body) };
}

// Write a publish_error breadcrumb on the queue row WITHOUT touching status,
// then return a 500. Used when the inventory rollback fails.
async function recordPublishError(supabase, queueId, message) {
  const { error: errWriteErr } = await supabase
    .from('walkaround_review_queue')
    .update({ publish_error: message })
    .eq('id', queueId);
  if (errWriteErr) {
    console.error(`[UNPUBLISH] failed to record publish_error on id=${queueId}: ${errWriteErr.message}`);
  }
  return respond(500, { ok: false, error: message });
}

// ── Handler ──────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const qs = event.queryStringParameters || {};
  const idParam = qs.id ? String(qs.id).trim() : '';
  if (!idParam) {
    return respond(400, { error: 'Provide ?id=<queue.id>' });
  }

  // ── 1. Fetch the queue row ────────────────────────────────────────────────
  const { data: rows, error: fetchErr } = await supabase
    .from('walkaround_review_queue')
    .select('*')
    .eq('id', idParam);
  if (fetchErr) {
    console.error(`[UNPUBLISH] queue fetch error: ${fetchErr.message}`);
    return respond(500, { ok: false, error: 'queue fetch failed: ' + fetchErr.message });
  }
  if (!rows || rows.length === 0) {
    return respond(404, { ok: false, error: 'queue row not found' });
  }
  if (rows.length > 1) {
    return respond(500, { ok: false, error: 'multiple queue rows matched the id — data integrity issue' });
  }
  const row = rows[0];

  // Hard gate — only published rows can be unpublished. previous_buyer_intelligence
  // may legitimately be null (means the unit had no buyer_intelligence before publish);
  // we still proceed and restore null, which returns the unit to its pre-publish state.
  if (row.status !== 'published') {
    return respond(400, { ok: false, error: `only published rows can be unpublished (status='${row.status}')` });
  }

  // ── 2. THE ONLY WRITE TO `inventory` IN THIS FUNCTION ────────────────────
  // Restore the snapshot. Updates exactly one column. RETURNING via .select()
  // so we can verify exactly one row was affected — if not, we abort and
  // refuse to revert queue status, so the system never enters a partial state.
  const { data: updated, error: writeErr } = await supabase
    .from('inventory')
    .update({ buyer_intelligence: row.previous_buyer_intelligence })
    .eq('stock', row.stock)
    .select('stock');
  if (writeErr) {
    console.error(`[UNPUBLISH] inventory restore failed for stock=${row.stock}: ${writeErr.message}`);
    return recordPublishError(supabase, row.id, 'inventory restore failed: ' + writeErr.message);
  }
  if (!updated || updated.length === 0) {
    return recordPublishError(supabase, row.id, `inventory update affected 0 rows for stock='${row.stock}'`);
  }
  if (updated.length > 1) {
    return recordPublishError(supabase, row.id, `inventory update affected ${updated.length} rows for stock='${row.stock}' (expected 1)`);
  }

  // ── 3. Revert the queue row to approved; clear publish bookkeeping ───────
  // previous_buyer_intelligence is cleared so the next publish takes a fresh
  // snapshot of the actually-live (now-restored) value. Prevents a publish/
  // unpublish/publish sequence from restoring a stale snapshot later.
  const queuePatch = {
    status:                      'approved',
    published_at:                null,
    previous_buyer_intelligence: null,
    publish_error:               null, // clear any prior error breadcrumb on success
  };
  const { error: queueWriteErr } = await supabase
    .from('walkaround_review_queue')
    .update(queuePatch)
    .eq('id', row.id);
  if (queueWriteErr) {
    // Inventory is already restored, so we can't cleanly roll forward from here.
    // Surface the queue-write failure; an operator may need to manually
    // reconcile the queue row. Inventory state IS the restored state.
    console.error(`[UNPUBLISH] inventory was restored but queue update failed for id=${row.id}: ${queueWriteErr.message}`);
    return respond(500, {
      ok: false,
      error: 'inventory restored but queue write failed — queue row needs manual reconciliation',
      detail: queueWriteErr.message,
      stock: row.stock,
      id: row.id,
    });
  }

  // ── 4. Success ────────────────────────────────────────────────────────────
  console.log(`[UNPUBLISH] OK stock=${row.stock} id=${row.id}`);
  return respond(200, {
    ok: true,
    stock: row.stock,
    id: row.id,
    restored: true,
  });
};

// ── Write-boundary audit ─────────────────────────────────────────────────────
// Grep this file for `.from('inventory')` — it should appear in exactly ONE
// place: a single .update({ buyer_intelligence: ... }) at step 2. No other
// inventory column is ever named. All other writes target walkaround_review_queue.
