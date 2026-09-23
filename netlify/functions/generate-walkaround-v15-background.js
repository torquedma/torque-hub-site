// generate-walkaround-v15-background.js — Walk Around v1.5, GOVERNED EVIDENCE BUNDLE.
//
// Trigger: HTTP background function. ?engine=<label>&stocks=A,B,C
//   engine MUST be one of the two allowlisted labels in lib/walkaround-v15-screens.js;
//   the label determines the model. A ?model= parameter is refused outright.
//
// Evidence: the frozen public.understanding_snapshot row for (stock, 'walkaround', engine).
//   The snapshot's database-computed bundle_md5 must equal its stored fingerprint, or the
//   stock is refused. Nothing outside the snapshot reaches the model.
//
// ONE-SHOT CONTRACT (Chief pre-deploy correction): one model call per stock per engine.
//   Refused BEFORE the model call if: no snapshot for the engine; fingerprint mismatch;
//   any snapshot claim not approved; snapshot grounding or generation_metrics already set;
//   or ANY walkaround_review_queue row already exists for (stock, engine_version).
//   The queue row is INSERTED (never upserted); a unique conflict is a failure, never an
//   overwrite. Snapshot grounding / generation_metrics are written once, only while NULL,
//   and that write is VERIFIED (exactly one row); otherwise the stock is reported as
//   snapshot_audit_write_failed_after_queue_insert and the queue row is preserved.
// CLAIM-SET INTEGRITY: snapshot.claim_ids must equal the bundle's item claim ids exactly
//   (no extras, omissions or duplicates) and every one must be 'approved'.
// M_X SCREEN IS SNAPSHOT-SCOPED: only claims listed in snapshot.mx_claim_ids (and verified
//   as approved M_X) can influence this generation. No fleet-global M_X screening.
// RAW CONTRACT SCORING: shape, grounding and content screens run on the model's RAW parsed
//   output BEFORE any plain-text normalization; findings are recorded as-returned.
//
// WRITE BOUNDARY: inserts walkaround_review_queue rows and sets the matching
// understanding_snapshot row's grounding / generation_metrics ONLY.
// There is NO write to inventory anywhere in this file. inventory is read (select) for the
// queue title / category / subcategory, exactly as the v1.4.3 producer does.
//
// v1.4.3 (generate-walkaround-background.js) is untouched and remains pinned.

const { createClient } = require('@supabase/supabase-js');
const { WALKAROUND_V15_SYSTEM_PROMPT } = require('./lib/walkaround-v15-prompt.js');
const {
  resolveEngine, renderBundle, validateShape, validateGrounding, screenContent,
} = require('./lib/walkaround-v15-screens.js');

const MAX_TOKENS = 4096; // identical for every engine

const ALLOWED_UNCERTAINTY_TYPES = new Set(['term', 'config', 'business', 'system', 'condition', 'ownership']);

function parseModelJson(raw) {
  try { return JSON.parse(raw); } catch (_) { /* fall through */ }
  const fence = raw.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (fence && fence[1]) { try { return JSON.parse(fence[1]); } catch (_) { /* fall through */ } }
  const bare = raw.match(/(\{[\s\S]*\})/);
  if (bare && bare[1]) { try { return JSON.parse(bare[1]); } catch (_) { /* fall through */ } }
  return null;
}

