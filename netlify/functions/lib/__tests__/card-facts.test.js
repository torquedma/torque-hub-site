// card-facts.test.js — invariant contract tests for the DARK governed best-fact selector
// (Section B of card-facts.source.js) plus mirror parity with the executing CJS artifact.
// Derived from the Dispatch 2 contract suite (2026-09-22). No live-data assertions:
// every fixture is a static input; nothing here reads the database or a production census.
// Run: node netlify/functions/lib/__tests__/card-facts.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const usage = require('../usage-display.generated.js');
const SRC = path.join(__dirname, '..', 'card-facts.source.js');

// Evaluates the source body exactly as the generator's CJS wrapper does
// (showMileage/showHours supplied as free identifiers) so internal functions are testable.
const EXPORTS = [
  'trimEngine', 'buildCardChips', 'INFO_CAP',
  'gNum', 'inRange', 'cleanDesignation', 'parseDrive', 'parseTransmission',
  'parseGvwrClass', 'parseFuel', 'parseEngine', 'VOCAB', 'VOCAB_KEYS', 'profileOf',
  'tempCompatible', 'TEMP_columnAgreementGuardrail', 'TEMP_GUARDRAIL_MIRRORED',
  'governedCandidates', 'formatFact', 'FORMAT', 'identityProfile',
  'GOVERNED_COHORT_SUBCATEGORIES', 'inGovernedCohort',
  'engineTokens', 'duplicateVerdict', 'selectBestFacts'
];

function loadSource(opts) {
  opts = opts || {};
  let body = opts.text != null ? opts.text : fs.readFileSync(opts.file || SRC, 'utf8');
  if (typeof opts.transform === 'function') body = opts.transform(body);

  const names = (opts.exports || EXPORTS).filter(n => new RegExp('(function|var)\\s+' + n + '\\b').test(body));
  const tail = '\n;module.exports = {' + names.map(n => n + ': ' + n).join(', ') + '};\n';

  const warnings = [];
  const sandbox = {
    module: { exports: {} },
    showMileage: usage.showMileage,
    showHours: usage.showHours,
    console: { warn: m => warnings.push(String(m)), log: () => {}, error: () => {} },
    Object, Array, String, Number, Math, JSON, RegExp, isFinite, parseFloat, parseInt, Boolean, Error
  };
  vm.createContext(sandbox);
  vm.runInContext(body + tail, sandbox, { filename: 'card-facts.source.js' });
  const api = sandbox.module.exports;
  api.__warnings = warnings;
  api.__text = body;
  api.__exportedNames = names;
  return api;
}


// ── guardrail-removal proof helpers ──────────────────────────────────────────
const CALL_SITE = /^\s*var hold = TEMP_columnAgreementGuardrail\(key, value, card\);\s*$/;
const HOLD_USE  = /^\s*if \(hold\) \{ rejected\.push\(\{ key: key, reason: hold \}\); continue; \}\s*$/;

// Strip the guardrail from source text. The only edit inside a live code path is
// the single call site; the rest is deleting the isolated, clearly-named block.
function strip(text) {
  const lines = text.split('\n');
  const out = [];
  let callSiteLinesRemoved = 0;
  let inDecl = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (CALL_SITE.test(l) || HOLD_USE.test(l)) { callSiteLinesRemoved++; continue; }   // ← THE CALL SITE
    if (/^function TEMP_columnAgreementGuardrail\(/.test(l)) { inDecl = true; continue; }
    if (inDecl) { if (/^\}/.test(l)) inDecl = false; continue; }
    if (/^var TEMP_GUARDRAIL_MIRRORED = /.test(l)) continue;
    if (/^function tempCompatible\(/.test(l)) { inDecl = true; continue; }
    if (/^\/\/ TEMPORARY BUILD-GATE GUARDRAIL/.test(l)) {                               // its comment block
      while (i + 1 < lines.length && /^\/\//.test(lines[i + 1])) i++;
      continue;
    }
    out.push(l);
  }
  return { text: out.join('\n'), callSiteLinesRemoved };
}

function sliceFn(text, name) {
  const start = text.indexOf('function ' + name + '(');
  if (start < 0) return null;
  const end = text.indexOf('\n}\n', start);
  return text.slice(start, end + 3);
}

function removeGuardrail(srcPath) {
  const text = fs.readFileSync(srcPath, 'utf8');
  const { text: stripped, callSiteLinesRemoved } = strip(text);
  let moduleLoads = false, err = null;
  try { loadSource({ text: stripped }); moduleLoads = true; } catch (e) { err = e.message; }
  return {
    callSiteLinesRemoved,
    moduleLoads,
    loadError: err,
    noTempRemains: !/TEMP_/.test(stripped),
    selectBestFactsTextIdentical: sliceFn(text, 'selectBestFacts') === sliceFn(stripped, 'selectBestFacts'),
    formatFactTextIdentical: sliceFn(text, 'formatFact') === sliceFn(stripped, 'formatFact'),
    duplicateVerdictTextIdentical: sliceFn(text, 'duplicateVerdict') === sliceFn(stripped, 'duplicateVerdict'),
    strippedText: stripped
  };
}

// ── behavioural fixtures ─────────────────────────────────────────────────────
// Deliberately include rows the guardrail HOLDS, so the control can prove the
// removal changed governedCandidates.
const FIXTURES = [
  { category: 'Trucks', subcategory: 'Box Truck', title: '2007 Ford F-650', subLabel: 'Box Truck',
    mileage: '184,014', hours: null, engine: '6.0L V8 Gasoline', horsepower: '290', fuel: 'Gasoline',
    governed_facts: { mileage: '184,014', engine: '6.0L V8', horsepower: '290', fuel: 'Gasoline' } },
  { category: 'Trucks', subcategory: 'Box Truck', title: 'x', subLabel: 'Box Truck',
    mileage: null, hours: null, engine: null, horsepower: null, fuel: null,
    governed_facts: { transmission: 'Allison 2500 RDS', drivetrain: '4x2',
                      gvwr_class: 'Class 4: 14,001 - 16,000 lb' } },                 // absent-payload HOLDs
  { category: 'Trucks', subcategory: 'Box Truck', title: 'x', subLabel: 'Box Truck',
    mileage: null, hours: null, engine: '', horsepower: null, fuel: null,
    governed_facts: { engine: 'Cummins ISB 6.7L' } },                                // blank-column HOLD
  { category: 'Farm', subcategory: 'Tractor', title: 'Ford Tractor', subLabel: 'Tractor',
    mileage: '', hours: null, engine: '', horsepower: null, fuel: 'Gasoline',
    governed_facts: { fuel: 'Diesel' } },                                            // JOE disagreement HOLD
  { category: 'Construction', subcategory: 'Excavator', title: '2016 Kubota KX040', subLabel: 'Excavator',
    mileage: null, hours: '2,628', engine: null, horsepower: '74 HP', fuel: null,
    governed_facts: { hours: '2,628', horsepower: '74 HP' } },
  { category: 'Trailers', subcategory: 'Enclosed Trailer', title: '2021 Cargo Mate 7ft x 16',
    subLabel: 'Enclosed Trailer',
    mileage: null, hours: null, engine: null, horsepower: null, fuel: null,
    governed_facts: { gvwr_lb: '7000', deck_length_ft: '16', deck_width_in: '84' } }
];

function sameSelectorBehaviour(srcPath) {
  const WITH = loadSource({ file: srcPath });
  const WITHOUT = loadSource({ text: removeGuardrail(srcPath).strippedText });
  const mismatches = [];
  let guardrailActuallyMattered = false;
  let cases = 0;

  FIXTURES.forEach((f, i) => {
    const gWith = WITH.governedCandidates(f);
    const gWithout = WITHOUT.governedCandidates(f);
    if (JSON.stringify(gWith.candidates) !== JSON.stringify(gWithout.candidates)) {
      guardrailActuallyMattered = true;   // CONTROL: the removal is not a no-op
    }
    // The claim under test: given the SAME candidate list, the selector is
    // indifferent to whether the guardrail exists. Feed each candidate list to
    // BOTH selectors and require all four results to agree.
    [gWith.candidates, gWithout.candidates].forEach(cands => {
      const input = { category: f.category, subcategory: f.subcategory,
                      title: f.title, subLabel: f.subLabel, candidates: cands };
      const a = JSON.stringify(WITH.selectBestFacts(input));
      const b = JSON.stringify(WITHOUT.selectBestFacts(input));
      cases++;
      if (a !== b) mismatches.push({ fixture: i, with: a, without: b });
    });
  });
  return { mismatches, cases, guardrailActuallyMattered };
}


// ── tiny assertion kit ────────────────────────────────────────────────────────
function eq(a, b, msg) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error((msg || 'eq') + ': expected ' + B + ' got ' + A);
}
function ok(v, msg) { if (!v) throw new Error(msg || 'expected truthy'); }
function notOk(v, msg) { if (v) throw new Error(msg || 'expected falsy'); }
function displays(r) { return r.picks.map(p => p.display); }

