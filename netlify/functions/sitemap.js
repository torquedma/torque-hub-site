const BASE    = 'https://hub.torquedma.com';
const SB_URL  = 'https://bxsikkmqasydosmblzov.supabase.co';
const SB_ANON = process.env.SUPABASE_ANON_KEY;
const PAGE_SIZE = 1000;

// Same buyer-live contract as inventory-engine.js: the public cards view owns
// publication eligibility; sold=false selects its currently available units.
// No dealer allowlist, external feeds, or additional lifecycle rules belong here.
async function loadBuyerLiveStocks() {
  if (!SB_ANON) throw new Error('Missing public inventory API key');
  const stocks = new Set();
  let offset = 0;

  for (;;) {
    const response = await fetch(
      `${SB_URL}/rest/v1/inventory_cards?select=stock&sold=eq.false&order=id.asc&limit=${PAGE_SIZE}&offset=${offset}`,
      { headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` } }
    );
    if (!response.ok) throw new Error(`Public inventory returned HTTP ${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('Invalid public inventory response');
    if (!rows.length) break;

    for (const row of rows) {
      if (!row || typeof row.stock !== 'string' || !row.stock.trim()) {
        throw new Error('Public inventory row has no canonical stock identity');
      }
      stocks.add(row.stock);
    }
    // Advance by the actual response size, including when the API caps pages
    // below PAGE_SIZE. An empty next page establishes completion.
    offset += rows.length;
  }
  return [...stocks];
}

const STATIC_URLS = [
  { loc: '/',                                                 changefreq: 'daily',   priority: '1.0' },
  { loc: '/inventory.html',                                   changefreq: 'daily',   priority: '0.9' },
  { loc: '/finance.html',                                     changefreq: 'weekly',  priority: '0.9' },
  { loc: '/commercial-truck-financing.html',                  changefreq: 'weekly',  priority: '0.8' },
  { loc: '/dump-truck-financing.html',                        changefreq: 'weekly',  priority: '0.8' },
  { loc: '/trailer-financing.html',                           changefreq: 'weekly',  priority: '0.8' },
  { loc: '/equipment-financing.html',                         changefreq: 'weekly',  priority: '0.8' },
  { loc: '/semi-truck-financing.html',                        changefreq: 'weekly',  priority: '0.8' },
  { loc: '/skid-steer-financing.html',                        changefreq: 'weekly',  priority: '0.8' },
  { loc: '/tractor-financing.html',                           changefreq: 'weekly',  priority: '0.8' },
  { loc: '/startup-truck-financing.html',                     changefreq: 'weekly',  priority: '0.8' },
  { loc: '/bad-credit-equipment-financing.html',              changefreq: 'weekly',  priority: '0.8' },
  { loc: '/north-carolina-commercial-truck-financing.html',   changefreq: 'weekly',  priority: '0.8' },
  { loc: '/box-truck-financing.html',                         changefreq: 'weekly',  priority: '0.7' },
  { loc: '/rollback-truck-financing.html',                    changefreq: 'weekly',  priority: '0.7' },
  { loc: '/owner-operator-truck-financing.html',              changefreq: 'weekly',  priority: '0.7' },
  { loc: '/llc-truck-financing.html',                         changefreq: 'weekly',  priority: '0.7' },
  { loc: '/first-time-buyer-commercial-truck-financing.html', changefreq: 'weekly',  priority: '0.7' },
  { loc: '/excavator-financing.html',                         changefreq: 'weekly',  priority: '0.7' },
  { loc: '/forklift-financing.html',                          changefreq: 'weekly',  priority: '0.7' },
  { loc: '/mini-excavator-financing.html',                    changefreq: 'weekly',  priority: '0.7' },
  { loc: '/enclosed-trailer-financing.html',                  changefreq: 'weekly',  priority: '0.7' },
  { loc: '/dump-trailer-financing.html',                      changefreq: 'weekly',  priority: '0.7' },
  { loc: '/gooseneck-trailer-financing.html',                 changefreq: 'weekly',  priority: '0.7' },
  { loc: '/equipment-trailer-financing.html',                 changefreq: 'weekly',  priority: '0.7' },
  { loc: '/car-hauler-financing.html',                        changefreq: 'weekly',  priority: '0.7' },
  { loc: '/no-credit-truck-financing.html',                   changefreq: 'weekly',  priority: '0.7' },
  { loc: '/challenged-credit-equipment-financing.html',       changefreq: 'weekly',  priority: '0.7' },
  { loc: '/startup-llc-equipment-financing.html',             changefreq: 'weekly',  priority: '0.7' },
  { loc: '/truck-financing-low-down-payment.html',            changefreq: 'weekly',  priority: '0.7' },
  { loc: '/easy-commercial-equipment-financing.html',         changefreq: 'weekly',  priority: '0.7' },
  { loc: '/dealer-partners.html',                             changefreq: 'monthly', priority: '0.7' },
  { loc: '/lender-partners.html',                             changefreq: 'monthly', priority: '0.7' },
];

const CATEGORY_URLS = [
  // Hubs
  { loc: '/trucks-for-sale',                changefreq: 'daily', priority: '0.8' },
  { loc: '/trailers-for-sale',              changefreq: 'daily', priority: '0.8' },
  { loc: '/farm-equipment-for-sale',        changefreq: 'daily', priority: '0.8' },
  { loc: '/construction-equipment-for-sale',changefreq: 'daily', priority: '0.8' },
  { loc: '/landscape-equipment-for-sale',   changefreq: 'daily', priority: '0.8' },
  // Truck leaves
  { loc: '/box-trucks-for-sale',            changefreq: 'daily', priority: '0.8' },
  { loc: '/refrigerated-trucks-for-sale',   changefreq: 'daily', priority: '0.8' },
  { loc: '/semi-trucks-for-sale',           changefreq: 'daily', priority: '0.8' },
  { loc: '/service-trucks-for-sale',        changefreq: 'daily', priority: '0.8' },
  { loc: '/dump-trucks-for-sale',           changefreq: 'daily', priority: '0.8' },
  { loc: '/cab-and-chassis-trucks-for-sale',changefreq: 'daily', priority: '0.8' },
  { loc: '/flatbed-trucks-for-sale',        changefreq: 'daily', priority: '0.8' },
  { loc: '/rollback-tow-trucks-for-sale',   changefreq: 'daily', priority: '0.8' },
  { loc: '/cargo-vans-for-sale',            changefreq: 'daily', priority: '0.8' },
  { loc: '/yard-spotters-for-sale',         changefreq: 'daily', priority: '0.8' },
  { loc: '/boom-trucks-for-sale',           changefreq: 'daily', priority: '0.8' },
  { loc: '/vacuum-trucks-for-sale',         changefreq: 'daily', priority: '0.8' },
  { loc: '/landscape-trucks-for-sale',      changefreq: 'daily', priority: '0.8' },
  { loc: '/car-carrier-trucks-for-sale',    changefreq: 'daily', priority: '0.8' },
  { loc: '/pickup-trucks-for-sale',         changefreq: 'daily', priority: '0.8' },
  { loc: '/bucket-trucks-for-sale',         changefreq: 'daily', priority: '0.8' },
  { loc: '/roll-off-trucks-for-sale',       changefreq: 'daily', priority: '0.8' },
  // Trailer leaves
  { loc: '/reefer-trailers-for-sale',              changefreq: 'daily', priority: '0.8' },
  { loc: '/dry-van-trailers-for-sale',             changefreq: 'daily', priority: '0.8' },
  { loc: '/flatbed-trailers-for-sale',             changefreq: 'daily', priority: '0.8' },
  { loc: '/conestoga-trailers-for-sale',           changefreq: 'daily', priority: '0.8' },
  { loc: '/enclosed-trailers-for-sale',            changefreq: 'daily', priority: '0.8' },
  { loc: '/car-hauler-trailers-for-sale',          changefreq: 'daily', priority: '0.8' },
  { loc: '/utility-trailers-for-sale',             changefreq: 'daily', priority: '0.8' },
  { loc: '/equipment-trailers-for-sale',           changefreq: 'daily', priority: '0.8' },
  { loc: '/dump-trailers-for-sale',                changefreq: 'daily', priority: '0.8' },
  { loc: '/gooseneck-trailers-for-sale',           changefreq: 'daily', priority: '0.8' },
  { loc: '/race-trailers-for-sale',                changefreq: 'daily', priority: '0.8' },
  { loc: '/living-quarters-trailers-for-sale',     changefreq: 'daily', priority: '0.8' },
  { loc: '/deckover-trailers-for-sale',             changefreq: 'daily', priority: '0.8' },
  { loc: '/concession-trailers-for-sale',           changefreq: 'daily', priority: '0.8' },
  { loc: '/hopper-bottom-trailers-for-sale',        changefreq: 'daily', priority: '0.8' },
  { loc: '/belt-trailers-for-sale',                 changefreq: 'daily', priority: '0.8' },
  // Farm leaves
  { loc: '/tractors-for-sale',              changefreq: 'daily', priority: '0.8' },
  { loc: '/rotary-cutters-for-sale',        changefreq: 'daily', priority: '0.8' },
  { loc: '/boom-mowers-for-sale',           changefreq: 'daily', priority: '0.8' },
  { loc: '/drum-mowers-for-sale',           changefreq: 'daily', priority: '0.8' },
  { loc: '/hay-rakes-for-sale',             changefreq: 'daily', priority: '0.8' },
  { loc: '/utility-vehicles-for-sale',      changefreq: 'daily', priority: '0.8' },
  // Landscape leaves
  { loc: '/zero-turn-mowers-for-sale',      changefreq: 'daily', priority: '0.8' },
  { loc: '/lawn-tractors-for-sale',         changefreq: 'daily', priority: '0.8' },
  // Construction leaves
  { loc: '/excavators-for-sale',            changefreq: 'daily', priority: '0.8' },
  { loc: '/mini-excavators-for-sale',       changefreq: 'daily', priority: '0.8' },
  { loc: '/skid-steers-for-sale',           changefreq: 'daily', priority: '0.8' },
  { loc: '/mini-skid-steers-for-sale',      changefreq: 'daily', priority: '0.8' },
  { loc: '/skid-steer-attachments-for-sale', changefreq: 'daily', priority: '0.8' },
  { loc: '/loaders-for-sale',               changefreq: 'daily', priority: '0.8' },
  { loc: '/crane-trucks-for-sale',          changefreq: 'daily', priority: '0.8' },
  { loc: '/forklifts-for-sale',             changefreq: 'daily', priority: '0.8' },
  { loc: '/scissor-lifts-for-sale',         changefreq: 'daily', priority: '0.8' },
];

exports.handler = async () => {
  let stocks;
  try {
    stocks = await loadBuyerLiveStocks();
  } catch (error) {
    // Never publish a partial, successful sitemap after a failed inventory read.
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      body: 'Sitemap temporarily unavailable',
    };
  }

  const staticXml = STATIC_URLS
    .map(u => `  <url><loc>${BASE}${u.loc}</loc><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`)
    .join('\n');

  const categoryXml = CATEGORY_URLS
    .map(u => `  <url><loc>${BASE}${u.loc}</loc><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`)
    .join('\n');

  const vdpXml = stocks
    .map(stock =>
      `  <url><loc>${BASE}/vehicle.html?stock=${encodeURIComponent(stock)}</loc><changefreq>weekly</changefreq><priority>0.6</priority></url>`
    )
    .join('\n');

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    staticXml,
    categoryXml,
    vdpXml,
    '</urlset>',
  ].join('\n');

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=600',
    },
    body: xml,
  };
};
