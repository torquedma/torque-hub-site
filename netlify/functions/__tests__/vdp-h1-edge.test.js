'use strict';
// vdp-h1-edge.test.js - VDP-H1-001 Option S (Chief 2 ruling TH-CHIEF_2-20261106-080).
// The vehicle edge function emits exactly ONE descriptive, escaped H1 (class vdp-headline-title, id hl-title) on every
// rendered listing (live, sold, departed) by replacing the template's headline DIV. vehicle.html keeps the DIV, so the
// 404 / no-stock / error-fallback paths carry no H1. A missing or duplicated replacement target fails H-9 and H-11.
// Drives the REAL default handler (netlify/edge-functions/vehicle.js, ESM) with a mocked fetch for the public view and a
// context.next() that returns the REAL vehicle.html. No network. Fixture rows are synthetic (shaped like four live units).
// H-8 compares against the 18685c03 base output (sha256 of the output with the H1 written back as the base DIV).
// If vehicle.html or vehicle.js changes deliberately later, re-capture BASE_SHA256 from the then-current base.
// VDP-H1-COPY-001 (Chief 1 -298, Chief 2 -270): the H1 TEXT is now buildHeadingTitle (display title + canonical type);
// H-8 writes the base display title back into the DIV, so the rest of the page must still match the base byte-for-byte.
// SITE-DIAG-001 (Chief 1 -372, HST -316): the obsolete May 1 overflow diagnostic <script> (it rewrote document.title)
// is removed from vehicle.html; H-8 writes that exact block back right after the main script (where it stood), so the
// rest of the page still matches the base byte-for-byte.
// VDP-CAT-001 (Chief 1 -388, HST -318/-320): the category badge under the H1 is removed (template element, CSS rule,
// edge fill and hydration) and the label becomes a Key Details 'Category:' bullet. H-8 writes all of that back
// (unCat), so the rest of the page must still match the pinned base byte-for-byte.
// Run: node --test netlify/functions/__tests__/vdp-h1-edge.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '../../..');
const EDGE_DIR = path.join(ROOT, 'netlify/edge-functions');
const TEMPLATE = fs.readFileSync(path.join(ROOT, 'vehicle.html'), 'utf8');
const EDGE_SRC = fs.readFileSync(path.join(EDGE_DIR, 'vehicle.js'), 'utf8');
const TARGET = '<div class="vdp-headline-title" id="hl-title"></div>';
const H1_RE = /<h1 class="vdp-headline-title" id="hl-title">([^<]*)<\/h1>/;