// A "card payload" as the live inventory_cards view delivers it: the mirror
// columns that EXIST are exactly mileage, hours, engine, horsepower, fuel.
function payload(extra) {
  return Object.assign({ mileage: null, hours: null, engine: null, horsepower: null, fuel: null }, extra);
}
function run(M, card, titleInfo, maxFacts) {
  const gc = M.governedCandidates(card);
  return {
    gc,
    sel: M.selectBestFacts({
      category: card.category, subcategory: card.subcategory,
      title: titleInfo && titleInfo.title, subLabel: titleInfo && titleInfo.subLabel,
      candidates: gc.candidates, maxFacts
    })
  };
}

// ── the test table ───────────────────────────────────────────────────────────
const TESTS = [

['T01 only governed_facts values are considered', M => {
  const card = payload({ category: 'Trucks', subcategory: 'Box Truck',
    mileage: '120000', engine: 'Cummins ISB 6.7L', horsepower: '250', fuel: 'Gasoline',
    governed_facts: {} });
  const r = run(M, card, { title: '2015 Freightliner M2', subLabel: 'Box Truck' });
  eq(r.gc.candidates, [], 'no candidates from columns alone');
  eq(r.sel.picks, [], 'no picks from columns alone');
  // CONTROL POSITIVE: same columns, governed_facts populated → candidates appear.
  const ctl = payload({ category: 'Trucks', subcategory: 'Box Truck',
    mileage: '120000', engine: 'Cummins ISB 6.7L', horsepower: '250', fuel: 'Gasoline',
    governed_facts: { mileage: '120000', engine: 'Cummins ISB 6.7L' } });
  const c = run(M, ctl, { title: '2015 Freightliner M2', subLabel: 'Box Truck' });
  eq(c.gc.candidates.map(x => x.key), ['mileage', 'engine'], 'control positive');
  ok(c.sel.picks.length === 2, 'control positive picks');
}],

['T02 max 2 informational facts (cap is hard)', M => {
  const card = payload({ category: 'Trucks', subcategory: 'Box Truck',
    mileage: '120000', engine: 'Cummins ISB 6.7L', horsepower: '250', fuel: 'Gasoline',
    governed_facts: { mileage: '120000', engine: 'Cummins ISB 6.7L', horsepower: '250', fuel: 'Gasoline' } });
  const r = run(M, card, { title: '2015 Freightliner M2', subLabel: 'Box Truck' });
  ok(r.gc.candidates.length >= 4, 'four candidates available');
  eq(r.sel.picks.length, 2, 'cap');
  eq(M.INFO_CAP, 2, 'INFO_CAP');
}],

['T03 zero / one / two facts are all valid; no filler', M => {
  const zero = payload({ category: 'Trucks', subcategory: 'Box Truck', governed_facts: {} });
  eq(run(M, zero, { title: 'x', subLabel: 'Box Truck' }).sel.picks.length, 0, '0 valid');
  const one = payload({ category: 'Trucks', subcategory: 'Box Truck', mileage: '90000',
    governed_facts: { mileage: '90000' } });
  eq(run(M, one, { title: 'x', subLabel: 'Box Truck' }).sel.picks.length, 1, '1 valid');
  const two = payload({ category: 'Trucks', subcategory: 'Box Truck', mileage: '90000',
    engine: 'Cummins ISB', governed_facts: { mileage: '90000', engine: 'Cummins ISB' } });
  eq(run(M, two, { title: 'x', subLabel: 'Box Truck' }).sel.picks.length, 2, '2 valid');
}],

['T04 deterministic priority follows the category profile order', M => {
  const cands = [
    { key: 'fuel', family: 'fuel', canonical: 'Gasoline' },
    { key: 'horsepower', family: 'power', canonical: 250 },
    { key: 'engine', family: 'engine', canonical: 'Cummins ISB' },
    { key: 'mileage', family: 'usage_miles', canonical: 90000 }
  ];
  const r = M.selectBestFacts({ category: 'Trucks', subcategory: 'Box Truck',
    title: 'x', subLabel: 'y', candidates: cands });
  eq(r.picks.map(p => p.key), ['mileage', 'engine'], 'profile order wins over array order');
}],

['T05 category profiles are honoured', M => {
  eq(M.profileOf('Trucks', 'Box Truck'),
     ['mileage','engine','gvwr_class','transmission','drivetrain','horsepower','fuel'], 'trucks');
  eq(M.profileOf('Trailers', 'Dump Trailer'),
     ['gvwr_lb','axle_rating_lb','interior_height_in','deck_width_in','deck_length_ft'], 'trailers');
  eq(M.profileOf('Construction', 'Excavator'),
     ['hours','horsepower','operating_weight_lb','fuel'], 'construction');
  eq(M.profileOf('Farm', 'Disk'), ['working_width_in','hours','horsepower'], 'farm');
  eq(M.profileOf('Farm', 'Tractor'), ['hours','horsepower','drivetrain','transmission'], 'tractor sub');
  eq(M.profileOf('Construction', 'Forklift'), ['hours','lift_capacity_lb','fuel','horsepower'], 'forklift');
  eq(M.profileOf('Other', 'Boat'), ['mileage','hours','horsepower','engine','fuel'], 'default');
  const r = M.selectBestFacts({ category: 'Trailers', subcategory: 'Dump Trailer', title: 'x', subLabel: 'y',
    candidates: [{ key: 'engine', family: 'engine', canonical: 'Cummins ISB' }] });
  eq(r.picks, [], 'off-profile candidate not selected');
  ok(r.trace.some(t => t.key === 'engine' && /not in category profile/.test(t.verdict)), 'traced');
}],

['T06 selectBestFacts NEVER emits NEW', M => {
  const card = payload({ category: 'Trucks', subcategory: 'Box Truck', condition: 'New',
    mileage: '12', engine: 'Cummins ISB',
    governed_facts: { mileage: '12', engine: 'Cummins ISB', condition: 'New' } });
  const r = run(M, card, { title: '2026 Freightliner M2', subLabel: 'Box Truck' });
  notOk(r.gc.candidates.some(c => c.key === 'condition'), 'condition is not vocabulary');
  notOk(displays(r.sel).some(d => /NEW/i.test(d)), 'no NEW in picks');
  notOk(M.VOCAB_KEYS.indexOf('condition') >= 0, 'condition not in VOCAB_KEYS');
  eq(M.formatFact('condition', 'New'), '', 'no formatter for condition');
}],

['T07 selectBestFacts NEVER emits Stock #', M => {
  const card = payload({ category: 'Trucks', subcategory: 'Box Truck', stock: 'FIXTURE-STOCK-1',
    mileage: '12000', governed_facts: { mileage: '12000', stock: 'FIXTURE-STOCK-1' } });
  const r = run(M, card, { title: '2015 Freightliner M2', subLabel: 'Box Truck' });
  notOk(r.gc.candidates.some(c => c.key === 'stock'), 'stock is not vocabulary');
  notOk(displays(r.sel).some(d => /FIXTURE-STOCK-1/.test(d)), 'no stock in picks');
  eq(M.formatFact('stock', 'FIXTURE-STOCK-1'), '', 'no formatter for stock');
}],

['T08 invalid / filler / prose values are rejected', M => {
  eq(M.cleanDesignation('n/a'), null, 'n/a');
  eq(M.cleanDesignation('   '), null, 'blank');
  eq(M.cleanDesignation('unknown'), null, 'unknown');
  eq(M.cleanDesignation('---'), null, 'dashes');
  eq(M.cleanDesignation('runs great, ready to work'), null, 'prose');
  eq(M.cleanDesignation('Powerful and reliable Cummins'), null, 'PROSE words');
  eq(M.cleanDesignation('Propane-powered for efficient and clean operation.'), null, 'live MPX prose');
  eq(M.cleanDesignation('Cummins ISB 6.7L'), 'Cummins ISB 6.7L', 'CONTROL: real designation survives');
  eq(M.gNum('to be determined'), null, 'range/prose number');
  eq(M.gNum('0'), null, 'zero');
  eq(M.gNum('-5'), null, 'negative');
  eq(M.gNum('184,014'), 184014, 'CONTROL: real number survives');
  eq(M.VOCAB.mileage.parse('9999999'), null, 'out of range high');
  eq(M.VOCAB.mileage.parse('184014'), 184014, 'CONTROL: in range');
}],

['T09 usage gates evaluate the GOVERNED value, not the column', M => {
  const trailer = payload({ category: 'Trailers', subcategory: 'Dump Trailer',
    mileage: '5000', governed_facts: { mileage: '5000' } });
  const t = run(M, trailer, { title: '2020 PJ Dump', subLabel: 'Dump Trailer' });
  ok(t.gc.rejected.some(r => r.key === 'mileage' && /usage rule hides mileage/.test(r.reason)),
     'trailer mileage hidden by usage rule');
  const zeroGov = payload({ category: 'Trucks', subcategory: 'Box Truck',
    mileage: '0', governed_facts: { mileage: '0' } });
  const z = run(M, zeroGov, { title: 'x', subLabel: 'Box Truck' });
  ok(z.gc.rejected.some(r => r.key === 'mileage' && /usage rule/.test(r.reason)), 'governed 0 hidden');
  const hTruck = payload({ category: 'Trucks', subcategory: 'Box Truck', hours: '900',
    governed_facts: { hours: '900' } });
  ok(run(M, hTruck, { title: 'x', subLabel: 'Box Truck' }).gc.rejected
      .some(r => r.key === 'hours' && /usage rule hides hours/.test(r.reason)), 'truck hours hidden');
  const hExc = payload({ category: 'Construction', subcategory: 'Excavator', hours: '900',
    governed_facts: { hours: '900' } });
  eq(run(M, hExc, { title: 'x', subLabel: 'Excavator' }).gc.candidates.map(c => c.key), ['hours'],
     'CONTROL: excavator hours shown');
}],

['T10 diesel is never an informational pill', M => {
  const card = payload({ category: 'Trucks', subcategory: 'Box Truck', fuel: 'Diesel',
    governed_facts: { fuel: 'Diesel' } });
  const r = run(M, card, { title: '2015 Freightliner M2', subLabel: 'Box Truck' });
  eq(r.gc.candidates, [], 'diesel yields no candidate');
  ok(r.gc.rejected.some(x => x.key === 'fuel' && /diesel is never a pill/.test(x.reason)), 'reason');
  eq(M.parseFuel('diesel'), null, 'parseFuel diesel');
  eq(M.parseFuel('Diesel'), null, 'parseFuel Diesel');
  eq(M.parseFuel('gasoline'), 'Gasoline', 'CONTROL: gasoline survives');
  notOk(displays(r.sel).some(d => /diesel/i.test(d)), 'no diesel display');
}],

['T11 family deduplication — one fact per family', M => {
  eq(M.VOCAB.gvwr_class.family, M.VOCAB.gvwr_lb.family, 'shared gvwr family');
  eq(M.VOCAB.deck_width_in.family, M.VOCAB.working_width_in.family, 'shared width family');
  eq(M.VOCAB.deck_length_ft.family, M.VOCAB.body_length_ft.family, 'shared length family');
  const r = M.selectBestFacts({ category: 'Trailers', subcategory: 'Dump Trailer',
    title: 'x', subLabel: 'y', candidates: [
      { key: 'gvwr_lb', family: 'gvwr', canonical: 14000 },
      { key: 'axle_rating_lb', family: 'gvwr', canonical: 7000 },
      { key: 'deck_length_ft', family: 'length', canonical: 16 }
    ] });
  eq(r.picks.map(p => p.key), ['gvwr_lb', 'deck_length_ft'], 'second gvwr-family fact suppressed');
  ok(r.trace.some(t => t.key === 'axle_rating_lb' && /same family already shown/.test(t.verdict)), 'traced');
}],

['T12 visible title / subcategory duplicate suppression', M => {
  const id = M.identityProfile('2015 Ford F-550 4x4 300 HP', 'Service Truck');
  eq(M.duplicateVerdict({ family: 'power', canonical: 300 }, id), 'SUPPRESS', 'hp in title');
  eq(M.duplicateVerdict({ family: 'power', canonical: 330 }, id), 'KEEP', 'CONTROL: different hp');
  eq(M.duplicateVerdict({ family: 'drivetrain', canonical: '4x4' }, id), 'SUPPRESS', 'drive in title');
  eq(M.duplicateVerdict({ family: 'drivetrain', canonical: '6x4' }, id), 'KEEP', 'CONTROL: different drive');
  const id2 = M.identityProfile('2020 PJ Trailer', '16 ft Deckover Trailer');
  eq(M.duplicateVerdict({ family: 'length', canonical: 16 }, id2), 'SUPPRESS', 'length from subLabel');
  const card = payload({ category: 'Trucks', subcategory: 'Service Truck', horsepower: '300',
    mileage: '80000', governed_facts: { horsepower: '300', mileage: '80000' } });
  const r = run(M, card, { title: '2015 Ford F-550 4x4 300 HP', subLabel: 'Service Truck' });
  notOk(displays(r.sel).some(d => /300 HP/.test(d)), 'hp not repeated');
}],

['T13 `7ft x 16` semantic dimensional equivalence', M => {
  const id = M.identityProfile('2021 Cargo Mate 7ft x 16 Enclosed', 'Enclosed Trailer');
  eq(id.dims, [[7, 16]], 'dimension pair parsed');
  eq(M.duplicateVerdict({ family: 'length', canonical: 16 }, id), 'SUPPRESS', '16 == second dim');
  eq(M.duplicateVerdict({ family: 'width', canonical: 84 }, id), 'SUPPRESS', '7ft == 84in width');
  eq(M.duplicateVerdict({ family: 'length', canonical: 20 }, id), 'KEEP', 'CONTROL: different length');
  eq(M.duplicateVerdict({ family: 'width', canonical: 102 }, id), 'KEEP', 'CONTROL: different width');
  eq(M.identityProfile("7' x 16'", '').dims, [[7, 16]], "7' x 16'");
  eq(M.identityProfile('7 x 16', '').dims, [[7, 16]], '7 x 16');
  eq(M.identityProfile('7ft x 16ft', '').dims, [[7, 16]], '7ft x 16ft');
}],

['T14 4WD / Four-Wheel Drive equivalence', M => {
  eq(M.parseDrive('4WD'), '4x4', '4WD');
  eq(M.parseDrive('4wd'), '4x4', '4wd');
  eq(M.parseDrive('4x4'), '4x4', '4x4');
  eq(M.parseDrive('Four-Wheel Drive'), '4x4', 'Four-Wheel Drive');
  eq(M.parseDrive('Four Wheel Drive'), '4x4', 'Four Wheel Drive');
  eq(M.parseDrive('4x4 (Part Time)'), '4x4', 'parenthetical stripped');
  eq(M.parseDrive('2WD'), '4x2', 'CONTROL: 2WD is a different canonical');
  eq(M.parseDrive('AWD'), 'AWD', 'CONTROL: AWD is a different canonical');
  ['4WD', 'Four-Wheel Drive', '4x4'].forEach(t => {
    const id = M.identityProfile('2015 Ford F-550 ' + t, 'Service Truck');
    eq(M.duplicateVerdict({ family: 'drivetrain', canonical: '4x4' }, id), 'SUPPRESS', 'title ' + t);
  });
}],

['T15 engine identity duplicate handling', M => {
  const id = M.identityProfile('2015 Freightliner M2 Cummins ISB 6.7L', 'Box Truck');
  eq(M.duplicateVerdict({ family: 'engine', canonical: 'Cummins ISB 6.7L' }, id), 'SUPPRESS', 'exact');
  eq(M.duplicateVerdict({ family: 'engine', canonical: 'Cummins ISB 6.7L Diesel' }, id), 'SUPPRESS',
     'generic token "diesel" ignored');
  eq(M.duplicateVerdict({ family: 'engine', canonical: 'Cummins ISL 8.9L' }, id), 'KEEP',
     'CONTROL: different engine survives');
  eq(M.engineTokens('Cummins ISB 6.7L I6 Diesel'), ['cummins', 'isb', '6.7l'], 'generic tokens dropped');
}],

['T16 DT466 and DT466E are NOT automatically the same engine', M => {
  const idE = M.identityProfile('2004 International 4300 DT466E 7.6L Diesel', 'Dump Truck');
  eq(M.duplicateVerdict({ family: 'engine', canonical: 'DT466' }, idE), 'KEEP',
     'governed DT466 is NOT suppressed by a DT466E title');
  const idB = M.identityProfile('2004 International 4300 DT466 7.6L Diesel', 'Dump Truck');
  eq(M.duplicateVerdict({ family: 'engine', canonical: 'DT466E' }, idB), 'KEEP',
     'governed DT466E is NOT suppressed by a DT466 title');
  eq(M.duplicateVerdict({ family: 'engine', canonical: 'DT466' }, idB), 'SUPPRESS',
     'CONTROL: DT466 IS suppressed by a DT466 title');
  eq(M.duplicateVerdict({ family: 'engine', canonical: 'DT466E' }, idE), 'SUPPRESS',
     'CONTROL: DT466E IS suppressed by a DT466E title');
}],

['T17 formatter does not mutate canonical truth', M => {
  const canonical = M.VOCAB.gvwr_class.parse('Class 4: 14,001 - 16,000 lb');
  eq(canonical, { cls: 4 }, 'object canonical');
  const before = JSON.stringify(canonical);
  eq(M.formatFact('gvwr_class', canonical), 'CLASS 4', 'display');
  eq(JSON.stringify(canonical), before, 'canonical unchanged after format');
  notOk(Object.isFrozen(canonical), "the CALLER's canonical is not frozen — a copy is");
  const mutating = { cls: 4 };
  const saved = M.FORMAT.gvwr_class;
  try {
    M.FORMAT.gvwr_class = function (c) { try { c.cls = 99; } catch (e) {} return 'CLASS ' + c.cls; };
    M.formatFact('gvwr_class', mutating);
    eq(mutating.cls, 4, 'caller object untouched');
  } finally { M.FORMAT.gvwr_class = saved; }
  eq(M.formatFact('mileage', 184014), '184K MI', 'mileage fmt');
  eq(M.formatFact('mileage', 184014), M.formatFact('mileage', 184014), 'repeatable');
}],

['T18 GUARDRAIL — governed/column disagreement HOLDS', M => {
  const card = payload({ category: 'Trucks', subcategory: 'Box Truck',
    fuel: 'Gasoline', governed_facts: { fuel: 'Propane' } });
  const r = run(M, card, { title: 'x', subLabel: 'Box Truck' });
  eq(r.gc.candidates, [], 'held');
  ok(r.gc.rejected.some(x => x.key === 'fuel' && x.reason === 'HOLD column/governed disagree'), 'reason');
  const ctl = payload({ category: 'Trucks', subcategory: 'Box Truck',
    fuel: 'Propane', governed_facts: { fuel: 'Propane' } });
  eq(run(M, ctl, { title: 'x', subLabel: 'Box Truck' }).gc.candidates.map(c => c.key), ['fuel'],
     'CONTROL POSITIVE: agreeing column releases the same fact');
}],

['T19 GUARDRAIL — blank mirror column HOLDS', M => {
  ['', '   ', null].forEach(blank => {
    const card = payload({ category: 'Trucks', subcategory: 'Box Truck',
      engine: blank, governed_facts: { engine: 'Cummins ISB 6.7L' } });
    const r = run(M, card, { title: 'x', subLabel: 'Box Truck' });
    eq(r.gc.candidates, [], 'held for blank ' + JSON.stringify(blank));
    ok(r.gc.rejected.some(x => x.key === 'engine' && x.reason === 'HOLD column blank'),
       'reason for ' + JSON.stringify(blank));
  });
  const ctl = payload({ category: 'Trucks', subcategory: 'Box Truck',
    engine: 'Cummins ISB 6.7L', governed_facts: { engine: 'Cummins ISB 6.7L' } });
  eq(run(M, ctl, { title: 'x', subLabel: 'Box Truck' }).gc.candidates.map(c => c.key), ['engine'],
     'CONTROL POSITIVE');
}],

['T20 GUARDRAIL — mirror column absent from the card payload HOLDS', M => {
  const card = { category: 'Trucks', subcategory: 'Box Truck', mileage: null, hours: null,
    engine: null, horsepower: null, fuel: null,
    governed_facts: { transmission: 'Allison 2500 RDS', drivetrain: '4x2', gvwr_class: 'Class 4: 14,001 lb' } };
  const r = run(M, card, { title: 'x', subLabel: 'Box Truck' });
  eq(r.gc.candidates, [], 'all three held');
  ['transmission', 'drivetrain', 'gvwr_class'].forEach(k =>
    ok(r.gc.rejected.some(x => x.key === k && x.reason === 'HOLD mirror column not in card payload'),
       'reason for ' + k));
  const wide = Object.assign({}, card, { transmission: 'Allison 2500 RDS', drivetrain: '4x2',
    gvwr_class: 'Class 4: 14,001 lb' });
  eq(run(M, wide, { title: 'x', subLabel: 'Box Truck' }).gc.candidates.map(c => c.key),
     ['transmission', 'drivetrain', 'gvwr_class'],
     'CONTROL POSITIVE (fixture only — the production payload is NOT broadened)');
}],

['T21 GUARDRAIL removal is a ONE-CALL-SITE change (static)', M => {
  const text = fs.readFileSync(M.__srcPath, 'utf8');
  const lines = text.split('\n');
  const calls = lines.map((l, i) => ({ n: i + 1, l }))
    .filter(x => /TEMP_columnAgreementGuardrail\s*\(/.test(x.l) && !/^\s*function\s/.test(x.l));
  eq(calls.length, 1, 'exactly one call site (found lines ' + calls.map(c => c.n).join(',') + ')');
  const decl = lines.findIndex(l => /^function TEMP_columnAgreementGuardrail/.test(l)) + 1;
  ok(decl > 0, 'guardrail declared once at line ' + decl);
  const gcStart = lines.findIndex(l => /^function governedCandidates/.test(l)) + 1;
  const gcEnd = lines.findIndex((l, i) => i > gcStart && /^}/.test(l)) + 1;
  ok(calls[0].n > gcStart && calls[0].n < gcEnd,
     'the one call site (line ' + calls[0].n + ') is inside governedCandidates (' + gcStart + '–' + gcEnd + ')');
  const sbf = text.slice(text.indexOf('function selectBestFacts'));
  notOk(/TEMP_/.test(sbf), 'selectBestFacts never references TEMP_*');
  notOk(/TEMP_/.test(text.slice(text.indexOf('function duplicateVerdict'), text.indexOf('function selectBestFacts'))),
     'duplicateVerdict never references TEMP_*');
  notOk(/TEMP_/.test(text.slice(text.indexOf('function formatFact'), text.indexOf('function identityProfile'))),
     'formatFact never references TEMP_*');
}],

['T22 GUARDRAIL removal proof — delete it, selectBestFacts is unchanged (behavioural)', M => {
    const res = removeGuardrail(M.__srcPath);
  ok(res.callSiteLinesRemoved <= 2, 'call-site edit is <= 2 lines, got ' + res.callSiteLinesRemoved);
  ok(res.moduleLoads, 'source still loads with the guardrail gone');
  ok(res.selectBestFactsTextIdentical, 'selectBestFacts source text byte-identical after removal');
  ok(res.noTempRemains, 'no TEMP_ identifier survives the removal');
  const cmp = sameSelectorBehaviour(M.__srcPath);
  ok(cmp.cases > 0, 'CONTROL: fixtures actually ran (' + cmp.cases + ')');
  ok(cmp.guardrailActuallyMattered,
     'CONTROL: governedCandidates DID differ with/without the guardrail — the removal was real');
  eq(cmp.mismatches, [],
     'selectBestFacts produced identical output for identical candidate input, guardrail present or gone');
}],

['T23 determinism — same input, 200 repeated runs', M => {
  const card = payload({ category: 'Trucks', subcategory: 'Box Truck', mileage: '184,014',
    engine: '6.0L V8 Gasoline', horsepower: '290', fuel: 'Gasoline',
    governed_facts: { mileage: '184,014', engine: '6.0L V8', horsepower: '290', fuel: 'Gasoline' } });
  const first = JSON.stringify(run(M, card, { title: '2007 Ford F-650', subLabel: 'Box Truck' }));
  for (let i = 0; i < 200; i++) {
    eq(JSON.stringify(run(M, card, { title: '2007 Ford F-650', subLabel: 'Box Truck' })), first, 'run ' + i);
  }
}],

['T24 determinism — across governed_facts key order (all 24 permutations)', M => {
  const base = { mileage: '184,014', engine: '6.0L V8', horsepower: '290', fuel: 'Gasoline' };
  const keys = Object.keys(base);
  const perms = [];
  (function permute(cur, rest) {
    if (!rest.length) { perms.push(cur); return; }
    rest.forEach((k, i) => permute(cur.concat(k), rest.slice(0, i).concat(rest.slice(i + 1))));
  })([], keys);
  eq(perms.length, 24, '4! permutations');
  let first = null;
  perms.forEach(order => {
    const gf = {};
    order.forEach(k => { gf[k] = base[k]; });
    const card = payload({ category: 'Trucks', subcategory: 'Box Truck', mileage: '184,014',
      engine: '6.0L V8 Gasoline', horsepower: '290', fuel: 'Gasoline', governed_facts: gf });
    const out = JSON.stringify(run(M, card, { title: '2007 Ford F-650', subLabel: 'Box Truck' }));
    if (first === null) first = out; else eq(out, first, 'key order ' + order.join(','));
  });
}],

['T25 determinism — across candidate ARRAY order into selectBestFacts', M => {
  const cands = [
    { key: 'mileage', family: 'usage_miles', canonical: 184014 },
    { key: 'engine', family: 'engine', canonical: '6.0L V8' },
    { key: 'horsepower', family: 'power', canonical: 290 },
    { key: 'fuel', family: 'fuel', canonical: 'Gasoline' }
  ];
  const call = c => JSON.stringify(M.selectBestFacts({ category: 'Trucks', subcategory: 'Box Truck',
    title: '2007 Ford F-650', subLabel: 'Box Truck', candidates: c }).picks);
  const ref = call(cands);
  // every permutation, not a random sample
  const perms = [];
  (function permute(cur, rest) {
    if (!rest.length) { perms.push(cur); return; }
    rest.forEach((x, i) => permute(cur.concat([x]), rest.slice(0, i).concat(rest.slice(i + 1))));
  })([], cands);
  eq(perms.length, 24, '4! permutations');
  perms.forEach((p, i) => eq(call(p), ref, 'permutation ' + i));
}],

['T26 fixture: truck whose only governed fact is diesel yields no engine candidate and zero facts', M => {
  const card = { stock: 'FIXTURE-A', category: 'Trucks', subcategory: 'Pickup Truck',
    mileage: '', hours: null, engine: '', horsepower: null, fuel: 'Diesel',
    governed_facts: { fuel: 'Diesel' } };
  const r = run(M, card, { title: '2001 International 4700 LP', subLabel: 'Pickup Truck' });
  notOk(r.gc.candidates.some(c => c.key === 'engine'), 'no engine candidate');
  notOk(r.gc.rejected.some(c => c.key === 'engine'), 'not even a REJECTED engine — the key is absent');
  notOk(Object.prototype.hasOwnProperty.call(card.governed_facts, 'engine'),
        'root cause: governed_facts carries no engine key');
  eq(r.sel.picks, [], 'the row yields zero facts (its only governed fact is diesel)');
  const ctl = Object.assign({}, card, { engine: 'International DT466',
    governed_facts: { fuel: 'Diesel', engine: 'International DT466' } });
  eq(run(M, ctl, { title: '2001 International 4700 LP', subLabel: 'Pickup Truck' })
      .gc.candidates.map(c => c.key), ['engine'], 'CONTROL POSITIVE');
}],

['T27 fixture: governed/column disagreement HOLDS (fuel and engine)', M => {
  const joe = { stock: 'FIXTURE-B', category: 'Farm', subcategory: 'Tractor',
    mileage: '', hours: null, engine: '', horsepower: null, fuel: 'Gasoline',
    governed_facts: { fuel: 'Diesel' } };
  const r = run(M, joe, { title: 'Ford Tractor', subLabel: 'Tractor' });
  eq(r.gc.candidates, [], 'held');
  ok(r.gc.rejected.some(x => x.key === 'fuel' && x.reason === 'HOLD column/governed disagree'), 'reason');
  const joe2 = { stock: 'FIXTURE-C', category: 'Trucks', subcategory: 'Dump Truck',
    mileage: '302827', hours: null, engine: 'International DT466E 7.6L Diesel',
    horsepower: null, fuel: 'Diesel',
    governed_facts: { engine: 'International 7.636371824L Diesel' } };
  const r2 = run(M, joe2, { title: '2004 International 4400', subLabel: 'Dump Truck' });
  ok(r2.gc.rejected.some(x => x.key === 'engine' && x.reason === 'HOLD column/governed disagree'),
     'engine disagreement held');
  eq(r2.gc.candidates, [], 'nothing released');
}],

['T28 governed_facts delivered as a JSON STRING behaves identically', M => {
  const gf = { mileage: '184,014', engine: '6.0L V8' };
  const a = payload({ category: 'Trucks', subcategory: 'Box Truck', mileage: '184,014',
    engine: '6.0L V8 Gasoline', governed_facts: gf });
  const b = payload({ category: 'Trucks', subcategory: 'Box Truck', mileage: '184,014',
    engine: '6.0L V8 Gasoline', governed_facts: JSON.stringify(gf) });
  eq(JSON.stringify(run(M, b, { title: 'x', subLabel: 'y' })),
     JSON.stringify(run(M, a, { title: 'x', subLabel: 'y' })), 'string == object');
  const bad = payload({ category: 'Trucks', subcategory: 'Box Truck', governed_facts: '{not json' });
  eq(run(M, bad, { title: 'x', subLabel: 'y' }).gc.candidates, [], 'unparseable → no candidates');
}],

['T29 REGRESSION — a governed value naming an Object.prototype member', M => {
  eq(M.parseFuel('constructor'), null, 'parseFuel("constructor") must not return Object');
  eq(M.parseFuel('__proto__'), null, 'parseFuel("__proto__") must not return Object.prototype');
  eq(M.formatFact('constructor', {}), '', 'formatFact("constructor") must not reach Object.prototype');
  eq(M.profileOf('Trucks', 'constructor'),
     ['mileage','engine','gvwr_class','transmission','drivetrain','horsepower','fuel'],
     'profileOf must not treat "constructor" as a mower');
  const card = payload({ category: 'Trucks', subcategory: 'Box Truck', fuel: 'constructor',
    governed_facts: { fuel: 'constructor' } });
  const r = run(M, card, { title: 'x', subLabel: 'y' });
  notOk(displays(r.sel).some(d => /native code|function/.test(d)), 'no source code leaks into a pill');
  eq(M.parseFuel('gasoline'), 'Gasoline', 'CONTROL: real lookups still work');
  eq(M.formatFact('mileage', 90000), '90K MI', 'CONTROL: real formatters still work');
}],

['T30 REGRESSION — a generic-only engine designation is filler and re-admits diesel', M => {
  ['Diesel', 'Diesel Engine', 'Turbo Diesel', 'V8'].forEach(v => {
    const card = payload({ category: 'Trucks', subcategory: 'Box Truck', engine: v,
      governed_facts: { engine: v } });
    const r = run(M, card, { title: '2015 Freightliner M2', subLabel: 'Box Truck' });
    eq(r.gc.candidates, [], 'no candidate for generic engine ' + JSON.stringify(v));
    notOk(displays(r.sel).some(d => /diesel/i.test(d)), 'no diesel pill via engine for ' + v);
  });
  const ctl = payload({ category: 'Trucks', subcategory: 'Box Truck', engine: 'Cummins ISB 6.7L Diesel',
    governed_facts: { engine: 'Cummins ISB 6.7L Diesel' } });
  eq(run(M, ctl, { title: 'x', subLabel: 'y' }).gc.candidates.map(c => c.key), ['engine'],
     'CONTROL POSITIVE: a real designation carrying a generic token still survives');
}],

['T31 maxFacts is an integer cap', M => {
  const cands = [
    { key: 'mileage', family: 'usage_miles', canonical: 90000 },
    { key: 'engine', family: 'engine', canonical: 'Cummins ISB' },
    { key: 'fuel', family: 'fuel', canonical: 'Gasoline' }
  ];
  const at = n => M.selectBestFacts({ category: 'Trucks', subcategory: 'Box Truck',
    title: 'x', subLabel: 'y', candidates: cands, maxFacts: n }).picks.length;
  eq(at(0), 0, 'maxFacts 0');
  eq(at(1), 1, 'maxFacts 1');
  eq(at(2), 2, 'maxFacts 2');
  eq(at(99), 2, 'maxFacts above INFO_CAP is clamped');
  eq(at(-1), 0, 'negative clamped to 0');
  eq(at(undefined), 2, 'default = INFO_CAP');
  eq(at(1.5), 1, 'fractional cap floors (inherited source yields 2)');
}],

['T32 no pill is ever synthesised — every display traces to a governed value', M => {
  const card = payload({ category: 'Trucks', subcategory: 'Box Truck', mileage: '184,014',
    engine: '6.0L V8 Gasoline', governed_facts: { mileage: '184,014', engine: '6.0L V8' } });
  const r = run(M, card, { title: '2007 Ford F-650', subLabel: 'Box Truck' });
  r.sel.picks.forEach(p => {
    ok(Object.prototype.hasOwnProperty.call(card.governed_facts, p.key), p.key + ' came from governed_facts');
    ok(r.gc.candidates.some(c => c.key === p.key), p.key + ' passed through governedCandidates');
  });
  eq(displays(r.sel), ['184K MI', '6.0L V8'], 'exact displays');
}]

];


