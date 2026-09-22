// GENERATED FROM card-facts.source.js — DO NOT EDIT. Run node scripts/generate-card-facts.js
// ESM variant for Netlify edge functions (Deno). Logic must match card-facts.generated.js
// byte-for-byte to keep SSR/client parity.

import { showMileage, showHours } from './usage-display.esm.js';

// ───────────────────────────────────────────────────────────── A. LIVE
function trimEngine(val) {
  if (!val) return '';
  var s = val.split(/\s+[-–—]\s+/)[0].replace(/\s+Engine\s*$/i, '').trim();
  // strip trailing torque (e.g. "660-1050ft. lbs.", "850ft. lbs.")
  s = s.replace(/\s*\d+(?:[.,]\d+)?(?:-\d+(?:[.,]\d+)?)?\s*ft\.?\s*lbs?\.?\s*$/i, '').trim();
  // strip trailing horsepower (e.g. "260-360hp", "370hp", "455 HP")
  s = s.replace(/\s*\d+(?:[.,]\d+)?(?:-\d+(?:[.,]\d+)?)?\s*hp\b\.?\s*$/i, '').trim();
  // strip leading horsepower (e.g. "400 HP Cummins ISX12", "455hp Detroit DD15")
  s = s.replace(/^\d+(?:[.,]\d+)?(?:-\d+(?:[.,]\d+)?)?\s*hp\b\.?\s*/i, '').trim();
  // nothing meaningful left (e.g. "74hp") → no chip
  if (!s || /^\d+(?:[.,]\d+)?$/.test(s)) return '';
  return s;
}

var CHIP_JUNK = {'':1,'—':1,'-':1,'--':1,'n/a':1,'na':1,'none':1,'unknown':1,'null':1};
function chipBadText(v) { return !v || CHIP_JUNK[String(v).trim().toLowerCase()]; }
function chipNum(v) {
  if (v === null || v === undefined) return null;
  var s = String(v).trim();
  if (/\bto\b/i.test(s)) return null;
  var m = s.replace(/[, ]/g, '').match(/^-?\d+(\.\d+)?/);
  if (!m) return null;
  var n = parseFloat(m[0]);
  return (isFinite(n) && n > 0) ? n : null;
}
function chipFmtNum(n) { return n.toLocaleString('en-US'); }
var CHIP_MOWERS = {'zero turn mower':1,'walk behind mower':1,'lawn tractor':1,'front deck mower':1};
var INFO_CAP = 2;

function buildCardChips(u, opts) {
  opts = opts || {};
  var F = {
    mileage:      function () { if (!showMileage(u)) return null; var n = chipNum(u.mileage); return n ? chipFmtNum(n) + ' mi' : null; },
    hours:        function () { if (!showHours(u))   return null; var n = chipNum(u.hours);   return n ? chipFmtNum(n) + ' hrs' : null; },
    engine:       function () { return chipBadText(u.engine) ? null : trimEngine(u.engine); },
    fuel:         function () { if (chipBadText(u.fuel)) return null; var f = String(u.fuel).trim(); return /diesel/i.test(f) ? null : f; },
    horsepower:   function () { var n = chipNum(u.horsepower); return n ? chipFmtNum(n) + ' HP' : null; }
  };
  var sub = (u.subcategory || '').toLowerCase();
  var cat = (u.category || '').toLowerCase();
  var order;
  if (sub === 'tractor')           order = ['horsepower', 'hours'];
  else if (CHIP_MOWERS[sub])       order = ['hours', 'horsepower'];
  else if (sub === 'crane truck')  order = ['mileage', 'engine'];
  else if (cat === 'trailers')     order = [];
  else if (cat === 'trucks')       order = ['mileage', 'engine', 'fuel'];
  else if (cat === 'construction') order = ['horsepower', 'hours'];
  else if (cat === 'farm')         order = ['horsepower', 'hours'];
  else                             order = ['mileage', 'fuel'];
  var isNew = !chipBadText(u.condition) && String(u.condition).trim().toLowerCase() === 'new';
  // search_pills override (client payload only; 0 live rows at 2026-09-22). Behavior preserved
  // exactly as before this consolidation, including NEW counting inside its 3-pill limit
  // (Chief ruling L2 — M3 applies only to the informational-pill path below).
  // opts.searchPills gates the branch to the client, the only caller that SELECTs the column.
  if (opts.searchPills && Array.isArray(u.search_pills) && u.search_pills.length) {
    var sp = u.search_pills.filter(function (x) { return x && String(x).trim(); }).slice(0, 3);
    if (sp.length) {
      var spChips = [];
      if (isNew) spChips.push('NEW');
      for (var k = 0; k < sp.length && spChips.length < 3; k++) spChips.push(String(sp[k]).trim());
      return spChips;
    }
  }
  var chips = [];
  if (isNew) chips.push('NEW');
  var info = 0;
  for (var i = 0; i < order.length && info < INFO_CAP; i++) {
    var v = F[order[i]] && F[order[i]]();
    if (v) { chips.push(v); info++; }
  }
  return chips;
}

