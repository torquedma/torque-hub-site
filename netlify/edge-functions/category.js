import { TAXONOMY_DATA, CATEGORY_HUB } from '../../js/taxonomy-data.js';
import { buildDisplayTitle } from './lib/title-helpers.js';
import { SHELL, esc, escAttr, safeJson, buildCardGrid } from './lib/listing-shell.js';
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

const SUBCATEGORY_LEAVES = (() => {
  const out = {};
  for (const e of TAXONOMY_DATA) {
    if (!e.ssr) continue;
    out[e.slug] = { subs: e.subs, label: e.label, hub: CATEGORY_HUB[e.category] };
  }
  return out;
})();

const HUB_CHILDREN = {};
for (const [slug, def] of Object.entries(SUBCATEGORY_LEAVES)) {
  (HUB_CHILDREN[def.hub] = HUB_CHILDREN[def.hub] || []).push({ slug, label: def.label });
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
      ? ('Browse ' + count + ' ' + label.toLowerCase() + ' for sale at Torque Hub. Commercial ' + label.toLowerCase() + ' from verified sellers — financing available.')
      : ('Shop ' + label.toLowerCase() + ' for sale at Torque Hub. New inventory added regularly — financing available.');
    const taglineText = "Tell 'em Torque sent ya.";
    const canonical = BASE + '/' + slug;

    const cardGrid = buildCardGrid(units);
    const { hubLinksHtml, siblingHtml } = buildCrossLinks(slug, isHub, isHub ? null : leaf.hub);
    const childLinks = isHub ? buildHubChildLinks(slug) : '';
    const introHtml = '<p class="cat-intro">' + esc(descText) + '<br>' + esc(taglineText) + '</p>';
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
          'name': buildDisplayTitle(u),
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
