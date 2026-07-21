const { createClient } = require('@supabase/supabase-js');
const { decodeVin } = require('./lib/vin-decode');
const { stampFacts } = require('./lib/provenance');

// ─────────────────────────────────────────────────────────────────────────────
// decode-vin-background.js — VIN ENRICHMENT, standalone.
//
// LIFECYCLE CONTRACT: torque-hub-INVENTORY-ENRICHMENT-LIFECYCLE-design-contract-locked-2026-07-21
// (Drive id 1xEHNWmNmbfJu-QInGKKUaDSojWxuKb60yzeJG5XK_2U). Read it before changing this file.
//
// THIS FUNCTION HAS EXACTLY ONE RESPONSIBILITY: decode VINs and persist what was learned.
// It does NOT read, write, or reason about `description` in any form. No LLM. No Anthropic key.
//
// It exists because description generation and VIN enrichment were previously coupled behind one
// selection gate (generate-dx-background.js line 66), which permanently locked 49 units out of
// decoding. See finding 14jHVbieTa6YQ29c31L7PcqQlL3GuGinrlUaUfLBdCkw.
//
// LOAD-BEARING RULES — do not "simplify" these away:
//   - NO dx_locked FILTER. dx_locked governs EDITORIAL content (descriptions). Factual enrichment
//     must not be frozen by an editorial flag. (Contract §5)
//   - length(trim(vin)) === 17 is NEVER bypassed, not even by ?force. A non-17 value is an equipment
//     PIN/serial or a stock number echoed in — vPIC cannot decode it, and retrying forever is the
//     failure mode this guard prevents. (Contract §5, board v11 T4.3)
//   - FLAT COLUMNS AND PROVENANCE ARE WRITTEN IN THE SAME UPDATE, ALWAYS. This is T1.1-d's lockstep
//     rule enforced at creation instead of cleaned up later. The old code wrote provenance but NOT
//     the flat columns, so every consumer reading flat columns (VDP spec table, filters, search)
//     never received the enrichment. (Contract §5 step 5)
//   - Provenance is NEVER written directly — only as the return value of stampFacts(). (Trust
//     arbiter invariant, 1Wucu9ZDnMS0r1t9KNIpDq3p9wn5lp6TBSlXmQl7uC5Q)
// ─────────────────────────────────────────────────────────────────────────────

const VIN_LENGTH = 17;

