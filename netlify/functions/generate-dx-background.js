const { createClient } = require('@supabase/supabase-js');
const { generateDescription } = require('./lib/generate-description.generated');

exports.handler = async (event) => {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing ANTHROPIC_API_KEY' }) };
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // Parse limit: default 5 (safe test batch), 0 or 'all' = no limit, null qs = scheduled = unlimited
  const qs = event.queryStringParameters;
  const isAutomated = !qs;   // scheduled invocations pass null query params
  const rawLimit = qs?.limit;
  const limitAll = rawLimit === '0' || rawLimit === 'all' || isAutomated;
  const limit = limitAll ? null : (parseInt(rawLimit, 10) || 5);
  const stockParam = qs?.stock || null;
  const force = qs?.force === '1';
  // Dry run: select candidates and report them, write nothing. PERMANENT, not
  // test scaffolding — a lifecycle-wide generator with hundreds of eligible
  // rows needs a read-only census mode. Also the only way to exercise the
  // non-force selector, since ?stocks= implies force (see forceAll below).
  const dryRun = qs?.dryRun === '1';

  // ?stocks=A,B,C — split on comma only; trim each value but preserve internal spaces
  // (e.g. "DBT-7800 P" must survive intact). Netlify decodes %20 → space before we see it.
  const stocksRaw = qs?.stocks || null;
  const stocksList = stocksRaw
    ? stocksRaw.split(',').map(s => s.trim()).filter(Boolean)
    : null;

  // Fetch non-sold, non-locked units.
  // ?stocks → PostgREST .in() filter; ?stock → single .eq(); otherwise fetch all.
  // dx_locked=false guard is always applied — locked units are excluded even if listed in ?stocks.
  let query = supabase
    .from('inventory')
    .select('stock, dealer, year, make, model, trim, category, subcategory, price, mileage, hours, engine, horsepower, transmission, drivetrain, fuel, condition, vin, raw_description, description, description_source, provenance, gvwr_class, body_class, vin_decoded_at, created_at')
    .eq('sold', false)
    .eq('dx_locked', false);
  if (stocksList)      query = query.in('stock', stocksList);
  else if (stockParam) query = query.eq('stock', stockParam);
  const { data: rows, error: fetchError } = await query;

  if (fetchError) {
    console.error('Fetch error:', fetchError.message);
    return { statusCode: 500, body: JSON.stringify({ error: fetchError.message }) };
  }

  // ?stocks implies force for the listed stocks — regenerate regardless of existing description.
  // Otherwise candidacy is LIFECYCLE STATE, not a presentation string.
  //
  // 2026-09-13: the previous test was !description.includes('Key Details').
  // That is a presentation substring, and the ingestion path emits it too, so
  // every unit arriving via dealer discovery was invisible to this function.
  // Measured 2026-09-13: all 38 units discovered in the 09-12/09-13 cutovers
  // had description_source = NULL (never Canonical) AND contained 'Key Details'
  // (skipped) — 38 of 38 blind.
  //
  // description_source is an explicit lifecycle/source field.
  // This function stamps 'torque_hub_dx' when Canonical DX is generated.
  // Other ingestion paths may write other values or leave it NULL
  // (hgr-sync.js sets 'raw_description' at parse time, for example).
  // Therefore only description_source === 'torque_hub_dx' establishes
  // that the current description came from the Canonical DX engine.
  // NULL-safe by construction: the comparison runs in JS on a fetched value,
  // NOT as a PostgREST .neq(), which would exclude NULL rows entirely.
  const forceAll = force || !!stocksList;
  let candidates = forceAll
    ? (rows || [])
    : (rows || []).filter(u => u.description_source !== 'torque_hub_dx');

  // D6 (lifecycle contract): description generation must not race ahead of an
  // eligible, incomplete VIN-decode stage. A real-VIN unit not yet decoded is
  // DEFERRED so its description gets the decoded facts. Bounded-wait release
  // prevents a never-decoding unit from never getting a description. ?stocks
  // bypasses this (operator override).
  const BOUNDED_WAIT_DAYS = 3;
  const nowMs = Date.now();
  if (!stocksList) {
    candidates = candidates.filter(u => {
      if ((u.vin || '').trim().length !== 17) return true;
      if (u.vin_decoded_at) return true;
      const ageDays = (nowMs - new Date(u.created_at).getTime()) / 86400000;
      if (ageDays > BOUNDED_WAIT_DAYS) {
        console.warn(`[D6-RELEASE] ${u.stock} — waited ${ageDays.toFixed(1)}d for decode; releasing`);
        return true;
      }
      console.log(`[D6-WAIT] ${u.stock} — real VIN undecoded; deferring description`);
      return false;
    });
  }

  const total_candidates = candidates.length;

  // Report how many of the requested stocks were actually found (post dx_locked filter).
  if (stocksList) {
    const foundStocks = new Set((rows || []).map(u => u.stock));
    const notFound = stocksList.filter(s => !foundStocks.has(s));
    console.log(`generate-dx-background [stocks mode]: requested=${stocksList.length}, found/unlocked=${foundStocks.size}, not_found_or_locked=${notFound.length}`);
    if (notFound.length) console.log(`  not found/locked: ${notFound.join(', ')}`);
  }

  // Apply limit (ignored in ?stocks mode — listed stocks are always processed in full).
  if (!stocksList && limit !== null) candidates = candidates.slice(0, limit);

  console.log(`generate-dx-background: ${(rows || []).length} total fetched, ${total_candidates} candidates, processing ${candidates.length} (limit=${stocksList ? 'n/a (stocks mode)' : (limit ?? 'none')})`);

  let processed = 0, skipped_error = 0;
  let skipped_insufficient_evidence = 0;

  if (dryRun) {
    console.log(`[DRY-RUN] would process ${candidates.length}: ${candidates.map(u => u.stock).join(', ')}`);
    return { statusCode: 200, body: JSON.stringify({
      dry_run: true, total_candidates, would_process: candidates.length,
      stocks: candidates.map(u => u.stock),
    }) };
  }

  // TEMPORARY CONTAINMENT — 2026-09-13.
  // Corrected lifecycle selection exposes historical non-Canonical rows.
  // Until fresh-inventory automation has its own eligibility boundary,
  // writes must be explicitly stock-scoped. Dry-run remains unrestricted.
  if (!dryRun && !stocksList && !stockParam) {
    console.warn(`[BLOCKED-UNBOUNDED-WRITE] ${candidates.length} candidates selected; explicit stock scope required`);
    return {
      statusCode: 409,
      body: JSON.stringify({
        error: 'UNBOUNDED_DX_WRITE_BLOCKED',
        candidates: candidates.length,
        message: 'Use dryRun=1 to inspect candidates or specify stock/stocks for an intentional bounded write.',
      }),
    };
  }

  for (const unit of candidates) {
    try {
      // VIN decoding lives in decode-vin-background.js (T1.3). This function
      // READS decoded facts (engine/fuel/drivetrain/gvwr_class/body_class/
      // horsepower on the row, plus provenance for T1.2-A usage rendering) but
      // no longer performs decoding.
      const text = await generateDescription(unit, anthropicKey);

      if (!text || !text.trim()) {
        console.warn(`[SKIP-EMPTY] Empty description returned for ${unit.stock}`);
        skipped_error++;
        continue;
      }

      const { error: writeError } = await supabase
        .from('inventory')
        .update({
          description: text,
          description_source: 'torque_hub_dx',
          description_generated_at: new Date().toISOString(),
        })
        .eq('stock', unit.stock)
        .eq('sold', false);

      if (writeError) {
        console.error(`[SKIP-WRITE-FAIL] ${unit.stock} (${unit.dealer}):`, writeError.message);
        skipped_error++;
      } else {
        console.log(`[OK] ${unit.stock} (${unit.dealer}) — "${text.slice(0, 60).replace(/\n/g, ' ')}..."`);
        processed++;
      }
    } catch (err) {
      if (err.code === 'INSUFFICIENT_EVIDENCE') {
        console.log(`[SKIP-INSUFFICIENT-EVIDENCE] ${unit.stock} (${unit.dealer}) — ${err.message} Existing description left unchanged.`);
        skipped_insufficient_evidence++;
      } else {
        console.error(`[SKIP-ERROR] ${unit.stock} (${unit.dealer}):`, err.message);
        skipped_error++;
      }
    }
  }

  const summary = { total_candidates, processed, skipped_error, skipped_insufficient_evidence, limit_applied: stocksList ? 'n/a (stocks mode)' : (limit ?? 'none'), stocks_requested: stocksList ? stocksList.length : null, stock_filter: stocksList ? stocksList : stockParam, force: forceAll };
  console.log('generate-dx-background complete:', JSON.stringify(summary));
  return { statusCode: 200, body: JSON.stringify(summary) };
};
