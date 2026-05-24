const SUPABASE_URL = 'https://bxsikkmqasydosmblzov.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4c2lra21xYXN5ZG9zbWJsem92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTc1OTksImV4cCI6MjA5MDQ3MzU5OX0.JMEI7cx2tddmbvfqm_qxiIWp7f5Phuk5l0Y487DUSZg';
const SB_HEADERS = { 'apikey': SUPABASE_ANON, 'Authorization': 'Bearer ' + SUPABASE_ANON };
const BASE = 'https://hub.torquedma.com';

const CATEGORY_HUBS = {
  'trucks-for-sale':                { category: 'Trucks',       label: 'Trucks' },
  'trailers-for-sale':              { category: 'Trailers',     label: 'Trailers' },
  'farm-equipment-for-sale':        { category: 'Farm',         label: 'Farm Equipment' },
  'construction-equipment-for-sale':{ category: 'Construction', label: 'Construction Equipment' },
  'landscape-equipment-for-sale':   { category: 'Landscape',    label: 'Landscape Equipment' },
};

const SUBCATEGORY_LEAVES = {
  'box-trucks-for-sale':             { subs: ['Box Truck'],                     label: 'Box Trucks',           hub: 'trucks-for-sale' },
  'semi-trucks-for-sale':            { subs: ['Day Cab Tractor'],               label: 'Semi Trucks',          hub: 'trucks-for-sale' },
  'service-trucks-for-sale':         { subs: ['Service Truck'],                 label: 'Service Trucks',       hub: 'trucks-for-sale' },
  'dump-trucks-for-sale':            { subs: ['Dump Truck','Grain Dump Truck'], label: 'Dump Trucks',          hub: 'trucks-for-sale' },
  'cab-and-chassis-trucks-for-sale': { subs: ['Cab & Chassis'],                 label: 'Cab & Chassis Trucks', hub: 'trucks-for-sale' },
  'flatbed-trucks-for-sale':         { subs: ['Flatbed Truck'],                 label: 'Flatbed Trucks',       hub: 'trucks-for-sale' },
  'rollback-tow-trucks-for-sale':    { subs: ['Rollback Tow Truck'],            label: 'Rollback Tow Trucks',  hub: 'trucks-for-sale' },
  'cargo-vans-for-sale':             { subs: ['Cargo Van'],                     label: 'Cargo Vans',           hub: 'trucks-for-sale' },
  'yard-spotters-for-sale':          { subs: ['Yard Spotter'],                  label: 'Yard Spotters',        hub: 'trucks-for-sale' },
  'car-carrier-trucks-for-sale':     { subs: ['Car Carrier Truck'],             label: 'Car Carrier Trucks',   hub: 'trucks-for-sale' },
  'enclosed-trailers-for-sale':      { subs: ['Enclosed Trailer'],              label: 'Enclosed Trailers',    hub: 'trailers-for-sale' },
  'car-hauler-trailers-for-sale':    { subs: ['Car Hauler Trailer'],            label: 'Car Hauler Trailers',  hub: 'trailers-for-sale' },
  'utility-trailers-for-sale':       { subs: ['Utility Trailer'],               label: 'Utility Trailers',     hub: 'trailers-for-sale' },
  'equipment-trailers-for-sale':     { subs: ['Equipment Trailer'],             label: 'Equipment Trailers',   hub: 'trailers-for-sale' },
  'dump-trailers-for-sale':          { subs: ['Dump Trailer'],                  label: 'Dump Trailers',        hub: 'trailers-for-sale' },
  'gooseneck-trailers-for-sale':     { subs: ['Gooseneck Trailer'],             label: 'Gooseneck Trailers',   hub: 'trailers-for-sale' },
  'tractors-for-sale':               { subs: ['Tractor'],                       label: 'Tractors',             hub: 'farm-equipment-for-sale' },
  'rotary-cutters-for-sale':         { subs: ['Rotary Cutter'],                 label: 'Rotary Cutters',       hub: 'farm-equipment-for-sale' },
  'zero-turn-mowers-for-sale':       { subs: ['Zero Turn Mower'],               label: 'Zero Turn Mowers',     hub: 'landscape-equipment-for-sale' },
  'lawn-tractors-for-sale':          { subs: ['Lawn Tractor'],                  label: 'Lawn Tractors',        hub: 'landscape-equipment-for-sale' },
  'excavators-for-sale':             { subs: ['Excavator'],                     label: 'Excavators',           hub: 'construction-equipment-for-sale' },
  'skid-steers-for-sale':            { subs: ['Skid Steer'],                    label: 'Skid Steers',          hub: 'construction-equipment-for-sale' },
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

function buildCardGrid(units) {
  if (!units.length) return '';
  return units.map(u => {
    const photos = getPhotos(u);
    const img = photos[0] || '/torque-logo.png';
    const title = [u.year, u.make, u.model].filter(Boolean).join(' ') || (u.subcategory || 'Unit');
    const price = formatPrice(u.price);
    const miles = (u.mileage != null && u.mileage !== '') ? (Number(String(u.mileage).replace(/[^0-9.]/g,'')).toLocaleString() + ' mi') : '';
    const href = '/vehicle.html?stock=' + encodeURIComponent(u.stock);
    return (
      '<a class="cat-card" href="' + escAttr(href) + '">' +
      '<div class="cat-card-img"><img src="' + escAttr(img) + '" alt="' + escAttr(title) + '" loading="lazy" width="400" height="300" /></div>' +
      '<div class="cat-card-body">' +
      '<div class="cat-card-title">' + esc(title) + '</div>' +
      (u.subcategory ? '<div class="cat-card-sub">' + esc(u.subcategory) + '</div>' : '') +
      (miles ? '<div class="cat-card-miles">' + esc(miles) + '</div>' : '') +
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

export default async function handler(request, context) {
  try {
    const url = new URL(request.url);
    const slug = url.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();

    const hub = CATEGORY_HUBS[slug];
    const leaf = SUBCATEGORY_LEAVES[slug];
    if (!hub && !leaf) return context.next();

    const isHub = !!hub;
    const label = isHub ? hub.label : leaf.label;

    let query;
    if (isHub) {
      query = SUPABASE_URL + '/rest/v1/inventory?category=eq.' + encodeURIComponent(hub.category) +
        '&sold=eq.false&order=created_at.desc&limit=48&select=stock,year,make,model,price,mileage,subcategory,photos';
    } else {
      // Variant B encoding: encodeURIComponent each value, join with literal commas, no quotes.
      // SAFE because no subcategory value contains a comma. If a comma-containing value is ever
      // added, switch to quoted form ("val1","val2").
      const inList = leaf.subs.map(s => encodeURIComponent(s)).join(',');
      query = SUPABASE_URL + '/rest/v1/inventory?subcategory=in.(' + inList + ')' +
        '&sold=eq.false&order=created_at.desc&limit=48&select=stock,year,make,model,price,mileage,subcategory,photos';
    }

    const [invRes, shellRes] = await Promise.all([
      fetch(query, { headers: SB_HEADERS }).catch(() => null),
      context.next(),
    ]);

    let units = [];
    if (invRes && invRes.ok) { try { units = await invRes.json(); } catch { units = []; } }
    if (!Array.isArray(units)) units = [];

    let html = await shellRes.text();

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
        'itemListElement': units.slice(0, 48).map((u, i) => ({
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
    try { return await context.next(); } catch { return new Response('OK', { status: 200 }); }
  }
}
