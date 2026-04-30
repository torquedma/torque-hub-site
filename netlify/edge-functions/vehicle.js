// netlify/edge-functions/vehicle.js
// Intercepts /vehicle.html requests, fetches the listing from Supabase server-side,
// and injects real title, meta, schema, and body content so crawlers see actual
// listing data instead of the client-side loading state.

const SUPABASE_URL = 'https://bxsikkmqasydosmblzov.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4c2lra21xYXN5ZG9zbWJsem92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTc1OTksImV4cCI6MjA5MDQ3MzU5OX0.JMEI7cx2tddmbvfqm_qxiIWp7f5Phuk5l0Y487DUSZg';
const SB_HEADERS = { 'apikey': SUPABASE_ANON, 'Authorization': 'Bearer ' + SUPABASE_ANON };
const SITE = 'https://hub.torquedma.com';

const DEALERS = {
  'Davenport Motors':              { phone: '252-809-2172', address: '3711 Mackeys Rd\nPlymouth, NC 27962' },
  "Fat Daddy's Truck Sales":       { phone: '919-759-5434', address: '4337 Hwy 13 N\nGoldsboro, NC 27534' },
  'Wilson Trailer Sales & Service':{ phone: '252-429-8805', address: '1605 Thorne Ave S\nWilson, NC 27893' },
  "HGR's Truck and Trailer":       { phone: '800-230-8920', address: '4519 Marracco Dr\nHope Mills, NC 28348' },
  'Auto Connection 210 LLC':       { phone: '910-490-2596', address: 'Angier, NC' },
  'Dick Smith Equipment':          { phone: '919-734-1191', address: 'Goldsboro, NC' },
  'Impex Heavy Metal':             { phone: '336-715-8704', address: 'Greensboro, NC' },
  'Ironworks Trading Corp':        { phone: '757-663-4444', address: 'Norfolk, VA' },
  "Joe's Tractor Sales":           { phone: '336-850-8271', address: 'Thomasville, NC' },
  "Mid-Atlantic Power & Equipment":{ phone: '',             address: 'North Carolina' },
  "Smith's Enterprise":            { phone: '910-567-2680', address: 'Salemburg, NC' },
  'Suttontown Repair Service':     { phone: '',             address: 'North Carolina' },
  'Johnson Farm Service':          { phone: '',             address: 'North Carolina' },
};

// ─── Escaping helpers ────────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

// Prevents </script> inside inline <script> tags from terminating the block.
function safeJson(data) {
  return JSON.stringify(data).replace(/<\//g, '<\\/').replace(/<!--/g, '<\\!--');
}

// ─── Formatters ──────────────────────────────────────────────────────────────

function formatPrice(raw) {
  if (raw === null || raw === undefined || raw === '') return 'Call for Price';
  const num = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/[^0-9.]/g, ''));
  if (isNaN(num) || num <= 0) return 'Call for Price';
  return '$' + num.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function trimSpec(val) {
  if (!val) return val;
  return String(val).split(/\s*[—–]\s*|\s+-\s+/)[0].trim();
}

function formatMileage(raw) {
  if (!raw) return '';
  const n = parseInt(String(raw).replace(/[^0-9]/g, ''), 10);
  return isNaN(n) ? String(raw) : n.toLocaleString('en-US') + ' mi';
}

function getPhotos(unit) {
  const raw = unit.photos;
  if (!raw) return [];
  const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return Array.isArray(arr) ? arr : [];
}

// ─── SSR content builders ────────────────────────────────────────────────────

function buildSpecsHtml(unit) {
  return [
    unit.year         && ['Year',         unit.year],
    unit.make         && ['Make',         unit.make],
    unit.model        && ['Model',        unit.model],
    unit.condition    && ['Condition',    unit.condition],
    unit.fuel         && ['Fuel',         unit.fuel],
    unit.mileage      && ['Mileage',      formatMileage(unit.mileage)],
    unit.engine       && ['Engine',       trimSpec(unit.engine)],
    unit.transmission && ['Transmission', trimSpec(unit.transmission)],
    unit.drivetrain   && ['Drivetrain',   unit.drivetrain],
    unit.vin          && ['VIN',          unit.vin],
    unit.stock        && ['Stock #',      unit.stock],
    unit.subcategory  && ['Type',         unit.subcategory],
  ].filter(Boolean).map(([l, v]) =>
    `<div class="spec-row"><div class="spec-label">${esc(l)}</div><div class="spec-val">${esc(String(v))}</div></div>`
  ).join('');
}

