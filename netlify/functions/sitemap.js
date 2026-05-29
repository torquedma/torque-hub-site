// DEALERS config is intentionally duplicated from /js/inventory-engine.js.
// The engine is a browser-side IIFE and cannot be imported in Node.
// If a dealer is added or removed, update BOTH files.

const BASE    = 'https://hub.torquedma.com';
const SB_URL  = 'https://bxsikkmqasydosmblzov.supabase.co'; // non-sensitive endpoint
// Requires SUPABASE_ANON_KEY in Netlify env vars: Site Settings → Environment Variables
const SB_ANON = process.env.SUPABASE_ANON_KEY;

const DEALERS = [
  { key: "Davenport Motors",               feedUrl: "https://davenportmotors.net/.netlify/functions/inventory" },
  { key: "Fat Daddy's Truck Sales",        feedUrl: "https://fatdaddystrucksales.netlify.app/.netlify/functions/inventory" },
  { key: "Wilson Trailer Sales & Service", feedUrl: "https://wilson-trailer-sales.netlify.app/.netlify/functions/inventory" },
  { key: "HGR's Truck and Trailer",        feedUrl: "https://hub.torquedma.com/.netlify/functions/hgr-inventory" },
  { key: "Impex Heavy Metal",              feedUrl: "https://hub.torquedma.com/.netlify/functions/impex-inventory" },
  { key: "Joe's Tractor Sales",            feedUrl: null },
  { key: "Auto Connection 210 LLC",        feedUrl: null },
  { key: "Dick Smith Equipment",           feedUrl: null },
  { key: "Suttontown Repair Service",      feedUrl: null },
  { key: "Fannon Land & Auction Co.",      feedUrl: null },
  { key: "Mid Atlantic Power & Equipment", feedUrl: null },
  { key: "DeBary Truck Sales",            feedUrl: null },
  { key: "A F Sales & Service",           feedUrl: null },
  { key: "The Trailer Source",            feedUrl: null },
  { key: "Allied Truck & Trailer Sales", feedUrl: null },
];

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
  { loc: '/car-carrier-trucks-for-sale',    changefreq: 'daily', priority: '0.8' },
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
  // Farm leaves
  { loc: '/tractors-for-sale',              changefreq: 'daily', priority: '0.8' },
  { loc: '/rotary-cutters-for-sale',        changefreq: 'daily', priority: '0.8' },
  // Landscape leaves
  { loc: '/zero-turn-mowers-for-sale',      changefreq: 'daily', priority: '0.8' },
  { loc: '/lawn-tractors-for-sale',         changefreq: 'daily', priority: '0.8' },
  // Construction leaves
  { loc: '/excavators-for-sale',            changefreq: 'daily', priority: '0.8' },
  { loc: '/mini-excavators-for-sale',       changefreq: 'daily', priority: '0.8' },
  { loc: '/skid-steers-for-sale',           changefreq: 'daily', priority: '0.8' },
  { loc: '/mini-skid-steers-for-sale',      changefreq: 'daily', priority: '0.8' },
  { loc: '/loaders-for-sale',               changefreq: 'daily', priority: '0.8' },
];

exports.handler = async () => {
  const feedPromises = DEALERS
    .filter(d => d.feedUrl)
    .map(d =>
      fetch(d.feedUrl)
        .then(r => r.json())
        .then(items =>
          (items || [])
            .filter(u => !u.sold)
            .map(u => {
              let stock = u.stock || '';
              if (d.key === "HGR's Truck and Trailer" && stock && !stock.includes('-'))
                stock = stock.slice(0, 3) + '-' + stock.slice(3);
              return stock ? { stock, dealerKey: d.key } : null;
            })
            .filter(Boolean)
        )
        .catch(() => [])
    );

  const sbPromises = DEALERS
    .filter(d => !d.feedUrl)
    .map(d =>
      fetch(
        `${SB_URL}/rest/v1/inventory_cards?dealer=eq.${encodeURIComponent(d.key)}&sold=eq.false&limit=1000`,
        { headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` } }
      )
        .then(r => r.json())
        .then(items =>
          (items || [])
            .map(u => u.stock ? { stock: u.stock, dealerKey: d.key } : null)
            .filter(Boolean)
        )
        .catch(() => [])
    );

  const results = await Promise.allSettled([...feedPromises, ...sbPromises]);
  const vdpUnits = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);

  const staticXml = STATIC_URLS
    .map(u => `  <url><loc>${BASE}${u.loc}</loc><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`)
    .join('\n');

  const categoryXml = CATEGORY_URLS
    .map(u => `  <url><loc>${BASE}${u.loc}</loc><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`)
    .join('\n');

  const vdpXml = vdpUnits
    .map(({ stock, dealerKey }) =>
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
