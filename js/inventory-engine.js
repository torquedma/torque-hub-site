window.InventoryEngine = (function () {

  // ── Constants ──────────────────────────────────────────────────────────────
  var PAGE_SIZE = 12;
  var MAIN_CATS = ['Trucks', 'Trailers', 'Construction', 'Farm'];

  var DEALERS = [
    { key: "Davenport Motors",            name: "Davenport Motors",            feedUrl: "https://davenportmotors.net/.netlify/functions/inventory",              phone: "252-809-2172", tel: "2528092172", location: "Plymouth, NC",     desc: "Located in Plymouth, NC – Eastern Carolina's Trusted Source for Semi-Trucks, Dump Trucks, and Heavy Equipment" },
    { key: "Fat Daddy's Truck Sales",     name: "Fat Daddy's Truck Sales",     feedUrl: "https://fatdaddystrucksales.netlify.app/.netlify/functions/inventory",  phone: "919-759-5434", tel: "9197595434", location: "Goldsboro, NC",    desc: "Old school pre-DEF work trucks. Box trucks, flatbeds, dump trucks ready to earn." },
    { key: "Wilson Trailer Sales & Service", name: "Wilson Trailer Sales & Service", feedUrl: "https://wilson-trailer-sales.netlify.app/.netlify/functions/inventory", phone: "252-429-8805", tel: "2524298805", location: "Wilson, NC",      desc: "Full-service trailer dealership. Hoppers, dumps, dry vans, reefers, livestock trailers." },
    { key: "HGR's Truck and Trailer",     name: "HGR's Truck & Trailer Sales", feedUrl: "https://hub.torquedma.com/.netlify/functions/hgr-inventory",            phone: "910-661-0868", tel: "9106610868", location: "Hope Mills, NC",   desc: "Race trailers, enclosed trailers, cargo trailers, and specialty hauling setups." },
    { key: "Impex Heavy Metal",           name: "Impex Heavy Metal",           feedUrl: "https://hub.torquedma.com/.netlify/functions/impex-inventory",           phone: "336-715-8704", tel: "3367158704", location: "Greensboro, NC",   desc: "Commercial trucks, trailers, and specialty vehicles. Day cabs, rollbacks, box trucks, yard spotters, and more." },
    { key: "Joe's Tractor Sales",         name: "Joe's Tractor Sales",         feedUrl: null,                                                                     phone: "336-850-8271", tel: "3368508271", location: "Thomasville, NC",  desc: "Tractors, mowers, and farm equipment. New and used ag equipment serving the Piedmont Triad since 1949." },
    { key: "Auto Connection 210 LLC",     name: "Auto Connection 210 LLC",     feedUrl: null,                                                                     phone: "910-490-2596", tel: "9104902596", location: "Angier, NC",       desc: "Work vans, box trucks, and commercial vehicles ready for the job site." },
    { key: "Dick Smith Equipment",        name: "Dick Smith Equipment",        feedUrl: null,                                                                     phone: "919-734-1191", tel: "9197341191", location: "Goldsboro, NC",    desc: "Construction and farm equipment. Excavators, tractors, skid steers, and more in Goldsboro, NC." }
  ];

  var SB_URL  = 'https://bxsikkmqasydosmblzov.supabase.co';
  var SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4c2lra21xYXN5ZG9zbWJsem92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTc1OTksImV4cCI6MjA5MDQ3MzU5OX0.JMEI7cx2tddmbvfqm_qxiIWp7f5Phuk5l0Y487DUSZg';
  var SB_HDRS = { 'apikey': SB_ANON, 'Authorization': 'Bearer ' + SB_ANON };

  var CAT_SUBS = {
    'Trucks': [
      { label: 'Dump Trucks',     kw: 'dump',      slug: 'dump-trucks' },
      { label: 'Rollback Trucks', kw: 'rollback',  slug: 'rollback-trucks' },
      { label: 'Box Trucks',      kw: 'box',        slug: 'box-trucks' },
      { label: 'Service Trucks',  kw: 'service',   slug: 'service-trucks' },
      { label: 'Semi Trucks',     kw: 'semi',       slug: 'semi-trucks' },
      { label: 'Flatbeds',        kw: 'flatbed',   slug: 'flatbed-trucks' }
    ],
    'Trailers': [
      { label: 'Equipment Trailers', kw: 'equipment', slug: 'equipment-trailers' },
      { label: 'Dump Trailers',      kw: 'dump',       slug: 'dump-trailers' },
      { label: 'Enclosed Trailers',  kw: 'enclosed',   slug: 'enclosed-trailers' },
      { label: 'Gooseneck Trailers', kw: 'gooseneck',  slug: 'gooseneck-trailers' },
      { label: 'Livestock Trailers', kw: 'livestock',  slug: 'livestock-trailers' },
      { label: 'Car / Racing',       kw: 'car',        slug: 'car-racing-trailers' }
    ],
    'Construction': [
      { label: 'Skid Steers', kw: 'skid',      slug: 'skid-steers' },
      { label: 'Excavators',  kw: 'excavator', slug: 'excavators' },
      { label: 'Loaders',     kw: 'loader',    slug: 'loaders' },
      { label: 'Forklifts',   kw: 'forklift',  slug: 'forklifts' },
      { label: 'Backhoes',    kw: 'backhoe',   slug: 'backhoes' }
    ],
    'Farm': [
      { label: 'Tractors',      kw: 'tractor',   slug: 'tractors' },
      { label: 'Hay Equipment', kw: 'hay',        slug: 'hay-equipment' },
      { label: 'Mowers',        kw: 'mower',      slug: 'mowers' },
      { label: 'Implements',    kw: 'implement',  slug: 'implements' },
      { label: 'Spreaders',     kw: 'spreader',   slug: 'spreaders' }
    ],
    'Other': []
  };

  var CAT_DISPLAY = {
    'Trucks':       'Commercial Trucks',
    'Trailers':     'Trailers',
    'Construction': 'Construction Equipment',
    'Farm':         'Farm Equipment',
    'Other':        'Other Equipment'
  };

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
    var title    = [u.year, u.make, u.model].filter(Boolean).join(' ');
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
    var q      = (_el(fids.search)    || { value: '' }).value.toLowerCase();
    var dealer = (_el(fids.dealer)    || { value: '' }).value;
    var cond   = (_el(fids.condition) || { value: '' }).value;
    var sort   = (_el(fids.sort)      || { value: 'price-desc' }).value;

    var filtered = ALL_INV.filter(function(u) {
      var matchQ   = !q      || (String(u.year||'') + ' ' + String(u.make||'') + ' ' + String(u.model||'') + ' ' + String(u.stock||'') + ' ' + String(u.dealer||'')).toLowerCase().includes(q);
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
      : items.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    if (!slice.length) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:#64748b">No listings found. Try adjusting your filters.</div>';
      if (pg) pg.innerHTML = '';
      return;
    }

    grid.innerHTML = slice.map(function(u) {
      var d          = u._dealer || DEALERS.find(function(x) { return x.key === u.dealer; }) || {};
      var photo      = u.photos && u.photos.length ? (u.photos[0].url || u.photos[0].dataUrl || '') : '';
      var title      = [u.year, u.make, u.model].filter(Boolean).join(' ') || 'Unit Available';
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
          var catLabel = currentCat
            ? (currentCat === 'Other' ? 'other units' : currentCat.toLowerCase())
            : 'featured units';
          var linkLabel = currentCat
            ? 'View all ' + (currentCat === 'Other' ? 'other inventory' : currentCat.toLowerCase()) + ' →'
            : 'View all inventory →';
          countEl.textContent = 'Showing ' + Math.min(PAGE_SIZE, total) + ' of ' + total + ' ' + catLabel;
          linkEl.textContent = linkLabel;
          footer.style.display = 'block';
        } else {
          footer.style.display = 'none';
        }
      }
    }

    if (pg && !featured) {
      if (pages <= 1) { pg.innerHTML = ''; return; }
      pg.innerHTML = Array.from({ length: pages }, function(_, i) {
        return '<button onclick="InventoryEngine.goToPage(' + (i + 1) + ')" style="padding:9px 16px;border-radius:9px;border:1px solid rgba(255,255,255,0.08);background:' + (i + 1 === currentPage ? '#334155' : 'rgba(255,255,255,0.05)') + ';color:#f8fafc;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">' + (i + 1) + '</button>';
      }).join('');
    }
  }

  // ── Navigation ─────────────────────────────────────────────────────────────
  function _scrollToTarget() {
    var target = _cfg.scrollTargetId ? _el(_cfg.scrollTargetId) : null;
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function goToPage(n) {
    currentPage = n;
    applyFilters();
    _scrollToTarget();
  }

  function setCat(cat, el) {
    currentCat  = cat;
    currentSub  = '';
    currentPage = 1;
    document.querySelectorAll('.chip').forEach(function(c) { c.classList.remove('active'); });
    if (el) el.classList.add('active');
    applyFilters();
  }

  function filterByMainCat(cat) {
    currentCat  = cat;
    currentSub  = '';
    currentPage = 1;
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
    applyFilters();
    _scrollToTarget();
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  return {
    init: function(cfg) { _cfg = cfg || {}; },

    loadAll:        loadAll,
    applyFilters:   applyFilters,
    goToPage:       goToPage,
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
    PAGE_SIZE:      PAGE_SIZE
  };

})();
