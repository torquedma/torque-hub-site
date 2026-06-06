// SSR edge function for /inventory.html
// Fetches the top 6 units by price-desc from Supabase and injects them into the
// static inventory.html shell so the LCP image is in the initial HTML response —
// discoverable by the browser preload scanner before any JS runs.
//
// SAFETY CONTRACT: on any error (fetch fail, parse fail, marker absent, anything
// in the try block) we return the unmodified static response. Worst case = no SSR
// benefit, never a broken page.

const SUPABASE_URL = 'https://bxsikkmqasydosmblzov.supabase.co';
// Non-sensitive public anon key — same value used in category.js and inventory-engine.js.
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4c2lra21xYXN5ZG9zbWJsem92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTc1OTksImV4cCI6MjA5MDQ3MzU5OX0.JMEI7cx2tddmbvfqm_qxiIWp7f5Phuk5l0Y487DUSZg';
const SB_HEADERS = { apikey: SUPABASE_ANON, Authorization: 'Bearer ' + SUPABASE_ANON };

// Must match inventory.html:289 exactly — no fuzzy injection.
const GRID_MARKER = '<div class="inventory-grid" id="inventory-grid"></div>';

// Mirrors DEALERS in js/inventory-engine.js. Edge function cannot import the browser IIFE.
// key → { name, location } used to build the dealer line under each card.
// If a dealer is added or removed, update js/inventory-engine.js too.
const DEALER_MAP = {
  'Davenport Motors':               { name: 'Davenport Motors',               location: 'Plymouth, NC' },
  "Fat Daddy's Truck Sales":        { name: "Fat Daddy's Truck Sales",        location: 'Goldsboro, NC' },
  'Wilson Trailer Sales & Service': { name: 'Wilson Trailer Sales & Service', location: 'Wilson, NC' },
  "HGR's Truck and Trailer":        { name: "HGR's Truck & Trailer Sales",    location: 'Hope Mills, NC' },
  'Impex Heavy Metal':              { name: 'Impex Heavy Metal',              location: 'Greensboro, NC' },
  "Joe's Tractor Sales":            { name: "Joe's Tractor Sales",            location: 'Thomasville, NC' },
  'Auto Connection 210 LLC':        { name: 'Auto Connection 210 LLC',        location: 'Angier, NC' },
  'Dick Smith Equipment':           { name: 'Dick Smith Equipment',           location: 'Goldsboro, NC' },
  'Suttontown Repair Service':      { name: 'Suttontown Repair Service',      location: 'Faison, NC' },
  'Fannon Land & Auction Co.':      { name: 'Fannon Land & Auction Co.',      location: 'Pennington Gap, VA' },
  'Mid-Atlantic Power & Equipment': { name: 'Mid-Atlantic Power & Equipment', location: 'Dunn, NC' },
  'DeBary Truck Sales':             { name: 'DeBary Truck Sales',             location: 'Sanford, FL' },
  'A F Sales & Service':            { name: 'A F Sales & Service',            location: 'Indianapolis, IN' },
  'The Trailer Source':             { name: 'The Trailer Source',             location: 'Winston Salem, NC' },
  'Allied Truck & Trailer Sales':   { name: 'Allied Truck & Trailer Sales',   location: 'Madison, NC' },
};

// ── Helpers (mirror inventory-engine.js exactly) ──────────────────────────────

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Mirrors client pp() in inventory-engine.js:268.
// `price` is a TEXT column — strip everything except digits and decimal point,
// then parse as float. Returns 0 for null / empty / non-numeric (sinks to bottom).
const ppNum = (p) => parseFloat(String(p == null ? '' : p).replace(/[^0-9.]/g, '')) || 0;

