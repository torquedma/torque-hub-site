// netlify/functions/generate-walkaround-background.js
//
// Generates Walkaround buyer_intelligence objects for a list of stocks and
// writes them to walkaround_review_queue for human review before promotion.
//
// STRICT WRITE BOUNDARY: this function is READ-ONLY against `inventory`.
// Writes only to `walkaround_review_queue`. There is no .from('inventory')
// .insert/.update/.upsert/.delete path anywhere in this file.
//
// Trigger: HTTP background function. ?stocks=A,B,C — comma-separated.
//
// Output: JSON summary { generated:[...], abstained:[...], failed:[...], not_found:[...] }.

const { createClient } = require('@supabase/supabase-js');
const { WALKAROUND_SYSTEM_PROMPT } = require('./lib/walkaround-prompt.js');

// HARDCODED — pinned to this engine version. The (stock, engine_version)
// unique index in walkaround_review_queue is the upsert conflict target;
// regenerating the same stock under the same engine_version overwrites the
// pending review row, which is the desired behavior for retries.
const ENGINE_VERSION = 'walkaround-v1.1-text';

// Six allowed uncertainty_type values. Anything else (including arrays,
// numbers, misspellings) is dropped to null before write.
const ALLOWED_UNCERTAINTY_TYPES = new Set([
  'term',
  'config',
  'business',
  'system',
  'condition',
  'ownership',
]);

// Conservative phantom-field suppression — drop fields the inventory feed
// commonly back-fills with defaults that don't apply (e.g. fuel='Diesel' on a
// farm attachment that has no engine). v1 covers the obvious cases; expand as
// review surfaces more. Erring on the side of INCLUDING a field is correct —
// the model is also given the description text as observable context.
const FARM_ATTACHMENT_SUBS = new Set([
  'backhoe attachment', 'hay rake', 'baler', 'cultivator', 'planter',
  'wagon', 'harrow', 'disk', 'box scraper', 'rotary cutter',
  'land leveler', 'overseeder', 'v-ripper',
]);

function isPhantom(unit, key) {
  const cat = String(unit.category || '').toLowerCase();
  const sub = String(unit.subcategory || '').toLowerCase();
  // Trailers don't have engines/fuel/transmission/drivetrain/horsepower/hours.
  // (Mileage is left in — axle miles are sometimes relevant.)
  if (cat === 'trailers') {
    if (key === 'engine' || key === 'fuel' || key === 'horsepower' || key === 'hours') return true;
  }
  // Farm attachments (non-self-propelled) have no engine block.
  if (cat === 'farm' && FARM_ATTACHMENT_SUBS.has(sub)) {
    if (key === 'engine' || key === 'fuel' || key === 'horsepower' || key === 'hours' || key === 'mileage') return true;
  }
  return false;
}

function buildFacts(unit) {
  const facts = [];
  if (unit.year)        facts.push('Year: ' + unit.year);
  if (unit.make)        facts.push('Make: ' + unit.make);
  if (unit.model)       facts.push('Model: ' + unit.model);
  if (unit.trim)        facts.push('Trim: ' + unit.trim);
  if (unit.category)    facts.push('Category: ' + unit.category);
  if (unit.subcategory) facts.push('Subcategory: ' + unit.subcategory);
  if (unit.condition)   facts.push('Condition: ' + unit.condition);

  if (unit.price) {
    const priceNum = Number(String(unit.price).replace(/[^0-9.]/g, ''));
    if (priceNum > 0) facts.push('Price: $' + priceNum.toLocaleString());
  }

  // Runtime / usage — hours marked "shown" per doctrine (it's what the meter shows,
  // not a verified lifetime figure).
  if (unit.hours    && !isPhantom(unit, 'hours'))    facts.push('Hours: ' + unit.hours + ' shown');
  if (unit.mileage  && !isPhantom(unit, 'mileage'))  facts.push('Mileage: ' + unit.mileage);

  // Engine block
  if (unit.engine     && !isPhantom(unit, 'engine'))     facts.push('Engine: ' + unit.engine);
  if (unit.horsepower && !isPhantom(unit, 'horsepower')) facts.push('Horsepower: ' + unit.horsepower);
  if (unit.fuel       && !isPhantom(unit, 'fuel'))       facts.push('Fuel: ' + unit.fuel);

  if (unit.vin) facts.push('VIN: ' + unit.vin);

  return facts.join('\n');
}

function buildUserMessage(unit) {
  const factsBlock = buildFacts(unit);
  // Description is observable context — the model should treat it as marketing
  // copy from the dealer, not as a verified spec sheet.
  const desc = (unit.description || '').toString().trim();
  const descBlock = desc
    ? '\n\nLISTING DESCRIPTION (text only — dealer copy, NOT verified spec):\n' + desc
    : '';
  return 'FACTS (from inventory record):\n' + factsBlock + descBlock;
}

