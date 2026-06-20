const { createClient } = require('@supabase/supabase-js');
const { generateDescription } = require('./lib/generate-description');
const { decodeVin } = require('./lib/vin-decode');

exports.handler = async (event) => {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing ANTHROPIC_API_KEY' }) };
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // ── (a) Fetch dealer contact info from Supabase at handler start ─────────
  const { data: dealerRows, error: dealerFetchError } = await supabase
    .from('dealers')
    .select('name, phone, city, state, website, site_url, address');
  if (dealerFetchError) {
    console.error('Failed to fetch dealers table:', dealerFetchError.message);
    return { statusCode: 500, body: JSON.stringify({ error: 'dealers fetch failed: ' + dealerFetchError.message }) };
  }
  const dealerMap = {};
  for (const d of (dealerRows || [])) {
    const location = [d.city, d.state].filter(Boolean).join(', ') || d.address || '';
    dealerMap[d.name] = { name: d.name, phone: d.phone || '', location };
  }

  // Parse limit: default 5 (safe test batch), 0 or 'all' = no limit, null qs = scheduled = unlimited
  const qs = event.queryStringParameters;
  const isAutomated = !qs;   // scheduled invocations pass null query params
  const rawLimit = qs?.limit;
  const limitAll = rawLimit === '0' || rawLimit === 'all' || isAutomated;
  const limit = limitAll ? null : (parseInt(rawLimit, 10) || 5);
  const stockParam = qs?.stock || null;
  const force = qs?.force === '1';

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
    .select('stock, dealer, year, make, model, price, mileage, engine, transmission, drivetrain, fuel, vin, raw_description, description')
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
  // Otherwise honour ?force=1 or the "no Key Details yet" heuristic.
  const forceAll = force || !!stocksList;
  let candidates = forceAll
    ? (rows || [])
    : (rows || []).filter(u => !(u.description || '').includes('Key Details'));
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

  let processed = 0, skipped_no_contact = 0, skipped_error = 0;

  for (const unit of candidates) {
    // ── (b) dealerMap replaces DEALER_CONTACT lookup ─────────────────────
    const dealerContact = dealerMap[unit.dealer];
    if (!dealerContact || !dealerContact.phone) {
      console.warn(`[SKIP-NO-CONTACT] "${unit.dealer}" missing from dealers table or has no phone — ${unit.stock}`);
      skipped_no_contact++;
      continue;
    }

    try {
      // vPIC enrichment (best-effort, fill-empty-only, never overwrite feed/dealer data)
      let vinDecoded = false;
      if (unit.vin) {
        const vp = await decodeVin(unit.vin);
        if (vp) {
          vinDecoded = true;
          // Fill empty existing fields only
          if (!unit.engine && vp.engineManufacturer) {
            unit.engine = [vp.engineManufacturer, vp.displacementL ? vp.displacementL + 'L' : null, vp.fuelTypePrimary].filter(Boolean).join(' ');
          }
          if (!unit.fuel && vp.fuelTypePrimary) unit.fuel = vp.fuelTypePrimary;
          if (!unit.drivetrain && vp.driveType) unit.drivetrain = vp.driveType;
          // Attach NEW vPIC-only fields for Key Details (drive type NOT here — handled via fill-empty above; no redundancy)
          unit._vpic = {
            gvwrClass:  vp.gvwrClass,
            bodyClass:  vp.bodyClass,
            horsepower: vp.horsepower,
            torque:     vp.torque,
          };
        }
      }

      const text = await generateDescription(unit, dealerContact, anthropicKey);

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
          ...(vinDecoded ? { vin_decoded_at: new Date().toISOString() } : {})
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
      console.error(`[SKIP-ERROR] ${unit.stock} (${unit.dealer}):`, err.message);
      skipped_error++;
    }
  }

  const summary = { total_candidates, processed, skipped_no_contact, skipped_error, limit_applied: stocksList ? 'n/a (stocks mode)' : (limit ?? 'none'), stocks_requested: stocksList ? stocksList.length : null, stock_filter: stocksList ? stocksList : stockParam, force: forceAll };
  console.log('generate-dx-background complete:', JSON.stringify(summary));
  return { statusCode: 200, body: JSON.stringify(summary) };
};