exports.handler = async (event) => {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // ── Params ────────────────────────────────────────────────────────────────
  // Scheduled invocations pass null query params => unlimited, no force.
  const qs = event.queryStringParameters;
  const isAutomated = !qs;
  const rawLimit = qs?.limit;
  const limitAll = rawLimit === '0' || rawLimit === 'all' || isAutomated;
  const limit = limitAll ? null : (parseInt(rawLimit, 10) || 5);

  const force = qs?.force === '1';
  const stocksRaw = qs?.stocks || null;
  const stocksList = stocksRaw
    ? stocksRaw.split(',').map(s => s.trim()).filter(Boolean)   // preserve internal spaces: "DBT-7800 P"
    : null;

  // D2: ?stocks= or ?force=1 bypasses the vin_decoded_at IS NULL filter (re-decode).
  // Legitimate triggers: corrected VIN, vPIC improved its database, our decode logic changed.
  const forceAll = force || !!stocksList;

  // ── Selection — THIS FUNCTION'S OWN CRITERION, derived from its own question ──
  // "Does this unit have an undecoded VIN?" — never "does it already have a description?"
  let query = supabase
    .from('inventory')
    .select('stock, dealer, vin, engine, fuel, drivetrain, gvwr_class, body_class, horsepower, provenance')
    .eq('sold', false)
    .not('vin', 'is', null);

  if (!forceAll) query = query.is('vin_decoded_at', null);
  if (stocksList) query = query.in('stock', stocksList);

  const { data: rows, error: fetchError } = await query;
  if (fetchError) {
    console.error('Fetch error:', fetchError.message);
    return { statusCode: 500, body: JSON.stringify({ error: fetchError.message }) };
  }

  // Length guard in JS — PostgREST cannot filter on length(). NEVER bypassed. (Contract §5)
  const wellFormed = (rows || []).filter(u => (u.vin || '').trim().length === VIN_LENGTH);
  const skipped_not_a_vin = (rows || []).length - wellFormed.length;

  let candidates = wellFormed;
  if (!stocksList && limit !== null) candidates = candidates.slice(0, limit);

  if (stocksList) {
    const found = new Set(wellFormed.map(u => u.stock));
    const missing = stocksList.filter(s => !found.has(s));
    console.log(`decode-vin-background [stocks mode]: requested=${stocksList.length}, eligible=${found.size}, not_found_or_not_a_vin=${missing.length}`);
    if (missing.length) console.log(`  not eligible: ${missing.join(', ')}`);
  }

  console.log(`decode-vin-background: ${(rows || []).length} fetched, ${skipped_not_a_vin} skipped (vin not 17 chars), ${candidates.length} to process (limit=${stocksList ? 'n/a (stocks mode)' : (limit ?? 'none')})`);

  let decoded = 0, no_data = 0, skipped_transport = 0, skipped_write_fail = 0, conflicts = 0;

  for (const unit of candidates) {
    try {
      // ── Ask vPIC ───────────────────────────────────────────────────────────
      // D1: vin_decoded_at answers "did we successfully ASK?" — not "did vPIC have anything?"
      // A response containing nothing useful (trailers, equipment, unknown VIN) STILL sets the
      // marker, or trailers become infinite retry machines. A TRANSPORT failure must NOT set it.
      //
      // VERIFIED against lib/vin-decode.js (2026-07-21). decodeVin() NEVER THROWS. It returns:
      //   null    -> invalid/missing VIN, transport failure (network/timeout/non-2xx), or malformed
      //              response. ALL RETRY-WORTHY. Do NOT set vin_decoded_at.
      //   object  -> vPIC responded and parsed. Individual fields may be null (its val() helper maps
      //              blanks and 'Not Applicable'/'Not Available'/'N/A'/'0' to null per-field).
      //              An ALL-NULL object is the "responded, nothing usable" case — trailers and
      //              equipment. That IS a completed ask: it falls through below, fills nothing,
      //              stamps no provenance, and sets vin_decoded_at. (Matches ATT-024943 live.)
      const vp = await decodeVin(unit.vin);

      if (!vp) {
        // NOT the trailer case — that returns an object. This is a genuine failure to ask.
        // Leaving vin_decoded_at null is deliberate: the unit retries next run. (D1)
        console.warn(`[NO-RESPONSE] ${unit.stock} (${unit.dealer}) — decodeVin returned null (transport/invalid/malformed); will retry`);
        skipped_transport++;
        continue;
      }

      // ── Fill-empty + conflict detection (D4 / D5) ─────────────────────────
      // D4: automated enrichment must not overwrite an explicitly entered value WITHOUT SURFACING
      // THE CONFLICT. The flat value stays; the vPIC value is preserved as a competing claim so a
      // later review can decide which becomes canonical. Silently discarding the disagreement would
      // be the opposite of what the provenance model exists to do.
      const writeFields = {};        // flat columns to persist (empty-only)
      const verifiedFacts = {};      // facts to stamp verified/vin_decode
      const conflicting = [];        // {fact, incoming, existing} — populated, disagreeing

      const vpicEngine = vp.engineManufacturer
        ? [vp.engineManufacturer, vp.displacementL ? vp.displacementL + 'L' : null, vp.fuelTypePrimary]
            .filter(Boolean).join(' ')
        : null;

      const proposals = [
        { fact: 'engine',     incoming: vpicEngine,          existing: unit.engine },
        { fact: 'fuel',       incoming: vp.fuelTypePrimary,  existing: unit.fuel },
        { fact: 'drivetrain', incoming: vp.driveType,        existing: unit.drivetrain },
        // Persisted 2026-07-22 (T1.3): previously lived ONLY in transient unit._vpic, read by the
        // description generator and never written anywhere. See amendment 1 — "facts required by
        // downstream lifecycle stages must not exist only in transient process memory."
        { fact: 'gvwr_class', incoming: vp.gvwrClass,        existing: unit.gvwr_class },
        { fact: 'body_class', incoming: vp.bodyClass,        existing: unit.body_class },
        // Horsepower canonicalized 2026-07-22 (Ryan): vPIC horsepower was a display-time fallback that
        // never touched the column. Under fill-empty it now becomes the canonical flat value when the
        // column is empty — provenance-tracked and visible to the VDP spec table, filters, and search
        // rather than only to the description. A dealer-entered value still always wins.
        // vPIC returns a bare number; the generator's flat-horsepower render already has a
        // double-suffix guard, so no formatting change is needed here.
        { fact: 'horsepower', incoming: vp.horsepower,       existing: unit.horsepower },
      ];

      for (const { fact, incoming, existing } of proposals) {
        if (!incoming) continue;
        const isEmpty = existing === null || existing === undefined || String(existing).trim() === '';
        if (isEmpty) {
          writeFields[fact] = incoming;
          verifiedFacts[fact] = incoming;
        } else if (String(existing).trim().toLowerCase() !== String(incoming).trim().toLowerCase()) {
          // Populated AND different: flat value untouched, disagreement surfaced.
          conflicting.push({ fact, incoming, existing });
        }
        // Populated and equivalent: nothing to do (no spurious claim).
      }

      // ── Provenance (via stampFacts ONLY — never a direct write) ────────────
      let newProvenance = null;
      if (Object.keys(verifiedFacts).length > 0) {
        newProvenance = stampFacts(unit.provenance || null, verifiedFacts, {
          source: 'vin_decode',
          trust: 'verified',
          mode: 'fill-empty',
        });
      }

      // ⚠️ D5 CONFLICT CLAIMS — NOT IMPLEMENTED HERE ON PURPOSE.
      // Recording a competing claim requires buildClaim()'s exact signature and the correct
      // relation from the locked vocabulary {qualifies, disputes, narrows, contextualizes, states,
      // estimates_actual}. Guessing at it would write malformed provenance through the trust
      // arbiter — worse than not writing it. Read lib/provenance.js, then implement:
      //   for (const c of conflicting) -> attach a claim to provenance[c.fact] carrying c.incoming,
      //   source vin_decode, trust verified, relation <chosen>, note naming the human/feed value.
      // Until then, conflicts are LOGGED so they are visible rather than silent.
      if (conflicting.length) {
        conflicts += conflicting.length;
        for (const c of conflicting) {
          console.warn(`[CONFLICT] ${unit.stock} (${unit.dealer}) ${c.fact}: existing="${c.existing}" vs vin_decode="${c.incoming}" — flat value KEPT, claim not yet recorded (see D5)`);
        }
      }

      // ── ONE UPDATE: flat columns + provenance + completion marker, together ──
      // The flat columns are the piece the old code omitted. Writing them here is what makes the
      // enrichment visible to the VDP spec table, filters, and search.
      const payload = {
        ...writeFields,
        vin_decoded_at: new Date().toISOString(),
        ...(newProvenance ? { provenance: newProvenance } : {}),
      };

      const { error: writeError } = await supabase
        .from('inventory')
        .update(payload)
        .eq('stock', unit.stock)
        .eq('sold', false);

      if (writeError) {
        console.error(`[WRITE-FAIL] ${unit.stock} (${unit.dealer}):`, writeError.message);
        skipped_write_fail++;
      } else {
        const filled = Object.keys(writeFields);
        if (filled.length) {
          console.log(`[OK] ${unit.stock} (${unit.dealer}) — filled: ${filled.join(', ')}`);
          decoded++;
        } else {
          // vPIC responded but had nothing to add (all-null fields, or every field already
          // populated). Stage complete, no provenance fabricated. This is correct, not a failure.
          console.log(`[OK-NO-FILL] ${unit.stock} (${unit.dealer}) — responded, nothing to add; stage marked complete`);
          no_data++;
        }
      }

    } catch (err) {
      // Assumed TRANSPORT failure (network / timeout / 5xx). Deliberately does NOT set
      // vin_decoded_at, so the unit retries on the next run. (D1)
      // ⚠️ Depends on decodeVin() throwing for transport failures — verify.
      console.error(`[TRANSPORT-FAIL] ${unit.stock} (${unit.dealer}):`, err.message, '— will retry');
      skipped_transport++;
    }
  }

  const summary = {
    fetched: (rows || []).length,
    skipped_not_a_vin,
    processed: candidates.length,
    decoded,
    no_data,
    conflicts,
    skipped_transport,
    skipped_write_fail,
    force: forceAll,
    stocks_requested: stocksList ? stocksList.length : null,
    limit_applied: stocksList ? 'n/a (stocks mode)' : (limit ?? 'none'),
  };
  console.log('decode-vin-background complete:', JSON.stringify(summary));
  return { statusCode: 200, body: JSON.stringify(summary) };
};