// Parse the model's response. Returns the parsed object or null on failure.
// Handles direct JSON, fenced ```json``` blocks, and bare-object extraction.
function parseModelJson(raw) {
  try { return JSON.parse(raw); } catch (_) { /* fall through */ }
  const fence = raw.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (fence && fence[1]) {
    try { return JSON.parse(fence[1]); } catch (_) { /* fall through */ }
  }
  const bare = raw.match(/(\{[\s\S]*\})/);
  if (bare && bare[1]) {
    try { return JSON.parse(bare[1]); } catch (_) { /* fall through */ }
  }
  return null;
}

function validateUncertaintyType(value) {
  if (typeof value !== 'string') return null;
  return ALLOWED_UNCERTAINTY_TYPES.has(value) ? value : null;
}

exports.handler = async (event) => {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing ANTHROPIC_API_KEY' }) };
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // Parse ?stocks=A,B,C — split on comma only, trim each entry, preserve internal spaces.
  const qs = event.queryStringParameters || {};
  const stocksRaw = qs.stocks || '';
  const stocksList = stocksRaw
    ? stocksRaw.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  if (!stocksList.length) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing or empty ?stocks=A,B,C' }) };
  }

  // ── READ-ONLY fetch from inventory ───────────────────────────────────────
  const { data: rows, error: fetchError } = await supabase
    .from('inventory')
    .select('stock,year,make,model,trim,category,subcategory,price,hours,horsepower,mileage,engine,condition,fuel,vin,description')
    .in('stock', stocksList);

  if (fetchError) {
    console.error('inventory fetch error:', fetchError.message);
    return { statusCode: 500, body: JSON.stringify({ error: fetchError.message }) };
  }

  const found = rows || [];
  const foundStocks = new Set(found.map(u => u.stock));
  const notFound = stocksList.filter(s => !foundStocks.has(s));
  console.log(`generate-walkaround-background: requested=${stocksList.length}, found=${found.length}, not_found=${notFound.length}`);

  const generated = [];
  const abstained = [];
  const failed = [];

  for (const unit of found) {
    try {
      const userMessage = buildUserMessage(unit);

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 4096,
          system: WALKAROUND_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userMessage }],
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[SKIP-API] ${unit.stock}: Anthropic ${res.status}: ${errText.slice(0, 200)}`);
        failed.push({ stock: unit.stock, reason: 'anthropic_' + res.status });
        continue;
      }

      const apiData = await res.json();
      const raw = (apiData.content?.[0]?.text || '').trim();

      const parsed = parseModelJson(raw);
      if (!parsed || typeof parsed !== 'object') {
        console.error(`[SKIP-PARSE] ${unit.stock}: model output not parseable as JSON`);
        failed.push({ stock: unit.stock, reason: 'parse_fail' });
        continue;
      }

      const uncertaintyType = validateUncertaintyType(parsed.uncertainty_type);

      // Title for the queue row is built from the INVENTORY record (not the
      // model output) — keeps the review surface anchored in source-of-truth.
      const title = [unit.year, unit.make, unit.model, unit.trim].filter(Boolean).join(' ') || 'Unit';

      // ── WRITE only to walkaround_review_queue ───────────────────────────
      // Upsert conflict target: the unique index on (stock, engine_version).
      const queueRow = {
        stock:            unit.stock,
        title,
        category:         unit.category    || null,
        subcategory:      unit.subcategory || null,
        generated_bi:     parsed,
        status:           'generated',
        engine_version:   ENGINE_VERSION,
        uncertainty_type: uncertaintyType,
      };

      const { error: writeError } = await supabase
        .from('walkaround_review_queue')
        .upsert(queueRow, { onConflict: 'stock,engine_version' });

      if (writeError) {
        console.error(`[SKIP-WRITE] ${unit.stock}: ${writeError.message}`);
        failed.push({ stock: unit.stock, reason: 'write_fail' });
        continue;
      }

      if (parsed.abstain === true) {
        abstained.push(unit.stock);
        console.log(`[OK-ABSTAIN] ${unit.stock}`);
      } else {
        generated.push(unit.stock);
        console.log(`[OK] ${unit.stock} — uncertainty_type=${uncertaintyType || 'null'}`);
      }
    } catch (err) {
      console.error(`[SKIP-ERROR] ${unit.stock}: ${err.message}`);
      failed.push({ stock: unit.stock, reason: err.message });
    }
  }

  const summary = { generated, abstained, failed, not_found: notFound };
  console.log('generate-walkaround-background summary:', JSON.stringify(summary));
  return { statusCode: 200, body: JSON.stringify(summary) };
};
