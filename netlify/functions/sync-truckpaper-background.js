const { createClient } = require('@supabase/supabase-js');
const { generateDescription } = require('./lib/generate-description.generated');
const { CANONICAL_SUBCATEGORIES, SUBCATEGORY_ALIASES, canonicalize } = require('./lib/taxonomy.generated.js');
const { isPhantom } = require('./lib/phantom-fields');
const { isKnownSuppressMileage, isKnownSuppressHours } = require('./lib/usage-display.generated.js');
const { stampFacts } = require('./lib/provenance');

// Strip marketing filler after a dash/em-dash separator, e.g.
// "Cummins ISB 6.7L - Powerful and efficient" → "Cummins ISB 6.7L"
// Leaves spec-embedded dashes intact: "6-Speed", "DT-466", "ISB6.7L"
function trimSpec(val) {
  if (!val) return val;
  return val.split(/\s*[—–]\s*|\s+-\s+/)[0].trim();
}

function cleanEngine(v) {
  if (!v) return '';
  v = String(v).trim();
  if (!v) return '';
  if (/[*|]/.test(v)) return '';                         // bullet/feature-list delimiters
  if (/^[a-z]/.test(v)) return '';                       // prose fragment (lowercase start)
  if (/^\d+(\.\d+)?\s*(hours?|hrs?|miles?|mi)\b/i.test(v)) return '';  // "12000 HOURS" usage fragments
  if (/\b(speed|automatic|manual|allison|eaton|fuller|transmission|brake|frame|axle|gvw|gvwr|invert|pintle|gladhand|differential|divider|suspension|wheel\s?base|cab to frame|lockers|cruise|power steering|cold ac)\b/i.test(v)) return '';
  if (v.length > 50) return '';
  return v;
}

const MAKE_ACRONYMS = new Set(['GMC', 'RAM', 'JCB', 'BMW', 'KTM', 'ASV', 'CAT', 'JLG', 'GM', 'PJ']);
const BODY_MAKERS = new Set(['lift bodies inc','a.m. haire','custom built','johnson','marion','morgan','supreme','kidron']);

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

// Known multi-word makes. The upstream Sandhills/actor h1 parser splits make on
// the first space, so "Mid State Trailers Foo" arrives as make="Mid", model="State Trailers Foo".
// This repair layer re-joins them on ingest. Exact-pattern only (make === first word
// AND model starts with the remaining words at a word boundary) so it never over-merges.
// Sorted longest-first so the most specific known make wins on any future overlap.
// NOTE: duplicate of canonical make authority — promote to shared module when one exists;
// the same list can also be applied in the Apify actor Web IDE to fix the split at source.
const MULTI_WORD_MAKES = [
  'Mid State Trailers',
  'Massey Ferguson',
  'Down 2 Earth',
  'Road Clipper',
  'New Holland',
  'PJ Trailers',
  'Land Rover',
  'Big Country',
  'John Deere',
  'Load Trail',
  'Sure Trac',
  'Case IH',
  'Big Tex'
].sort((a, b) => b.length - a.length);

const KNOWN_EQUIPMENT_CRANE_MAKES = ['imt','hiab','fassi','palfinger','national','terex','effer','manitex','elliott','altec','linkbelt','grove','tadano','manitowoc','liebherr'];

// Returns { make, model } with a known multi-word make re-joined if the
// split pattern is detected; otherwise returns the inputs unchanged.
function repairMultiWordMake(make, model) {
  const m = (make || '').trim();
  const mod = (model || '').trim();
  if (!m || !mod) return { make: make, model: model };
  for (const full of MULTI_WORD_MAKES) {
    const parts = full.split(' ');
    const firstWord = parts[0];
    const rest = parts.slice(1).join(' ');           // e.g. "State Trailers"
    const restLower = rest.toLowerCase();
    // make must equal the first word (case-insensitive) AND model must start with
    // the rest at a word boundary (exact, or followed by a space).
    if (m.toLowerCase() === firstWord.toLowerCase() &&
        (mod.toLowerCase() === restLower || mod.toLowerCase().startsWith(restLower + ' '))) {
      const newModel = mod.length === rest.length ? '' : mod.slice(rest.length).trim();
      return { make: full, model: newModel };
    }
  }
  return { make: make, model: model };
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
  'Mid-Atlantic Power & Equipment': 'MAP-',
  'The Trailer Source': 'TTS-',
  'Allied Truck & Trailer Sales': 'ATT-',
  'DeBary Truck Sales': 'DBT-',
};