// Mirrors buildCardThumb() in js/inventory-engine.js line 30–70.
// All four CDN branches replicated exactly; 400-wide thumbnails.
function buildCardThumb(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  if (rawUrl.startsWith('data:')) return rawUrl;
  // Already-rendered Supabase URL — don't double-transform.
  if (rawUrl.indexOf('/storage/v1/render/image/public/') !== -1) return rawUrl;
  // Supabase object storage → render API (transform add-on required).
  if (rawUrl.indexOf('/storage/v1/object/public/') !== -1) {
    const sb = rawUrl.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
    return /[?&](width|height|resize)=/i.test(sb)
      ? sb
      : sb + (sb.indexOf('?') !== -1 ? '&' : '?') + 'width=400&height=300&resize=cover';
  }
  // Sandhills CDN: ?w= / ?h= params.
  if (rawUrl.indexOf('media.sandhills.com') !== -1) {
    let u = rawUrl;
    u = /[?&]w=\d+/i.test(u) ? u.replace(/([?&])w=\d+/i, '$1w=400') : u + (u.indexOf('?') !== -1 ? '&' : '?') + 'w=400';
    u = /[?&]h=\d+/i.test(u) ? u.replace(/([?&])h=\d+/i, '$1h=300') : u + '&h=300';
    return u;
  }
  // CarsForsale CDN: /WxH/ path segment.
  if (rawUrl.indexOf('cdn05.carsforsale.com') !== -1 && /\/\d+x\d+\//.test(rawUrl)) {
    return rawUrl.replace(/\/\d+x\d+\//, '/400x300/');
  }
  // Endeavor CDN: ?width= param.
  if (rawUrl.indexOf('cdnmedia.endeavorsuite.com') !== -1) {
    return /[?&]width=\d+/i.test(rawUrl)
      ? rawUrl.replace(/([?&]width=)\d+/i, '$1400')
      : rawUrl + (rawUrl.indexOf('?') !== -1 ? '&' : '?') + 'width=400';
  }
  return rawUrl;
}

// Mirrors getPhotos() in category.js — handles string or parsed JSON.
function getPhotos(unit) {
  let p = unit && unit.photos;
  if (!p) return [];
  if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) { return []; } }
  return Array.isArray(p) ? p : [];
}