// FIXTURES-BEGIN
const BASE_ROW = {
  trim: '', photos: [{ url: 'https://example.invalid/photo-1.jpg' }], mileage: '', engine: '', horsepower: '', hours: '',
  fuel: null, condition: 'Used', transmission: '', drivetrain: '', vin: '', buyer_intelligence: null,
  public_phone: '555-0100', cta_phone: '555-0100', tracking_scope: 'dealer', public_street: null, public_geo_scope: 'dealer',
};
const FIX = {
  'DBT-7961': Object.assign({}, BASE_ROW, {
    stock: 'DBT-7961', year: '2024', make: 'RAM', model: '5500', trim: 'Cab & Chassis', price: '49950',
    dealer: 'DeBary Truck Sales', category: 'Trucks', subcategory: 'Cab & Chassis', engine: 'Cummins 6.7L I6', fuel: 'Diesel',
    drivetrain: '4X4', vin: '3C7WRNEL7RG240397', sold: false, listing_state: 'live',
    description: 'Key Details\n- Year: 2024\n- Make: RAM\n- Model: 5500\n- Stock #: DBT-7961\n\nOverview\nCrew cab cab & chassis.',
    public_city: 'Sanford', public_state: 'FL', public_zip: '32771',
  }),
  'JOE-102902': Object.assign({}, BASE_ROW, {
    stock: 'JOE-102902', year: '', make: 'Billy Goat', model: 'Hurricane Z3000', price: '$12,500',
    dealer: "Joe's Tractor Sales", category: 'Landscape', subcategory: 'Stand-On Blower', engine: 'Vanguard 993cc V-twin',
    horsepower: '35', hours: '133', fuel: 'Gasoline', transmission: 'Dual Hydrostatic', sold: false, listing_state: 'live',
    description: 'Key Details\n- Make: Billy Goat\n- Model: Hurricane Z3000\n- Stock #: JOE-102902\n\nOverview\nStand-on blower.',
    public_city: 'Thomasville', public_state: 'NC', public_zip: '27360',
  }),
  'ATC-0085': Object.assign({}, BASE_ROW, {
    stock: 'ATC-0085', year: '2018', make: 'Ram', model: '4500', trim: null, price: '$16,450',
    dealer: 'Auto Connection 210 LLC', category: 'Trucks', subcategory: 'Service Truck', mileage: '257,057',
    engine: '6.7L Cummins', fuel: 'Diesel', sold: true, listing_state: 'sold',
    description: 'Key Details\n- Year: 2018\n- Stock #: ATC-0085\n\nOverview\nService truck.',
    public_city: 'Angier', public_state: 'NC', public_zip: '27501',
  }),
  'ATT-000517': Object.assign({}, BASE_ROW, {
    stock: 'ATT-000517', year: '1996', make: 'Stoughton', model: '48 ft', trim: 'Dry Van Trailer', price: '3500',
    dealer: 'Allied Truck & Trailer Sales', category: 'Trailers', subcategory: 'Dry Van Trailer', sold: true,
    listing_state: 'departed', description: 'Key Details\n- Year: 1996\n- Stock #: ATT-000517\n\nOverview\nDry van.',
    public_city: 'Madison', public_state: 'NC', public_zip: '27025',
  }),
  'ESC-0001': Object.assign({}, BASE_ROW, {
    stock: 'ESC-0001', year: '2020', make: 'A&B <Co>', model: '"X" 1', price: '1000', dealer: 'Test Dealer',
    category: 'Trucks', subcategory: 'Box Truck', sold: false, listing_state: 'live', description: 'Overview\nTest.',
    public_city: 'Test', public_state: 'NC', public_zip: '27000',
  }),
};
// FIXTURES-END

// sha256 of the 18685c03 base handler output for the same fixtures, mocks and vehicle.html (captured offline by HST).
const BASE_SHA256 = {
  'DBT-7961': '85215459f64edca0974d05df2ca46e17c52e07ad74f8a1a146d51f6283e0f7da',
  'JOE-102902': '1b9b747b2b584365bb375577212f7a2b2b95ca14bbb938053017bf7e71905dcb',
  'ATC-0085': '31a63e649fabdca69e0f7f0ce42205128ab5712c1e9565d9ddb1464435c41a6e',
  'ATT-000517': 'edd97bd7f1043d2fd7697ad6ad075ee577c7f9eeae06a6c99cad0251e3663f60',
  '404': '792f1e221ed97c122297ba9aac26a12d4503e3c5bb993cb20693d5d8e170d4d5',
};

let handlerPromise = null;
function loadHandler() {
  if (!handlerPromise) handlerPromise = import(pathToFileURL(path.join(EDGE_DIR, 'vehicle.js')).href).then((m) => m.default);
  return handlerPromise;
}