const FORCE_FALLBACK_DEALERS = new Set([
  'Allied Truck & Trailer Sales',
]);

function stripSandhillsJunkPhotos(photos) {
  if (!Array.isArray(photos)) return photos;
  return photos.filter(function(p) {
    var url = (p && p.url) ? String(p.url) : '';
    // Junk class 1: injected branding frames served with wid=0 (real photos carry the dealer widget id).
    if (/[?&]wid=0(?:&|$)/.test(url)) return false;
    // Junk class 2: page-furniture frames (disclaimer/sticker/QR/similar-listings) the scraper sweeps in
    // via querySelectorAll('img').
    // Observed 2026-06-01 (418 units / 5 Sandhills dealers):
    //   Real photo checksums:        ~46-60 chars
    //   Junk/page-furniture checksums: 164+ chars
    //   Threshold set at >100 to leave a large safety margin; max 4 junk frames per unit, zero false positives.
    var cs = (url.match(/[?&]checksum=([^&]+)/) || [])[1] || '';
    if (cs.length > 100) return false;
    return true;
  });
}

function reorderDbtPhotos(photos, dealer) {
  if (dealer !== 'DeBary Truck Sales') return photos;
  if (!Array.isArray(photos) || photos.length < 3) return photos;
  const originalFirst = photos[0];
  const third = photos[2];
  const middle = photos.slice(1, 2).concat(photos.slice(3)); // indices 1, then 3..end
  return [third].concat(middle).concat([originalFirst]);
}

