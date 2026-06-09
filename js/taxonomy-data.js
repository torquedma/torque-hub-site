// ─────────────────────────────────────────────────────────────────────────────
// taxonomy-data.js — CANONICAL TAXONOMY SOURCE OF TRUTH (Torque Hub #12 Phase A)
//
// One entry per leaf/tile. All taxonomy surfaces derive from THIS file:
//   - inventory-engine.js  → CAT_SUBS (browser, via window.TAXONOMY_DATA)
//   - category.js          → SUBCATEGORY_LEAVES (edge, via import)
//   - sitemap.js / netlify.toml / index.html → drift-checked against this
//
// Entry shape: { category, slug, label, subs, kw, ssr }
//   ssr:true  = real SSR leaf route (38 of these)
//   ssr:false = kw-only filter tile, no SSR route (12 of these)
//   subs      = subcategory values the leaf/tile matches ([] for kw-only tiles)
//
// Array ORDER is significant: it matches the current CAT_SUBS render order
// (browse tiles render in this sequence). Preserve order when editing.
//
// Hub slug is derived from category, not stored:
//   Trucks→trucks-for-sale, Trailers→trailers-for-sale,
//   Construction→construction-equipment-for-sale, Farm→farm-equipment-for-sale,
//   Landscape→landscape-equipment-for-sale
// ─────────────────────────────────────────────────────────────────────────────

