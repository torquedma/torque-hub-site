const SUPABASE_URL = 'https://bxsikkmqasydosmblzov.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4c2lra21xYXN5ZG9zbWJsem92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTc1OTksImV4cCI6MjA5MDQ3MzU5OX0.JMEI7cx2tddmbvfqm_qxiIWp7f5Phuk5l0Y487DUSZg';
const SB_HEADERS = { 'apikey': SUPABASE_ANON, 'Authorization': 'Bearer ' + SUPABASE_ANON };
const BASE = 'https://hub.torquedma.com';

// Shell HTML embedded directly — no context.next() dependency on a static file at the route path.
// (Cause B fix: context.next() for /trucks-for-sale finds no static file → 404 shell.
//  Cause A fix: category.html removed from edge-functions dir so bundler only sees .js files.)
const SHELL = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title id="page-title">Inventory for Sale | Torque Hub</title>
  <meta name="description" id="page-desc" content="Browse work trucks, trailers, and equipment from real dealers across the Southeast at Torque Hub powered by Torque DMA." />
  <meta name="robots" content="index,follow" />
  <link rel="canonical" id="canonical-url" href="https://hub.torquedma.com/" />

  <!-- Open Graph -->
  <meta property="og:type" content="website" />
  <meta property="og:title" id="og-title" content="Inventory for Sale | Torque Hub" />
  <meta property="og:description" id="og-desc" content="Browse work trucks, trailers, and equipment from real dealers across the Southeast." />
  <meta property="og:image" content="https://hub.torquedma.com/torque-logo.png" />
  <meta property="og:url" id="og-url" content="https://hub.torquedma.com/" />
  <meta property="og:site_name" content="Torque Hub" />
  <meta name="twitter:card" content="summary_large_image" />

  <!-- Schema.org - populated by edge function -->
  <script type="application/ld+json" id="schema-data">{}</script>

  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700;800&family=Barlow+Condensed:wght@600;700;800;900&display=swap" rel="stylesheet" />

  <style>
    :root {
      --bg: #0a0f1a;
      --panel: #111827;
      --panel-2: #1a2235;
      --line: rgba(255,255,255,0.07);
      --text: #f1f5f9;
      --muted: #94a3b8;
      --soft: #64748b;
      --orange: #f97316;
      --orange-2: #ea6f0f;
      --green: #365943;
      --radius: 16px;
      --max: 1180px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body { font-family: "Barlow", sans-serif; color: var(--text); background: var(--bg); min-height: 100vh; overflow-x: hidden; }
    a { color: inherit; text-decoration: none; }
    img { max-width: 100%; display: block; }
    .container { width: min(var(--max), calc(100% - 32px)); margin: 0 auto; }

    /* NAV */
    .topbar { position: sticky; top: 0; z-index: 100; backdrop-filter: blur(16px); background: rgba(10,15,26,0.92); border-bottom: 1px solid var(--line); }
    .nav { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 64px; }
    .brand { display: flex; align-items: center; gap: 10px; }
    .brand-logo { width: 44px; height: 44px; object-fit: contain; }
    .brand-title { font-family: "Barlow Condensed", sans-serif; font-size: 22px; font-weight: 900; text-transform: uppercase; }
    .brand-sub { font-size: 9px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.14em; margin-top: 2px; }
    .nav-right { display: flex; align-items: center; gap: 8px; }
    .nav-back { color: var(--muted); font-size: 14px; font-weight: 600; padding: 8px 14px; border-radius: 9px; border: 1px solid var(--line); transition: 0.2s; }
    .nav-back:hover { color: var(--text); background: rgba(255,255,255,0.05); }
    .nav-cta { background: linear-gradient(135deg, #365943, #294434); color: #fff; font-size: 13px; font-weight: 700; padding: 9px 16px; border-radius: 9px; text-transform: uppercase; letter-spacing: 0.06em; box-shadow: 0 4px 14px rgba(22,163,74,0.3); }

    /* BREADCRUMB */
    .breadcrumb { padding: 14px 0; font-size: 13px; color: var(--soft); }
    .breadcrumb a { color: var(--muted); }
    .breadcrumb a:hover { color: #cbd5e1; }
    .breadcrumb span { margin: 0 6px; }

    /* CATEGORY HEAD */
    .cat-head { padding: 24px 0 16px; border-bottom: 1px solid var(--line); margin-bottom: 20px; }
    .cat-h1 { font-family: "Barlow Condensed", sans-serif; font-size: clamp(28px, 5vw, 44px); font-weight: 900; line-height: 1.05; margin-bottom: 6px; }
    .cat-count { font-size: 14px; color: var(--muted); font-weight: 600; margin-bottom: 10px; }
    .cat-intro { font-size: 15px; color: var(--muted); line-height: 1.7; max-width: 720px; }

    /* CHILD LINKS (hub pages) */
    .cat-children { margin-bottom: 20px; }
    .cat-children-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--soft); margin-right: 10px; }
    .cat-children a { display: inline-block; font-size: 13px; font-weight: 700; padding: 6px 14px; border-radius: 20px; border: 1px solid var(--line); background: rgba(255,255,255,0.03); color: var(--muted); margin: 4px 4px 4px 0; transition: 0.2s; }
    .cat-children a:hover { color: var(--text); background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.15); }

    /* LISTING GRID */
    .cat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 18px; margin-bottom: 32px; }

    /* LISTING CARD */
    .cat-card { display: flex; flex-direction: column; background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; transition: transform 0.2s, box-shadow 0.2s; }
    .cat-card:hover { transform: translateY(-3px); box-shadow: 0 12px 32px rgba(0,0,0,0.35); }
    .cat-card-img { aspect-ratio: 4/3; overflow: hidden; background: var(--panel-2); }
    .cat-card-img img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s; }
    .cat-card:hover .cat-card-img img { transform: scale(1.04); }
    .cat-card-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; flex: 1; }
    .cat-card-title { font-size: 15px; font-weight: 700; line-height: 1.3; color: var(--text); }
    .cat-card-sub { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.09em; color: var(--soft); }
    .cat-card-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
    .cat-card-chip { font-size: 11px; font-weight: 600; color: var(--muted); background: rgba(255,255,255,0.06); border-radius: 4px; padding: 2px 8px; white-space: nowrap; }
    .cat-card-price { font-family: "Barlow Condensed", sans-serif; font-size: 22px; font-weight: 900; color: #e2e8f0; margin-top: 4px; }

    /* EMPTY STATE */
    .cat-empty { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); padding: 48px 24px; text-align: center; color: var(--muted); font-size: 15px; line-height: 1.75; margin-bottom: 32px; }
    .cat-empty a { color: #94a3b8; text-decoration: underline; }

    /* SIBLING LINKS (leaf pages) */
    .cat-siblings { margin-bottom: 20px; padding: 16px; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; }
    .cat-siblings-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--soft); margin-right: 10px; }
    .cat-siblings a { display: inline-block; font-size: 13px; font-weight: 600; color: var(--muted); margin: 3px 8px 3px 0; transition: color 0.2s; }
    .cat-siblings a:hover { color: var(--text); }

    /* HUB NAV LINKS */
    .cat-hublinks { margin-bottom: 32px; padding: 14px 0; border-top: 1px solid var(--line); }
    .cat-hublinks a { display: inline-block; font-size: 13px; font-weight: 600; color: var(--muted); margin: 4px 12px 4px 0; transition: color 0.2s; }
    .cat-hublinks a:hover { color: var(--text); }

    /* FINANCE STRIP */
    .cat-finance { background: linear-gradient(135deg, #1a2a1e, #111827); border: 1px solid rgba(54,89,67,0.4); border-radius: var(--radius); padding: 28px 28px; margin-bottom: 40px; display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
    .cat-finance-copy h3 { font-family: "Barlow Condensed", sans-serif; font-size: 22px; font-weight: 900; margin-bottom: 6px; }
    .cat-finance-copy p { font-size: 14px; color: var(--muted); line-height: 1.6; }
    .cat-finance-btn { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: 0 28px; background: linear-gradient(135deg, #365943, #294434); color: #fff; font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.07em; border-radius: 12px; white-space: nowrap; flex-shrink: 0; box-shadow: 0 4px 14px rgba(22,163,74,0.25); transition: 0.2s; }
    .cat-finance-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(22,163,74,0.35); }

    /* FOOTER */
    .cat-footer { border-top: 1px solid var(--line); padding: 32px 0; text-align: center; color: var(--soft); font-size: 13px; line-height: 1.8; }
    .cat-footer a { color: var(--muted); }
    .cat-footer a:hover { color: var(--text); }

    /* RESPONSIVE */
    @media (max-width: 640px) {
      .cat-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
      .cat-card-title { font-size: 13px; }
      .cat-card-price { font-size: 18px; }
      .cat-finance { flex-direction: column; text-align: center; }
    }
  </style>

  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-X9LG1DZKDP"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-X9LG1DZKDP');
  </script>
  <!-- Meta Pixel Code -->
  <script>
  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window, document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', '1710916626441974');
  fbq('track', 'PageView');
  </script>
  <noscript><img height="1" width="1" style="display:none"
  src="https://www.facebook.com/tr?id=1710916626441974&ev=PageView&noscript=1"
  /></noscript>
  <!-- End Meta Pixel Code -->
</head>
<body>

<header class="topbar">
  <div class="container">
    <nav class="nav">
      <a class="brand" href="/">
        <img src="/torque-logo.png" alt="Torque Hub" class="brand-logo" onerror="this.style.display='none'">
        <div>
          <div class="brand-title">Torque Hub</div>
          <div class="brand-sub">Powered by Torque DMA</div>
        </div>
      </a>
      <div class="nav-right">
        <a href="/inventory.html" class="nav-back">← All Inventory</a>
        <a href="/finance.html?src=cat_nav" class="nav-cta">Get Financing</a>
      </div>
    </nav>
  </div>
</header>

<div class="container">
  <div class="breadcrumb">
    <a href="/">Torque Hub</a>
    <span>›</span>
    <a href="/inventory.html">Inventory</a>
    <span>›</span>
    <span><!--CAT_BREADCRUMB--></span>
  </div>

  <div class="cat-head">
    <h1 class="cat-h1"><!--CAT_H1--></h1>
    <div class="cat-count"><!--CAT_COUNT--></div>
    <!--CAT_INTRO-->
  </div>

  <!--CAT_CHILDREN-->

  <!--CAT_GRID-->

  <!--CAT_SIBLINGS-->

  <!--CAT_HUBLINKS-->

  <div class="cat-finance">
    <div class="cat-finance-copy">
      <h3>Financing Available on All Units</h3>
      <p>Fast approvals &bull; All credit situations considered &bull; Business-use financing</p>
    </div>
    <a class="cat-finance-btn" href="/finance.html?src=cat_finance">Get Pre-Approved →</a>
  </div>
</div>

<footer class="cat-footer">
  <div class="container">
    <p>
      <a href="/">Torque Hub</a> &bull;
      <a href="/inventory.html">All Inventory</a> &bull;
      <a href="/finance.html">Financing</a> &bull;
      <a href="/trucks-for-sale">Trucks</a> &bull;
      <a href="/trailers-for-sale">Trailers</a> &bull;
      <a href="/farm-equipment-for-sale">Farm Equipment</a> &bull;
      <a href="/construction-equipment-for-sale">Construction</a> &bull;
      <a href="/landscape-equipment-for-sale">Landscape</a>
    </p>
    <p style="margin-top:10px;">Powered by <a href="https://torquedma.com" target="_blank" rel="noopener">Torque DMA</a> &mdash; Tell &lsquo;em Torque sent ya.</p>
  </div>
</footer>

</body>
</html>`;

const CATEGORY_HUBS = {
  'trucks-for-sale':                { category: 'Trucks',       label: 'Trucks' },
  'trailers-for-sale':              { category: 'Trailers',     label: 'Trailers' },
  'farm-equipment-for-sale':        { category: 'Farm',         label: 'Farm Equipment' },
  'construction-equipment-for-sale':{ category: 'Construction', label: 'Construction Equipment' },
  'landscape-equipment-for-sale':   { category: 'Landscape',    label: 'Landscape Equipment' },
};

const SUBCATEGORY_LEAVES = {
  'box-trucks-for-sale':             { subs: ['Box Truck'],                     label: 'Box Trucks',           hub: 'trucks-for-sale' },
  'refrigerated-trucks-for-sale':    { subs: ['Refrigerated Truck'],            label: 'Refrigerated Trucks',  hub: 'trucks-for-sale' },
  'semi-trucks-for-sale':            { subs: ['Day Cab Tractor','Sleeper Tractor'], label: 'Semi Trucks',          hub: 'trucks-for-sale' },
  'service-trucks-for-sale':         { subs: ['Service Truck'],                 label: 'Service Trucks',       hub: 'trucks-for-sale' },
  'dump-trucks-for-sale':            { subs: ['Dump Truck','Grain Dump Truck'], label: 'Dump Trucks',          hub: 'trucks-for-sale' },
  'cab-and-chassis-trucks-for-sale': { subs: ['Cab & Chassis'],                 label: 'Cab & Chassis Trucks', hub: 'trucks-for-sale' },
  'flatbed-trucks-for-sale':         { subs: ['Flatbed Truck'],                 label: 'Flatbed Trucks',       hub: 'trucks-for-sale' },
  'rollback-tow-trucks-for-sale':    { subs: ['Rollback Tow Truck'],            label: 'Rollback Tow Trucks',  hub: 'trucks-for-sale' },
  'cargo-vans-for-sale':             { subs: ['Cargo Van'],                     label: 'Cargo Vans',           hub: 'trucks-for-sale' },
  'yard-spotters-for-sale':          { subs: ['Yard Spotter'],                  label: 'Yard Spotters',        hub: 'trucks-for-sale' },
  'boom-trucks-for-sale':            { subs: ['Boom Truck'],                    label: 'Boom Trucks',          hub: 'trucks-for-sale' },
  'vacuum-trucks-for-sale':         { subs: ['Vacuum Truck'],                  label: 'Vacuum Trucks',        hub: 'trucks-for-sale' },
  'landscape-trucks-for-sale':      { subs: ['Landscape Truck'],               label: 'Landscape Trucks',     hub: 'trucks-for-sale' },
  'car-carrier-trucks-for-sale':     { subs: ['Car Carrier Truck'],             label: 'Car Carrier Trucks',   hub: 'trucks-for-sale' },
  'reefer-trailers-for-sale':          { subs: ['Reefer Trailer'],              label: 'Reefer Trailers',              hub: 'trailers-for-sale' },
  'dry-van-trailers-for-sale':         { subs: ['Dry Van Trailer'],             label: 'Dry Van Trailers',             hub: 'trailers-for-sale' },
  'flatbed-trailers-for-sale':         { subs: ['Flatbed Trailer'],             label: 'Flatbed Trailers',             hub: 'trailers-for-sale' },
  'conestoga-trailers-for-sale':       { subs: ['Conestoga Trailer'],           label: 'Conestoga Trailers',           hub: 'trailers-for-sale' },
  'enclosed-trailers-for-sale':        { subs: ['Enclosed Trailer'],            label: 'Enclosed Trailers',            hub: 'trailers-for-sale' },
  'car-hauler-trailers-for-sale':      { subs: ['Car Hauler Trailer'],          label: 'Car Hauler Trailers',          hub: 'trailers-for-sale' },
  'utility-trailers-for-sale':         { subs: ['Utility Trailer'],             label: 'Utility Trailers',             hub: 'trailers-for-sale' },
  'equipment-trailers-for-sale':       { subs: ['Equipment Trailer'],           label: 'Equipment Trailers',           hub: 'trailers-for-sale' },
  'dump-trailers-for-sale':            { subs: ['Dump Trailer'],                label: 'Dump Trailers',                hub: 'trailers-for-sale' },
  'gooseneck-trailers-for-sale':       { subs: ['Gooseneck Trailer'],           label: 'Gooseneck Trailers',           hub: 'trailers-for-sale' },
  'race-trailers-for-sale':            { subs: ['Race Trailer'],                label: 'Race Trailers',                hub: 'trailers-for-sale' },
  'living-quarters-trailers-for-sale': { subs: ['Living Quarters Trailer'],    label: 'Living Quarters Trailers',     hub: 'trailers-for-sale' },
  'tractors-for-sale':               { subs: ['Tractor'],                       label: 'Tractors',             hub: 'farm-equipment-for-sale' },
  'rotary-cutters-for-sale':         { subs: ['Rotary Cutter'],                 label: 'Rotary Cutters',       hub: 'farm-equipment-for-sale' },
  'boom-mowers-for-sale':            { subs: ['Boom Mower'],                    label: 'Boom Mowers',          hub: 'farm-equipment-for-sale' },
  'drum-mowers-for-sale':            { subs: ['Drum Mower'],                    label: 'Drum Mowers',          hub: 'farm-equipment-for-sale' },
  'zero-turn-mowers-for-sale':       { subs: ['Zero Turn Mower'],               label: 'Zero Turn Mowers',     hub: 'landscape-equipment-for-sale' },
  'lawn-tractors-for-sale':          { subs: ['Lawn Tractor'],                  label: 'Lawn Tractors',        hub: 'landscape-equipment-for-sale' },
  'excavators-for-sale':             { subs: ['Excavator', 'Crawler Excavator', 'Mini Excavator'], label: 'Excavators',           hub: 'construction-equipment-for-sale' },
  'mini-excavators-for-sale':        { subs: ['Mini Excavator'],                label: 'Mini Excavators',      hub: 'construction-equipment-for-sale' },
  'skid-steers-for-sale':            { subs: ['Skid Steer', 'Compact Track Loader', 'Mini Skid Steer', 'Track Skid Steer', 'Wheel Skid Steer'], label: 'Skid Steers',          hub: 'construction-equipment-for-sale' },
  'mini-skid-steers-for-sale':       { subs: ['Mini Skid Steer'],               label: 'Mini Skid Steers',     hub: 'construction-equipment-for-sale' },
  'loaders-for-sale':                { subs: ['Wheel Loader', 'Crawler Loader'], label: 'Loaders',              hub: 'construction-equipment-for-sale' },
  'crane-trucks-for-sale':           { subs: ['Crane Truck'],                   label: 'Crane Trucks',         hub: 'construction-equipment-for-sale' },
};

const HUB_CHILDREN = {};
for (const [slug, def] of Object.entries(SUBCATEGORY_LEAVES)) {
  (HUB_CHILDREN[def.hub] = HUB_CHILDREN[def.hub] || []).push({ slug, label: def.label });
}

function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escAttr(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function safeJson(data) { return JSON.stringify(data).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026'); }
function formatPrice(raw) {
  if (raw == null || raw === '') return 'Call for Price';
  const n = Number(String(raw).replace(/[^0-9.]/g, ''));
  if (!(n > 0)) return 'Call for Price';
  return '$' + n.toLocaleString();
}
function getPhotos(unit) {
  let p = unit && unit.photos;
  if (!p) return [];
  if (typeof p === 'string') { try { p = JSON.parse(p); } catch { return []; } }
  return Array.isArray(p) ? p : [];
}

// Mirrors trimEngine() in inventory-engine.js line 263–266.
function trimEngine(val) {
  if (!val) return '';
  let s = val.split(/\s+[-–—]\s+/)[0].replace(/\s+Engine\s*$/i, '').trim();
  // strip trailing torque (e.g. "660-1050ft. lbs.", "850ft. lbs.")
  s = s.replace(/\s*\d+(?:[.,]\d+)?(?:-\d+(?:[.,]\d+)?)?\s*ft\.?\s*lbs?\.?\s*$/i, '').trim();
  // strip trailing horsepower (e.g. "260-360hp", "370hp", "455 HP")
  s = s.replace(/\s*\d+(?:[.,]\d+)?(?:-\d+(?:[.,]\d+)?)?\s*hp\b\.?\s*$/i, '').trim();
  // strip leading horsepower (e.g. "400 HP Cummins ISX12", "455hp Detroit DD15")
  s = s.replace(/^\d+(?:[.,]\d+)?(?:-\d+(?:[.,]\d+)?)?\s*hp\b\.?\s*/i, '').trim();
  // if nothing meaningful remains (e.g. "74hp" -> "", or it was just a number/junk), return empty so no chip renders
  if (!s || /^\d+(?:[.,]\d+)?$/.test(s)) return '';
  return s;
}

function buildCardChips(u) {
  const JUNK = {'':1,'—':1,'-':1,'--':1,'n/a':1,'na':1,'none':1,'unknown':1,'null':1};
  function badText(v){ return !v || JUNK[String(v).trim().toLowerCase()]; }
  function num(v){
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    if (/\bto\b/i.test(s)) return null;
    const m = s.replace(/[, ]/g,'').match(/^-?\d+(\.\d+)?/);
    if (!m) return null;
    const n = parseFloat(m[0]);
    return (isFinite(n) && n > 0) ? n : null;
  }
  function fmtNum(n){ return n.toLocaleString('en-US'); }
  const F = {
    mileage:          () => { const n=num(u.mileage); return n? fmtNum(n)+' mi':null; },
    hours:            () => { const n=num(u.hours); return n? fmtNum(n)+' hrs':null; },
    engine:           () => badText(u.engine)? null : trimEngine(u.engine),
    transmission:     () => badText(u.transmission)? null : String(u.transmission).trim(),
    drivetrain:       () => badText(u.drivetrain)? null : String(u.drivetrain).trim(),
    fuel:             () => { if(badText(u.fuel)) return null; const f=String(u.fuel).trim(); return /diesel/i.test(f)? null : f; },
    horsepower:       () => { const n=num(u.horsepower); return n? fmtNum(n)+' HP':null; },
    operating_weight: () => { const n=num(u.operating_weight); return n? fmtNum(n)+' lb':null; },
    length:           () => badText(u.length)? null : String(u.length).trim(),
    gvwr:             () => badText(u.gvwr)? null : String(u.gvwr).trim(),
    axles:            () => badText(u.axles)? null : String(u.axles).trim(),
    deck_width:       () => badText(u.deck_width)? null : String(u.deck_width).trim()
  };
  const sub = (u.subcategory||'').toLowerCase();
  const cat = (u.category||'').toLowerCase();
  const MOWERS = {'zero turn mower':1,'walk behind mower':1,'lawn tractor':1,'front deck mower':1};
  let order;
  if (sub === 'tractor')           order = ['horsepower','hours'];
  else if (MOWERS[sub])            order = ['deck_width','hours','horsepower'];
  else if (sub === 'crane truck')  order = ['mileage','engine'];
  else if (cat === 'trailers')     order = ['length','gvwr','axles'];
  else if (cat === 'trucks')       order = ['mileage','engine','transmission','drivetrain','fuel'];
  else if (cat === 'construction') order = ['horsepower','hours','operating_weight'];
  else if (cat === 'farm')         order = ['horsepower','hours'];
  else                             order = ['mileage','fuel'];
  const isNew = !badText(u.condition) && String(u.condition).trim().toLowerCase() === 'new';
  const chips = [];
  if (isNew) chips.push('NEW');
  for (let i=0;i<order.length && chips.length<2;i++){
    const v = F[order[i]] && F[order[i]]();
    if (v) chips.push(v);
  }
  return chips;
}

function buildCardGrid(units) {
  if (!units.length) return '';
  return units.map(u => {
    const photos = getPhotos(u);
    const img = (photos[0] && (photos[0].url || photos[0].dataUrl)) || '/torque-logo.png';
    const title = [u.year, u.make, u.model].filter(Boolean).join(' ') || (u.subcategory || 'Unit');
    const price = formatPrice(u.price);
    const href = '/vehicle.html?stock=' + encodeURIComponent(u.stock);
    const chips = buildCardChips(u);
    const chipsHtml = chips.length ? '<div class="cat-card-chips">' + chips.map(c => '<span class="cat-card-chip">' + esc(c) + '</span>').join('') + '</div>' : '';
    return (
      '<a class="cat-card" href="' + escAttr(href) + '">' +
      '<div class="cat-card-img"><img src="' + escAttr(img) + '" alt="' + escAttr(title) + '" loading="lazy" width="400" height="300" /></div>' +
      '<div class="cat-card-body">' +
      '<div class="cat-card-title">' + esc(title) + '</div>' +
      (u.subcategory ? '<div class="cat-card-sub">' + esc(u.subcategory) + '</div>' : '') +
      chipsHtml +
      '<div class="cat-card-price">' + esc(price) + '</div>' +
      '</div></a>'
    );
  }).join('\n');
}

function buildCrossLinks(currentSlug, isHub, hubSlug) {
  let links = [];
  for (const [slug, def] of Object.entries(CATEGORY_HUBS)) {
    if (slug !== currentSlug) links.push('<a href="/' + slug + '">' + esc(def.label) + '</a>');
  }
  let siblingHtml = '';
  if (!isHub && hubSlug && HUB_CHILDREN[hubSlug]) {
    const sibs = HUB_CHILDREN[hubSlug].filter(c => c.slug !== currentSlug);
    if (sibs.length) siblingHtml = '<div class="cat-siblings"><span class="cat-siblings-label">More in ' + esc(CATEGORY_HUBS[hubSlug].label) + ':</span> ' +
      sibs.map(s => '<a href="/' + s.slug + '">' + esc(s.label) + '</a>').join(' ') + '</div>';
  }
  return { hubLinksHtml: '<div class="cat-hublinks">' + links.join(' ') + ' <a href="/inventory.html">All Inventory</a></div>', siblingHtml };
}

function buildHubChildLinks(hubSlug) {
  const kids = HUB_CHILDREN[hubSlug] || [];
  if (!kids.length) return '';
  return '<div class="cat-children"><span class="cat-children-label">Browse by type:</span> ' +
    kids.map(k => '<a href="/' + k.slug + '">' + esc(k.label) + '</a>').join(' ') + '</div>';
}

export default async function handler(request) {
  try {
    const url = new URL(request.url);
    const slug = url.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();

    const hub = CATEGORY_HUBS[slug];
    const leaf = SUBCATEGORY_LEAVES[slug];
    if (!hub && !leaf) return new Response(null, { status: 404 });

    const isHub = !!hub;
    const label = isHub ? hub.label : leaf.label;

    let query;
    if (isHub) {
      query = SUPABASE_URL + '/rest/v1/inventory_cards?category=eq.' + encodeURIComponent(hub.category) +
        '&sold=eq.false&order=created_at.desc&limit=250&select=stock,year,make,model,price,mileage,subcategory,category,engine,horsepower,hours,fuel,condition,photos';
    } else {
      // Variant B encoding: encodeURIComponent each value, join with literal commas, no quotes.
      // SAFE because no subcategory value contains a comma. If a comma-containing value is ever
      // added, switch to quoted form ("val1","val2").
      const inList = leaf.subs.map(s => encodeURIComponent(s)).join(',');
      query = SUPABASE_URL + '/rest/v1/inventory_cards?subcategory=in.(' + inList + ')' +
        '&sold=eq.false&order=created_at.desc&limit=250&select=stock,year,make,model,price,mileage,subcategory,category,engine,horsepower,hours,fuel,condition,photos';
    }

    const invRes = await fetch(query, { headers: SB_HEADERS }).catch(() => null);

    let units = [];
    if (invRes && invRes.ok) { try { units = await invRes.json(); } catch { units = []; } }
    if (!Array.isArray(units)) units = [];

    let html = SHELL;

    const titleText = label + ' for Sale | Torque Hub';
    const h1Text = label + ' for Sale';
    const count = units.length;
    const descText = count
      ? ('Browse ' + count + ' ' + label.toLowerCase() + ' for sale at Torque Hub. Commercial ' + label.toLowerCase() + ' from trusted dealers — financing available. Tell \'em Torque sent ya.')
      : ('Shop ' + label.toLowerCase() + ' for sale at Torque Hub. New inventory added regularly — financing available.');
    const canonical = BASE + '/' + slug;

    const cardGrid = buildCardGrid(units);
    const { hubLinksHtml, siblingHtml } = buildCrossLinks(slug, isHub, isHub ? null : leaf.hub);
    const childLinks = isHub ? buildHubChildLinks(slug) : '';
    const introHtml = '<p class="cat-intro">' + esc(descText) + '</p>';
    const gridBlockHtml = count
      ? ('<div class="cat-grid">' + cardGrid + '</div>')
      : ('<div class="cat-empty"><p>No ' + esc(label.toLowerCase()) + ' in stock right now — new inventory is added regularly. Browse related categories below or <a href="/inventory.html">view all inventory</a>.</p></div>');

    const itemListSchema = {
      '@context': 'https://schema.org', '@type': 'CollectionPage',
      'name': h1Text, 'description': descText, 'url': canonical,
      'mainEntity': {
        '@type': 'ItemList', 'numberOfItems': count,
        'itemListElement': units.slice(0, 250).map((u, i) => ({
          '@type': 'ListItem', 'position': i + 1,
          'url': BASE + '/vehicle.html?stock=' + encodeURIComponent(u.stock),
          'name': [u.year, u.make, u.model].filter(Boolean).join(' ') || (u.subcategory || 'Unit'),
        })),
      },
    };
    const breadcrumbItems = [
      { '@type': 'ListItem', position: 1, name: 'Home', item: BASE + '/' },
      { '@type': 'ListItem', position: 2, name: 'Inventory', item: BASE + '/inventory.html' },
    ];
    if (!isHub) breadcrumbItems.push({ '@type': 'ListItem', position: 3, name: CATEGORY_HUBS[leaf.hub].label, item: BASE + '/' + leaf.hub });
    breadcrumbItems.push({ '@type': 'ListItem', position: breadcrumbItems.length + 1, name: label, item: canonical });
    const breadcrumbSchema = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: breadcrumbItems };
    const schemaJson = safeJson([itemListSchema, breadcrumbSchema]);

    html = html
      .replace(/(<title id="page-title">)[\s\S]*?(<\/title>)/, '$1' + esc(titleText) + '$2')
      .replace(/(<meta name="description" id="page-desc" content=")[^"]*(")/, '$1' + escAttr(descText) + '$2')
      .replace(/(<link rel="canonical" id="canonical-url" href=")[^"]*(")/, '$1' + escAttr(canonical) + '$2')
      .replace(/(<meta property="og:title" id="og-title" content=")[^"]*(")/, '$1' + escAttr(titleText) + '$2')
      .replace(/(<meta property="og:description" id="og-desc" content=")[^"]*(")/, '$1' + escAttr(descText) + '$2')
      .replace(/(<meta property="og:url" id="og-url" content=")[^"]*(")/, '$1' + escAttr(canonical) + '$2')
      .replace(/(<script type="application\/ld\+json" id="schema-data">)[\s\S]*?(<\/script>)/, '$1' + schemaJson + '$2');

    html = html
      .replace('<!--CAT_H1-->', esc(h1Text))
      .replace('<!--CAT_COUNT-->', count ? (count + ' listing' + (count === 1 ? '' : 's')) : '')
      .replace('<!--CAT_INTRO-->', introHtml)
      .replace('<!--CAT_GRID-->', gridBlockHtml)
      .replace('<!--CAT_CHILDREN-->', childLinks)
      .replace('<!--CAT_SIBLINGS-->', siblingHtml)
      .replace('<!--CAT_HUBLINKS-->', hubLinksHtml)
      .replace('<!--CAT_BREADCRUMB-->', esc(label));

    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  } catch (e) {
    return new Response(SHELL, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
}