function normalizeStockNumber(rawStock, dealerName, sourceListingId) {
  const raw = rawStock ? String(rawStock).trim() : '';
  const sourceId = sourceListingId ? String(sourceListingId).trim() : '';
  const prefix = DEALER_PREFIXES[dealerName];
  if (!prefix) return raw || null;
  // Strip existing prefix for comparison purposes
  const stripped = raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
  const forceFallback = FORCE_FALLBACK_DEALERS.has(dealerName);
  // Fallback rule: if no real internal stock parsed (either missing OR equal to source_listing_id),
  // OR if dealer is in FORCE_FALLBACK_DEALERS (parsed stock is unreliable, e.g. Allied's ad-hoc labels),
  // use last 6 digits of source_listing_id
  if (!stripped || (sourceId && stripped === sourceId) || forceFallback) {
    if (!sourceId) return null;
    return `${prefix}${sourceId.slice(-6)}`;
  }
  return raw.startsWith(prefix) ? raw : `${prefix}${stripped}`;
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
      [/[\/-]roll-?off-trucks?\b|[\/-]hooklift-trucks?\b/, 'Roll-Off'],
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
      [/[\/-]boom-trucks?\b/, 'Boom Truck'],
      [/[\/-]garbage-trucks?\b/, 'Garbage Truck'],
      [/[\/-]refuse-trucks?\b/, 'Garbage Truck'],
      [/[\/-]mixer-trucks?\b/, 'Mixer Truck'],
      [/[\/-]tanker-trucks?\b/, 'Tanker Truck'],
      [/[\/-]fuel-trucks?\b/, 'Tanker Truck'],
      [/[\/-]vacuum-trucks?\b/, 'Vacuum Truck'],
      [/[\/-]septic-trucks?\b/, 'Vacuum Truck'],
      [/[\/-]sewer-trucks?\b/,  'Vacuum Truck'],
      [/knuckle-boom-cranes?\b|[\/-]mounted-cranes?\b|boom-cranes?\b/, 'Crane Truck'],
      [/[\/-]crane-trucks?\b/, 'Crane Truck'],
      [/[\/-]landscape-trucks?\b/, 'Landscape Truck'],
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
      [/[\/-]conestoga-trailers?\b/, 'Conestoga Trailer'],
      [/[\/-]boom-mowers?\b/, 'Boom Mower'],
      [/[\/-]flail-mowers?\b/, 'Boom Mower'],
      [/[\/-]drum-mowers?\b/, 'Drum Mower'],
      [/[\/-]suvs?\b/, 'SUV'],
      // 2026-09-13 — dealer-direct taxonomy slugs. The dealer states these
      // explicitly in the listing URL; capturing them is ingestion, not
      // inference. Missing entries left subcategory empty, which in turn
      // made showHours()/showMileage() abstain: MAP-256361 held hours
      // '5,805' that never reached a buyer because its class was unknown.
      [/[\/-]motor-graders?\b/, 'Motor Grader'],
      [/[\/-]motor-scrapers?\b/, 'Scraper'],
      [/[\/-]wheel-excavators?\b/, 'Excavator'],
      [/[\/-]crawler-loaders?\b/, 'Crawler Loader'],
      [/[\/-]articulating-boom-lifts?\b/, 'Boom Lift'],
      [/[\/-]telescopic-boom-lifts?\b/, 'Boom Lift'],
      [/[\/-]walk-behind-lawn-mowers?\b/, 'Walk Behind Mower'],
      [/[\/-]water-tank-trucks?\b/, 'Water Truck'],
      [/[\/-]septic-tank-trucks?\b/, 'Vacuum Truck'],
      [/[\/-]disks-tillage-equipment\b/, 'Disk'],
      // HP-band tractor slugs encode a horsepower RANGE as a browse facet.
      // They establish the machine class ONLY. The band must never populate
      // horsepower — same trap as vPIC's 'Engine Brake (hp) From' (RC-7).
      [/[\/-][0-9]+-hp-to-[0-9]+-hp-tractors?\b/, 'Tractor'],
    ];
    for (const [rx, label] of URL_SLUGS) {
      if (rx.test(url)) {
        // TAXONOMY FIREWALL. The URL path previously returned its label raw
        // while the `direct` path below went through canonicalize(). That let
        // non-canonical labels reach the database: 5 live rows hold
        // 'Track Skid Steer' and 2 hold 'Crawler Excavator' (measured
        // 2026-09-13), both of which are aliases, not canonical values.
        // Both paths now resolve through the single source of truth.
        const c = canonicalize(label);
        if (c) return c;
      }
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
    [/\broll[\s-]*off\b|\bhook[\s-]*lift\b|\bgalbreath\b|\bstellar\s*system\b|\bmiller\s*hooklift\b|\broll[\s-]*rite\b/, 'Roll-Off'],
    [/\bdump\s*truck\b|\bdump\s*body\b/, 'Dump Truck'],
    [/\bbox\s*truck\b|\bbox\s*van\b|\bcube\s*van\b/, 'Box Truck'],
    [/\brefrigerated\b|\breefer\b/, 'Refrigerated Truck'],
    [/\bflatbed\s*trailer\b/, 'Flatbed Trailer'],
    [/\bflatbed\b/, 'Flatbed Truck'],
    [/\bcargo\s*van\b/, 'Cargo Van'],
    [/\bpassenger\s*van\b/, 'Passenger Van'],
    [/\btractor\b.*\bsleeper\b|\bsleeper\b.*\btractor\b/, 'Sleeper Tractor'],
    [/\bday\s*cab\b/, 'Day Cab Tractor'],
    [/\bvacuum\s*truck\b|\bvac\s*truck\b|\bseptic\s*truck\b|\bsewer\s*truck\b|\bsewer\s*cleaner\b|\bvactor\b|\bjetter\b|\bcamel\s*jet\b/, 'Vacuum Truck'],
    [/\btractor\b/, 'Tractor'],
    [/\bservice\s*truck\b|\bmechanic\s*truck\b/, 'Service Truck'],
    [/\bbucket\s*truck\b|\baerial\s*truck\b/, 'Bucket Truck'],
    [/\bboom\s*truck\b/, 'Boom Truck'],
    [/\bgarbage\s*truck\b|\brefuse\s*truck\b/, 'Garbage Truck'],
    [/\bcement\s*mixer\b|\bmixer\s*truck\b/, 'Mixer Truck'],
    [/\bfuel\s*truck\b|\btanker\b/, 'Tanker Truck'],
    [/\bcrane\s*truck\b/, 'Crane Truck'],
    [/\blandscape\s*truck\b/, 'Landscape Truck'],
    [/\bdovetail\b/, 'Dovetail Trailer'],
    [/\bgooseneck\b/, 'Gooseneck Trailer'],
    [/\bdump\s*trailer\b/, 'Dump Trailer'],
    [/\butility\s*trailer\b/, 'Utility Trailer'],
    [/\bequipment\s*trailer\b/, 'Equipment Trailer'],
    [/\bcargo\s*trailer\b|\benclosed\s*trailer\b/, 'Enclosed Trailer'],
    [/\blowboy\b/, 'Lowboy Trailer'],
    [/\bdry\s*van\b/, 'Dry Van Trailer'],
    [/\bconestoga\b/, 'Conestoga Trailer'],
    [/\bboom\s*mower\b|\bflail\s*mower\b|\bditch\s*mower\b|\bverge\s*mower\b/, 'Boom Mower'],
    [/\bdrum\s*mower\b/, 'Drum Mower'],
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
  'Mid-Atlantic Power & Equipment': { name: 'Mid-Atlantic Power & Equipment', phone: '910-889-9201', location: 'Dunn, NC' },
};