// ── T33: the generated CJS mirror (the executing artifact) behaves exactly like the source ──
TESTS.push(['T33 generated card-facts.generated.js matches the source on every fixture', M => {
  const G = require('../card-facts.generated.js');
  const fixtures = FIXTURES.concat([
    { category: 'Trucks', subcategory: 'Pickup Truck', mileage: '', engine: '', fuel: 'constructor', governed_facts: { fuel: 'constructor' } },
    { category: 'Trucks', subcategory: 'Box Truck', mileage: '130700', engine: 'V8 Diesel', fuel: 'Diesel', governed_facts: { mileage: '130700', engine: 'V8 Diesel' } }
  ]);
  fixtures.forEach((f, i) => {
    const a = M.governedCandidates(f), b = G.governedCandidates(f);
    eq(b, a, 'governedCandidates fixture ' + i);
    const input = { category: f.category, subcategory: f.subcategory, title: f.title, subLabel: f.subLabel, candidates: a.candidates };
    eq(G.selectBestFacts(input), M.selectBestFacts(input), 'selectBestFacts fixture ' + i);
    eq(G.buildCardChips(f), M.buildCardChips(f), 'buildCardChips fixture ' + i);
  });
}]);

// ── T34-T41: GOVERNED COHORT PILOT (forklift). Static fixtures only — nothing below
//    reads the database or a production census. ──────────────────────────────────
// A cohort card as a card-rendering request delivers it.
// usage-display legitimately warns on unmapped subcategories; the fixtures below use some
// on purpose, so the warning is captured rather than printed.
function quiet(fn) { const w = console.warn; console.warn = () => {}; try { return fn(); } finally { console.warn = w; } }
function fork(extra) {
  return payload(Object.assign({ category: 'Construction', subcategory: 'Forklift', condition: 'Used' }, extra));
}
// The legacy reference: the SAME source with the cohort predicate forced false, so the
// cohort branch can never be taken. Any fixture whose chips differ between M and LEGACY
// is, by construction, a fixture the cohort branch changed.
const LEGACY = loadSource({
  file: SRC,
  transform: t => t.replace('return gHas(GOVERNED_COHORT_SUBCATEGORIES, sub);', 'return false;')
});
// The browser IIFE mirror, loaded exactly as a page loads it.
function loadBrowserMirror() {
  const win = { UsageDisplay: { showMileage: usage.showMileage, showHours: usage.showHours } };
  const ctx = { window: win, globalThis: win, console: { warn: () => {}, log: () => {}, error: () => {} } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'js', 'card-facts.browser.js'), 'utf8'), ctx);
  return win.CardFacts;
}

