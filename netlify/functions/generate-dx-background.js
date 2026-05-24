const { createClient } = require('@supabase/supabase-js');
const { generateDescription } = require('./lib/generate-description');

const DEALER_CONTACT = {
  'Davenport Motors':              { name: 'Davenport Motors',              phone: '252-809-2172', location: 'Plymouth, NC' },
  "Fat Daddy's Truck Sales":       { name: "Fat Daddy's Truck Sales",       phone: '919-759-5434', location: 'Goldsboro, NC' },
  'Wilson Trailer Sales & Service':{ name: 'Wilson Trailer Sales & Service',phone: '252-429-8805', location: 'Wilson, NC' },
  "HGR's Truck and Trailer":       { name: "HGR's Truck & Trailer Sales",   phone: '910-661-0868', location: 'Hope Mills, NC' },
  'Impex Heavy Metal':             { name: 'Impex Heavy Metal',             phone: '336-715-8704', location: 'Greensboro, NC' },
  "Joe's Tractor Sales":           { name: "Joe's Tractor Sales",           phone: '336-850-8271', location: 'Thomasville, NC' },
  'Auto Connection 210 LLC':       { name: 'Auto Connection 210 LLC',       phone: '910-490-2596', location: 'Angier, NC' },
  'Dick Smith Equipment':          { name: 'Dick Smith Equipment',          phone: '919-734-1191', location: 'Goldsboro, NC' },
  'Suttontown Repair Service':     { name: 'Suttontown Repair Service',     phone: '910-530-1732', location: 'Faison, NC' },
  'Fannon Land & Auction Co.':     { name: 'Fannon Land & Auction Co.',     phone: '276-821-1194', location: 'Pennington Gap, VA' },
  'Mid Atlantic Power & Equipment':{ name: 'Mid Atlantic Power & Equipment',phone: '910-889-9201', location: 'Dunn, NC' },
};

exports.handler = async (event) => {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing ANTHROPIC_API_KEY' }) };
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // Parse limit: default 5 (safe test batch), 0 or 'all' = no limit
  const rawLimit = event.queryStringParameters?.limit;
  const limitAll = rawLimit === '0' || rawLimit === 'all';
  const limit = limitAll ? null : (parseInt(rawLimit, 10) || 5);

  // Fetch all non-sold, non-locked units with fields needed for generation
  const { data: rows, error: fetchError } = await supabase
    .from('inventory')
    .select('stock, dealer, year, make, model, price, mileage, engine, transmission, drivetrain, fuel, vin, raw_description, description')
    .eq('sold', false)
    .eq('dx_locked', false);

  if (fetchError) {
    console.error('Fetch error:', fetchError.message);
    return { statusCode: 500, body: JSON.stringify({ error: fetchError.message }) };
  }

  // Filter in JS: keep only units whose description does NOT contain "Key Details" (clean-format signal)
  let candidates = (rows || []).filter(u => !(u.description || '').includes('Key Details'));
  const total_candidates = candidates.length;

  // Apply limit
  if (limit !== null) candidates = candidates.slice(0, limit);

  console.log(`generate-dx-background: ${(rows || []).length} total non-locked fetched, ${total_candidates} need regen, processing ${candidates.length} (limit=${limit ?? 'none'})`);

  let processed = 0, skipped_no_contact = 0, skipped_error = 0;

  for (const unit of candidates) {
    const dealerContact = DEALER_CONTACT[unit.dealer];
    if (!dealerContact) {
      console.warn(`[SKIP-NO-CONTACT] "${unit.dealer}" not in DEALER_CONTACT — ${unit.stock}`);
      skipped_no_contact++;
      continue;
    }

    try {
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
          description_generated_at: new Date().toISOString()
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

  const summary = { total_candidates, processed, skipped_no_contact, skipped_error, limit_applied: limit ?? 'none' };
  console.log('generate-dx-background complete:', JSON.stringify(summary));
  return { statusCode: 200, body: JSON.stringify(summary) };
};