// 2026-09-04 INVENTORY AUTHORITY FREEZE. The marketplace-feed (and Mid-Atlantic
// dealer-site) actors have been shown to return incomplete populations that the
// existing 50% ratio gate cannot detect (a stable-incompleteness feed scores 1.00
// against yesterday's already-truncated snapshot). Until dealer-site-authoritative
// discovery with an external completeness invariant is in place, this file must
// NOT mark rows sold_type='feed_removed' for these dealers, and MUST NOT
// D1-resurrect for them either (the same untrusted feed drives both writes).
// Ingestion of new listings and updates to existing live rows continue.
// Remove entries only when their dealer's discovery is proven complete.
const FROZEN_DEALERS = new Set([
  'DeBary Truck Sales',
  "HGR's Truck and Trailer",
  // 2026-09-12: The Trailer Source removed — dealer-owned discovery
  // authenticated complete (unscoped surface 6 of 6, identity-set equality
  // both directions, maxItems raised 3 -> 100 so the cap no longer binds).
  // Its historical failure mode is worth remembering: a discovery cap below
  // the live population keeps inc/exist under the 50% gate, so mark-sold
  // aborts every run and stale listings persist indefinitely — the inverse
  // of Mid-Atlantic's. See the inventory-authority doctrine for the full
  // account.
]);

// ADJUDICATED EXCLUSIONS — identity-specific, decided by hand, one reason
// per entry. These identities are DEALER-LIVE and correctly discovered, but
// are deliberately withheld from ordinary ingestion by a human ruling.
// Presence is accounted for BEFORE the guard below, so mark-sold and the
// ratio gate still count these items as dealer-present; only MUTATION is
// suppressed — no resurrection, no update, AND NO INSERT. Removing an entry
// hands that listing straight back to ordinary ingestion.
// ★ ENTRIES DO NOT SHARE A REASON. Read the note before acting on one.
//
//   Mid-Atlantic 241311091 (MAP-311091) — PRESENTATION HOLD, ruled 2026-09-06.
//   The dealer publishes it as Manufacturer UNKNOWN / Model 7 and disclaims
//   the year in its own prose; year/make/model are deliberately blank.
//   Without this guard the normal update path would write year='2010' and
//   make='7' — a FALSE identity. Do not publish "Unit Available"; do not put
//   the equipment type into model.
//
//   Allied 260299567 — DUPLICATE SUPPRESSION, ruled 2026-09-12.
//   Same physical truck as keeper 260297441, VIN 5KKHAXDV4FPGE6184. The
//   dealer lists it twice: Fassi F280SE-equipped (KEEPER) and as a bare cab
//   & chassis (THIS ONE, whose own description states its lead photo is AI
//   generated "of the truck without the boom"). Per the 2026-06-07 Allied
//   precedent, the equipped configuration is canonical. Neither identity is
//   in Torque Hub, so without this guard BOTH would insert and publish the
//   same truck twice.
//
//   Allied 260301101 — CONDITION-VERIFICATION HOLD, ruled 2026-09-12.
//   2017 IMT 16000SIII on Western Star 4700, VIN 5KKHAXDV6HPHV6614. Allied's
//   own prior listings (249974841 / 249975205, now feed_removed) disclosed a
//   hairline crack in the crane base and multiple hydraulic leaks, offered it
//   "not as a working boom truck", and stated the odometer was inaccurate at
//   ~250,000 actual miles. The current listing positively markets the crane
//   configuration at 200,000 mi and discloses none of those prior conditions.
//   HOLD until Allied confirms repair status and the mileage it stands behind.
//   A successor listing identity does NOT erase unresolved adverse disclosures
//   attached to the same VIN.
const PRESENTATION_HELD_LISTINGS = new Set([
  'Mid-Atlantic Power & Equipment|241311091',
  'Allied Truck & Trailer Sales|260299567',
  'Allied Truck & Trailer Sales|260301101',
]);