TESTS.push(['T34 cohort forklift: governed picks replace the legacy emitters (HRS + the Propane gain)', M => {
  // (a) the Propane gain: no usable hours column, governed fuel agrees with the column
  const propane = fork({ fuel: 'Propane', governed_facts: { fuel: 'Propane' } });
  eq(M.buildCardChips(propane, { title: '2014 Hyster S60FT' }), ['Propane'], 'governed fuel becomes a pill');
  eq(LEGACY.buildCardChips(propane, { title: '2014 Hyster S60FT' }), [], 'CONTROL: legacy emitted nothing here');
  // (b) HRS formatting — the governed formatter, not the legacy ' hrs' suffix
  const hrs = fork({ hours: '4,173', fuel: 'Diesel', governed_facts: { fuel: 'Diesel', hours: '4,173' } });
  eq(M.buildCardChips(hrs, { title: '2015 Moffett M8 55.4' }), ['4,173 HRS'], 'governed HRS');
  eq(LEGACY.buildCardChips(hrs, { title: '2015 Moffett M8 55.4' }), ['4,173 hrs'], 'CONTROL: legacy lowercase hrs');
  // (c) comma-less governed hours vs a comma-bearing column: gNum agrees, both format the same
  const comma = fork({ hours: '2,333', fuel: 'Diesel', governed_facts: { fuel: 'Diesel', hours: '2333' } });
  eq(M.buildCardChips(comma, { title: '2006 Moffett M50P' }), ['2,333 HRS'], 'gNum comparison, one format');
}]);

