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
const { isPhantom } = require('./lib/phantom-fields');
const { showMileage, showHours } = require('./lib/usage-display.generated.js');

// HARDCODED — pinned to this engine version. The (stock, engine_version)
// unique index in walkaround_review_queue is the upsert conflict target;
// regenerating the same stock under the same engine_version overwrites the
// pending review row, which is the desired behavior for retries.
//
// v1.4 contract (Foreman rulings 2026-09-18): the stored object is EXACTLY what
// the live cards consume — version, torque_take[] (displayed paragraphs only,
// no throwaway slot), decision_factors{makes_it_a_yes[4], makes_it_a_yes_footer},
// uncertainty_type, buyer_question. No identity block, no meet (Card 1 is the
// governed DX). Text evidence only. Abstention preserved.
const ENGINE_VERSION = 'walkaround-v1.4.1-fable-5-1';
// MODEL-ISOLATION COHORT (Foreman 2026-09-19): identical v1.4.1 prompt bytes and
// evidence, generation model changed from claude-haiku-4-5-20251001 to the current
// strongest generally available model per the Models overview (verified 2026-09-19):
// claude-fable-5-1. Stored contract unchanged (version "1.4").
const GENERATION_MODEL = 'claude-fable-5-1';

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
  // not a verified lifetime figure). Gate via the canonical usage-display rule so
  // the AI is never fed a value that wouldn't render to buyers (no fabrication).
  if (showHours(unit))    facts.push('Hours: ' + unit.hours + ' shown');
  if (showMileage(unit))  facts.push('Mileage: ' + unit.mileage);

  // Engine block
  if (unit.engine     && !isPhantom(unit, 'engine'))     facts.push('Engine: ' + unit.engine);
  if (unit.horsepower && !isPhantom(unit, 'horsepower')) facts.push('Horsepower: ' + unit.horsepower);
  if (unit.fuel       && !isPhantom(unit, 'fuel'))       facts.push('Fuel: ' + unit.fuel);

  if (unit.vin) facts.push('VIN: ' + unit.vin);

  return facts.join('\n');
}

function buildUserMessage(unit) {
  const factsBlock = buildFacts(unit);
  // Description is the listing's governed text (Canonical DX: Key Details +
  // Overview, or dealer copy where no Canonical DX exists yet). It is evidence
  // the buyer has already read as Card 1 — not a spec sheet the model may extend.
  const desc = (unit.description || '').toString().trim();
  const descBlock = desc
    ? '\n\nLISTING DESCRIPTION (text evidence — not a spec sheet you may extend):\n' + desc
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
          model: GENERATION_MODEL,
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
      // Select the text block by type: models with adaptive thinking may return a
      // thinking block before the text block, so content[0] is not guaranteed text.
      const textBlock = Array.isArray(apiData.content) ? apiData.content.find(b => b && b.type === 'text') : null;
      const raw = (textBlock?.text || '').trim();

      const parsed = parseModelJson(raw);
      if (!parsed || typeof parsed !== 'object') {
        console.error(`[SKIP-PARSE] ${unit.stock}: model output not parseable as JSON`);
        failed.push({ stock: unit.stock, reason: 'parse_fail' });
        continue;
      }

      const uncertaintyType = validateUncertaintyType(parsed.uncertainty_type);

      // v1.4 shape hygiene (non-abstain only): the contract has no placeholder
      // slot, so strip any empty/whitespace elements; stamp the contract version
      // so the Admin validator and the renderer can trust the stored shape.
      // v1.4.1 rule 9 (plain text): mechanical scrub of Markdown emphasis/code
      // characters and collapsed whitespace on every stored string. Content is
      // never rewritten — only these characters are removed.
      const plain = s => String(s).replace(/[*`_~]+/g, '').replace(/\s+/g, ' ').trim();
      if (Array.isArray(parsed.torque_take)) {
        parsed.torque_take = parsed.torque_take
          .map(s => (s == null ? '' : plain(s)))
          .filter(Boolean);
      }
      if (parsed.decision_factors && typeof parsed.decision_factors === 'object') {
        const df = parsed.decision_factors;
        if (Array.isArray(df.makes_it_a_yes)) df.makes_it_a_yes = df.makes_it_a_yes.map(s => (s == null ? '' : plain(s))).filter(Boolean);
        if (typeof df.makes_it_a_yes_footer === 'string') df.makes_it_a_yes_footer = plain(df.makes_it_a_yes_footer);
      }
      if (typeof parsed.buyer_question === 'string') parsed.buyer_question = plain(parsed.buyer_question);
      if (typeof parsed.title === 'string') parsed.title = plain(parsed.title);
      parsed.version = '1.4';

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