// Use background function for longer timeout (15 minutes vs 10 seconds)
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch(e) { return { statusCode: 400, body: 'Invalid JSON' }; }

  const dryRun = body.dryRun === true;
  const dryRunLog = [];
  if (dryRun) console.log('DRY RUN MODE — no writes will be performed');

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
    .select('stock,source_listing_id,subcategory_locked,model_locked,source_url,provenance')
    .eq('dealer', dealer)
    .eq('sold', false);

  const existingStocks = new Set((existing || []).map(u => u.stock));
  const existingByListingId = new Map();
  const existingByStock = new Map();
  for (const row of (existing || [])) {
    if (row.source_listing_id) existingByListingId.set(row.source_listing_id, row);
    existingByStock.set(row.stock, row);
  }

  // D1: rows previously buried by a feed removal are ELIGIBLE for resurrection.
  // The scope is deliberately narrow:
  //   - this dealer only
  //   - sold_type 'feed_removed' ONLY. Never 'dedup_hidden', never a genuine sale.
  //   - matched by source_listing_id only, the stable marketplace identity.
  // Presence in the CURRENT feed is the sole trigger: this map is consulted only
  // for an item the current scrape actually returned, so a row absent from the
  // feed is never read and never written.
  const { data: buried } = await supabase
    .from('inventory')
    .select('stock,source_listing_id,subcategory_locked,model_locked,source_url,provenance')
    .eq('dealer', dealer)
    .eq('sold', true)
    .eq('sold_type', 'feed_removed');

  const buriedByListingId = new Map();
  for (const row of (buried || [])) {
    if (row.source_listing_id) buriedByListingId.set(String(row.source_listing_id), row);
  }
  if (buriedByListingId.size) {
    console.log(`D1: ${buriedByListingId.size} feed_removed row(s) for ${dealer} are resurrection-eligible if this feed returns them`);
  }
  const lockedSubcat = new Set([...(existing || []), ...(buried || [])].filter(u => u.subcategory_locked).map(u => u.stock));
  const lockedModel  = new Set([...(existing || []), ...(buried || [])].filter(u => u.model_locked).map(u => u.stock));
  const incomingStocks = new Set();
  const incomingListingIds = new Set();
  const incomingPlatforms = new Set();
  const incomingByPlatform = {};            // platform -> count of incoming items
  const incomingStocksByPlatform = {};      // platform -> Set of incoming stocks
  let synced = 0, errors = 0, resurrected = 0;

  // Derive platform from a source URL, mirroring the source_type logic below.
  // Returns 'machinerytrader' | 'truckpaper' | 'tractorhouse' | 'other'.
  function platformOf(url) {
    const u = (url || '').toLowerCase();
    if (u.includes('machinerytrader.com')) return 'machinerytrader';
    if (u.includes('truckpaper.com')) return 'truckpaper';
    if (u.includes('tractorhouse.com')) return 'tractorhouse';
    return 'other';
  }

  // Process in batches of 10 to avoid timeouts
  const batchSize = 10;
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map(async (item) => {
      try {
        const rawStock = item.stock || item.stockNumber || (item.listingId ? String(item.listingId) : null);
        const stock = normalizeStockNumber(rawStock, dealer, item.source_listing_id);
        if (!stock) return;
        incomingStocks.add(stock);
        if (item.source_listing_id) incomingListingIds.add(String(item.source_listing_id));
        {
          const _plat = platformOf(item.source_url || item.url || '');
          incomingPlatforms.add(_plat);
          incomingByPlatform[_plat] = (incomingByPlatform[_plat] || 0) + 1;
          if (!incomingStocksByPlatform[_plat]) incomingStocksByPlatform[_plat] = new Set();
          incomingStocksByPlatform[_plat].add(stock);
        }

        // 2026-09-12 PRESENTATION HOLD: presence is already recorded above
        // (incomingStocks / incomingListingIds / incomingByPlatform), so this item
        // still counts as dealer-present for mark-sold and for the ratio gate.
        // Suppress MUTATION ONLY — no resurrection, no update, no insert.
        const presentationHoldKey = `${dealer}|${item.source_listing_id ? String(item.source_listing_id) : ''}`;
        if (PRESENTATION_HELD_LISTINGS.has(presentationHoldKey)) {
          console.log(`PRESENTATION HOLD ${dealer}: suppress writes for listing_id=${item.source_listing_id}`);
          return;
        }

        let make = normalizeMake((item.make && item.make !== 'undefined') ? item.make : '') || '';
        let model = normalizeModel((item.model && item.model !== 'undefined') ? item.model : '');
        ({ make, model } = repairMultiWordMake(make, model));

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
        engine = cleanEngine(trimSpec(engine));

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

        let sub = deriveSubcategory(item);
        const _mk = (make || '').toLowerCase().trim();
        const _md = (model || '').toLowerCase().trim();
        if ((BODY_MAKERS.has(_mk) && /^[0-9]+\.?[0-9]* ?ft\b/i.test(_md)) || /\bbody\b/i.test(_md)) {
          sub = 'Truck Body';
        }
        const subLower = (sub || '').toLowerCase();
        const CONSTRUCTION_SUBS = ['skid steer','excavator','wheel loader','crawler dozer','forklift','scissor lift','boom lift','air compressor','mini dumper','crane','backhoe','telehandler','grader','asphalt'];
        const FARM_SUBS = ['utility vehicle','tractor','mower','hay','baler','tedder','rake','planter','combine','sprayer','tillage'];
        let derivedCategory;
        if (subLower.includes('trailer')) derivedCategory = 'Trailers';
        else if (['suv','sedan','coupe','classic car','motorcycle','engine','power plant','boat'].some(function(k){ return subLower.includes(k); })) derivedCategory = 'Other';
        else if (subLower.includes('day cab') || subLower.includes('sleeper')) derivedCategory = 'Trucks';
        else if (subLower.includes('crane') && (function(){ const mn = (make || '').toLowerCase().replace(/[\s-]+/g,''); return KNOWN_EQUIPMENT_CRANE_MAKES.some(function(em){ return mn === em.replace(/[\s-]+/g,''); }); }())) derivedCategory = 'Construction';
        else if (subLower.includes('crane')) derivedCategory = 'Trucks';
        else if (CONSTRUCTION_SUBS.some(function(k){ return subLower.includes(k); })) derivedCategory = 'Construction';
        else if (FARM_SUBS.some(function(k){ return subLower.includes(k); })) derivedCategory = 'Farm';
        else if (subLower === 'truck body') derivedCategory = 'Other';
        else if (item.category) derivedCategory = item.category;
        else derivedCategory = 'Trucks';
        const unit = {
          stock, dealer,
          year: item.year ? String(item.year) : '',
          make, model,
          trim: item.trim || sub || '',
          price: item.price ? String(item.price).replace(/[^0-9.]/g, '') : '',
          mileage, vin: item.vin || '', engine, transmission, drivetrain,
          horsepower: item.horsepower || '',
          hours: item.hours || '',
          fuel: item.fuel || null,
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

        // Non-powered units (trailers, farm attachments, classic cars) must not carry phantom
        // powertrain fields. Two sources of truth: lib/phantom-fields.js for engine/fuel/HP,
        // lib/usage-display for mileage/hours (single canonical rule shared with display + AI).
        // No fuel beats fake fuel; no mileage beats fake mileage.
        const _pf = { category: derivedCategory, subcategory: sub };
        if (isPhantom(_pf, 'fuel'))       unit.fuel = null;
        if (isPhantom(_pf, 'engine'))     unit.engine = '';
        if (isPhantom(_pf, 'horsepower')) unit.horsepower = '';
        // CONSERVATIVE canonical rule — null hours/mileage ONLY when the subcategory
        // is KNOWN to disallow the field. Unknown/unmapped subcategories preserve the
        // raw value (destructive write; do not discard data on a guess). Display/AI
        // surfaces use the aggressive showMileage/showHours variants which suppress
        // rendering on the same unknown cases without touching the DB row.
        if (unit.hours   && isKnownSuppressHours(unit))   unit.hours   = '';
        if (unit.mileage && isKnownSuppressMileage(unit)) unit.mileage = '';

        unit.photos = stripSandhillsJunkPhotos(unit.photos);
        unit.photos = reorderDbtPhotos(unit.photos, dealer);

        // Determine upsert path: prefer (dealer, source_listing_id) when present, fall back to (dealer, stock)
        const incomingListingId = item.source_listing_id || null;
        const liveMatchedRow = incomingListingId ? existingByListingId.get(incomingListingId) : null;
        // D1: no live row matched, so this listing may be a unit the marketplace
        // is advertising again after a previous feed removal.
        const buriedMatchedRowRaw = (!liveMatchedRow && incomingListingId)
          ? buriedByListingId.get(String(incomingListingId))
          : null;
        // 2026-09-04 FREEZE: the same feed that mis-buried these rows drives resurrection.
        // Do not revive from an untrusted source. Skip the whole item — do not fall through
        // to insert (would collide on unique (dealer, stock)) and do not update the buried
        // row silently. Log the identity so a later authoritative discovery pass can act.
        if (buriedMatchedRowRaw && FROZEN_DEALERS.has(dealer)) {
          console.log(`FREEZE ${dealer}: skip resurrection for listing_id=${incomingListingId} stock=${buriedMatchedRowRaw.stock}`);
          return;
        }
        const buriedMatchedRow = buriedMatchedRowRaw;
        const isResurrection = !!buriedMatchedRow;
        const matchedExistingRow = liveMatchedRow || buriedMatchedRow || null;
        const matchedExistingStock = matchedExistingRow ? matchedExistingRow.stock : null;
        const isExisting = matchedExistingStock ? true : existingStocks.has(stock);
        const lookupStock = matchedExistingStock || stock;

        // Field-lock deletes must run BEFORE the provenance stamp so provFactSubset excludes
        // locked/dropped fields — keeps provenance consistent with the persisted row.
        if (isExisting) {
          if (lockedSubcat.has(lookupStock)) { delete unit.subcategory; delete unit.category; delete unit.trim; }
          if (lockedModel.has(lookupStock))  { delete unit.make; delete unit.model; }
        }

        // T1.2-A: stamp provenance BEFORE generateDescription so the generator (first consumer) can
        // read unit.provenance for provenance-aware Mileage/Hours rendering.
        const existingRowForProv = matchedExistingRow || existingByStock.get(stock) || null;
        const provFactSubset = {};
        for (const k of ['year','make','model','trim','mileage','vin','engine','transmission','drivetrain','horsepower','hours','fuel','condition']) {
          if (unit[k] !== undefined && unit[k] !== null && unit[k] !== '') provFactSubset[k] = unit[k];
        }
        unit.provenance = stampFacts(
          existingRowForProv ? existingRowForProv.provenance : null,
          provFactSubset,
          { source: unit.source_type || 'unknown', trust: 'attributed', mode: 'fill-empty' }
        );

        if (anthropicKey) {
          try {
            const desc = await generateDescription(unit, anthropicKey);
            if (desc) unit.description = desc;
          } catch (e) {
            if (e.code === 'INSUFFICIENT_EVIDENCE') {
              console.log(`[SKIP-INSUFFICIENT-EVIDENCE] ${stock} — no source evidence and insufficient canonical identity; no description generated`);
            } else {
              console.error(`Description generation failed for ${stock}:`, e.message);
            }
          }
        }

        if (isExisting) {
          // Preserve curated DX on existing rows — backfill data fields without rewriting descriptions
          delete unit.description;
          delete unit.raw_description;
        }

        let result;
        if (dryRun) {
          const path = isResurrection
            ? 'resurrect'
            : (isExisting
              ? (matchedExistingStock && incomingListingId ? 'update-by-listing-id' : 'update-by-stock')
              : 'insert');
          dryRunLog.push({ path, stock, dealer, unit });
          if (isResurrection) resurrected++;
        } else if (isExisting) {
          // 2026-09-16 IDENTITY GUARD. Once a row exists and is recognized as that row
          // (by source_listing_id, by stock, or as a feed_removed resurrection), routine
          // sync does not own the right to change its Torque Hub `stock` identity. Scraped
          // stock determines identity at INSERT only; changing it afterward is an explicit
          // migration/adjudication, never a side effect of a better scrape. Covers all three
          // existing-row paths below because resurrection builds from this same `unit`.
          // NOTE: dryRun returns before this branch, so dry-run logs still show the incoming
          // normalized stock; the real PATCH never carries it.
          delete unit.stock;
          if (unit.fuel == null || unit.fuel === '') delete unit.fuel;
          if (unit.condition == null || unit.condition === '') delete unit.condition;
          if (isResurrection) {
            // D1 RESURRECTION. The unit is in the current feed and its row is
            // sold_type='feed_removed'. Return THAT SAME ROW to live instead of
            // inserting a second one, which UNIQUE (stock, dealer) rejects and the
            // error path then silently swallows — the whole D1 defect.
            // Guards, all four required together: the stable listing id, this
            // dealer, sold=true, and sold_type='feed_removed'. A genuine sale or a
            // 'dedup_hidden' row therefore cannot be revived by this path.
            const revived = Object.assign({}, unit, { sold: false, sold_type: null });
            result = await supabase.from('inventory').update(revived)
              .eq('source_listing_id', incomingListingId)
              .eq('dealer', dealer)
              .eq('sold', true)
              .eq('sold_type', 'feed_removed');
            if (!(result && result.error)) resurrected++;
            console.log(`D1 RESURRECT ${matchedExistingStock} listing_id=${incomingListingId} ${dealer}`);
          } else if (matchedExistingStock && incomingListingId) {
            // Match by source_listing_id (stable Sandhills ID, robust against stock-derivation changes)
            result = await supabase.from('inventory').update(unit).eq('source_listing_id', incomingListingId).eq('dealer', dealer).eq('sold', false);
          } else {
            // Legacy fallback: match by stock
            result = await supabase.from('inventory').update(unit).eq('stock', stock).eq('dealer', dealer).eq('sold', false);
          }
        } else {
          result = await supabase.from('inventory').insert([unit]);
        }
        const { error } = result || {};

        if (error) { console.error(`Error ${stock}:`, error.message); errors++; }
        else synced++;
      } catch(e) { console.error('Item error:', e.message); errors++; }
    }));
  }

  // Mark removed units sold — PER-PLATFORM scoped, with per-platform safety check.
  // Multi-task dealers (e.g. Impex: TruckPaper + MachineryTrader) run separate
  // scrapes per platform. Each run must ONLY mark-sell units from the platform(s)
  // it actually scraped, and only when that platform was scraped near-completely.
  // This prevents a single-platform run from burying the other platform's inventory.
  let markedSold = 0;

  // Count existing rows per platform (scoped to this dealer).
  // NOTE: rows with missing/unknown source_url resolve to platform 'other' and are
  // therefore only ever mark-sold by a run that itself scraped 'other'-platform items.
  // In practice that means orphan/null-source rows are protected unless explicitly scraped.
  const existingByPlatform = {};
  for (const row of (existing || [])) {
    const p = platformOf(row.source_url);
    existingByPlatform[p] = (existingByPlatform[p] || 0) + 1;
  }

  // Decide which platforms are safe to mark-sell this run: present in the incoming
  // scrape AND scraped to at least 50% of that platform's existing count.
  const platformsToMarkSold = new Set();
  for (const plat of incomingPlatforms) {
    const inc = incomingByPlatform[plat] || 0;
    const exist = existingByPlatform[plat] || 0;
    const frac = exist > 0 ? inc / exist : 1;
    if (exist >= 10 && frac < 0.5) {
      console.warn(`Mark-sold ABORTED for ${dealer} platform=${plat}: incoming=${inc} existing=${exist} (${(frac*100).toFixed(0)}%). Likely partial scrape — skipping this platform.`);
    } else {
      console.log(`Mark-sold ENABLED for ${dealer} platform=${plat}: incoming=${inc} existing=${exist}`);
      platformsToMarkSold.add(plat);
    }
  }

  // 2026-09-04 FREEZE: entire mark-sold loop is a no-op for frozen dealers. The 50%
  // ratio gate does not detect stable-incompleteness feeds — do not let this file
  // write sold_type='feed_removed' for these dealers until authoritative discovery
  // with an external completeness invariant is in place.
  const freezeMarkSold = FROZEN_DEALERS.has(dealer);
  if (freezeMarkSold) {
    console.warn(`FREEZE ${dealer}: mark-sold loop skipped entirely (0 units mark-sold this run)`);
  }
  for (const row of (existing || [])) {
    if (freezeMarkSold) continue;
    // Manual entries (no feed origin) are never feed-removed.
    if (!row.source_url && !row.source_listing_id) continue;
    const rowPlatform = platformOf(row.source_url);
    // Scope gate: skip rows whose platform this run didn't scrape (or scraped too partially).
    if (!platformsToMarkSold.has(rowPlatform)) continue;
    // A unit is only "gone" if it matches NOTHING incoming by either key.
    // source_listing_id is treated as the stable Sandhills listing identity.
    // Keep it global here because stock is the collision-prone derived key (so stock is platform-scoped).
    const rowListingId = row.source_listing_id ? String(row.source_listing_id) : '';
    const stillPresentByListingId = rowListingId && incomingListingIds.has(rowListingId);
    const platStocks = incomingStocksByPlatform[rowPlatform];
    const stillPresentByStock = !!(platStocks && platStocks.has(row.stock));
    if (stillPresentByListingId || stillPresentByStock) continue;
    if (!dryRun) {
      await supabase.from('inventory').update({ sold: true, sold_type: 'feed_removed' }).eq('stock', row.stock).eq('dealer', dealer);
    }
    markedSold++;
  }

  const result = { synced, errors, resurrected, markedSold, total: items.length, dealer };
  if (dryRun) {
    result.dryRun = true;
    result.dryRunLog = dryRunLog;
    result.dryRunCount = dryRunLog.length;
    console.log('DRY RUN COMPLETE — NO WRITES PERFORMED. Proposed writes:', dryRunLog.length);
  }
  console.log('Sync complete:', result);
  return { statusCode: 200, body: JSON.stringify(result) };
};