TESTS.push(['T35 NEW is OUTSIDE the cohort cap (M3) — three chips, two informational', M => {
  const card = fork({ condition: 'New', hours: '1,000', fuel: 'Propane',
    governed_facts: { hours: '1,000', fuel: 'Propane' } });
  eq(M.buildCardChips(card, { title: '2026 Hyster S60FT' }), ['NEW', '1,000 HRS', 'Propane'], 'NEW outside the cap');
  eq(M.INFO_CAP, 2, 'the cap itself is still 2');
  // CONTROL: same card, not new → exactly the two informational pills
  const used = fork({ condition: 'Used', hours: '1,000', fuel: 'Propane',
    governed_facts: { hours: '1,000', fuel: 'Propane' } });
  eq(M.buildCardChips(used, { title: '2026 Hyster S60FT' }), ['1,000 HRS', 'Propane'], 'control: no NEW');
}]);

TESTS.push(['T36 every NON-cohort subcategory is byte-identical to the legacy path', M => quiet(() => {
  const cases = [
    ['truck',            payload({ category: 'Trucks', subcategory: 'Box Truck', condition: 'Used', mileage: '184,014', engine: '6.0L V8 Gasoline', fuel: 'Gasoline', governed_facts: { mileage: '184,014', engine: '6.0L V8', fuel: 'Gasoline' } })],
    ['tractor',          payload({ category: 'Farm', subcategory: 'Tractor', condition: 'Used', hours: '2,628', horsepower: '74', governed_facts: { hours: '2,628', horsepower: '74' } })],
    ['trailer',          payload({ category: 'Trailers', subcategory: 'Dump Trailer', condition: 'New', governed_facts: { gvwr_lb: '14000' } })],
    ['TELEHANDLER',      payload({ category: 'Construction', subcategory: 'Telehandler', condition: 'Used', hours: '3,100', fuel: 'Propane', governed_facts: { hours: '3,100', fuel: 'Propane' } })],
    ['blank subcategory',payload({ category: 'Construction', subcategory: '', condition: 'Used', hours: '900', governed_facts: { hours: '900' } })],
    ['null subcategory', payload({ category: 'Trucks', subcategory: null, condition: 'Used', mileage: '90000', governed_facts: { mileage: '90000' } })],
    ['mower',            payload({ category: 'Landscape', subcategory: 'Zero Turn Mower', condition: 'Used', hours: '402', fuel: 'Gasoline', governed_facts: { hours: '402', fuel: 'Gasoline' } })],
  ];
  let anyNonEmpty = 0;
  cases.forEach(([label, card]) => {
    const withTitle = M.buildCardChips(card, { title: 'T', searchPills: true });
    const legacy    = LEGACY.buildCardChips(card, { title: 'T', searchPills: true });
    eq(withTitle, legacy, label + ' must equal the legacy path');
    eq(M.buildCardChips(card), LEGACY.buildCardChips(card), label + ' (no opts) must equal the legacy path');
    if (legacy.length) anyNonEmpty++;
  });
  ok(anyNonEmpty >= 4, 'CONTROL: the comparison is not vacuous — ' + anyNonEmpty + ' cases emit pills');
  notOk(M.inGovernedCohort({ subcategory: 'Telehandler' }), 'telehandler is NOT adjudicated into the cohort');
  ok(M.inGovernedCohort({ subcategory: '  FORKLIFT ' }), 'CONTROL: forklift is, case- and space-insensitively');
})]);

