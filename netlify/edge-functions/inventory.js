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
  return val.split(/\s+[-–—]\s+/)[0].replace(/\s+Engine\s*$/i, '').trim();
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

    // Spec chips: mirrors engine lines 381–387.
    // Note: SSR queries the `inventory` table (Supabase-only); `hours` column not
    // selected. If u.hours is absent, mileage always gets ' mi' suffix — correct
    // for the Supabase-direct dealer pool.
    const mileageVal = fmtMileage(u.mileage);
    const engineVal = trimEngine(u.engine);
    const chips = [];
    if (mileageVal) chips.push(mileageVal + ' mi');
    if (chips.length < 2 && engineVal) chips.push(engineVal);
    if (chips.length < 2 && u.fuel && u.fuel !== '—') chips.push(u.fuel);
    if (chips.length < 2 && u.condition) chips.push(u.condition);

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

    // ── LCP preload hint ────────────────────────────────────────────────────────
    // One cheap Supabase call (limit 1) to find the highest-priced unit server-side.
    // Injects <link rel="preload" as="image" fetchpriority="high"> in <head> so the
    // browser starts fetching the LCP image immediately — before JS runs and calls
    // Supabase itself (which currently causes a 3.5s discovery delay).
    //
    // Isolated in its own try/catch: ANY failure (network, parse, missing </head>)
    // is silently swallowed. The page continues to card injection unaffected.
    let finalHtml = html;
    try {
      const lcpRes = await fetch(
        SUPABASE_URL + '/rest/v1/inventory?sold=eq.false&order=price.desc.nullslast&limit=1&select=price,photos',
        { headers: SB_HEADERS }
      ).catch(() => null);

      if (lcpRes && lcpRes.ok) {
        const lcpData = await lcpRes.json().catch(() => null);
        if (Array.isArray(lcpData) && lcpData.length) {
          const top = lcpData[0];
          const topPrice = parseFloat(String(top.price || '').replace(/[^0-9.]/g, '')) || 0;

          // Threshold guard: only emit the preload if the Supabase top clearly beats
          // the highest known external-feed price ($60k Davenport). 65000 gives a $5k
          // safety margin. If Supabase top is below threshold we cannot confirm it is
          // the global top card — emit nothing rather than preloading the wrong image.
          if (topPrice >= 65000) {
            const topPhotos = getPhotos(top);
            const photoUrl = topPhotos.length ? (topPhotos[0].url || topPhotos[0].dataUrl || '') : '';
            const thumbUrl = buildCardThumb(photoUrl);

            if (thumbUrl && finalHtml.includes('</head>')) {
              const preloadLink = `<link rel="preload" as="image" fetchpriority="high" href="${esc(thumbUrl)}">`;
              finalHtml = finalHtml.replace('</head>', preloadLink + '\n</head>');
            }
          }
        }
      }
    } catch (e) { /* preload skipped — continue to card injection */ }

    // Fetch top 6 units sorted by price descending — matches the client default sort
    // (applyFilters() line 325: `value: 'price-desc'` fallback when the <select> is absent).
    // nullslast keeps null-price units below priced ones.
    // NOTE: this queries Supabase only. The client also merges external feed dealers
    // (Davenport, Fat Daddy's, Wilson, HGR, Impex) fetched at runtime. The SSR and
    // client top-6 may differ if feed-dealer units outrank Supabase units by price.
    // This is acceptable: SSR cards are early-paint placeholders that JS replaces.
    const query = SUPABASE_URL +
      '/rest/v1/inventory?sold=eq.false&order=price.desc.nullslast&limit=6' +
      '&select=stock,year,make,model,trim,subcategory,price,mileage,engine,fuel,condition,photos,dealer';

    const invRes = await fetch(query, { headers: SB_HEADERS }).catch(() => null);
    if (!invRes || !invRes.ok) return response;

    let units;
    try { units = await invRes.json(); } catch (e) { return response; }
    if (!Array.isArray(units) || !units.length) return response;

    const sixCardsHtml = buildSixCards(units);
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