function buildDescHtml(text) {
  if (!text) return '';
  const HEADINGS = new Set(['Key Details', 'Overview', 'Interested In This Unit?']);
  const parts = [];
  let bullets = [];

  const flushBullets = () => {
    if (!bullets.length) return;
    parts.push('<ul class="desc-list">' + bullets.map(b => `<li>${esc(b)}</li>`).join('') + '</ul>');
    bullets = [];
  };

  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushBullets(); continue; }
    if (HEADINGS.has(line.trim())) {
      flushBullets();
      parts.push(`<div class="desc-heading">${esc(line.trim())}</div>`);
    } else if (/^[-•]\s+/.test(line.trim())) {
      bullets.push(line.trim().replace(/^[-•]\s+/, ''));
    } else {
      flushBullets();
      parts.push(`<p class="desc-para">${esc(line)}</p>`);
    }
  }
  flushBullets();
  return parts.join('');
}

function buildSchema(unit, d, pageUrl, dealerKey) {
  const title = [unit.year, unit.make, unit.model].filter(Boolean).join(' ') || 'Unit Available';
  const isVehicle = !unit.category || unit.category.toLowerCase().includes('truck');
  const photos = getPhotos(unit);
  const firstPhoto = photos[0]?.url || photos[0]?.dataUrl || '';
  const priceNum = parseFloat(String(unit.price || '').replace(/[^0-9.]/g, '')) || undefined;
  const addrParts = (d.address || '').split('\n');

  return {
    '@context': 'https://schema.org',
    '@type': isVehicle ? 'Vehicle' : 'Product',
    'name': title,
    ...(unit.vin        && { 'vehicleIdentificationNumber': unit.vin }),
    ...(unit.year       && { 'modelDate': String(unit.year) }),
    ...(unit.make       && { 'brand': { '@type': 'Brand', 'name': unit.make } }),
    ...(unit.model      && { 'model': unit.model }),
    ...(unit.fuel       && { 'fuelType': unit.fuel }),
    ...(unit.subcategory && { 'vehicleBodyType': unit.subcategory }),
    ...(unit.mileage    && { 'mileageFromOdometer': { '@type': 'QuantitativeValue', 'value': unit.mileage, 'unitCode': 'SMI' } }),
    'vehicleCondition': unit.condition === 'New' ? 'https://schema.org/NewCondition' : 'https://schema.org/UsedCondition',
    ...(firstPhoto      && { 'image': firstPhoto }),
    'url': pageUrl,
    'offers': {
      '@type': 'Offer',
      ...(priceNum       && { 'price': priceNum, 'priceCurrency': 'USD' }),
      'availability': unit.sold ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
      'seller': {
        '@type': 'LocalBusiness',
        'name': dealerKey || unit.dealer || '',
        ...(d.phone && { 'telephone': d.phone }),
        ...(addrParts[0] && {
          'address': {
            '@type': 'PostalAddress',
            'streetAddress': addrParts[0],
            'addressLocality': (addrParts[1] || '').split(',')[0].trim(),
            'addressRegion': 'NC',
            'addressCountry': 'US',
          },
        }),
      },
    },
  };
}

// ─── Supabase fetch with MPX variant handling ─────────────────────────────────

// log array is populated with one entry per Supabase request — used by ?__debug=1
async function fetchUnit(stock, dealer, log) {
  const variants = [stock];
  if (/^MPX-/i.test(stock))        variants.push(stock.replace(/^MPX-/i, 'MPX'));
  else if (/^MPX[^-]/i.test(stock)) variants.push('MPX-' + stock.slice(3));

  console.log('[vehicle edge] fetchUnit variants:', variants, '| dealer:', dealer);

  const sbFetch = async (sv, dealerFilter) => {
    const q = dealerFilter
      ? `stock=eq.${encodeURIComponent(sv)}&dealer=eq.${encodeURIComponent(dealerFilter)}&limit=1`
      : `stock=eq.${encodeURIComponent(sv)}&limit=1`;
    const fullUrl = `${SUPABASE_URL}/rest/v1/inventory?${q}`;
    const entry = { url: fullUrl, sv, dealerFilter, status: null, rowCount: null, error: null };

    try {
      const res = await fetch(fullUrl, { headers: SB_HEADERS });
      entry.status = res.status;

      if (!res.ok) {
        entry.error = `HTTP ${res.status}`;
        entry.body = (await res.text()).slice(0, 300);
        log.push(entry);
        console.error(`[vehicle edge] Supabase error ${res.status} — ${entry.body}`);
        return null;
      }

      const data = await res.json();
      entry.rowCount = Array.isArray(data) ? data.length : -1;
      log.push(entry);
      console.log(`[vehicle edge] Supabase OK — stock:${sv} dealer:${dealerFilter} rows:${entry.rowCount}`);
      return data?.[0] ?? null;
    } catch (e) {
      entry.error = e.message;
      log.push(entry);
      console.error(`[vehicle edge] fetch threw — ${e.message}`);
      return null;
    }
  };

  if (dealer) {
    for (const sv of variants) {
      const row = await sbFetch(sv, dealer);
      if (row) return { unit: row, dealerKey: dealer };
    }
  }

  for (const sv of variants) {
    const row = await sbFetch(sv, null);
    if (row) return { unit: row, dealerKey: row.dealer || dealer || '' };
  }

  return null;
}