// ───────────────────────────────────────────────────────────── B. DARK (governed)
function gNum(v) {
  if (v == null) return null;
  var s = String(v).trim();
  if (!s || /\bto\b/i.test(s)) return null;
  var m = s.replace(/[, ]/g, '').match(/^\d+(\.\d+)?/);
  if (!m) return null;
  var n = parseFloat(m[0]);
  return isFinite(n) && n > 0 ? n : null;
}
function inRange(n, lo, hi) { return n != null && n >= lo && n <= hi ? n : null; }

var PROSE = /\b(reliable|efficient|powerful|powered|perfect|great|excellent|runs|ready|clean|strong|well|good|operation|performance)\b/i;
function cleanDesignation(v) {
  var s = String(v == null ? '' : v).trim();
  if (!s || s.length > 45) return null;
  if (/^[a-z]/.test(s)) return null;
  if (/[.!?;:]\s|[.!?]$/.test(s)) return null;
  if (PROSE.test(s)) return null;
  if (/^(n\/?a|none|unknown|not applicable|null|-+)$/i.test(s)) return null;
  return s;
}
var DRIVE = [
  [/^(4x4|4wd|four[- ]?wheel[- ]?drive)$/i, '4x4'],
  [/^(4x2|2wd|two[- ]?wheel[- ]?drive)$/i, '4x2'],
  [/^(6x4)$/i, '6x4'], [/^(6x2)$/i, '6x2'], [/^(8x4)$/i, '8x4'], [/^(8x6)$/i, '8x6'], [/^(6x6)$/i, '6x6'],
  [/^(awd|all[- ]?wheel[- ]?drive)$/i, 'AWD'],
  [/^(mfwd)$/i, 'MFWD']
];
function parseDrive(v) {
  var s = String(v == null ? '' : v).trim().replace(/\s*\(.*\)\s*$/, '');
  for (var i = 0; i < DRIVE.length; i++) if (DRIVE[i][0].test(s)) return DRIVE[i][1];
  return null;
}
var TRANS_OK = /\b(automatic|manual|allison|eaton|fuller|ultrashift|hydrostatic|powershift|power shift|shuttle|cvt|\d{1,2}[- ]speed|\d{1,2}f\/\d{1,2}r|mitsubishi|aisin|spicer|rockwell|meritor|mack|volvo i-shift|i-shift|mdrive|dt12)\b/i;
function parseTransmission(v) {
  var s = cleanDesignation(v);
  if (!s || !TRANS_OK.test(s)) return null;
  var parts = s.split(/\s+-\s+/);
  if (parts.length === 2 && parts[0].toLowerCase() === parts[1].toLowerCase()) s = parts[0];
  return s.replace(/\s*\((automatic|manual)\)\s*$/i, '');
}
function parseGvwrClass(v) {
  var m = String(v == null ? '' : v).match(/^\s*class\s*(\d)\b/i);
  return m ? { cls: +m[1] } : null;
}
var FUEL_SHOW = { gasoline: 'Gasoline', gas: 'Gasoline', propane: 'Propane', lpg: 'Propane', electric: 'Electric', cng: 'CNG', hybrid: 'Hybrid', 'dual fuel': 'Dual Fuel' };
// Every table in Section B is indexed by DATA (a governed value or a taxonomy
// string), so every lookup must be own-property only. Plain `tbl[k]` walks
// Object.prototype: parseFuel('constructor') returned the Object constructor,
// which reached formatFact and stringified into a pill. gHas() closes that.
function gHas(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function parseFuel(v) { var k = String(v == null ? '' : v).trim().toLowerCase(); return gHas(FUEL_SHOW, k) ? FUEL_SHOW[k] : null; }

// An engine designation made only of generic tokens ("Diesel", "Diesel Engine",
// "Turbo Diesel", "V8") is filler, and in the diesel case it re-admits through
// the `engine` key the pill the `fuel` key intentionally excludes.
function parseEngine(v) {
  var s = cleanDesignation(v);
  if (s == null) return null;
  return engineTokens(s).length ? s : null;
}

var VOCAB = {
  mileage:             { family: 'usage_miles',      parse: function (v) { return inRange(gNum(v), 1, 3000000); } },
  hours:               { family: 'usage_hours',      parse: function (v) { return inRange(gNum(v), 1, 200000); } },
  engine:              { family: 'engine',           parse: parseEngine },
  horsepower:          { family: 'power',            parse: function (v) { return inRange(gNum(v), 5, 2500); } },
  transmission:        { family: 'transmission',     parse: parseTransmission },
  drivetrain:          { family: 'drivetrain',       parse: parseDrive },
  fuel:                { family: 'fuel',             parse: parseFuel },
  gvwr_class:          { family: 'gvwr',             parse: parseGvwrClass },
  gvwr_lb:             { family: 'gvwr',             parse: function (v) { return inRange(gNum(v), 500, 150000); } },
  axle_rating_lb:      { family: 'axle',             parse: function (v) { return inRange(gNum(v), 500, 40000); } },
  interior_height_in:  { family: 'interior_height',  parse: function (v) { return inRange(gNum(v), 24, 180); } },
  deck_width_in:       { family: 'width',            parse: function (v) { return inRange(gNum(v), 24, 120); } },
  deck_length_ft:      { family: 'length',           parse: function (v) { return inRange(gNum(v), 4, 60); } },
  lift_capacity_lb:    { family: 'lift_capacity',    parse: function (v) { return inRange(gNum(v), 500, 100000); } },
  operating_weight_lb: { family: 'operating_weight', parse: function (v) { return inRange(gNum(v), 200, 500000); } },
  working_width_in:    { family: 'width',            parse: function (v) { return inRange(gNum(v), 12, 600); } },
  body_length_ft:      { family: 'length',           parse: function (v) { return inRange(gNum(v), 6, 53); } }
};
var VOCAB_KEYS = ['mileage', 'hours', 'engine', 'horsepower', 'transmission', 'drivetrain', 'fuel', 'gvwr_class',
  'gvwr_lb', 'axle_rating_lb', 'interior_height_in', 'deck_width_in', 'deck_length_ft',
  'lift_capacity_lb', 'operating_weight_lb', 'working_width_in', 'body_length_ft'];

function profileOf(category, subcategory) {
  var cat = String(category || '').toLowerCase(), sub = String(subcategory || '').toLowerCase();
  if (sub === 'forklift' || sub === 'telehandler') return ['hours', 'lift_capacity_lb', 'fuel', 'horsepower'];
  if (sub === 'truck body') return ['body_length_ft', 'lift_capacity_lb'];
  if (sub === 'tractor' || sub === 'compact tractor' || sub === 'utility tractor') return ['hours', 'horsepower', 'drivetrain', 'transmission'];
  if (gHas(CHIP_MOWERS, sub)) return ['hours', 'horsepower', 'fuel'];
  if (cat === 'trailers') return ['gvwr_lb', 'axle_rating_lb', 'interior_height_in', 'deck_width_in', 'deck_length_ft'];
  if (cat === 'trucks') return ['mileage', 'engine', 'gvwr_class', 'transmission', 'drivetrain', 'horsepower', 'fuel'];
  if (cat === 'construction') return ['hours', 'horsepower', 'operating_weight_lb', 'fuel'];
  if (cat === 'farm') return ['working_width_in', 'hours', 'horsepower'];
  return ['mileage', 'hours', 'horsepower', 'engine', 'fuel'];
}

// TEMPORARY BUILD-GATE GUARDRAIL (Chief, 2026-09-22) — REMOVABLE.
// Not the permanent architecture: permanent = authoritative governed truth → consumers, and a
// stale legacy column is repaired, not allowed to suppress the governed fact. For this build a
// governed fact whose inventory column exists must agree with that column as delivered in the
// card payload; blank, absent-from-payload or disagreeing → HOLD. To retire it, delete this
// function and its single call in governedCandidates. selectBestFacts never depends on it.
var TEMP_GUARDRAIL_MIRRORED = { mileage: 1, hours: 1, engine: 1, horsepower: 1, transmission: 1, drivetrain: 1, fuel: 1, gvwr_class: 1 };
function tempCompatible(a, b) {
  var na = String(a == null ? '' : a).toLowerCase().trim(), nb = String(b == null ? '' : b).toLowerCase().trim();
  if (!na || !nb) return false;
  return na === nb || na.indexOf(nb) >= 0 || nb.indexOf(na) >= 0;
}
function TEMP_columnAgreementGuardrail(key, value, card) {
  if (!TEMP_GUARDRAIL_MIRRORED[key]) return null;
  if (!Object.prototype.hasOwnProperty.call(card, key)) return 'HOLD mirror column not in card payload';
  var col = card[key];
  if (col == null || String(col).trim() === '') return 'HOLD column blank';
  var ok = (key === 'mileage' || key === 'hours' || key === 'horsepower') ? gNum(col) === gNum(value)
         : key === 'drivetrain' ? parseDrive(col) === parseDrive(value)
         : tempCompatible(col, value);
  return ok ? null : 'HOLD column/governed disagree';
}

// card: an inventory_cards row carrying governed_facts (object or JSON string).
function governedCandidates(card) {
  var out = [], rejected = [];
  var gf = card && card.governed_facts;
  if (typeof gf === 'string') { try { gf = JSON.parse(gf); } catch (e) { gf = null; } }
  if (!gf || typeof gf !== 'object') return { candidates: out, rejected: rejected };
  for (var i = 0; i < VOCAB_KEYS.length; i++) {
    var key = VOCAB_KEYS[i], value = gHas(gf, key) ? gf[key] : null;
    if (value == null || String(value).trim() === '') continue;
    var hold = TEMP_columnAgreementGuardrail(key, value, card);
    if (hold) { rejected.push({ key: key, reason: hold }); continue; }
    if (key === 'mileage' && !showMileage({ subcategory: card.subcategory, mileage: value })) { rejected.push({ key: key, reason: 'usage rule hides mileage' }); continue; }
    if (key === 'hours' && !showHours({ subcategory: card.subcategory, hours: value })) { rejected.push({ key: key, reason: 'usage rule hides hours' }); continue; }
    var canonical = VOCAB[key].parse(value);
    if (canonical == null) {
      rejected.push({ key: key, reason: (key === 'fuel' && /diesel/i.test(String(value))) ? 'diesel is never a pill (by design)' : 'invalid or unclean value' });
      continue;
    }
    out.push({ key: key, family: VOCAB[key].family, canonical: canonical });
  }
  return { candidates: out, rejected: rejected };
}

function thousands(n) { return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function kShort(n) { return n >= 1000 ? (Math.round(n / 100) / 10).toString().replace(/\.0$/, '') + 'K' : thousands(n); }
function formatEngine(s) {
  var t = s.split(/\s+[-–—]\s+/)[0].replace(/\s+Engine\s*$/i, '');
  t = t.replace(/\s*\d+(?:[.,]\d+)?\s*hp\b\.?\s*$/i, '').replace(/^\d+(?:[.,]\d+)?\s*hp\b\.?\s*/i, '');
  t = t.replace(/(\d+\.\d)\d+\s*L\b/g, '$1L');
  return t.trim();
}
var FORMAT = {
  mileage: function (n) { return kShort(n) + ' MI'; },
  hours: function (n) { return thousands(n) + ' HRS'; },
  engine: formatEngine,
  horsepower: function (n) { return thousands(n) + ' HP'; },
  transmission: function (s) { return s; },
  drivetrain: function (s) { return s; },
  fuel: function (s) { return s; },
  gvwr_class: function (c) { return 'CLASS ' + c.cls; },
  gvwr_lb: function (n) { return thousands(n) + ' GVWR'; },
  axle_rating_lb: function (n) { return kShort(n) + ' AXLES'; },
  interior_height_in: function (n) { return (n % 12 === 0 ? (n / 12) + "'" : Math.floor(n / 12) + "'" + (n % 12) + '"') + ' INTERIOR'; },
  deck_width_in: function (n) { return n + '" DECK WIDTH'; },
  deck_length_ft: function (n) { return n + ' FT DECK'; },
  lift_capacity_lb: function (n) { return thousands(n) + ' LB CAPACITY'; },
  operating_weight_lb: function (n) { return thousands(n) + ' LB'; },
  working_width_in: function (n) { return (n % 12 === 0 ? (n / 12) + ' FT' : n + '"') + ' WIDTH'; },
  body_length_ft: function (n) { return n + ' FT BODY'; }
};
function formatFact(key, canonical) {
  var frozen = (canonical && typeof canonical === 'object') ? Object.freeze(Object.assign({}, canonical)) : canonical;
  return gHas(FORMAT, key) ? String(FORMAT[key](frozen)) : '';
}

function identityProfile(title, subLabel) {
  var text = (String(title || '') + ' | ' + String(subLabel || '')).toLowerCase();
  var dims = [], m;
  var re = /(\d+(?:\.\d+)?)\s*(?:ft|'|foot|feet)?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(ft|'|foot|feet|in|")?/g;
  while ((m = re.exec(text))) dims.push([+m[1], +m[2]]);
  var lengths = [], rl = /(\d+(?:\.\d+)?)\s*(?:ft|'|foot|feet)\b/g;
  while ((m = rl.exec(text))) lengths.push(+m[1]);
  var drive = null, dm = text.match(/\b(4x4|4wd|four[- ]?wheel[- ]?drive|4x2|2wd|6x4|6x2|8x4|awd|mfwd)\b/);
  if (dm) drive = parseDrive(dm[1]);
  var hp = [], rh = /(\d+(?:\.\d+)?)\s*(?:hp|horsepower)\b/g;
  while ((m = rh.exec(text))) hp.push(+m[1]);
  var tokens = text.replace(/[,()]/g, ' ').split(/[\s|/]+/).filter(Boolean);
  return { text: text, dims: dims, lengths: lengths, drive: drive, hp: hp, tokens: tokens,
           gvwr: /\bgvwr?\b|\bclass\s*\d\b/.test(text) };
}
function engineTokens(s) {
  return String(s).toLowerCase().replace(/[,()]/g, ' ').split(/[\s/]+/)
    .filter(function (t) { return t && !/^(diesel|gas|gasoline|engine|turbo|turbodiesel|i6|v8|v6|i4|l6)$/.test(t); });
}
function duplicateVerdict(c, id) {
  switch (c.family) {
    case 'usage_miles': case 'usage_hours': return 'KEEP';
    case 'power': return id.hp.indexOf(c.canonical) >= 0 ? 'SUPPRESS' : 'KEEP';
    case 'drivetrain': return id.drive && id.drive === c.canonical ? 'SUPPRESS' : 'KEEP';
    case 'gvwr': return id.gvwr ? 'SUPPRESS' : 'KEEP';
    case 'axle': return 'KEEP';
    case 'length':
      if (id.lengths.indexOf(c.canonical) >= 0) return 'SUPPRESS';
      for (var i = 0; i < id.dims.length; i++) if (id.dims[i][1] === c.canonical) return 'SUPPRESS';
      return 'KEEP';
    case 'width':
      for (var j = 0; j < id.dims.length; j++) { if (Math.round(id.dims[j][0] * 12) === c.canonical) return 'SUPPRESS'; }
      return 'KEEP';
    case 'engine': {
      var toks = engineTokens(c.canonical);
      return toks.length && toks.every(function (t) { return id.tokens.indexOf(t) >= 0; }) ? 'SUPPRESS' : 'KEEP';
    }
    case 'transmission': case 'fuel': {
      var tt = String(c.canonical).toLowerCase().split(/[\s-]+/).filter(Boolean);
      return tt.every(function (t) { return id.tokens.indexOf(t) >= 0; }) ? 'SUPPRESS' : 'KEEP';
    }
    default: return 'KEEP';
  }
}

// input: { category, subcategory, title, subLabel, candidates, maxFacts? } → { picks, trace }
// Deterministic; at most 2 informational facts; never emits NEW or Stock #.
function selectBestFacts(input) {
  var max = Math.min(INFO_CAP, Math.max(0, Math.floor(input.maxFacts == null ? INFO_CAP : input.maxFacts) || 0));
  var order = profileOf(input.category, input.subcategory);
  var byKey = Object.create(null);
  (input.candidates || []).forEach(function (c) { if (!byKey[c.key]) byKey[c.key] = c; });
  var id = identityProfile(input.title, input.subLabel);
  var picks = [], usedFamilies = Object.create(null), trace = [];
  for (var i = 0; i < order.length; i++) {
    var c = byKey[order[i]];
    if (!c) continue;
    if (picks.length >= max) { trace.push({ key: c.key, verdict: 'not needed (cap reached)' }); continue; }
    if (usedFamilies[c.family]) { trace.push({ key: c.key, verdict: 'same family already shown: ' + c.family }); continue; }
    if (duplicateVerdict(c, id) === 'SUPPRESS') { trace.push({ key: c.key, verdict: 'duplicates visible identity' }); continue; }
    var display = formatFact(c.key, c.canonical);
    if (!display) { trace.push({ key: c.key, verdict: 'no display form' }); continue; }
    usedFamilies[c.family] = true;
    picks.push({ key: c.key, family: c.family, display: display });
    trace.push({ key: c.key, verdict: 'SELECTED' });
  }
  (input.candidates || []).forEach(function (c) { if (order.indexOf(c.key) < 0) trace.push({ key: c.key, verdict: 'not in category profile' }); });
  return { picks: picks, trace: trace };
}

export { buildCardChips, trimEngine, profileOf, governedCandidates, selectBestFacts, formatFact };
