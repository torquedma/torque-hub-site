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

function normalizeModel(model) {
  if (!model) return '';
  const s = String(model).trim();
  if (!s) return '';

  const letters = s.replace(/[^A-Za-z]/g, '');
  if (letters && letters !== letters.toUpperCase()) return s;

  const KEEP_UPPER = new Set([
    'GMC','RAM','BMW','KTM','ASV','CAT','JLG','GM','PJ','LLC','INC','CO',
    'HD','XL','XLT','SE','LE','LT','LTZ','SS','GT','GTS','RS','SR',
    'SXT','RT','EX','LX','DX','EXL','EXR','SEL','TRD','AWD','4WD',
    'RWD','FWD','M2','M3','M5','MX','SRT','XLE','XSE','XS',
    'II','III','IV','VI','VII','VIII','IX','X','XI','XII',
    'SD','NPR','NQR','NRR','FRR','FTR','FXR',
    'CXU','CHU','CXP','CHP','CXN',
    'DT','ISC','ISL','ISM','ISX',
    'HX','RD','RH','MR','MK',
    'PB','KW','FL','IH','IHC',
    'GVW','GVWR','DOT','EPA','EGR','DPF','DEF',
    'ACERT','MBE',
    'TT','BT','ST','MT','NT',
    'SLT','MV'
  ]);

  return s.split(/\s+/).map(word => {
    if (!word) return word;
    if (/^\d+$/.test(word)) return word;
    const alphaOnly = word.replace(/[^A-Za-z]/g, '');
    if (alphaOnly && KEEP_UPPER.has(alphaOnly.toUpperCase())) {
      return word.toUpperCase();
    }
    if (/\d/.test(word)) return word.toUpperCase();
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
}

const DEALER_PREFIXES = {
  'Impex Heavy Metal': 'MPX-',
  'Mid Atlantic Power & Equipment': 'MAP-',
  'The Trailer Source': 'TTS-',
  'Allied Truck & Trailer Sales': 'ATT-',
};

function normalizeStockNumber(rawStock, dealerName) {
  if (!rawStock) return null;
  const prefix = DEALER_PREFIXES[dealerName];
  if (!prefix) return rawStock;
  return rawStock.startsWith(prefix) ? rawStock : `${prefix}${rawStock}`;
}

// ── Canonical subcategory authority (first brick of the shared normalization layer) ──
const CANONICAL_SUBCATEGORIES = new Set([
  'Box Truck','Day Cab Tractor','Sleeper Tractor','Service Truck','Dump Truck',
  'Rollback Tow Truck','Tow Truck','Flatbed Truck','Car Carrier Truck','Cargo Van',
  'Passenger Van','Pickup Truck','Crane Truck','Refrigerated Truck','Tanker Truck',
  'Fuel Truck','Step Van','Garbage Truck','Concrete Mixer','Grain Dump Truck',
  'Bucket Truck','Mixer Truck','Yard Spotter','Cab & Chassis','Fire Truck','Winch Truck',
  'Crane Service Truck','Enclosed Landscape Truck',
  'Enclosed Trailer','Car Hauler Trailer','Utility Trailer','Dump Trailer','Equipment Trailer',
  'Gooseneck Trailer','Concession Trailer','Race Trailer','Deckover Trailer','Tilt Trailer',
  'Dovetail Trailer','Tank Trailer','Tanker Trailer','Dry Van Trailer','Motorcycle Trailer',
  'Landscape Trailer','Frameless Dump','Other Trailer','Reefer Trailer','Pole Trailer',
  'Reel / Cable Trailer','Curtain-Side Trailer','Lowboy Trailer','Flatbed Trailer',
  'Vending / Concession Trailer',
  'Skid Steer','Compact Track Loader','Loader','Wheel Loader','Boom Lift','Backhoe',
  'Excavator','Crawler Dozer','Forklift','Digger Derrick','Trencher','Scissor Lift',
  'Compactor','Scraper','Air Compressor','Motor Grader','Backhoe Attachment','Crawler Loader',
  'Tractor','Lawn Tractor','Zero Turn Mower','Walk Behind Mower','Front Mounted Mower',
  'Field Mower','Finish Mower','Rotary Cutter','Hay Rake','Baler','Cultivator','Planter',
  'Combine','Log Splitter','Wagon','Harrow','Disk','Box Scraper','Utility Vehicle','Land Leveler',
  'Overseeder','V-Ripper','Turf & Grounds Care',
  'SUV','Motorcycle','Classic Car','Engine','Side by Side','Boat','Freezer Box Body','Body',
]);

const SUBCATEGORY_ALIASES = {
  'Cargo / Enclosed Trailer': 'Enclosed Trailer',
  'Cargo Trailer': 'Enclosed Trailer',
  'Refrigerated Trailer': 'Reefer Trailer',
  'Equipment Trailers': 'Equipment Trailer',
  'Harrows': 'Harrow',
  'Disks': 'Disk',
  'Curtain-Side': 'Curtain-Side Trailer',
  'Dry Van': 'Dry Van Trailer',
  'Track Loader': 'Crawler Loader',
  'UTV': 'Utility Vehicle',
  'Car / Racing Trailer': 'Car Hauler Trailer',
  'Mower': '',
  'Lawn & Garden': '',
};

function canonicalize(value) {
  if (!value) return '';
  const v = value.toString().trim();
  const mapped = SUBCATEGORY_ALIASES.hasOwnProperty(v) ? SUBCATEGORY_ALIASES[v] : v;
  return CANONICAL_SUBCATEGORIES.has(mapped) ? mapped : '';
}

function deriveSubcategory(item) {
  const url = (item.source_url || item.url || '').toLowerCase();
  if (url) {
    const URL_SLUGS = [
      // MachineryTrader construction equipment
      [/[\/-]track-skid-steers?\b/, 'Track Skid Steer'],
      [/[\/-]wheel-skid-steers?\b/, 'Wheel Skid Steer'],
      [/[\/-]mini-skid-steers?\b/, 'Mini Skid Steer'],
      [/[\/-]mini-excavators?\b/, 'Mini Excavator'],
      [/[\/-]crawler-excavators?\b/, 'Crawler Excavator'],
      [/[\/-]wheel-loaders?\b/, 'Wheel Loader'],
      [/[\/-]crawler-dozers?\b/, 'Crawler Dozer'],
      [/[\/-]rough-terrain-forklifts(?:-lifts)?\b/, 'Forklift'],
      [/[\/-]cushion-tire-forklifts(?:-lifts)?\b/, 'Forklift'],
      [/[\/-]forklifts(?:-lifts)?\b/, 'Forklift'],
      [/[\/-]personnel-lifts\b/, 'Boom Lift'],
      [/[\/-]slab-scissor-lifts\b/, 'Scissor Lift'],
      [/[\/-]rough-terrain-scissor-lifts\b/, 'Scissor Lift'],
      [/[\/-]scissor-lifts\b/, 'Scissor Lift'],
      [/[\/-]air-compressors\b/, 'Air Compressor'],
      [/[\/-]dumpers\b/, 'Mini Dumper'],
      [/[\/-]utility-vehicles\b/, 'Utility Vehicle'],
      [/[\/-]day-cab-trucks?\b/, 'Day Cab Tractor'],
      [/[\/-]sleeper-trucks?\b/, 'Sleeper Tractor'],
      [/[\/-]cab-and-chassis-trucks?\b/, 'Cab & Chassis'],
      [/[\/-]yard-spotter-trucks?\b/, 'Yard Spotter'],
      [/[\/-]service-trucks?(?:-slash-utility-trucks?)?(?:-slash-mechanic-trucks?)?\b/, 'Service Truck'],
      [/[\/-]utility-trucks?\b/, 'Service Truck'],
      [/[\/-]mechanic-trucks?\b/, 'Service Truck'],
      [/[\/-]fire-trucks?\b/, 'Fire Truck'],
      [/[\/-]dump-trucks?\b/, 'Dump Truck'],
      [/[\/-]box-trucks?\b/, 'Box Truck'],
      [/[\/-]flatbed-trucks?\b/, 'Flatbed Truck'],
      [/[\/-]refrigerated-trucks?\b/, 'Refrigerated Truck'],
      [/[\/-]rollback-tow-trucks?\b/, 'Rollback Tow Truck'],
      [/[\/-]rollback-trucks?\b/, 'Rollback Tow Truck'],
      [/[\/-]tow-trucks?\b/, 'Tow Truck'],
      [/[\/-]wrecker-trucks?\b/, 'Tow Truck'],
      [/[\/-]car-hauler-trucks?\b/, 'Car Carrier Truck'],
      [/[\/-]car-carrier-trucks?\b/, 'Car Carrier Truck'],
      [/[\/-]bucket-trucks?\b/, 'Bucket Truck'],
      [/[\/-]aerial-trucks?\b/, 'Bucket Truck'],
      [/[\/-]garbage-trucks?\b/, 'Garbage Truck'],
      [/[\/-]refuse-trucks?\b/, 'Garbage Truck'],
      [/[\/-]mixer-trucks?\b/, 'Mixer Truck'],
      [/[\/-]tanker-trucks?\b/, 'Tanker Truck'],
      [/[\/-]fuel-trucks?\b/, 'Tanker Truck'],
      [/[\/-]crane-trucks?\b/, 'Crane Truck'],
      [/[\/-]cargo-vans?\b/, 'Cargo Van'],
      [/[\/-]passenger-vans?\b/, 'Passenger Van'],
      [/[\/-]pickup-trucks?\b/, 'Pickup Truck'],
      [/[\/-]dovetail-trailers?\b/, 'Dovetail Trailer'],
      [/[\/-]gooseneck-trailers?\b/, 'Gooseneck Trailer'],
      [/[\/-]dump-trailers?\b/, 'Dump Trailer'],
      [/[\/-]utility-trailers?\b/, 'Utility Trailer'],
      [/[\/-]equipment-trailers?\b/, 'Equipment Trailer'],
      [/[\/-]cargo-trailers?\b/, 'Enclosed Trailer'],
      [/[\/-]enclosed-trailers?\b/, 'Enclosed Trailer'],
      [/[\/-]lowboy-trailers?\b/, 'Lowboy Trailer'],
      [/[\/-]dry-van-trailers?\b/, 'Dry Van Trailer'],
      [/[\/-]flatbed-trailers?\b/, 'Flatbed Trailer'],
      [/[\/-]reefer-trailers?\b/, 'Reefer Trailer'],
      [/[\/-]refrigerated-trailers?\b/, 'Reefer Trailer'],
      [/[\/-]suvs?\b/, 'SUV'],
    ];
    for (const [rx, label] of URL_SLUGS) {
      if (rx.test(url)) return label;
    }
  }

  const direct = (item.subcategory || item.bodyType || item.body_type || item.vehicleType || '').toString().trim();
  if (direct) {
    const c = canonicalize(direct);
    if (c) return c;
  }

  const haystack = `${item.title || ''} ${item.description || ''} ${item.model || ''}`.toLowerCase();
  if (!haystack.trim()) return '';

  const PATTERNS = [
    [/\bcar\s*haul(er|ing)?\b|\bcar\s*carrier\b/, 'Car Carrier Truck'],
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
    [/\bcargo\s*trailer\b|\benclosed\s*trailer\b/, 'Enclosed Trailer'],
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
  'Mid Atlantic Power & Equipment': { name: 'Mid Atlantic Power & Equipment', phone: '910-889-9201', location: 'Dunn, NC' },
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

  const dealer = items.find(i => i.dealer)?.dealer || dealerName;

  // Pre-dedupe items by source_url. Same listing can appear twice if the
  // actor's stock-derivation falls back to listingId on one pass and reads
  // the dealer-style stock on another. Pick the best item per source_url.
  function _scoreItem(it) {
    var s = 0;
    var photos = Array.isArray(it.photos) ? it.photos : [];
    s += photos.length * 10;
    if (it.year) s += 1;
    if (it.price) s += 1;
    if (it.trim) s += 1;
    if (it.subcategory) s += 2;
    if (it.category) s += 1;
    var st = String(it.stock || it.stockNumber || '');
    if (st && !/^\d+$/.test(st)) s += 5; // prefer dealer-style stock over pure-numeric listing-id
    return s;
  }
  const _bySourceUrl = new Map();
  for (const it of items) {
    const key = String(it.source_url || it.url || '').trim();
    if (!key) {
      // No source_url — keep as-is (can't dedupe)
      _bySourceUrl.set('__nokey_' + Math.random(), it);
      continue;
    }
    const prev = _bySourceUrl.get(key);
    if (!prev || _scoreItem(it) > _scoreItem(prev)) _bySourceUrl.set(key, it);
  }
  const _beforeCount = items.length;
  items = Array.from(_bySourceUrl.values());
  if (items.length < _beforeCount) {
    console.log(`Pre-dedupe by source_url: ${_beforeCount} → ${items.length} items (collapsed ${_beforeCount - items.length} dupes)`);
  }

  // Get existing rows (stock + source_listing_id for dual-key upsert)
  const { data: existing } = await supabase
    .from('inventory')
    .select('stock,source_listing_id,subcategory_locked,model_locked')
    .eq('dealer', dealer)
    .eq('sold', false);

  const existingStocks = new Set((existing || []).map(u => u.stock));
  const existingByListingId = new Map();
  for (const row of (existing || [])) {
    if (row.source_listing_id) existingByListingId.set(row.source_listing_id, row.stock);
  }
  const lockedSubcat = new Set((existing || []).filter(u => u.subcategory_locked).map(u => u.stock));
  const lockedModel  = new Set((existing || []).filter(u => u.model_locked).map(u => u.stock));
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
        const model = normalizeModel((item.model && item.model !== 'undefined') ? item.model : '');

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

        const sub = deriveSubcategory(item);
        const subLower = (sub || '').toLowerCase();
        const CONSTRUCTION_SUBS = ['skid steer','excavator','wheel loader','crawler dozer','forklift','scissor lift','boom lift','air compressor','mini dumper','crane','backhoe','telehandler','grader','asphalt'];
        const FARM_SUBS = ['utility vehicle','tractor','mower','hay','baler','tedder','rake','planter','combine','sprayer','tillage'];
        let derivedCategory;
        if (subLower.includes('trailer')) derivedCategory = 'Trailers';
        else if (['suv','sedan','coupe','classic car','motorcycle','engine','power plant','boat'].some(function(k){ return subLower.includes(k); })) derivedCategory = 'Other';
        else if (CONSTRUCTION_SUBS.some(function(k){ return subLower.includes(k); })) derivedCategory = 'Construction';
        else if (FARM_SUBS.some(function(k){ return subLower.includes(k); })) derivedCategory = 'Farm';
        else if (item.category) derivedCategory = item.category;
        else derivedCategory = 'Trucks';
        const unit = {
          stock, dealer,
          year: item.year ? String(item.year) : '',
          make, model,
          trim: item.trim || sub || '',
          price: item.price ? String(item.price).replace(/[^0-9.]/g, '') : '',
          mileage, vin: item.vin || '', engine, transmission, drivetrain,
          fuel: item.fuel || 'Diesel',
          condition: item.condition || 'Used',
          raw_description: rawDescription,
          description: rawDescription,
          category: derivedCategory,
          subcategory: sub, sold: false, featured: 0, days: '0',
          photos: Array.isArray(item.photos) ? item.photos : [],
          source_type: (item.source_url || item.url || '').includes('machinerytrader.com') ? 'machinerytrader_apify' : (item.source_url || item.url || '').includes('truckpaper.com') ? 'truckpaper_apify' : (item.source_url || item.url || '').includes('tractorhouse.com') ? 'tractorhouse_apify' : 'sandhills_direct',
          source_url: item.source_url || item.url || '',
          source_listing_id: item.source_listing_id || null,
        };

        if (anthropicKey) {
          try {
            const desc = await generateDescription(unit, dealerInfo, anthropicKey);
            if (desc) unit.description = desc;
          } catch (e) {
            console.error(`Description generation failed for ${stock}:`, e.message);
          }
        }

        // Determine upsert path: prefer (dealer, source_listing_id) when present, fall back to (dealer, stock)
        const incomingListingId = item.source_listing_id || null;
        const matchedExistingStock = incomingListingId ? existingByListingId.get(incomingListingId) : null;
        const isExisting = matchedExistingStock ? true : existingStocks.has(stock);
        const lookupStock = matchedExistingStock || stock;

        if (isExisting) {
          if (lockedSubcat.has(lookupStock)) { delete unit.subcategory; delete unit.category; delete unit.trim; }
          if (lockedModel.has(lookupStock))  { delete unit.make; delete unit.model; }
        }

        let result;
        if (isExisting) {
          if (matchedExistingStock && incomingListingId) {
            // Match by source_listing_id (stable Sandhills ID, robust against stock-derivation changes)
            result = await supabase.from('inventory').update(unit).eq('source_listing_id', incomingListingId).eq('dealer', dealer).eq('sold', false);
          } else {
            // Legacy fallback: match by stock
            result = await supabase.from('inventory').update(unit).eq('stock', stock).eq('dealer', dealer).eq('sold', false);
          }
        } else {
          result = await supabase.from('inventory').insert([unit]);
        }
        const { error } = result;

        if (error) { console.error(`Error ${stock}:`, error.message); errors++; }
        else synced++;
      } catch(e) { console.error('Item error:', e.message); errors++; }
    }));
  }

  // Mark removed units sold — with safety check.
  // If incoming scrape is dramatically smaller than DB, abort mark-sold loop
  // to protect against partial scrape failures bulk-flagging good inventory.
  let markedSold = 0;
  const incomingFraction = existingStocks.size > 0 ? incomingStocks.size / existingStocks.size : 1;
  if (incomingFraction < 0.5 && existingStocks.size >= 10) {
    console.warn(`Mark-sold ABORTED for ${dealer}: incoming=${incomingStocks.size} existing=${existingStocks.size} (${(incomingFraction*100).toFixed(0)}%). Likely partial scrape — skipping mark-sold to preserve inventory.`);
  } else {
    for (const stock of existingStocks) {
      if (!incomingStocks.has(stock)) {
        await supabase.from('inventory').update({ sold: true, sold_type: 'feed_removed' }).eq('stock', stock).eq('dealer', dealer);
        markedSold++;
      }
    }
  }

  const result = { synced, errors, markedSold, total: items.length, dealer };
  console.log('Sync complete:', result);
  return { statusCode: 200, body: JSON.stringify(result) };
};