// ─── HTML transformer ─────────────────────────────────────────────────────────

function injectMeta(html, { pageTitle, pageDesc, pageUrl, firstPhoto, schema }) {
  html = html.replace(/<title[^>]*>[^<]*<\/title>/, `<title id="page-title">${esc(pageTitle)}</title>`);

  html = html.replace(
    /<meta name="description"[^>]*>/,
    `<meta name="description" id="page-desc" content="${escAttr(pageDesc)}" />`
  );
  html = html.replace(
    /<link rel="canonical"[^>]*>/,
    `<link rel="canonical" id="canonical-url" href="${escAttr(pageUrl)}" />`
  );

  html = html.replace(/<meta property="og:title"[^>]*>/,
    `<meta property="og:title" id="og-title" content="${escAttr(pageTitle)}" />`);
  html = html.replace(/<meta property="og:description"[^>]*>/,
    `<meta property="og:description" id="og-desc" content="${escAttr(pageDesc)}" />`);
  html = html.replace(/<meta property="og:url"[^>]*>/,
    `<meta property="og:url" id="og-url" content="${escAttr(pageUrl)}" />`);

  if (firstPhoto) {
    html = html.replace(/<meta property="og:image"[^>]*>/,
      `<meta property="og:image" id="og-image" content="${escAttr(firstPhoto)}" />`);
    html = html.replace(/<meta name="twitter:image"[^>]*>/,
      `<meta name="twitter:image" id="twitter-image" content="${escAttr(firstPhoto)}" />`);
  }

  html = html.replace(
    /<script type="application\/ld\+json"[^>]*>\s*\{\}\s*<\/script>/,
    `<script type="application/ld+json" id="schema-data">${safeJson(schema)}</script>`
  );

  return html;
}

