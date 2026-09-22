// SSR edge function for /inventory-directory
//
// Purpose (Search F3): give every governed buyer-live unit an ordinary,
// server-rendered HTML path — finite pages, ordinary anchors, no JS required.
// This complements the richer JS Inventory browser; it does not replace it.
//
// Data contract: the public inventory_cards view owns publication eligibility;
// sold=false selects its currently available units (same contract as
// sitemap.js and inventory-engine.js). No dealer allowlist, no lifecycle
// predicates, no inventory authority live here.
//
// Pagination contract:
//   order  = created_at.asc,id.asc   (created_at is NOT unique; id is the
//            immutable unique row identity and breaks every tie deterministically;
//            ascending keeps existing pages stable when new units are added)
//   size   = PAGE_SIZE units per page
//   page 1 = /inventory-directory        (canonical; ?page=1 canonicals here)
//   page N = /inventory-directory?page=N (self-canonical)
//   invalid / out-of-range / repeated page param -> 404, never a duplicate 200
//   upstream failure / unparsable count / incomplete page -> 503 no-store,
//            never a successful-looking partial page.

import { SHELL, esc, escAttr, safeJson, buildCardGrid } from './lib/listing-shell.js';
import { buildDisplayTitle } from './lib/title-helpers.js';

const SUPABASE_URL = 'https://bxsikkmqasydosmblzov.supabase.co';
// Non-sensitive public anon key — same value used in category.js and inventory-engine.js.
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4c2lra21xYXN5ZG9zbWJsem92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTc1OTksImV4cCI6MjA5MDQ3MzU5OX0.JMEI7cx2tddmbvfqm_qxiIWp7f5Phuk5l0Y487DUSZg';
const BASE = 'https://hub.torquedma.com';
const PATH = '/inventory-directory';
const PAGE_SIZE = 60;
const SELECT = 'stock,year,make,model,price,mileage,subcategory,category,engine,horsepower,hours,fuel,condition,photos,governed_facts';

function pageHref(n) { return n === 1 ? PATH : PATH + '?page=' + n; }