const TAXONOMY_DATA = [
  // ── Trucks (14 SSR) ──
  { category: 'Trucks', slug: 'box-trucks-for-sale',            label: 'Box Trucks',           kw: 'box',             subs: ['Box Truck'],                          ssr: true },
  { category: 'Trucks', slug: 'refrigerated-trucks-for-sale',   label: 'Refrigerated Trucks',  kw: 'refrigerated',    subs: ['Refrigerated Truck'],                 ssr: true },
  { category: 'Trucks', slug: 'semi-trucks-for-sale',           label: 'Semi Trucks',          kw: 'tractor',         subs: ['Day Cab Tractor', 'Sleeper Tractor'], ssr: true },
  { category: 'Trucks', slug: 'dump-trucks-for-sale',           label: 'Dump Trucks',          kw: 'dump',            subs: ['Dump Truck', 'Grain Dump Truck'],     ssr: true },
  { category: 'Trucks', slug: 'flatbed-trucks-for-sale',        label: 'Flatbed Trucks',       kw: 'flatbed',         subs: ['Flatbed Truck'],                      ssr: true },
  { category: 'Trucks', slug: 'service-trucks-for-sale',        label: 'Service Trucks',       kw: 'service',         subs: ['Service Truck'],                      ssr: true },
  { category: 'Trucks', slug: 'cab-and-chassis-trucks-for-sale',label: 'Cab & Chassis Trucks', kw: 'chassis',         subs: ['Cab & Chassis'],                      ssr: true },
  { category: 'Trucks', slug: 'rollback-tow-trucks-for-sale',   label: 'Rollback Tow Trucks',  kw: 'rollback',        subs: ['Rollback Tow Truck'],                 ssr: true },
  { category: 'Trucks', slug: 'boom-trucks-for-sale',           label: 'Boom Trucks',          kw: 'boom',            subs: ['Boom Truck'],                         ssr: true },
  { category: 'Trucks', slug: 'vacuum-trucks-for-sale',         label: 'Vacuum Trucks',        kw: 'vacuum',          subs: ['Vacuum Truck'],                       ssr: true },
  { category: 'Trucks', slug: 'landscape-trucks-for-sale',      label: 'Landscape Trucks',     kw: 'landscape truck', subs: ['Landscape Truck'],                    ssr: true },
  { category: 'Trucks', slug: 'yard-spotters-for-sale',         label: 'Yard Spotters',        kw: 'spotter',         subs: ['Yard Spotter'],                       ssr: true },
  { category: 'Trucks', slug: 'car-carrier-trucks-for-sale',    label: 'Car Carrier Trucks',   kw: 'car carrier',     subs: ['Car Carrier Truck'],                  ssr: true },
  { category: 'Trucks', slug: 'cargo-vans-for-sale',            label: 'Cargo Vans',           kw: 'cargo van',       subs: ['Cargo Van'],                          ssr: true },

  // ── Trailers (12 SSR) ──
  { category: 'Trailers', slug: 'reefer-trailers-for-sale',          label: 'Reefer Trailers',          kw: 'reefer',          subs: ['Reefer Trailer'],          ssr: true },
  { category: 'Trailers', slug: 'dry-van-trailers-for-sale',         label: 'Dry Van Trailers',         kw: 'dry van',         subs: ['Dry Van Trailer'],         ssr: true },
  { category: 'Trailers', slug: 'flatbed-trailers-for-sale',         label: 'Flatbed Trailers',         kw: 'flatbed',         subs: ['Flatbed Trailer'],         ssr: true },
  { category: 'Trailers', slug: 'conestoga-trailers-for-sale',       label: 'Conestoga Trailers',       kw: 'conestoga',       subs: ['Conestoga Trailer'],       ssr: true },
  { category: 'Trailers', slug: 'equipment-trailers-for-sale',       label: 'Equipment Trailers',       kw: 'equipment',       subs: ['Equipment Trailer'],       ssr: true },
  { category: 'Trailers', slug: 'dump-trailers-for-sale',            label: 'Dump Trailers',            kw: 'dump',            subs: ['Dump Trailer'],            ssr: true },
  { category: 'Trailers', slug: 'enclosed-trailers-for-sale',        label: 'Enclosed Trailers',        kw: 'enclosed',        subs: ['Enclosed Trailer'],        ssr: true },
  { category: 'Trailers', slug: 'car-hauler-trailers-for-sale',      label: 'Car Hauler Trailers',      kw: 'car',             subs: ['Car Hauler Trailer'],      ssr: true },
  { category: 'Trailers', slug: 'race-trailers-for-sale',            label: 'Race Trailers',            kw: 'race trailer',    subs: ['Race Trailer'],            ssr: true },
  { category: 'Trailers', slug: 'living-quarters-trailers-for-sale', label: 'Living Quarters Trailers', kw: 'living quarters', subs: ['Living Quarters Trailer'], ssr: true },
  { category: 'Trailers', slug: 'gooseneck-trailers-for-sale',       label: 'Gooseneck Trailers',       kw: 'gooseneck',       subs: ['Gooseneck Trailer'],       ssr: true },
  { category: 'Trailers', slug: 'utility-trailers-for-sale',         label: 'Utility Trailers',         kw: 'utility',         subs: ['Utility Trailer'],         ssr: true },

  // ── Construction (6 SSR + 2 kw-only) ──
  { category: 'Construction', slug: 'skid-steers-for-sale',      label: 'Skid Steers',      kw: 'skid',            subs: ['Skid Steer', 'Compact Track Loader', 'Mini Skid Steer', 'Track Skid Steer', 'Wheel Skid Steer'], ssr: true },
  { category: 'Construction', slug: 'mini-skid-steers-for-sale', label: 'Mini Skid Steers', kw: 'mini skid steer', subs: ['Mini Skid Steer'],                       ssr: true },
  { category: 'Construction', slug: 'excavators-for-sale',       label: 'Excavators',       kw: 'excavator',       subs: ['Excavator', 'Crawler Excavator', 'Mini Excavator'], ssr: true },
  { category: 'Construction', slug: 'mini-excavators-for-sale',  label: 'Mini Excavators',  kw: 'mini excavator',  subs: ['Mini Excavator'],                        ssr: true },
  { category: 'Construction', slug: 'loaders-for-sale',          label: 'Loaders',          kw: 'loader',          subs: ['Wheel Loader', 'Crawler Loader'],        ssr: true },
  { category: 'Construction', slug: 'crane-trucks-for-sale',     label: 'Crane Trucks',     kw: 'crane truck',     subs: ['Crane Truck'],                           ssr: true },
  { category: 'Construction', slug: 'forklifts',                 label: 'Forklifts',        kw: 'forklift',        subs: [],                                        ssr: false },
  { category: 'Construction', slug: 'backhoes',                  label: 'Backhoes',         kw: 'backhoe',         subs: [],                                        ssr: false },

  // ── Farm (4 SSR + 6 kw-only) ──
  { category: 'Farm', slug: 'tractors-for-sale',       label: 'Tractors',         kw: 'tractor',        subs: ['Tractor'],       ssr: true },
  { category: 'Farm', slug: 'rotary-cutters-for-sale', label: 'Rotary Cutters',   kw: 'rotary',         subs: ['Rotary Cutter'], ssr: true },
  { category: 'Farm', slug: 'boom-mowers-for-sale',    label: 'Boom Mowers',      kw: 'boom mower',     subs: ['Boom Mower'],    ssr: true },
  { category: 'Farm', slug: 'drum-mowers-for-sale',    label: 'Drum Mowers',      kw: 'drum mower',     subs: ['Drum Mower'],    ssr: true },
  { category: 'Farm', slug: 'hay-rakes',               label: 'Hay Rakes',        kw: 'hay rake',       subs: [],                ssr: false },
  { category: 'Farm', slug: 'balers',                  label: 'Balers',           kw: 'baler',          subs: [],                ssr: false },
  { category: 'Farm', slug: 'field-mowers',            label: 'Field Mowers',     kw: 'field mower',    subs: [],                ssr: false },
  { category: 'Farm', slug: 'utility-vehicles',        label: 'Utility Vehicles', kw: 'utility vehicle',subs: [],                ssr: false },
  { category: 'Farm', slug: 'harrows',                 label: 'Harrows',          kw: 'harrow',         subs: [],                ssr: false },
  { category: 'Farm', slug: 'disks',                   label: 'Disks',            kw: 'disk',           subs: [],                ssr: false },

  // ── Landscape (2 SSR + 4 kw-only) ──
  { category: 'Landscape', slug: 'zero-turn-mowers-for-sale', label: 'Zero Turn Mowers',     kw: 'zero turn',    subs: ['Zero Turn Mower'], ssr: true },
  { category: 'Landscape', slug: 'lawn-tractors-for-sale',    label: 'Lawn Tractors',        kw: 'lawn tractor', subs: ['Lawn Tractor'],    ssr: true },
  { category: 'Landscape', slug: 'walk-behind-mowers',        label: 'Walk Behind Mowers',   kw: 'walk behind',  subs: [],                  ssr: false },
  { category: 'Landscape', slug: 'front-mounted-mowers',      label: 'Front Mounted Mowers', kw: 'front mounted',subs: [],                  ssr: false },
  { category: 'Landscape', slug: 'turf-grounds-care',         label: 'Turf & Grounds Care',  kw: 'turf',         subs: [],                  ssr: false },
  { category: 'Landscape', slug: 'finish-mowers',             label: 'Finish Mowers',        kw: 'finish',       subs: [],                  ssr: false },
];

// Category → hub slug (derived, not stored per-entry).
const CATEGORY_HUB = {
  'Trucks':       'trucks-for-sale',
  'Trailers':     'trailers-for-sale',
  'Construction': 'construction-equipment-for-sale',
  'Farm':         'farm-equipment-for-sale',
  'Landscape':    'landscape-equipment-for-sale',
};

// Category render order (for grouping into CAT_SUBS).
const CATEGORY_ORDER = ['Trucks', 'Trailers', 'Construction', 'Farm', 'Landscape', 'Other'];

// Dual-export: browser (window) + module (edge/Node/check-script).
if (typeof window !== 'undefined') {
  window.TAXONOMY_DATA = TAXONOMY_DATA;
  window.TAXONOMY_CATEGORY_HUB = CATEGORY_HUB;
  window.TAXONOMY_CATEGORY_ORDER = CATEGORY_ORDER;
}
export { TAXONOMY_DATA, CATEGORY_HUB, CATEGORY_ORDER };
