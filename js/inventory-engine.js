window.InventoryEngine = (function () {

  // ── Constants ──────────────────────────────────────────────────────────────
  var PAGE_SIZE = 12;
  var PAGE_SIZE_INF   = 24;
  var AUTO_LOAD_LIMIT = 3;
  var visibleCount    = PAGE_SIZE_INF;
  var autoLoads       = 0;
  var _ioSentinel     = null;
  var MAIN_CATS = ['Trucks', 'Trailers', 'Construction', 'Farm', 'Landscape'];

  var DEALERS = [
    { key: "Davenport Motors",            name: "Davenport Motors",            feedUrl: "https://davenportmotors.net/.netlify/functions/inventory",              phone: "252-809-2172", tel: "2528092172", location: "Plymouth, NC",     desc: "Located in Plymouth, NC – Eastern Carolina's Trusted Source for Semi-Trucks, Dump Trucks, and Heavy Equipment" },
    { key: "Fat Daddy's Truck Sales",     name: "Fat Daddy's Truck Sales",     feedUrl: "https://fatdaddystrucksales.netlify.app/.netlify/functions/inventory",  phone: "919-759-5434", tel: "9197595434", location: "Goldsboro, NC",    desc: "Old school pre-DEF work trucks. Box trucks, flatbeds, dump trucks ready to earn." },
    { key: "Wilson Trailer Sales & Service", name: "Wilson Trailer Sales & Service", feedUrl: "https://wilson-trailer-sales.netlify.app/.netlify/functions/inventory", phone: "252-429-8805", tel: "2524298805", location: "Wilson, NC",      desc: "Full-service trailer dealership. Hoppers, dumps, dry vans, reefers, livestock trailers." },
    { key: "HGR's Truck and Trailer",     name: "HGR's Truck & Trailer Sales", feedUrl: "https://hub.torquedma.com/.netlify/functions/hgr-inventory",            phone: "910-661-0868", tel: "9106610868", location: "Hope Mills, NC",   desc: "Race trailers, enclosed trailers, cargo trailers, and specialty hauling setups." },
    { key: "Impex Heavy Metal",           name: "Impex Heavy Metal",           feedUrl: "https://hub.torquedma.com/.netlify/functions/impex-inventory",           phone: "336-715-8704", tel: "3367158704", location: "Greensboro, NC",   desc: "Commercial trucks, trailers, and specialty vehicles. Day cabs, rollbacks, box trucks, yard spotters, and more." },
    { key: "Joe's Tractor Sales",         name: "Joe's Tractor Sales",         feedUrl: null,                                                                     phone: "336-850-8271", tel: "3368508271", location: "Thomasville, NC",  desc: "Tractors, mowers, and farm equipment. New and used ag equipment serving the Piedmont Triad since 1949." },
    { key: "Auto Connection 210 LLC",     name: "Auto Connection 210 LLC",     feedUrl: null,                                                                     phone: "910-490-2596", tel: "9104902596", location: "Angier, NC",       desc: "Work vans, box trucks, and commercial vehicles ready for the job site." },
    { key: "Dick Smith Equipment",        name: "Dick Smith Equipment",        feedUrl: null,                                                                     phone: "919-734-1191", tel: "9197341191", location: "Goldsboro, NC",    desc: "Construction and farm equipment. Excavators, tractors, skid steers, and more in Goldsboro, NC." },
    { key: "Suttontown Repair Service",   name: "Suttontown Repair Service",   feedUrl: null,                                                                     phone: "910-530-1732", tel: "9105301732", location: "Faison, NC",       desc: "Repair service and used equipment — tractors and farm machinery in Faison, NC." },
    { key: "Fannon Land & Auction Co.",   name: "Fannon Land & Auction Co.",   feedUrl: null,                                                                     phone: "276-821-1194", tel: "2768211194", location: "Pennington Gap, VA", desc: "Mixed inventory — trucks, equipment, and more. Contact Hank for details." },
    { key: "Mid Atlantic Power & Equipment", name: "Mid Atlantic Power & Equipment", feedUrl: null,                                                                  phone: "910-889-9201", tel: "9108899201", location: "Dunn, NC",        desc: "New and used construction equipment, attachments, trucks, and trailers. Serving contractors since 1990." },
    { key: "DeBary Truck Sales",            name: "DeBary Truck Sales",            feedUrl: null,                                                                  phone: "(407) 993-2364", tel: "4079932364", location: "Sanford, FL",  desc: "Commercial truck dealer in Sanford, FL — box trucks, dump trucks, reefers, vans & more." },
    { key: "A F Sales & Service",           name: "A F Sales & Service",           feedUrl: null,                                                                     phone: "(317) 449-8903", tel: "3174498903", location: "Indianapolis, IN", desc: "Commercial truck & equipment dealer in Indianapolis, IN — day cabs, dumps, reefers, construction equipment & more." },
    { key: "The Trailer Source",            name: "The Trailer Source",            feedUrl: null,                                                                     phone: "336-850-8176",   tel: "3368508176",   location: "Winston Salem, NC", desc: "Commercial semi-trailer dealer in Winston-Salem, NC — reefer, dry van, and flatbed trailers." },
    { key: "Allied Truck & Trailer Sales", name: "Allied Truck & Trailer Sales", feedUrl: null,                                                                     phone: "336-388-6882",   tel: "3363886882",   location: "Madison, NC",       desc: "Commercial truck and trailer dealer in Madison, NC." }
  ];

  var SB_URL  = 'https://bxsikkmqasydosmblzov.supabase.co';
  var SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4c2lra21xYXN5ZG9zbWJsem92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTc1OTksImV4cCI6MjA5MDQ3MzU5OX0.JMEI7cx2tddmbvfqm_qxiIWp7f5Phuk5l0Y487DUSZg';
  var SB_HDRS = { 'apikey': SB_ANON, 'Authorization': 'Bearer ' + SB_ANON };

  // Query-side buyer synonym layer.
  // Deliberately separate from ingest aliases:
  // ingest aliases normalize source/feed values into canonical storage;
  // query synonyms expand buyer language into canonical search targets.
  // Do not blindly merge these maps.
  var QUERY_SYNONYMS = {
    'refrigerated':          ['reefer trailer', 'refrigerated truck'],
    'refrigerated trailer':  ['reefer trailer'],
    'fridge trailer':        ['reefer trailer'],
    'cold trailer':          ['reefer trailer'],
    'freezer trailer':       ['reefer trailer'],
    'semi':                  ['day cab tractor', 'sleeper tractor'],
    'semi truck':            ['day cab tractor', 'sleeper tractor'],
    '18 wheeler':            ['day cab tractor', 'sleeper tractor'],
    'tractor trailer':       ['day cab tractor', 'sleeper tractor'],
    'road tractor':          ['day cab tractor', 'sleeper tractor'],
    'sxs':                   ['side by side'],
    'side x side':           ['side by side'],
    'utv':                   ['utility vehicle', 'side by side'],
    'bobcat':                ['skid steer', 'compact track loader'],
    'tracked skid steer':    ['compact track loader'],
    'track skid steer':      ['compact track loader'],
    'ctl':                   ['compact track loader'],
    'track loader':          ['crawler loader'],
    'dozer loader':          ['crawler loader'],
    'wrecker':               ['tow truck', 'rollback tow truck'],
    'roll back':             ['rollback tow truck'],
    'cube truck':            ['box truck'],
    'cube van':              ['box truck'],
    'straight truck':        ['box truck'],
    'mechanic truck':        ['service truck'],
    'utility truck':         ['service truck'],
    'service body':          ['service truck'],
    'car carrier':           ['car carrier truck', 'car hauler trailer'],
    'auto hauler':           ['car carrier truck', 'car hauler trailer'],
    'vehicle hauler':        ['car carrier truck', 'car hauler trailer'],
    'brush hog':             ['rotary cutter'],
    'bush hog':              ['rotary cutter'],
    'finish cut':            ['finish mower'],
    'hay mower':             ['field mower'],
    'disc mower':            ['field mower'],
    'cargo trailer':         ['enclosed trailer'],
    'enclosed cargo':        ['enclosed trailer'],
    'cutaway':               ['box truck'],
    'skidsteer':             ['skid steer'],
    'skid loader':           ['skid steer'],
    'trackhoe':              ['excavator'],
    'track hoe':             ['excavator'],
    'mini excavator':        ['excavator'],
    'mini ex':               ['excavator'],
    'bulldozer':             ['crawler dozer'],
    'road grader':           ['motor grader'],
    'disc harrow':           ['harrow'],
    'disk harrow':           ['harrow'],

    // Use-case synonym: hotshot buyers may be looking for the truck/trailer pieces,
    // not a single canonical unit type.
    'hotshot':               ['pickup truck', 'flatbed truck', 'gooseneck trailer'],
    'hot shot':              ['pickup truck', 'flatbed truck', 'gooseneck trailer'],

    // Use-case synonym: generic "lawn mower" maps to all consumer mower types,
    // since no single canonical subcategory contains that literal phrase.
    'lawn mower':            ['zero turn mower', 'walk behind mower', 'lawn tractor']
  };

  var CAT_SUBS = {
    'Trucks': [
      { label: 'Box Trucks', kw: 'box', slug: 'box-trucks-for-sale', ssr: true },
      { label: 'Refrigerated Trucks', kw: 'refrigerated', slug: 'refrigerated-trucks-for-sale', ssr: true },
      { label: 'Semi Trucks', kw: 'tractor', slug: 'semi-trucks-for-sale', ssr: true },
      { label: 'Dump Trucks', kw: 'dump', slug: 'dump-trucks-for-sale', ssr: true },
      { label: 'Flatbed Trucks', kw: 'flatbed', slug: 'flatbed-trucks-for-sale', ssr: true },
      { label: 'Service Trucks', kw: 'service', slug: 'service-trucks-for-sale', ssr: true },
      { label: 'Cab & Chassis Trucks', kw: 'chassis', slug: 'cab-and-chassis-trucks-for-sale', ssr: true },
      { label: 'Rollback Tow Trucks', kw: 'rollback', slug: 'rollback-tow-trucks-for-sale', ssr: true },
      { label: 'Boom Trucks', kw: 'boom', slug: 'boom-trucks-for-sale', ssr: true },
      { label: 'Yard Spotters', kw: 'spotter', slug: 'yard-spotters-for-sale', ssr: true },
      { label: 'Car Carrier Trucks', kw: 'car carrier', slug: 'car-carrier-trucks-for-sale', ssr: true },
      { label: 'Cargo Vans', kw: 'cargo van', slug: 'cargo-vans-for-sale', ssr: true }
    ],
    'Trailers': [
      { label: 'Reefer Trailers', kw: 'reefer', slug: 'reefer-trailers-for-sale', ssr: true },
      { label: 'Dry Van Trailers', kw: 'dry van', slug: 'dry-van-trailers-for-sale', ssr: true },
      { label: 'Flatbed Trailers', kw: 'flatbed', slug: 'flatbed-trailers-for-sale', ssr: true },
      { label: 'Conestoga Trailers', kw: 'conestoga', slug: 'conestoga-trailers-for-sale', ssr: true },
      { label: 'Equipment Trailers', kw: 'equipment', slug: 'equipment-trailers-for-sale', ssr: true },
      { label: 'Dump Trailers', kw: 'dump', slug: 'dump-trailers-for-sale', ssr: true },
      { label: 'Enclosed Trailers', kw: 'enclosed', slug: 'enclosed-trailers-for-sale', ssr: true },
      { label: 'Car Haulers', kw: 'car', slug: 'car-hauler-trailers-for-sale', ssr: true },
      { label: 'Race Trailers', kw: 'race trailer', slug: 'race-trailers-for-sale', ssr: true },
      { label: 'Living Quarters Trailers', kw: 'living quarters', slug: 'living-quarters-trailers-for-sale', ssr: true },
      { label: 'Gooseneck Trailers', kw: 'gooseneck', slug: 'gooseneck-trailers-for-sale', ssr: true },
      { label: 'Utility Trailers', kw: 'utility', slug: 'utility-trailers-for-sale', ssr: true }
    ],
    'Construction': [
      { label: 'Skid Steers', kw: 'skid', slug: 'skid-steers-for-sale', ssr: true },
      { label: 'Excavators', kw: 'excavator', slug: 'excavators-for-sale', ssr: true },
      { label: 'Loaders', kw: 'loader', slug: 'loaders' },
      { label: 'Forklifts', kw: 'forklift', slug: 'forklifts' },
      { label: 'Backhoes', kw: 'backhoe', slug: 'backhoes' }
    ],
    'Farm': [
      { label: 'Tractors', kw: 'tractor', slug: 'tractors-for-sale', ssr: true },
      { label: 'Rotary Cutters', kw: 'rotary', slug: 'rotary-cutters-for-sale', ssr: true },
      { label: 'Hay Rakes', kw: 'hay rake', slug: 'hay-rakes' },
      { label: 'Balers', kw: 'baler', slug: 'balers' },
      { label: 'Field Mowers', kw: 'field mower', slug: 'field-mowers' },
      { label: 'Utility Vehicles', kw: 'utility vehicle', slug: 'utility-vehicles' },
      { label: 'Harrows', kw: 'harrow', slug: 'harrows' },
      { label: 'Disks', kw: 'disk', slug: 'disks' }
    ],
    'Landscape': [
      { label: 'Zero Turn Mowers', kw: 'zero turn', slug: 'zero-turn-mowers-for-sale', ssr: true },
      { label: 'Lawn Tractors', kw: 'lawn tractor', slug: 'lawn-tractors-for-sale', ssr: true },
      { label: 'Walk Behind Mowers', kw: 'walk behind', slug: 'walk-behind-mowers' },
      { label: 'Front Mounted Mowers', kw: 'front mounted', slug: 'front-mounted-mowers' },
      { label: 'Turf & Grounds Care', kw: 'turf', slug: 'turf-grounds-care' },
      { label: 'Finish Mowers', kw: 'finish', slug: 'finish-mowers' }
    ],
    'Other': []
  };

  var CAT_DISPLAY = {
    'Trucks':       'Commercial Trucks',
    'Trailers':     'Trailers',
    'Construction': 'Construction Equipment',
    'Farm':         'Farm Equipment',
    'Landscape':    'Landscape Equipment',
    'Other':        'Other Equipment'
  };

  // ── Sort options ───────────────────────────────────────────────────────────
  var SORT_OPTIONS = [
    { value: 'price-desc',   label: 'Price: High to Low' },
    { value: 'price-asc',    label: 'Price: Low to High' },
    { value: 'year-desc',    label: 'Model Year: Newest' },
    { value: 'year-asc',     label: 'Model Year: Oldest' },
    { value: 'created-desc', label: 'Recently Added' },
    { value: 'make-asc',     label: 'Make: A to Z' },
    { value: 'make-desc',    label: 'Make: Z to A' }
  ];

  function renderSortOptions(selectId) {
    var sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = SORT_OPTIONS.map(function (o) {
      return '<option value="' + o.value + '">' + o.label + '</option>';
    }).join('');
  }

  // ── Private state ──────────────────────────────────────────────────────────
  var _cfg = {};
  var ALL_INV = [];
  var currentCat = '';
  var currentSub = '';
  var currentPage = 1;

  // ── Helpers ────────────────────────────────────────────────────────────────
  function _el(id) { return id ? document.getElementById(id) : null; }

  function fmtMileage(val) {
    if (!val) return '—';
    var n = parseInt(String(val).replace(/[^0-9]/g, ''), 10);
    return isNaN(n) ? String(val) : n.toLocaleString('en-US');
  }

  function trimEngine(val) {
    if (!val) return '—';
    return val.split(/\s+[-–—]\s+/)[0].replace(/\s+Engine\s*$/i, '').trim();
  }

  function pp(p) { return parseFloat(String(p || '').replace(/[^0-9.]/g, '')) || 0; }

  function financeUrl(u, src) {
    src = src || 'inventory';
    var title    = [u.year, u.make, u.model, u.trim || u.subcategory].filter(Boolean).join(' ');
    var unitSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    var priceNum = parseFloat(String(u.price || '').replace(/[^0-9.]/g, '')) || '';
    return '/finance.html?stock=' + encodeURIComponent(u.stock || '') +
           '&unit='  + encodeURIComponent(unitSlug) +
           '&price=' + priceNum +
           '&src='   + encodeURIComponent(src);
  }

  // ── Data loading ───────────────────────────────────────────────────────────
  async function loadAll() {
    var feedPromises = DEALERS.filter(function(d) { return d.feedUrl; }).map(function(d) {
      return fetch(d.feedUrl).then(function(r) { return r.json(); }).then(function(items) {
        return items.filter(function(u) { return !u.sold; }).map(function(u) {
          if (d.key === "HGR's Truck and Trailer" && u.stock && !u.stock.includes('-'))
            u = Object.assign({}, u, { stock: u.stock.slice(0, 3) + '-' + u.stock.slice(3) });
          return Object.assign({}, u, { _dealer: d });
        });
      }).catch(function() { return []; });
    });

    var sbPromises = DEALERS.filter(function(d) { return !d.feedUrl; }).map(function(d) {
      return fetch(
        SB_URL + '/rest/v1/inventory_cards?dealer=eq.' + encodeURIComponent(d.key) + '&sold=eq.false&limit=1000',
        { headers: SB_HDRS }
      ).then(function(r) { return r.json(); }).then(function(items) {
        return (items || []).map(function(u) { return Object.assign({}, u, { _dealer: d }); });
      }).catch(function() { return []; });
    });

    var results = await Promise.allSettled([].concat(feedPromises, sbPromises));
    ALL_INV = results.flatMap(function(r) { return r.status === 'fulfilled' ? r.value : []; });

    if (typeof _cfg.onLoad === 'function') _cfg.onLoad(ALL_INV);
    applyFilters();
  }

  // ── Filtering & sorting ────────────────────────────────────────────────────
  function applyFilters() {
    var fids  = _cfg.filterIds || {};
    var q      = (_el(fids.search)    || { value: '' }).value.toLowerCase().trim();
    var dealer = (_el(fids.dealer)    || { value: '' }).value;
    var cond   = (_el(fids.condition) || { value: '' }).value;
    var sort   = (_el(fids.sort)      || { value: 'price-desc' }).value;

    var filtered = ALL_INV.filter(function(u) {
      var haystack = (String(u.year||'') + ' ' + String(u.make||'') + ' ' + String(u.model||'') + ' ' + String(u.stock||'') + ' ' + String(u.dealer||'') + ' ' + String(u.trim||'') + ' ' + String(u.subcategory||'')).toLowerCase();
      var matchQ   = !q      || haystack.includes(q) || (QUERY_SYNONYMS[q] || []).some(function(t){ return haystack.includes(t); });
      var matchD   = !dealer || u.dealer === dealer || (u._dealer && u._dealer.key === dealer);
      var matchC   = !cond   || u.condition === cond;
      var matchCat = !currentCat || (currentCat === 'Other' ? !MAIN_CATS.includes(u.category || '') : (u.category || '').includes(currentCat));
      var matchSub = !currentSub || (String(u.subcategory||'') + ' ' + String(u.make||'') + ' ' + String(u.model||'')).toLowerCase().includes(currentSub.toLowerCase());
      return matchQ && matchD && matchC && matchCat && matchSub;
    });

    if      (sort === 'created-desc') filtered.sort(function(a, b) { return (b.created_at || '').localeCompare(a.created_at || ''); });
    else if (sort === 'price-asc')    filtered.sort(function(a, b) { return pp(a.price) - pp(b.price); });
    else if (sort === 'price-desc')   filtered.sort(function(a, b) { return pp(b.price) - pp(a.price); });
    else if (sort === 'year-desc')    filtered.sort(function(a, b) { return (parseInt(b.year) || 0) - (parseInt(a.year) || 0); });
    else if (sort === 'year-asc')     filtered.sort(function(a, b) { return (parseInt(a.year) || 0) - (parseInt(b.year) || 0); });
    else if (sort === 'make-asc')     filtered.sort(function(a, b) { return (a.make || '').localeCompare(b.make || '') || (a.model || '').localeCompare(b.model || '') || (parseInt(b.year) || 0) - (parseInt(a.year) || 0); });
    else if (sort === 'make-desc')    filtered.sort(function(a, b) { return (b.make || '').localeCompare(a.make || '') || (a.model || '').localeCompare(b.model || '') || (parseInt(b.year) || 0) - (parseInt(a.year) || 0); });

    renderInventory(filtered);
  }

  // ── Card rendering ─────────────────────────────────────────────────────────
  function renderInventory(items) {
    var grid = _el(_cfg.containerId  || 'inventory-grid');
    var pg   = _el(_cfg.paginationId || null);
    if (!grid) return;

    var featured = (_cfg.mode === 'featured');
    var total    = items.length;
    var pages    = featured ? 1 : Math.ceil(total / PAGE_SIZE);
    currentPage  = Math.min(currentPage, pages || 1);
    var slice    = featured
      ? items.slice(0, PAGE_SIZE)
      : items.slice(0, visibleCount);

    if (!slice.length) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:#64748b">No listings found. Try adjusting your filters.</div>';
      if (pg) pg.innerHTML = '';
      return;
    }

    grid.innerHTML = slice.map(function(u) {
      var d          = u._dealer || DEALERS.find(function(x) { return x.key === u.dealer; }) || {};
      var photo      = u.photos && u.photos.length ? (u.photos[0].url || u.photos[0].dataUrl || '') : '';
      var title      = [u.year, u.make, u.model, u.trim || u.subcategory].filter(Boolean).join(' ') || 'Unit Available';
      var vdpUrl     = 'vehicle.html?stock=' + encodeURIComponent(u.stock || '');
      var priceStr   = u.price && !isNaN(parseFloat(String(u.price).replace(/[^0-9.]/g, '')))
                         ? '$' + Number(String(u.price).replace(/[^0-9.]/g, '')).toLocaleString()
                         : (u.price && u.price !== '0' ? u.price : 'Call');
      var dealerLine = [d.name || u.dealer, d.location || ''].filter(Boolean).join(' &middot; ');
      var mileageVal = fmtMileage(u.hours || u.mileage);
      var engineVal  = trimEngine(u.engine);
      var chips = [];
      if (mileageVal && mileageVal !== '—') chips.push(mileageVal + (u.hours ? ' hrs' : ' mi'));
      if (chips.length < 2 && engineVal  && engineVal  !== '—') chips.push(engineVal);
      if (chips.length < 2 && u.fuel     && u.fuel     !== '—') chips.push(u.fuel);
      if (chips.length < 2 && u.condition) chips.push(u.condition);

      return '<article class="inv-card" aria-label="' + title + '">' +
        '<a class="inv-card-link" href="' + vdpUrl + '" aria-label="View listing: ' + title + '">' +
          '<div class="inv-photo">' +
            (photo ? '<img src="' + photo + '" alt="' + title + '" loading="lazy">' : '<div class="inv-no-photo">No Photo</div>') +
          '</div>' +
          '<div class="inv-body">' +
            '<h3 class="inv-title">' + title + '</h3>' +
            '<div class="inv-price">' + priceStr + '</div>' +
            '<div class="inv-dealer">' + dealerLine + '</div>' +
            (chips.length ? '<div class="inv-specs">' + chips.map(function(c) { return '<span class="inv-spec">' + c + '</span>'; }).join('') + '</div>' : '') +
            '<div class="inv-cta-wrap"><span class="inv-cta">View Listing</span></div>' +
          '</div>' +
        '</a>' +
      '</article>';
    }).join('');

    // Featured-mode footer CTA
    if (featured) {
      var footer = document.getElementById('inventory-grid-footer');
      var countEl = document.getElementById('inv-footer-count');
      var linkEl = document.getElementById('inv-footer-link');
      if (footer && countEl && linkEl) {
        if (total > PAGE_SIZE) {
          var CAT_LABELS = {
            'Trucks':       { plural: 'trucks',             link: 'trucks' },
            'Trailers':     { plural: 'trailers',           link: 'trailers' },
            'Construction': { plural: 'construction units', link: 'construction equipment' },
            'Farm':         { plural: 'farm units',         link: 'farm equipment' },
            'Landscape':    { plural: 'landscape units',    link: 'landscape equipment' },
            'Other':        { plural: 'other units',        link: 'other inventory' }
          };
          var labels = CAT_LABELS[currentCat];
          var catLabel = labels ? labels.plural : 'featured units';
          var linkLabel = labels ? ('View all ' + labels.link + ' →') : 'View all inventory →';
          countEl.textContent = 'Showing ' + Math.min(PAGE_SIZE, total) + ' of ' + total + ' ' + catLabel;
          linkEl.textContent = linkLabel;
          var ffids = _cfg.filterIds || {};
          var fdealer = (_el(ffids.dealer) || { value: '' }).value;
          linkEl.href = fdealer ? ('/inventory.html?dealer=' + encodeURIComponent(fdealer)) : '/inventory.html';
          footer.style.display = 'block';
        } else {
          footer.style.display = 'none';
        }
      }
    }

    if (!featured) {
      var loadMoreWrap = document.getElementById('inv-load-more-wrap');
      var sentinel     = document.getElementById('inv-sentinel');

      if (visibleCount >= total) {
        if (loadMoreWrap) loadMoreWrap.innerHTML = '';
        if (sentinel) sentinel.style.display = 'none';
        if (_ioSentinel) { _ioSentinel.disconnect(); _ioSentinel = null; }
        if (pg) pg.innerHTML = '';
        return;
      }

      if (autoLoads < AUTO_LOAD_LIMIT) {
        if (loadMoreWrap) loadMoreWrap.innerHTML = '';
        if (sentinel) {
          sentinel.style.display = 'block';
          _setupSentinel();
        }
      } else {
        if (sentinel) sentinel.style.display = 'none';
        if (_ioSentinel) { _ioSentinel.disconnect(); _ioSentinel = null; }
        if (loadMoreWrap) {
          loadMoreWrap.innerHTML = '<button id="inv-load-more-btn" type="button" onclick="InventoryEngine.loadMore()" style="padding:12px 22px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);background:#1e293b;color:#f8fafc;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">Load More</button>';
        }
      }
      if (pg) pg.innerHTML = '';
    }
  }

  // ── Navigation ─────────────────────────────────────────────────────────────
  function _scrollToTarget() {
    var target = _cfg.scrollTargetId ? _el(_cfg.scrollTargetId) : null;
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function _setupSentinel() {
    var sentinel = document.getElementById('inv-sentinel');
    if (!sentinel) return;
    if (_ioSentinel) { _ioSentinel.disconnect(); _ioSentinel = null; }
    if (!('IntersectionObserver' in window)) return;
    _ioSentinel = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting && autoLoads < AUTO_LOAD_LIMIT) {
          autoLoads++;
          visibleCount += PAGE_SIZE_INF;
          applyFilters();
        }
      });
    }, { rootMargin: '600px 0px' });
    _ioSentinel.observe(sentinel);
  }

  function loadMore() {
    autoLoads    = 0;
    visibleCount += PAGE_SIZE_INF;
    applyFilters();
  }

  function goToPage(_n) {
    // Legacy shim — pagination replaced by hybrid infinite scroll. Kept as no-op for compatibility.
    return;
    applyFilters();
    _scrollToTarget();
  }

  function setCat(cat, el) {
    currentCat  = cat;
    currentSub  = '';
    currentPage = 1;
    visibleCount = PAGE_SIZE_INF;
    autoLoads = 0;
    document.querySelectorAll('.chip').forEach(function(c) { c.classList.remove('active'); });
    if (el) el.classList.add('active');
    applyFilters();
  }

  function filterByMainCat(cat) {
    currentCat  = cat;
    currentSub  = '';
    currentPage = 1;
    visibleCount = PAGE_SIZE_INF;
    autoLoads = 0;
    document.querySelectorAll('.chip').forEach(function(c) { c.classList.remove('active'); });
    var chip = Array.from(document.querySelectorAll('.chip')).find(function(c) { return c.textContent.trim() === cat; });
    if (chip) chip.classList.add('active');
    applyFilters();
    _scrollToTarget();
  }

  function filterByCatSub(cat, sub) {
    currentCat  = cat;
    currentSub  = sub;
    currentPage = 1;
    visibleCount = PAGE_SIZE_INF;
    autoLoads = 0;
    document.querySelectorAll('.chip').forEach(function(c) { c.classList.remove('active'); });
    var chip = Array.from(document.querySelectorAll('.chip')).find(function(c) { return c.textContent.trim() === cat; });
    if (chip) chip.classList.add('active');
    applyFilters();
    _scrollToTarget();
  }

  function heroSearch() {
    var kw     = (_el('hero-kw')  || { value: '' }).value.trim();
    var cat    = (_el('hero-cat') || { value: '' }).value;
    var fids   = _cfg.filterIds || {};
    var searchEl = _el(fids.search);
    if (searchEl && kw) searchEl.value = kw;
    if (cat) {
      currentCat = cat;
      currentSub = '';
      document.querySelectorAll('.chip').forEach(function(c) { c.classList.remove('active'); });
      var chip = Array.from(document.querySelectorAll('.chip')).find(function(c) { return c.textContent.trim() === cat; });
      if (chip) chip.classList.add('active');
    } else if (!kw) {
      currentCat = '';
      currentSub = '';
      document.querySelectorAll('.chip').forEach(function(c) { c.classList.remove('active'); });
      var allChip = document.querySelector('.chip');
      if (allChip) allChip.classList.add('active');
    }
    currentPage = 1;
    visibleCount = PAGE_SIZE_INF;
    autoLoads = 0;
    applyFilters();
    _scrollToTarget();
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  return {
    init: function(cfg) {
      _cfg = cfg || {};
      renderSortOptions((_cfg.filterIds && _cfg.filterIds.sort) ? _cfg.filterIds.sort : 'sort-filter');
    },

    loadAll:        loadAll,
    applyFilters:   applyFilters,
    goToPage:       goToPage,
    loadMore:       loadMore,
    setCat:         setCat,
    filterByMainCat: filterByMainCat,
    filterByCatSub: filterByCatSub,
    heroSearch:     heroSearch,
    financeUrl:     financeUrl,

    get ALL_INV()   { return ALL_INV; },
    DEALERS:        DEALERS,
    MAIN_CATS:      MAIN_CATS,
    CAT_SUBS:       CAT_SUBS,
    CAT_DISPLAY:    CAT_DISPLAY,
    PAGE_SIZE:      PAGE_SIZE,
    SORT_OPTIONS:   SORT_OPTIONS,
    renderSortOptions: renderSortOptions
  };

})();