function unavailable() {
  return new Response('Inventory directory temporarily unavailable', {
    status: 503,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function notFound() { return new Response(null, { status: 404 }); }

// Accepts exactly one `page` value that is a positive integer without leading
// zeros and at most 6 digits. Returns the integer, or null for anything else.
function parsePage(url) {
  const values = url.searchParams.getAll('page');
  if (values.length === 0) return 1;
  if (values.length !== 1) return null;
  if (!/^[1-9][0-9]{0,5}$/.test(values[0])) return null;
  return Number(values[0]);
}

// Content-Range: "start-end/total" or "*/total" (empty page with count=exact).
function parseTotal(header) {
  if (typeof header !== 'string') return null;
  const m = header.match(/^(?:\d+-\d+|\*)\/(\d+)$/);
  return m ? Number(m[1]) : null;
}

function buildPaginationNav(page, totalPages) {
  if (totalPages <= 1) return '';
  const parts = [];
  if (page > 1) parts.push('<a href="' + escAttr(pageHref(page - 1)) + '" rel="prev">&larr; Previous</a>');
  for (let n = 1; n <= totalPages; n++) {
    parts.push(n === page
      ? '<a href="' + escAttr(pageHref(n)) + '" aria-current="page" style="color:var(--text);border-color:rgba(255,255,255,0.3);">' + n + '</a>'
      : '<a href="' + escAttr(pageHref(n)) + '">' + n + '</a>');
  }
  if (page < totalPages) parts.push('<a href="' + escAttr(pageHref(page + 1)) + '" rel="next">Next &rarr;</a>');
  return '<nav class="cat-children" aria-label="Directory pages"><span class="cat-children-label">Page ' + page + ' of ' + totalPages + ':</span> ' + parts.join(' ') + '</nav>';
}

export default async function handler(request) {
  let page, units, total;
  try {
    const url = new URL(request.url);
    page = parsePage(url);
    if (page === null) return notFound();

    const offset = (page - 1) * PAGE_SIZE;
    const query = SUPABASE_URL + '/rest/v1/inventory_cards?sold=eq.false' +
      '&order=created_at.asc,id.asc&limit=' + PAGE_SIZE + '&offset=' + offset + '&select=' + SELECT;
    const res = await fetch(query, {
      headers: { apikey: SUPABASE_ANON, Authorization: 'Bearer ' + SUPABASE_ANON, Prefer: 'count=exact' },
    }).catch(() => null);
    // PostgREST answers an offset at/beyond the result set with 416 (PGRST103):
    // that is the approved beyond-final-page signal, not a backend failure.
    if (res && res.status === 416) return notFound();
    if (!res || !res.ok) return unavailable();

    total = parseTotal(res.headers.get('content-range'));
    if (total === null) return unavailable();

    try { units = await res.json(); } catch { return unavailable(); }
    if (!Array.isArray(units)) return unavailable();

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (page > totalPages) return notFound();

    // The page must be exactly the slice the count promised; anything else is
    // an incomplete or inconsistent read and must not render as success.
    const expected = Math.max(0, Math.min(PAGE_SIZE, total - offset));
    if (units.length !== expected) return unavailable();
    for (const u of units) {
      if (!u || typeof u.stock !== 'string' || !u.stock.trim()) return unavailable();
    }

    const first = total ? offset + 1 : 0;
    const last = offset + units.length;
    const titleText = 'Inventory Directory' + (totalPages > 1 ? ' — Page ' + page + ' of ' + totalPages : '') + ' | Torque Hub';
    const h1Text = 'Inventory Directory';
    const descText = total
      ? ('Complete list of all ' + total + ' trucks, trailers, and equipment for sale at Torque Hub' +
         (totalPages > 1 ? ' — page ' + page + ' of ' + totalPages + ', units ' + first + '–' + last : '') +
         '. Every unit currently listed, from verified sellers — financing available.')
      : 'Complete list of all trucks, trailers, and equipment for sale at Torque Hub. New inventory added regularly — financing available.';
    const canonical = BASE + pageHref(page);
    const countText = total
      ? (total + ' unit' + (total === 1 ? '' : 's') + ' for sale' + (totalPages > 1 ? ' · showing ' + first + '–' + last : ''))
      : '';
    const introHtml = '<p class="cat-intro">Every unit currently listed on Torque Hub, oldest listing first, ' + PAGE_SIZE +
      ' per page. Looking for something specific? <a href="/inventory.html" style="color:#cbd5e1;text-decoration:underline;">Browse Inventory</a> has search and filters.<br>' +
      esc("Tell 'em Torque sent ya.") + '</p>';
    const gridBlockHtml = units.length
      ? ('<div class="cat-grid">' + buildCardGrid(units) + '</div>')
      : ('<div class="cat-empty"><p>No units in stock right now — new inventory is added regularly. <a href="/inventory.html">Browse inventory</a>.</p></div>');
    const navHtml = buildPaginationNav(page, totalPages);

    const itemListSchema = {
      '@context': 'https://schema.org', '@type': 'CollectionPage',
      'name': h1Text + (totalPages > 1 ? ' — Page ' + page : ''), 'description': descText, 'url': canonical,
      'mainEntity': {
        '@type': 'ItemList', 'numberOfItems': units.length,
        'itemListElement': units.map((u, i) => ({
          '@type': 'ListItem', 'position': offset + i + 1,
          'url': BASE + '/vehicle.html?stock=' + encodeURIComponent(u.stock),
          'name': buildDisplayTitle(u),
        })),
      },
    };
    const breadcrumbSchema = {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: BASE + '/' },
        { '@type': 'ListItem', position: 2, name: 'Inventory', item: BASE + '/inventory.html' },
        { '@type': 'ListItem', position: 3, name: h1Text, item: canonical },
      ],
    };

    let html = SHELL
      .replace(/(<title id="page-title">)[\s\S]*?(<\/title>)/, '$1' + esc(titleText) + '$2')
      .replace(/(<meta name="description" id="page-desc" content=")[^"]*(")/, '$1' + escAttr(descText) + '$2')
      .replace(/(<link rel="canonical" id="canonical-url" href=")[^"]*(")/, '$1' + escAttr(canonical) + '$2')
      .replace(/(<meta property="og:title" id="og-title" content=")[^"]*(")/, '$1' + escAttr(titleText) + '$2')
      .replace(/(<meta property="og:description" id="og-desc" content=")[^"]*(")/, '$1' + escAttr(descText) + '$2')
      .replace(/(<meta property="og:url" id="og-url" content=")[^"]*(")/, '$1' + escAttr(canonical) + '$2')
      .replace(/(<script type="application\/ld\+json" id="schema-data">)[\s\S]*?(<\/script>)/, '$1' + safeJson([itemListSchema, breadcrumbSchema]) + '$2');

    html = html
      .replace('<!--CAT_H1-->', esc(h1Text))
      .replace('<!--CAT_COUNT-->', esc(countText))
      .replace('<!--CAT_INTRO-->', introHtml)
      .replace('<!--CAT_CHILDREN-->', navHtml)
      .replace('<!--CAT_GRID-->', gridBlockHtml)
      .replace('<!--CAT_SIBLINGS-->', navHtml)
      .replace('<!--CAT_HUBLINKS-->', '')
      .replace('<!--CAT_BREADCRUMB-->', esc(h1Text));

    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  } catch (e) {
    // Unlike category.js, never fall back to an empty successful shell:
    // a discovery page that cannot be established must not look complete.
    return unavailable();
  }
}