TESTS.push(['T37 search_pills wins over the cohort path, with NEW inside its 3-slot limit (L2)', M => {
  const card = fork({ condition: 'New', hours: '4,173', fuel: 'Propane',
    governed_facts: { hours: '4,173', fuel: 'Propane' },
    search_pills: ['Side Shift', 'Triple Mast', 'Cab Heat'] });
  eq(M.buildCardChips(card, { title: 'x', searchPills: true }),
     ['NEW', 'Side Shift', 'Triple Mast'], 'search_pills branch, NEW inside the 3 slots');
  // CONTROL: the same card with the branch not enabled falls to the cohort path
  eq(M.buildCardChips(card, { title: 'x' }), ['NEW', '4,173 HRS', 'Propane'], 'control: cohort path');
}]);

TESTS.push(['T38 opts.title drives duplicate suppression; omitting it must not throw', M => {
  const card = fork({ horsepower: '74', governed_facts: { horsepower: '74' } });
  eq(M.buildCardChips(card, { title: '2016 Toyota 74hp' }), [], 'title duplicates the fact → suppressed');
  eq(M.buildCardChips(card, { title: '2016 Toyota 8FDU30' }), ['74 HP'], 'CONTROL: unrelated title → pill shows');
  eq(M.buildCardChips(card, {}), ['74 HP'], 'opts without title: no throw, no suppression');
  eq(M.buildCardChips(card), ['74 HP'], 'no opts at all: no throw, no suppression');
  eq(M.buildCardChips(card, { title: null }), ['74 HP'], 'null title: no throw');
}]);