const plain = s => String(s).replace(/[*`_~]+/g, '').replace(/\s+/g, ' ').trim();

exports.handler = async (event) => {
  const qs = event.queryStringParameters || {};
  if (Object.prototype.hasOwnProperty.call(qs, 'model')) {
    return { statusCode: 400, body: JSON.stringify({ error: 'model parameter is not accepted; use an allowlisted engine label' }) };
  }
  let engine, model;
  try { engine = qs.engine; model = resolveEngine(engine); }
  catch (e) { return { statusCode: 400, body: JSON.stringify({ error: 'unsupported engine label' }) }; }

  const stocksList = (qs.stocks || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!stocksList.length) return { statusCode: 400, body: JSON.stringify({ error: 'Missing or empty ?stocks=A,B,C' }) };

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return { statusCode: 500, body: JSON.stringify({ error: 'Missing ANTHROPIC_API_KEY' }) };
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // READ-ONLY inventory fetch (title / category only).
  const { data: invRows, error: invErr } = await supabase
    .from('inventory').select('stock,year,make,model,trim,category,subcategory').in('stock', stocksList);
  if (invErr) return { statusCode: 500, body: JSON.stringify({ error: invErr.message }) };
  const inv = new Map((invRows || []).map(r => [r.stock, r]));

  const { data: snaps, error: snapErr } = await supabase
    .from('understanding_snapshot')
    .select('id,stock,engine_version,bundle,fingerprint,bundle_md5,claim_ids,mx_claim_ids,grounding,generation_metrics')
    .eq('consumer', 'walkaround').eq('engine_version', engine).in('stock', stocksList);
  if (snapErr) return { statusCode: 500, body: JSON.stringify({ error: snapErr.message }) };
  const snapByStock = new Map((snaps || []).map(s => [s.stock, s]));

  const summary = { engine, model, generated: [], abstained: [], failed: [], refused: [] };

  for (const stock of stocksList) {
    const snap = snapByStock.get(stock);
    const unit = inv.get(stock);
    if (!snap) { summary.refused.push({ stock, reason: 'no_snapshot_for_engine' }); continue; }
    if (!unit) { summary.refused.push({ stock, reason: 'inventory_not_found' }); continue; }
    if (!snap.bundle_md5 || snap.bundle_md5 !== snap.fingerprint) {
      console.error(`[REFUSE-FP] ${stock}: bundle_md5 != fingerprint`);
      summary.refused.push({ stock, reason: 'fingerprint_mismatch' }); continue;
    }
    if (snap.grounding != null || snap.generation_metrics != null) {
      summary.refused.push({ stock, reason: 'snapshot_already_consumed' }); continue;
    }
    const claimIds = Array.isArray(snap.claim_ids) ? snap.claim_ids : [];
    const bundleIds = ((snap.bundle && snap.bundle.items) || []).map(it => it && it.claim_id);
    const setEq = claimIds.length > 0
      && new Set(claimIds).size === claimIds.length
      && new Set(bundleIds).size === bundleIds.length
      && claimIds.length === bundleIds.length
      && bundleIds.every(id => claimIds.includes(id));
    if (!setEq) { summary.refused.push({ stock, reason: 'snapshot_claim_set_mismatch' }); continue; }
    const { data: claimRows, error: claimErr } = await supabase.from('understanding_claim')
      .select('id,review_state').in('id', bundleIds);
    if (claimErr || (claimRows || []).length !== bundleIds.length || (claimRows || []).some(c => c.review_state !== 'approved')) {
      summary.refused.push({ stock, reason: 'snapshot_claims_not_all_approved' }); continue;
    }
    const { data: existing, error: exErr } = await supabase.from('walkaround_review_queue')
      .select('id').eq('stock', stock).eq('engine_version', engine);
    if (exErr) { summary.failed.push({ stock, reason: 'queue_read_failed' }); continue; }
    if ((existing || []).length) {
      console.error(`[REFUSE-EXISTS] ${stock} ${engine}: queue row already exists; one-shot contract`);
      summary.refused.push({ stock, reason: 'queue_row_exists' }); continue;
    }

    // M_X claims: ONLY those explicitly linked to this frozen snapshot.
    const mxIds = Array.isArray(snap.mx_claim_ids) ? snap.mx_claim_ids : [];
    let mxClaims = [];
    if (mxIds.length) {
      const { data: mx, error: mxErr } = await supabase.from('understanding_claim')
        .select('id,state,review_state,value').in('id', mxIds);
      if (mxErr || (mx || []).length !== mxIds.length || (mx || []).some(c => c.state !== 'M_X' || c.review_state !== 'approved')) {
        summary.refused.push({ stock, reason: 'snapshot_mx_link_invalid' }); continue;
      }
      mxClaims = mx;
    }

    const userMessage = renderBundle(snap.bundle);
    const t0 = Date.now();
    let apiData, res;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: MAX_TOKENS, system: WALKAROUND_V15_SYSTEM_PROMPT, messages: [{ role: 'user', content: userMessage }] }),
      });
    } catch (e) {
      summary.failed.push({ stock, reason: 'transport_error' }); continue;
    }
    const durationMs = Date.now() - t0;
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[SKIP-API] ${stock}: ${res.status}: ${errText.slice(0, 200)}`);
      summary.failed.push({ stock, reason: 'anthropic_' + res.status }); continue;
    }
    apiData = await res.json();
    const textBlock = Array.isArray(apiData.content) ? apiData.content.find(b => b && b.type === 'text') : null;
    const parsed = parseModelJson((textBlock && textBlock.text || '').trim());
    const metrics = {
      model_requested: model, model_returned: apiData.model || null, duration_ms: durationMs,
      usage: apiData.usage || null, stop_reason: apiData.stop_reason || null, max_tokens: MAX_TOKENS,
    };
    if (!parsed || typeof parsed !== 'object') {
      const { data: pw, error: pwErr } = await supabase.from('understanding_snapshot').update({ generation_metrics: { ...metrics, parse: 'fail' } })
        .eq('id', snap.id).is('grounding', null).is('generation_metrics', null).select('id');
      const recorded = !pwErr && Array.isArray(pw) && pw.length === 1;
      summary.failed.push({ stock, reason: recorded ? 'parse_fail' : 'parse_fail_and_consumption_record_write_failed' }); continue;
    }

    const grounding = parsed._grounding || null;
    delete parsed._grounding;
    let checks;
    if (parsed.abstain === true) {
      checks = { abstain: true };
    } else {
      // Score the RAW model output first (as returned; version stamped only for the shape check).
      const raw = JSON.parse(JSON.stringify(parsed));
      checks = {
        scored_on: 'raw_model_output',
        shape: validateShape({ ...raw, version: raw.version == null ? '1.4' : raw.version }),
        grounding: validateGrounding(raw, grounding, snap.bundle),
        screens: screenContent(raw, grounding, snap.bundle, mxClaims),
      };
      // Then the permitted plain-text normalization for the stored generated_bi.
      if (Array.isArray(parsed.torque_take)) parsed.torque_take = parsed.torque_take.map(s => (s == null ? '' : plain(s))).filter(Boolean);
      const df = parsed.decision_factors;
      if (df && typeof df === 'object') {
        if (Array.isArray(df.makes_it_a_yes)) df.makes_it_a_yes = df.makes_it_a_yes.map(s => (s == null ? '' : plain(s))).filter(Boolean);
        if (typeof df.makes_it_a_yes_footer === 'string') df.makes_it_a_yes_footer = plain(df.makes_it_a_yes_footer);
      }
      if (typeof parsed.buyer_question === 'string') parsed.buyer_question = plain(parsed.buyer_question);
      parsed.version = '1.4';
    }
    const pass = checks.abstain || (!checks.shape.length && !checks.grounding.length && !checks.screens.length);
    const reviewNotes = checks.abstain ? 'v1.5 abstained'
      : pass ? `v1.5 checks PASS · snapshot ${snap.fingerprint}`
      : `v1.5 checks FAIL · snapshot ${snap.fingerprint} · shape ${checks.shape.length} · grounding ${checks.grounding.length} · screens ${checks.screens.length}`;

    const uncertaintyType = ALLOWED_UNCERTAINTY_TYPES.has(parsed.uncertainty_type) ? parsed.uncertainty_type : null;
    const title = [unit.year, unit.make, unit.model, unit.trim].filter(Boolean).join(' ') || 'Unit';
    // INSERT only — a unique (stock, engine_version) conflict is a failure, never an overwrite.
    const { error: qErr } = await supabase.from('walkaround_review_queue').insert({
      stock, title, category: unit.category || null, subcategory: unit.subcategory || null,
      generated_bi: parsed, status: 'generated', engine_version: engine,
      uncertainty_type: uncertaintyType, review_notes: reviewNotes,
    });
    if (qErr) {
      console.error(`[STOP-INSERT] ${stock} ${engine}: ${qErr.code || ''} ${qErr.message || ''}`);
      summary.failed.push({ stock, reason: qErr.code === '23505' ? 'queue_row_exists_at_insert' : 'queue_write_failed' }); continue;
    }

    // Written once: only while both fields are still NULL — and VERIFIED to hit exactly one row.
    const { data: sw, error: swErr } = await supabase.from('understanding_snapshot')
      .update({ grounding, generation_metrics: { ...metrics, checks } })
      .eq('id', snap.id).is('grounding', null).is('generation_metrics', null).select('id');
    if (swErr || !Array.isArray(sw) || sw.length !== 1) {
      console.error(`[AUDIT-WRITE-FAILED] ${stock} ${engine}: queue row inserted, snapshot audit record NOT written — preserved for reconciliation`);
      summary.failed.push({ stock, reason: 'snapshot_audit_write_failed_after_queue_insert' }); continue;
    }

    (parsed.abstain === true ? summary.abstained : summary.generated).push({ stock, pass, duration_ms: durationMs, usage: metrics.usage });
    console.log(`[V15] ${engine} ${stock} ${checks.abstain ? 'ABSTAIN' : pass ? 'PASS' : 'FAIL'} ${durationMs}ms`);
  }

  console.log('generate-walkaround-v15-background:', JSON.stringify(summary));
  return { statusCode: 200, body: JSON.stringify(summary) };
};