// Mirrors fmtMileage() in inventory-engine.js line 257–261.
function fmtMileage(val) {
  if (!val) return '';
  const n = parseInt(String(val).replace(/[^0-9]/g, ''), 10);
  return isNaN(n) ? '' : n.toLocaleString('en-US');
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
  else if (cat === 'construction') order = ['horsepower','operating_weight'];
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

// Build card HTML matching renderInventory() in inventory-engine.js line 368–403.
// Outer element: <article class="inv-card"> — confirmed at engine line 389.
// Cards 0–5 all get loading="eager"; card 0 also gets fetchpriority="high".
// Matches engine: eager = _i < 6, fetchpriority on _i === 0.
function buildSixCards(units) {
  return units.map((u, i) => {
    const d = DEALER_MAP[u.dealer] || { name: u.dealer || '', location: '' };

    const photos = getPhotos(u);
    const photoRaw = photos.length ? (photos[0].url || photos[0].dataUrl || '') : '';
    const photo = buildCardThumb(photoRaw);

    const fp = i === 0 ? ' fetchpriority="high"' : '';

    // Title: mirrors engine line 375.
    const title = [u.year, u.make, u.model, u.trim || u.subcategory]
      .filter(Boolean).join(' ') || 'Unit Available';

    const vdpUrl = '/vehicle.html?stock=' + encodeURIComponent(u.stock || '');

    // Price: mirrors engine lines 377–379.
    const priceNum = parseFloat(String(u.price || '').replace(/[^0-9.]/g, ''));
    const priceStr = (u.price && !isNaN(priceNum))
      ? '$' + Number(String(u.price).replace(/[^0-9.]/g, '')).toLocaleString('en-US')
      : (u.price && u.price !== '0' ? esc(u.price) : 'Call');

    // Dealer line: mirrors engine line 380. &middot; used raw in the HTML string.
    const dealerLine = [d.name, d.location].filter(Boolean).join(' &middot; ');

    // Spec chips: category-aware profiles via buildCardChips.
    const chips = buildCardChips(u);

    const imgHtml = photo
      ? `<img src="${esc(photo)}" alt="${esc(title)}" loading="eager"${fp} decoding="async">`
      : `<img src="/photos-coming-soon.png" alt="Photos coming soon" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;">`;

    const chipsHtml = chips.length
      ? `<div class="inv-specs">${chips.map(c => `<span class="inv-spec">${esc(c)}</span>`).join('')}</div>`
      : '';

    return (
      `<article class="inv-card" aria-label="${esc(title)}">` +
        `<a class="inv-card-link" href="${esc(vdpUrl)}" aria-label="View listing: ${esc(title)}">` +
          `<div class="inv-photo">${imgHtml}</div>` +
          `<div class="inv-body">` +
            `<h3 class="inv-title">${esc(title)}</h3>` +
            `<div class="inv-price">${priceStr}</div>` +
            `<div class="inv-dealer">${dealerLine}</div>` +
            chipsHtml +
            `<div class="inv-cta-wrap"><span class="inv-cta">View Listing</span></div>` +
          `</div>` +
        `</a>` +
      `</article>`
    );
  }).join('\n');
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(request, context) {
  // Always fetch the real static inventory.html first.
  const response = await context.next();

  try {
    // Clone before reading — the original body must stay unconsumed so `return response`
    // in any error branch still delivers an intact page.
    const html = await response.clone().text();

    // Exact-match guard: if the marker isn't present (future refactor, CDN cache edge
    // case, etc.) return the original page untouched rather than injecting into the wrong spot.
    if (!html.includes(GRID_MARKER)) return response;

    // ── Single Supabase fetch ──────────────────────────────────────────────────
    // ONE request covers both the preload hint and the card grid.
    // NO order param: `price` is a TEXT column so Supabase sorts lexically
    // ("9999" > "148500"). We pull all units (limit=1000 comfortably covers the
    // ~370-unit table) and sort numerically in JS, matching the client's pp() exactly.
    const invRes = await fetch(
      SUPABASE_URL +
        '/rest/v1/inventory?sold=eq.false&limit=1000' +
        '&select=stock,year,make,model,trim,subcategory,category,price,mileage,engine,fuel,condition,photos,dealer',
      { headers: SB_HEADERS }
    ).catch(() => null);

    if (!invRes || !invRes.ok) return response;

    let allUnits;
    try { allUnits = await invRes.json(); } catch (e) { return response; }
    if (!Array.isArray(allUnits) || !allUnits.length) return response;

    // Filter to rows with a usable first photo, then sort by ppNum(price) descending.
    // Filtering first ensures: (a) the preload candidate always has an image to preload,
    // (b) all 6 SSR cards render a real photo rather than the "coming soon" placeholder.
    const sorted = allUnits
      .filter(u => { const ph = getPhotos(u); return ph.length > 0 && (ph[0].url || ph[0].dataUrl); })
      .sort((a, b) => ppNum(b.price) - ppNum(a.price));

    // Nothing photo-bearing in Supabase (extremely unlikely) — serve static page.
    if (!sorted.length) return response;

    const top   = sorted[0];          // highest-priced photo-bearing unit
    const cards = sorted.slice(0, 6); // top 6 for the SSR card grid

    // ── LCP preload hint ────────────────────────────────────────────────────────
    // Injects <link rel="preload" as="image" fetchpriority="high"> in <head> so the
    // browser starts the LCP image fetch immediately — before JS runs and discovers the URL.
    // Isolated in its own try/catch — any failure silently skips the preload; the page
    // continues to card injection unaffected.
    let finalHtml = html;
    try {
      const topPrice = ppNum(top.price);

      // Threshold guard: Supabase top must clearly beat the highest known external-feed
      // price ($60k Davenport) by a $5k margin. Below threshold we cannot confirm Supabase
      // has the global top card — emit no preload rather than preloading the wrong image.
      if (topPrice >= 65000) {
        const topPhotos = getPhotos(top);
        const photoUrl  = topPhotos[0].url || topPhotos[0].dataUrl || '';
        const thumbUrl  = buildCardThumb(photoUrl);

        if (thumbUrl && finalHtml.includes('</head>')) {
          const preloadLink = `<link rel="preload" as="image" fetchpriority="high" href="${esc(thumbUrl)}">`;
          finalHtml = finalHtml.replace('</head>', preloadLink + '\n</head>');
        }
      }
    } catch (e) { /* preload skipped — continue to card injection */ }

    // ── SSR card grid ──────────────────────────────────────────────────────────
    // Same sorted array: cards[0] === top, so the preload image and the first SSR card
    // image are always the same URL.
    const sixCardsHtml = buildSixCards(cards);
    const injectedHtml = finalHtml.replace(
      GRID_MARKER,
      '<div class="inventory-grid" id="inventory-grid">' + sixCardsHtml + '</div>'
    );

    // content-length is now wrong (body grew) — delete it so the browser doesn't truncate.
    const headers = new Headers(response.headers);
    headers.delete('content-length');

    return new Response(injectedHtml, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (err) {
    // Any unexpected error: return the pristine original page.
    return response;
  }
}