TESTS.push(['T39 the browser mirror MERGES caller opts onto { searchPills: true }', M => {
  const B = loadBrowserMirror();
  const card = fork({ horsepower: '74', governed_facts: { horsepower: '74' } });
  eq(B.buildCardChips(card, { title: '2016 Toyota 74hp' }), [], 'caller title reached the mirror');
  eq(B.buildCardChips(card, { title: '2016 Toyota 8FDU30' }), ['74 HP'], 'CONTROL: unrelated title');
  eq(B.buildCardChips(card), ['74 HP'], 'no opts: still works');
  // searchPills must SURVIVE the merge — it is not overwritten by caller opts
  const sp = fork({ governed_facts: { hours: '900' }, hours: '900', search_pills: ['Side Shift'] });
  eq(B.buildCardChips(sp, { title: 'x' }), ['Side Shift'], 'searchPills default survives the merge');
  // and the mirror agrees with the source on every cohort fixture
  [card, sp, fork({ fuel: 'Propane', governed_facts: { fuel: 'Propane' } })].forEach((f, i) =>
    eq(B.buildCardChips(f, { title: 'x' }), M.buildCardChips(f, { title: 'x', searchPills: true }), 'mirror parity ' + i));
}]);

TESTS.push(['T40 cohort membership is an OWN-property lookup (no Object.prototype walk)', M => quiet(() => {
  ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf'].forEach(k => {
    notOk(M.inGovernedCohort({ subcategory: k }), k + ' must not be in the cohort');
    const card = payload({ category: 'Trucks', subcategory: k, condition: 'Used', mileage: '90000',
      governed_facts: { mileage: '90000' } });
    eq(M.buildCardChips(card), LEGACY.buildCardChips(card), k + ' takes the legacy path');
  });
  eq(Object.keys(M.GOVERNED_COHORT_SUBCATEGORIES), ['forklift'], 'the table is exactly one adjudicated key');
  // the table carries no stock / dealer / VIN term
  notOk(/stock|dealer|vin/i.test(JSON.stringify(M.GOVERNED_COHORT_SUBCATEGORIES)), 'table is product-rational');
})]);

