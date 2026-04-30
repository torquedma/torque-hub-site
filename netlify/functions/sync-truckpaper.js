const { createClient } = require('@supabase/supabase-js');
const { generateDescription } = require('./lib/generate-description');

// Strip marketing filler after a dash/em-dash separator, e.g.
// "Cummins ISB 6.7L - Powerful and efficient" → "Cummins ISB 6.7L"
// Leaves spec-embedded dashes intact: "6-Speed", "DT-466", "ISB6.7L"
function trimSpec(val) {
  if (!val) return val;
  return val.split(/\s*[—–]\s*|\s+-\s+/)[0].trim();
}

const DEALER_INFO_MAP = {
  'Impex Heavy Metal': { name: 'Impex Heavy Metal', phone: '336-715-8704', location: 'Greensboro, NC' },
  "HGR's Truck and Trailer": { name: "HGR's Truck and Trailer", phone: '910-661-0868', location: 'Hope Mills, NC' },
};

// Use background function for longer timeout (15 minutes vs 10 seconds)
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch(e) { return { statusCode: 400, body: 'Invalid JSON' }; }

  console.log('Webhook payload keys:', Object.keys(body).join(', '));
  console.log('Payload:', JSON.stringify(body).slice(0, 300));

  const apifyToken = process.env.APIFY_API_TOKEN;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  // Handle all Apify webhook payload formats
  let datasetId = body?.defaultDatasetId 
    || body?.eventData?.defaultDatasetId
    || body?.resource?.defaultDatasetId;
  
  const actorRunId = body?.actorRunId 
    || body?.eventData?.actorRunId
    || body?.resource?.id;
  
  const dealerName = body?.dealerName || 'Impex Heavy Metal';

  // If no dataset ID but have run ID, fetch it from the run
  if (!datasetId && actorRunId) {
    console.log('Looking up dataset for run:', actorRunId);
    try {
      const runRes = await fetch(`https://api.apify.com/v2/actor-runs/${actorRunId}?token=${apifyToken}`);
      const runData = await runRes.json();
      datasetId = runData?.data?.defaultDatasetId;
      console.log('Dataset ID from run:', datasetId);
    } catch(e) {
      console.error('Failed to get run data:', e.message);
    }
  }

  if (!datasetId) {
    console.error('No dataset ID. Full payload:', JSON.stringify(body));
    return { statusCode: 400, body: JSON.stringify({ error: 'No dataset ID found', payload: body }) };
  }

  console.log('Fetching dataset:', datasetId);
  
  const datasetUrl = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apifyToken}&format=json&clean=true&limit=10000`;

  let items;
  try {
    const res = await fetch(datasetUrl);
    if (!res.ok) throw new Error(`Apify fetch failed: ${res.status} ${await res.text()}`);
    items = await res.json();
  } catch(e) {
    console.error('Dataset fetch failed:', e.message);
    return { statusCode: 500, body: 'Dataset fetch failed: ' + e.message };
  }

  if (!items || !items.length) {
    return { statusCode: 200, body: JSON.stringify({ synced: 0, message: 'Empty dataset' }) };
  }

  console.log(`Syncing ${items.length} items for ${dealerName}`);

  const dealer = dealerName;

  // Get existing stocks
  const { data: existing } = await supabase
    .from('inventory')
    .select('stock')
    .eq('dealer', dealer)
    .eq('sold', false);

  const existingStocks = new Set((existing || []).map(u => u.stock));
  const incomingStocks = new Set();
  let synced = 0, errors = 0;

  // Process in batches of 10 to avoid timeouts
  const batchSize = 10;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map(async (item) => {
      try {
        const stock = item.stock || item.stockNumber || (item.listingId ? `MPX-${item.listingId}` : null);
        if (!stock) return;
        incomingStocks.add(stock);

        const make = (item.make && item.make !== 'undefined') ? item.make : '';
        const model = (item.model && item.model !== 'undefined') ? item.model : '';

        let mileage = item.mileage || '';
        if (!mileage && item.description) {
          const m = item.description.match(/([0-9,]+)\s*[Mm]iles/);
          if (m) mileage = m[1].replace(/,/g, '');
        }

        let engine = item.engine || '';
        if (!engine && item.description) {
          const m = item.description.match(/Engine[:\s•]+([^\n•✔]{5,60})/i);
          if (m) engine = m[1].trim();
        }
        engine = trimSpec(engine);

        let transmission = item.transmission || '';
        if (!transmission && item.description) {
          const m = item.description.match(/Transmission[:\s•]+([^\n•✔]{5,40})/i);
          if (m) transmission = m[1].trim();
        }
        transmission = trimSpec(transmission);

        let drivetrain = item.drivetrain || '';
        if (!drivetrain && item.description) {
          const m = item.description.match(/\b(4WD|RWD|AWD|2WD|4x4|4x2|6x4|6x2)\b/i);
          if (m) drivetrain = m[1].trim();
        }

        const rawDescription = item.description || item.title || '';
        const dealerInfo = DEALER_INFO_MAP[dealer] || { name: dealer };

        const unit = {
          stock, dealer,
          year: item.year ? String(item.year) : '',
          make, model,
          price: item.price ? String(item.price).replace(/[^0-9.]/g, '') : '',
          mileage, vin: item.vin || '', engine, transmission, drivetrain,
          fuel: item.fuel || 'Diesel',
          condition: item.condition || 'Used',
          raw_description: rawDescription,
          description: rawDescription,
          category: item.category || 'Trucks',
          subcategory: '', sold: false, featured: 0, days: '0',
          photos: Array.isArray(item.photos) ? item.photos : [],
          source_type: 'truckpaper_apify',
          source_url: item.source_url || item.url || '',
        };

        if (anthropicKey) {
          try {
            const desc = await generateDescription(unit, dealerInfo, anthropicKey);
            if (desc) unit.description = desc;
          } catch (e) {
            console.error(`Description generation failed for ${stock}:`, e.message);
          }
        }

        const isExisting = existingStocks.has(stock);
        const { error } = isExisting
          ? await supabase.from('inventory').update(unit).eq('stock', stock).eq('dealer', dealer)
          : await supabase.from('inventory').insert([unit]);

        if (error) { console.error(`Error ${stock}:`, error.message); errors++; }
        else synced++;
      } catch(e) { console.error('Item error:', e.message); errors++; }
    }));
  }

  // Mark removed units sold
  let markedSold = 0;
  for (const stock of existingStocks) {
    if (!incomingStocks.has(stock)) {
      await supabase.from('inventory').update({ sold: true, sold_type: 'feed_removed' }).eq('stock', stock).eq('dealer', dealer);
      markedSold++;
    }
  }

  const result = { synced, errors, markedSold, total: items.length, dealer };
  console.log('Sync complete:', result);
  return { statusCode: 200, body: JSON.stringify(result) };
};
