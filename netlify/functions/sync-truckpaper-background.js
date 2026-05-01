const { createClient } = require('@supabase/supabase-js');
const { generateDescription } = require('./lib/generate-description');

// Strip marketing filler after a dash/em-dash separator, e.g.
// "Cummins ISB 6.7L - Powerful and efficient" → "Cummins ISB 6.7L"
// Leaves spec-embedded dashes intact: "6-Speed", "DT-466", "ISB6.7L"
function trimSpec(val) {
  if (!val) return val;
  return val.split(/\s*[—–]\s*|\s+-\s+/)[0].trim();
}

const MAKE_ACRONYMS = new Set(['GMC', 'RAM', 'JCB', 'BMW', 'KTM', 'ASV', 'CAT', 'JLG', 'GM', 'PJ']);

function normalizeMake(rawMake) {
  if (!rawMake) return null;
  const trimmed = rawMake.trim();
  if (!trimmed) return null;

  // If already mixed-case (not all-caps), trust it and leave alone
  // This preserves brands like CargoPro, Alcom-Stealth, Harley-Davidson
  if (trimmed !== trimmed.toUpperCase()) {
    // Exception: fix wrong-cased acronyms like "Gmc" → "GMC", "Ram" → "RAM"
    if (MAKE_ACRONYMS.has(trimmed.toUpperCase())) {
      return trimmed.toUpperCase();
    }
    return trimmed;
  }

  // String is all-caps — check if it's a known acronym first
  if (MAKE_ACRONYMS.has(trimmed)) return trimmed;

  // Otherwise, title-case each word, preserving acronyms mid-string
  return trimmed
    .toLowerCase()
    .split(/\s+/)
    .map(word => {
      if (MAKE_ACRONYMS.has(word.toUpperCase())) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

const DEALER_PREFIXES = {
  'Impex Heavy Metal': 'MPX-',
};

function normalizeStockNumber(rawStock, dealerName) {
  if (!rawStock) return null;
  const prefix = DEALER_PREFIXES[dealerName];
  if (!prefix) return rawStock;
  return rawStock.startsWith(prefix) ? rawStock : `${prefix}${rawStock}`;
}

function deriveSubcategory(item) {
  // 1. Direct field from Apify (rare but cheap to check)
  const direct = (item.subcategory || item.bodyType || item.body_type || item.vehicleType || '').toString().trim();
  if (direct) return direct;

  // 2. URL slug match (TruckPaper's own category taxonomy)
  const url = (item.source_url || item.url || '').toLowerCase();
  if (url) {
    const URL_SLUGS = [
      [/\/day-cab-trucks?\b/, 'Day Cab Tractor'],
      [/\/sleeper-trucks?\b/, 'Sleeper Tractor'],
      [/\/cab-and-chassis-trucks?\b/, 'Cab & Chassis'],
      [/\/yard-spotter-trucks?\b/, 'Yard Spotter'],
      [/\/service-trucks?(?:-slash-utility-trucks?)?(?:-slash-mechanic-trucks?)?\b/, 'Service Truck'],
      [/\/utility-trucks?\b/, 'Service Truck'],
      [/\/mechanic-trucks?\b/, 'Service Truck'],
      [/\/fire-trucks?\b/, 'Fire Truck'],
      [/\/dump-trucks?\b/, 'Dump Truck'],
      [/\/box-trucks?\b/, 'Box Truck'],
      [/\/flatbed-trucks?\b/, 'Flatbed Truck'],
      [/\/refrigerated-trucks?\b/, 'Refrigerated Truck'],
      [/\/rollback-trucks?\b/, 'Rollback Tow Truck'],
      [/\/tow-trucks?\b/, 'Tow Truck'],
      [/\/wrecker-trucks?\b/, 'Tow Truck'],
      [/\/car-hauler-trucks?\b/, 'Car Hauler'],
      [/\/car-carrier-trucks?\b/, 'Car Hauler'],
      [/\/bucket-trucks?\b/, 'Bucket Truck'],
      [/\/aerial-trucks?\b/, 'Bucket Truck'],
      [/\/garbage-trucks?\b/, 'Garbage Truck'],
      [/\/refuse-trucks?\b/, 'Garbage Truck'],
      [/\/mixer-trucks?\b/, 'Mixer Truck'],
      [/\/tanker-trucks?\b/, 'Tanker Truck'],
      [/\/fuel-trucks?\b/, 'Tanker Truck'],
      [/\/crane-trucks?\b/, 'Crane Truck'],
      [/\/cargo-vans?\b/, 'Cargo Van'],
      [/\/passenger-vans?\b/, 'Passenger Van'],
      [/\/pickup-trucks?\b/, 'Pickup Truck'],
      [/\/dovetail-trailers?\b/, 'Dovetail Trailer'],
      [/\/gooseneck-trailers?\b/, 'Gooseneck Trailer'],
      [/\/dump-trailers?\b/, 'Dump Trailer'],
      [/\/utility-trailers?\b/, 'Utility Trailer'],
      [/\/equipment-trailers?\b/, 'Equipment Trailer'],
      [/\/cargo-trailers?\b/, 'Cargo Trailer'],
      [/\/enclosed-trailers?\b/, 'Cargo Trailer'],
      [/\/lowboy-trailers?\b/, 'Lowboy Trailer'],
      [/\/dry-van-trailers?\b/, 'Dry Van Trailer'],
      [/\/flatbed-trailers?\b/, 'Flatbed Trailer'],
      [/\/reefer-trailers?\b/, 'Refrigerated Trailer'],
      [/\/refrigerated-trailers?\b/, 'Refrigerated Trailer'],
    ];
    for (const [rx, label] of URL_SLUGS) {
      if (rx.test(url)) return label;
    }
  }

  // 3. Keyword regex fallback against title/description/model
  const haystack = `${item.title || ''} ${item.description || ''} ${item.model || ''}`.toLowerCase();
  if (!haystack.trim()) return '';

  const PATTERNS = [
    [/\bcar\s*haul(er|ing)?\b|\bcar\s*carrier\b/, 'Car Hauler'],
    [/\brollback\b|\broll[\s-]*back\b/, 'Rollback Tow Truck'],
    [/\btow\s*truck\b|\bwrecker\b/, 'Tow Truck'],
    [/\bdump\s*truck\b|\bdump\s*body\b/, 'Dump Truck'],
    [/\bbox\s*truck\b|\bbox\s*van\b|\bcube\s*van\b/, 'Box Truck'],
    [/\brefrigerated\b|\breefer\b/, 'Refrigerated Truck'],
    [/\bflatbed\b/, 'Flatbed Truck'],
    [/\bcargo\s*van\b/, 'Cargo Van'],
    [/\bpassenger\s*van\b/, 'Passenger Van'],
    [/\btractor\b.*\bsleeper\b|\bsleeper\b.*\btractor\b/, 'Sleeper Tractor'],
    [/\bday\s*cab\b/, 'Day Cab Tractor'],
    [/\btractor\b/, 'Tractor'],
    [/\bservice\s*truck\b|\bmechanic\s*truck\b/, 'Service Truck'],
    [/\bbucket\s*truck\b|\baerial\s*truck\b/, 'Bucket Truck'],
    [/\bgarbage\s*truck\b|\brefuse\s*truck\b/, 'Garbage Truck'],
    [/\bcement\s*mixer\b|\bmixer\s*truck\b/, 'Mixer Truck'],
    [/\bfuel\s*truck\b|\btanker\b/, 'Tanker Truck'],
    [/\bcrane\s*truck\b/, 'Crane Truck'],
    [/\bdovetail\b/, 'Dovetail Trailer'],
    [/\bgooseneck\b/, 'Gooseneck Trailer'],
    [/\bdump\s*trailer\b/, 'Dump Trailer'],
    [/\butility\s*trailer\b/, 'Utility Trailer'],
    [/\bequipment\s*trailer\b/, 'Equipment Trailer'],
    [/\bcargo\s*trailer\b|\benclosed\s*trailer\b/, 'Cargo Trailer'],
    [/\blowboy\b/, 'Lowboy Trailer'],
    [/\bdry\s*van\b/, 'Dry Van Trailer'],
    [/\bpickup\b/, 'Pickup Truck'],
  ];

  for (const [rx, label] of PATTERNS) {
    if (rx.test(haystack)) return label;
  }
  return '';
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
        const rawStock = item.stock || item.stockNumber || (item.listingId ? String(item.listingId) : null);
        const stock = normalizeStockNumber(rawStock, dealer);
        if (!stock) return;
        incomingStocks.add(stock);

        const make = normalizeMake((item.make && item.make !== 'undefined') ? item.make : '') || '';
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
          subcategory: deriveSubcategory(item), sold: false, featured: 0, days: '0',
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