async function render(query, opts) {
  const o = opts || {};
  const handler = await loadHandler();
  const realFetch = global.fetch;
  const quiet = [console.log, console.warn, console.error];
  global.fetch = async (url) => {
    const u = String(url);
    if (!u.includes('/rest/v1/inventory_public_detail?')) throw new Error('unexpected fetch ' + u);
    if (o.fail) return new Response('upstream error', { status: 500 });
    const m = u.match(/[?&]stock=eq\.([^&]+)/);
    const stock = m ? decodeURIComponent(m[1]) : '';
    const row = FIX[stock];
    return new Response(JSON.stringify(row ? [row] : []), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  try {
    const req = new Request('https://hub.torquedma.com/vehicle.html' + query, { headers: { 'user-agent': 'vdp-h1-test' } });
    const tpl = o.template == null ? TEMPLATE : o.template;
    const ctx = { next: async () => new Response(tpl, { status: 200, headers: { 'Content-Type': 'text/html' } }) };
    const res = await handler(req, ctx);
    return { status: res.status, headers: res.headers, body: await res.text() };
  } finally {
    global.fetch = realFetch;
    [console.log, console.warn, console.error] = quiet;
  }
}

const count = (s, sub) => s.split(sub).length - 1;
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const BASE_TITLE = { 'DBT-7961': '2024 RAM 5500', 'JOE-102902': 'Billy Goat Hurricane Z3000', 'ATC-0085': '2018 Ram 4500', 'ATT-000517': '1996 Stoughton 48 ft' };
// The one vehicle.html hydration line that changed (it sets #hl-title from buildHeadingTitle); written back for H-8.
const HYD_NEW = "hlTitle.textContent = window.TITLE_HELPERS.buildHeadingTitle(unit);";
const HYD_OLD = "hlTitle.textContent = title;";
const unHyd = (b) => b.split(HYD_NEW).join(HYD_OLD);
// SITE-DIAG-001: the removed May 1 diagnostic block, byte-exact; written back after the main script for H-8 only.
const DIAG_BLOCK = "<script>\nwindow.addEventListener('load', () => {\n  const vw = window.innerWidth;\n  const offenders = [];\n  document.querySelectorAll('*').forEach(el => {\n    const w = el.getBoundingClientRect().width;\n    if (w > vw + 1) {\n      offenders.push({tag: el.tagName, id: el.id, cls: el.className, width: Math.round(w)});\n    }\n  });\n  console.log('VIEWPORT:', vw);\n  console.log('OFFENDERS:', offenders);\n  if (offenders.length) {\n    document.title = offenders.slice(0, 5).map(o => `${o.tag}.${(o.cls || o.id || '?').toString().slice(0,15)}=${o.width}`).join(' | ');\n  }\n});\n</script>\n";
const DIAG_ANCHOR = '\ninit();\n</script>\n';
const reDiag = (b) => b.replace(DIAG_ANCHOR, () => DIAG_ANCHOR + DIAG_BLOCK);
// VDP-CAT-001 write-back: the removed badge CSS rule, template element (as the base edge filled it), hydration block
// and Key Details line are restored, and the added 'Category:' bullet is taken out.
const CAT_CSS = "    .subcat-badge { display: inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; padding: 4px 12px; border-radius: 20px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); color: #94a3b8; margin-top: 8px; }\n";
const CAT_CSS_ANCHOR = '    .vdp-headline-sep { color: var(--soft); }\n';
const CAT_EL_ANCHOR = '\n          <h2 class="vdp-seo-line" id="vdp-seo-h2">';
const catEl = (label) => label
  ? '<div id="hl-badge"><span class="subcat-badge" id="hl-subcat">' + label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</span></div>'
  : '<div id="hl-badge" style="display:none"><span class="subcat-badge" id="hl-subcat"></span></div>';
const CAT_HYD = "  if (subcatBadge) {\n    const hlSubcat = el('hl-subcat'); if (hlSubcat) hlSubcat.textContent = subcatBadge;\n    const hlBadge  = el('hl-badge');  if (hlBadge)  hlBadge.style.display = 'block';\n  }\n";
const CAT_HYD_ANCHOR = HYD_OLD + '\n';
const DESC_NEW = "window.DESC_RENDER.addCategoryFact(window.DESC_RENDER.buildKeyDetailsCardHtml(unit.description), subcatBadge);";
const DESC_OLD = "window.DESC_RENDER.buildKeyDetailsCardHtml(unit.description);";
const CAT_LI_RE = /<li>Category: [^<]*<\/li>/;
function unCat(b, label) {
  assert.equal(count(b, CAT_CSS_ANCHOR), 1); assert.equal(count(b, CAT_EL_ANCHOR), 1); assert.equal(count(b, CAT_HYD_ANCHOR), 1); assert.equal(count(b, DESC_NEW), 1);
  return b.replace(CAT_CSS_ANCHOR, () => CAT_CSS_ANCHOR + CAT_CSS)
    .replace(CAT_EL_ANCHOR, () => '\n          ' + catEl(label) + CAT_EL_ANCHOR)
    .replace(CAT_HYD_ANCHOR, () => CAT_HYD_ANCHOR + CAT_HYD)
    .replace(DESC_NEW, () => DESC_OLD)
    .replace(CAT_LI_RE, '');
}
const toBaseShape = (b, s, label) => reDiag(unCat(unHyd(b.replace(H1_RE, () => '<div class="vdp-headline-title" id="hl-title">' + BASE_TITLE[s] + '</div>')), label));
// The H-11 invariant for a rendered listing: one H1, inside the headline strip, and no headline DIV left behind.
function headlineProblem(body) {
  if (count(body, '<h1') !== 1 || count(body, '</h1>') !== 1) return 'h1 count ' + count(body, '<h1');
  if (!H1_RE.test(body)) return 'h1 is not the vdp-headline-title / hl-title element';
  if (count(body, '<div class="vdp-headline-title"') !== 0) return 'headline DIV left behind';
  const strip = body.indexOf('<div class="vdp-headline" id="vdp-headline">');
  const h1 = body.search(H1_RE);
  const seo = body.indexOf('id="vdp-seo-h2"');
  if (!(strip >= 0 && strip < h1 && h1 < seo)) return 'h1 not inside the headline strip before the SEO H2';
  return null;
}
const h1Text = (b) => (b.match(H1_RE) || [])[1];
const robots = (b) => (b.match(/<meta name="robots" content="([^"]*)"/) || [])[1];

test('H-1: live truck -> exactly one H1 with the descriptive heading (display title + type)', async () => {
  const { buildHeadingTitle } = await import(pathToFileURL(path.join(EDGE_DIR, 'lib/title-helpers.js')).href);
  const r = await render('?stock=DBT-7961');
  assert.equal(r.status, 200);
  assert.equal(headlineProblem(r.body), null);
  assert.equal(h1Text(r.body), '2024 RAM 5500 Cab &amp; Chassis');
  assert.equal(h1Text(r.body), buildHeadingTitle(FIX['DBT-7961']).replace(/&/g, '&amp;'));
  assert.equal(robots(r.body), 'index,follow');
});

test('H-1b: the H1 text goes through the existing esc() (& < > escaped; quotes are safe in text)', async () => {
  const r = await render('?stock=ESC-0001');
  assert.equal(headlineProblem(r.body), null);
  assert.equal(h1Text(r.body), '2020 A&amp;B &lt;Co&gt; "X" 1 Box Truck');
  assert.ok(!/<h1[^>]*>[^<]*<Co>/.test(r.body), 'raw markup must not appear inside the H1');
});

test('H-2: live equipment, no year, non-canonical type -> "Billy Goat Hurricane Z3000" exactly (no year, no subtype)', async () => {
  const r = await render('?stock=JOE-102902');
  assert.equal(r.status, 200);
  assert.equal(headlineProblem(r.body), null);
  assert.equal(h1Text(r.body), 'Billy Goat Hurricane Z3000');
  assert.ok(!/Stand-On/i.test(h1Text(r.body)));
  assert.ok(!/\b(19|20)\d{2}\b/.test(h1Text(r.body)));
});

test('H-3: sold -> one H1, noindex,follow, SEO H2 marked Sold', async () => {
  const r = await render('?stock=ATC-0085');
  assert.equal(r.status, 200);
  assert.equal(headlineProblem(r.body), null);
  assert.equal(h1Text(r.body), '2018 Ram 4500 Service Truck');
  assert.equal(robots(r.body), 'noindex,follow');
  assert.match(r.body, /id="vdp-seo-h2">[^<]*\u2014 Sold</);
});

test('H-4: departed -> one H1, noindex,follow, SEO H2 marked No Longer Listed', async () => {
  const r = await render('?stock=ATT-000517');
  assert.equal(r.status, 200);
  assert.equal(headlineProblem(r.body), null);
  assert.equal(h1Text(r.body), '1996 Stoughton 48 ft Dry Van Trailer');
  assert.equal(robots(r.body), 'noindex,follow');
  assert.match(r.body, /id="vdp-seo-h2">[^<]*\u2014 No Longer Listed</);
});

test('H-5: zero rows (D2) -> 404, ZERO H1, error H2 kept, noindex, no canonical, no og:url, no-store', async () => {
  const r = await render('?stock=NONE-0000');
  assert.equal(r.status, 404);
  assert.equal(count(r.body, '<h1'), 0);
  assert.ok(!r.body.includes('id="hl-title"></h1>'));
  assert.ok(r.body.includes('<h2>Listing Not Available</h2>'));
  assert.equal(robots(r.body), 'noindex,follow');
  assert.ok(!r.body.includes('rel="canonical"'));
  assert.ok(!r.body.includes('property="og:url"'));
  assert.equal(r.headers.get('cache-control'), 'no-store');
});

test('H-6: lookup failure -> 503 text/plain, unchanged', async () => {
  const r = await render('?stock=DBT-7961', { fail: true });
  assert.equal(r.status, 503);
  assert.match(r.headers.get('content-type'), /^text\/plain/);
  assert.equal(r.body, 'Listing temporarily unavailable');
});

test('H-7: no stock parameter -> template passed through unchanged, zero H1', async () => {
  const r = await render('');
  assert.equal(r.body, TEMPLATE);
  assert.equal(count(r.body, '<h1'), 0);
});

test('H-8: parity with the 18685c03 base output (only the headline tag and its text differ)', async () => {
  const { subcategoryLabel } = await import(pathToFileURL(path.join(EDGE_DIR, 'lib/title-helpers.js')).href);
  for (const s of ['DBT-7961', 'JOE-102902', 'ATC-0085', 'ATT-000517']) {
    const r = await render('?stock=' + s);
    assert.equal(sha(toBaseShape(r.body, s, subcategoryLabel(FIX[s]))), BASE_SHA256[s], s);
  }
  const nf = await render('?stock=NONE-0000');
  assert.equal(count(nf.body, HYD_NEW), 1, 'the changed hydration line is present once');
  assert.equal(count(nf.body, DIAG_ANCHOR), 1, 'the write-back anchor occurs once');
  assert.equal(sha(reDiag(unCat(unHyd(nf.body), ''))), BASE_SHA256['404'], '404 is byte-identical to base apart from that line, the removed diagnostic and the VDP-CAT-001 badge removal');
});

test('H-9: coupling - the template target occurs exactly once and the edge replaces it exactly once', () => {
  assert.equal(count(TEMPLATE, TARGET), 1, 'vehicle.html must hold exactly one headline target DIV');
  assert.equal(count(TEMPLATE, 'id="hl-title"'), 1, 'vehicle.html must hold exactly one hl-title element');
  assert.equal(count(TEMPLATE, '<h1'), 0, 'vehicle.html must carry no H1 of its own');
  assert.equal(count(EDGE_SRC, "html.replace('" + TARGET + "', `<h1 class=\"vdp-headline-title\" id=\"hl-title\">${esc(heading)}</h1>`)"), 1);
  assert.equal(count(EDGE_SRC, "'id=\"hl-title\"></div>'"), 0, 'old DIV-fill replace must be gone');
  assert.equal(count(EDGE_SRC, '<h1'), 1, 'the edge emits an H1 from exactly one place');
});

test('H-10: debug JSON unchanged', async () => {
  const r = await render('?stock=DBT-7961&__debug=1');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /application\/json/);
  const j = JSON.parse(r.body);
  assert.deepEqual(Object.keys(j), ['stock', 'dealer', 'supabaseUrl', 'found', 'dealerKey', 'userAgent', 'photos', 'unit', 'fetchError', 'log']);
  assert.equal(j.found, true);
  assert.ok(!r.body.includes('<h1'));
});

test('H-11: every rendered listing has exactly one H1 and no leftover headline DIV', async () => {
  for (const s of Object.keys(FIX)) {
    const r = await render('?stock=' + s);
    assert.equal(r.status, 200, s);
    assert.equal(headlineProblem(r.body), null, s);
  }
});

test('H-11b: a missing or duplicated template target is detected as a failure (not a silent DIV)', async () => {
  const missing = await render('?stock=DBT-7961', { template: TEMPLATE.replace(TARGET, '<div class="vdp-headline-title-x" id="hl-title-x"></div>') });
  assert.notEqual(headlineProblem(missing.body), null, 'missing target must be flagged');
  assert.equal(count(missing.body, '<h1'), 0);
  const dup = await render('?stock=DBT-7961', { template: TEMPLATE.replace(TARGET, TARGET + TARGET) });
  assert.notEqual(headlineProblem(dup.body), null, 'duplicated target must be flagged');
  assert.equal(count(dup.body, '<div class="vdp-headline-title"'), 1);
});

test('H-12: SITE-DIAG-001 - no overflow diagnostic; document.title is set only by the two SEO title paths', async () => {
  assert.equal(count(TEMPLATE, 'offenders'), 0, 'diagnostic code must be gone');
  assert.equal(count(TEMPLATE, 'OFFENDERS'), 0);
  assert.equal(count(TEMPLATE, "console.log('VIEWPORT:'"), 0);
  assert.equal(count(TEMPLATE, 'document.title ='), 2, 'only buildSeoTitle and the sold/departed title assign document.title');
  assert.equal(count(TEMPLATE, 'document.title = window.TITLE_HELPERS.buildSeoTitle(unit, cityState);'), 1);
  for (const s of ['DBT-7961', 'ATC-0085', 'NONE-0000']) {
    const r = await render('?stock=' + s);
    assert.equal(count(r.body, 'offenders'), 0, s);
    assert.equal(count(r.body, 'document.title ='), 2, s);
  }
});

test('H-13: VDP-CAT-001 - no badge under the H1; the category is one Key Details bullet in SSR (live and historical)', async () => {
  const want = {
    'DBT-7961': '<li>Model: 5500</li><li>Category: Cab &amp; Chassis</li>',
    'JOE-102902': '<li>Model: Hurricane Z3000</li><li>Category: Stand-On Blower</li>',
    'ATC-0085': '<ul class="desc-list"><li>Category: Service Truck</li><li>Year: 2018</li>',
    'ATT-000517': '<ul class="desc-list"><li>Category: Dry Van Trailer</li><li>Year: 1996</li>',
    'ESC-0001': 'id="desc-body"><ul class="desc-list"><li>Category: Box Truck</li></ul>',
  };
  for (const s of Object.keys(FIX)) {
    const r = await render('?stock=' + s);
    assert.equal(count(r.body, 'hl-badge'), 0, s);
    assert.equal(count(r.body, 'subcat-badge'), 0, s);
    assert.equal(count(r.body, '<li>Category: '), 1, s);
    assert.equal(count(r.body, want[s]), 1, s);
    assert.equal(headlineProblem(r.body), null, s);
  }
  const nf = await render('?stock=NONE-0000');
  assert.equal(count(nf.body, '<li>Category: '), 0);
  assert.equal(count(nf.body, 'hl-badge'), 0);
});