function injectBody(html, { unit, dealerKey, title, price, subcat, loc, cityState, specsHtml, descHtml, firstPhoto }) {
  // Breadcrumb
  html = html.replace(
    '<span id="bc-title">Listing Details</span>',
    `<span id="bc-title">${esc(title)}</span>`
  );

  // Loading state → hidden; VDP container → visible
  html = html.replace(
    '<div id="vdp-loading" class="container loading-state" aria-hidden="true">',
    '<div id="vdp-loading" class="container loading-state" aria-hidden="true" style="display:none">'
  );
  html = html.replace('<div id="vdp" style="display:none">', '<div id="vdp">');

  // Gallery — inject first photo into the empty gallery-main for SSR crawlers
  if (firstPhoto) {
    html = html.replace(
      '<div class="gallery-main" id="gallery-main">',
      `<div class="gallery-main" id="gallery-main"><img id="gallery-img" src="${escAttr(firstPhoto)}" alt="${escAttr(title)}" style="width:100%;height:100%;object-fit:cover;display:block;" loading="eager">`
    );
  }

  // Headline strip
  html = html.replace('id="vdp-headline" style="display:none"', 'id="vdp-headline"');
  html = html.replace('id="hl-title"></div>', `id="hl-title">${esc(title)}</div>`);
  html = html.replace('id="hl-price"></span>', `id="hl-price">${esc(price)}</span>`);
  if (subcat) {
    html = html.replace('id="hl-badge" style="display:none"', 'id="hl-badge"');
    html = html.replace('id="hl-subcat"></span>', `id="hl-subcat">${esc(subcat)}</span>`);
  }

  // SEO h2 — always shown; includes subcategory when present
  const seoLine = `${title}${subcat ? ' ' + subcat : ''} for Sale${cityState ? ' in ' + cityState : ''}`;
  html = html.replace('id="vdp-seo-h2">', `id="vdp-seo-h2">${esc(seoLine)}`);

  if (price && dealerKey) {
    html = html.replace('id="hl-sep" style="display:none">&bull;', 'id="hl-sep">&bull;');
  }
  html = html.replace('id="hl-dealer"></span>', `id="hl-dealer">${esc(dealerKey)}</span>`);
  if (loc) {
    html = html.replace('id="hl-loc-sep" style="display:none">&bull;', 'id="hl-loc-sep">&bull;');
    html = html.replace('id="hl-location"></span>', `id="hl-location">${esc(loc)}</span>`);
  }

  // Specs grid
  html = html.replace('id="specs-grid"></div>', `id="specs-grid">${specsHtml}</div>`);

  // Description
  if (descHtml) {
    html = html.replace('id="desc-card" style="display:none"', 'id="desc-card"');
    html = html.replace('id="desc-body"></div>', `id="desc-body">${descHtml}</div>`);
  }

  // Sidebar price card
  html = html.replace(
    '<div class="price-title" id="s-title">Loading...</div>',
    `<div class="price-title" id="s-title">${esc(title)}</div>`
  );
  html = html.replace(
    'class="price-stock" id="s-stock"></div>',
    `class="price-stock" id="s-stock">${unit.stock ? esc('Stock # ' + unit.stock) : ''}</div>`
  );
  html = html.replace(
    `class="price-amount" id="s-price"></div>`,
    `class="price-amount${price === 'Call for Price' ? ' call' : ''}" id="s-price">${esc(price)}</div>`
  );

  // Scrub fallback message text from JS source — listing is found so these
  // functions never execute; crawlers must not see the strings in source.
  html = html.replace("h2.textContent = 'Listing Not Available';", "h2.textContent = '';");
  html = html.replace("p.textContent = 'This unit may have been sold or removed. Browse current inventory below.';", "p.textContent = '';");
  if (!unit.sold) {
    html = html.replace("t.textContent = '\\u{1F6AB} This unit has been sold';", "t.textContent = '';");
    html = html.replace("s.textContent = 'Check out similar available units below.';", "s.textContent = '';");
  }

  return html;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(request, context) {
  const url = new URL(request.url);
  const stock = url.searchParams.get('stock');
  const dealerParam = url.searchParams.get('dealer');
  const isDebug = url.searchParams.get('__debug') === '1';

  console.log(`[vehicle edge] hit — stock:${stock} dealer:${dealerParam} debug:${isDebug}`);

  if (!stock) {
    console.log('[vehicle edge] no stock param, passing through');
    return context.next();
  }

  // ── Debug mode: return JSON showing exactly what Supabase returned ──────────
  // Usage: /vehicle.html?stock=XXX&dealer=YYY&__debug=1
  if (isDebug) {
    const log = [];
    let result = null;
    let fetchError = null;
    try {
      result = await fetchUnit(stock, dealerParam, log);
    } catch (e) {
      fetchError = e.message;
    }
    const rawUnit = result?.unit ?? null;
    const parsedPhotos = rawUnit ? getPhotos(rawUnit) : [];
    return new Response(JSON.stringify({
      stock,
      dealer: dealerParam,
      supabaseUrl: SUPABASE_URL,
      found: !!result,
      dealerKey: result?.dealerKey ?? null,
      // Photos diagnosis — shows exactly what comes out of Supabase
      photos: {
        rawType:   typeof rawUnit?.photos,
        isArray:   Array.isArray(rawUnit?.photos),
        rawSample: JSON.stringify(rawUnit?.photos)?.slice(0, 400) ?? null,
        parsedCount: parsedPhotos.length,
        parsedFirst: parsedPhotos[0] ?? null,
      },
      unit: rawUnit ? {
        stock: rawUnit.stock,
        dealer: rawUnit.dealer,
        year: rawUnit.year,
        make: rawUnit.make,
        model: rawUnit.model,
        price: rawUnit.price,
        sold: rawUnit.sold,
      } : null,
      fetchError,
      log,
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Normal path: fetch listing + base HTML in parallel ────────────────────
  const log = [];
  let fetchError = null;

  const [result, baseResponse] = await Promise.all([
    (async () => {
      try {
        return await fetchUnit(stock, dealerParam, log);
      } catch (e) {
        fetchError = e.message;
        console.error('[vehicle edge] fetchUnit threw:', e.message);
        return null;
      }
    })(),
    context.next(),
  ]);

  console.log(`[vehicle edge] result: ${result ? 'found ' + result.unit?.stock : 'null'} | error: ${fetchError ?? 'none'}`);

  // Not found — inject error template so client JS can build the error state
  if (!result) {
    let html = await baseResponse.text();
    const errorTpl = '<template id="vdp-error-tpl">'
      + '<h2>Listing Not Available</h2>'
      + '<p>This unit may have been sold or removed. Browse current inventory below.</p>'
      + '<a href="/#inventory" class="back-btn">Browse All Inventory</a>'
      + '</template>';
    html = html.replace('</body>', errorTpl + '\n</body>');
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=UTF-8', 'Cache-Control': 'no-store, no-cache' },
    });
  }

  const { unit, dealerKey } = result;
  const d = DEALERS[dealerKey] || {};

  // Log raw photos value straight from Supabase before any manipulation
  console.log(`[vehicle edge] photos raw — type:${typeof unit.photos} isArray:${Array.isArray(unit.photos)} sample:${JSON.stringify(unit.photos)?.slice(0, 150)}`);

  const title      = [unit.year, unit.make, unit.model].filter(Boolean).join(' ') || 'Unit Available';
  const price      = formatPrice(unit.price);
  const subcat     = unit.subcategory || '';
  const photos     = getPhotos(unit);
  const firstPhoto = photos[0]?.url || photos[0]?.dataUrl || '';

  console.log(`[vehicle edge] photos parsed — count:${photos.length} first:${photos[0]?.url ?? 'none'}`);

  const addrLines = (d.address || '').split('\n');
  const cityLine  = addrLines[addrLines.length - 1] || '';
  const city      = cityLine.split(',')[0].trim();
  const stateCode = (cityLine.split(',')[1] || '').trim().split(' ')[0];
  const cityState = city && stateCode ? `${city}, ${stateCode}` : city || 'NC';
  const loc       = addrLines.length > 1 ? addrLines[1] : addrLines[0] || '';

  const pageUrl   = `${SITE}/vehicle.html?stock=${encodeURIComponent(unit.stock)}&dealer=${encodeURIComponent(dealerKey)}`;
  const pageTitle = `${[unit.year, unit.make, unit.model, subcat].filter(Boolean).join(' ')} for Sale in ${cityState} | Torque Hub`;
  const pageDesc  = `${title}${subcat ? ' ' + subcat : ''} for sale in ${cityState}. ${price}. Call ${d.phone || 'the dealer'} or apply for financing online. Torque Hub.`;

  const specsHtml = buildSpecsHtml(unit);
  const descHtml  = buildDescHtml(unit.description);
  const schema    = buildSchema(unit, d, pageUrl, dealerKey);

  // Normalize photos: always send a parsed array to the client regardless of how
  // Supabase stores the column (jsonb comes back as an array; text comes back as
  // a JSON string). Use the already-computed `photos` array rather than calling
  // getPhotos() a second time so both paths use the same parsed value.
  const unitForClient = { ...unit, photos };
  console.log(`[vehicle edge] injecting __VDP_UNIT__ photos count:${photos.length} first url:${photos[0]?.url ?? 'none'}`);
  const dataScript = `<script>window.__VDP_UNIT__=${safeJson(unitForClient)};window.__VDP_DEALER_KEY__=${safeJson(dealerKey)};</script>`;

  let html = await baseResponse.text();
  console.log(`[vehicle edge] base HTML length: ${html.length}`);

  html = injectMeta(html, { pageTitle, pageDesc, pageUrl, firstPhoto, schema });
  html = html.replace('</head>', dataScript + '\n</head>');
  html = injectBody(html, { unit, dealerKey, title, price, subcat, loc, cityState, specsHtml, descHtml, firstPhoto });

  // Sold listing — inject template so client JS can build the sold banner
  if (unit.sold) {
    const soldTpl = '<template id="sold-banner-tpl">'
      + '<div><div class="sold-banner-text">🚫 This unit has been sold</div>'
      + '<div class="sold-banner-sub">Check out similar available units below.</div></div>'
      + '</template>';
    html = html.replace('</body>', soldTpl + '\n</body>');
  }

  console.log(`[vehicle edge] transformed OK — title: ${pageTitle}`);

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=UTF-8',
      'Cache-Control': 'no-store, no-cache',
      'X-VDP-SSR': '1',
    },
  });
}