TESTS.push(['T41 M1 — no fallback to the legacy emitters inside the cohort', M => {
  // rich legacy columns, empty governed_facts: the cohort card shows NO informational pill
  const card = fork({ hours: '5,000', fuel: 'Propane', horsepower: '90', governed_facts: {} });
  eq(M.buildCardChips(card, { title: 'x' }), [], 'no governed pick → no pill');
  eq(LEGACY.buildCardChips(card, { title: 'x' }), ['90 HP', '5,000 hrs'], 'CONTROL: legacy would have emitted two');
  // NEW still renders on a cohort card with no governed pick
  const isNew = fork({ condition: 'New', hours: '5,000', governed_facts: {} });
  eq(M.buildCardChips(isNew, { title: 'x' }), ['NEW'], 'NEW is a status badge, not an informational pill');
  // a governed value the guardrail HOLDS does not fall back either
  const held = fork({ hours: '5,000', governed_facts: { hours: '9,999' } });
  eq(M.buildCardChips(held, { title: 'x' }), [], 'HOLD → no pill, no fallback');
}]);

// ── runner ───────────────────────────────────────────────────────────────────
const M = loadSource({ file: SRC });
M.__srcPath = SRC;
let pass = 0, fail = 0;
TESTS.forEach(([name, fn]) => {
  try { fn(M); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ FAIL: ' + name + '\n      ' + e.message); }
});
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
