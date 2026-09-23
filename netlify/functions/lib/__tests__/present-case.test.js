'use strict';

// HGR DX 6A — presentation casing tests (Foreman GO 2026-09-18).
// node:test + node:assert/strict, no external deps, no network.
//
// Maps to the Foreman's conditions:
//   T1 all-caps prose → Title Case presentation
//   T2 mixed-case source → byte-identical
//   T3 codes/units/dimensions/tire sizes/capacities survive unchanged
//   T4 content equality apart from case (also the runtime guard)
//   T5 normalizedLine untouched; displayLine is additive
//   T6 bullet-only INSUFFICIENT_EVIDENCE refusal unchanged
//   T8 Stock # line unchanged (parked debt: preserved, not fixed)
//   T9 no Trucks/Farm/Construction/Landscape/Other behavior change
//   T10 Impex/Allied/free_form formats byte-identical pre/post
// T7 (no locked Unit rewritten) and T11 (deployed-artifact fingerprint) are
// production/deploy-phase checks and are documented in the landing brief.

const test = require('node:test');
const assert = require('node:assert/strict');

const { presentCase, isAllCaps } = require('../present-case');
const { normalizeTrailerSpecs } = require('../trailer-spec-normalizer');

// ── Five real HGR raws inserted by hgr-sync 2026-09-18 06:01Z (as stored in raw_description) ──
const RAW = {
  'HGR-XLH001336': "TRAILERS FOR EVERYTHING AND EVERYTHING FOR TRAILERS\n\nTHIS IS A CLEAN HAULMARK HEAVY DUTY GRIZZLY 7X14 CARGO TRAILER WITH TORSION AXLES, SCREWLESS EXTERIOR, REAR RAMP DOOR, SIDE DOOR, 7’ INSIDE HEIGHT, AND A TRIPLE TUBE TONGUE. IT WAS USED TO HAUL MOTORCYCLES. IT IS SET UP WITH REMOVEABLE WHEEL CHOCKS. IT IS NOT DINGED UP AT ALL. WE HAVE INSTALLED BRAND NEW TIRES BECAUSE OF THE AGE OF THE EXISTING TIRES.\n\n \n\n-FLAT FRONT WITH POLISHED ALUMINUM FRONT CAP\n\n-CAST UPPER FRONT CORNERS\n\n-STAINLESS STEEL VERTICAL CORNERS\n\n-SCREWLESS EXTERIOR\n\n-(1) PIECE ALUMINUM ROOF\n\n-HEAVY DUTY TOP AND BOTTOM TRIM\n\n-24\" STONEGUARD\n\n-ARMOR COATED TONGUE  \n\n-7’ INSIDE HEIGHT\n\n-6’6”  REAR DOOR OPENING HEIGHT\n\n-6’4”\" REAR DOOR OPENING WIDTH\n\n-DEXTER  3500LB EZ LUBE TORSION AXLES WITH 10”X2 ¼” BRAKES ON ALL WHEELS\n\n-POWDERCOAT GREY MODULAR WHEELS WITH CHROME HUB COVERS\n\n-BRAND NEW ST205/75/R15 LOAD RANGE D TRAILER RADIALS\n\n-ARMOR COATED 2\"X 6\" TRIPLE  TUBE TONGUE\n\n-16\" ON CENTER WALL STUDS\n\n-16\" ON CENTER FLOOR CROSSMEMBERS\n\n-16\" ON CENTER ROOF BOWS\n\n-36\" SIDE DOOR WITH FLUSHLOCK\n\n-SPRING ASSIST REAR RAMP DOOR WITH FLAP\n\n-3/8\" STABLEDECK OR EQUIVALENT WALLS\n\n-3/4\" STABLEDECK OR EQUIVALENT FLOOR\n\n-12 VOLT DOME LIGHT WITH SWITCH\n\n-LED CLEARANCE LIGHTS\n\n-LED TAILLIGHTS\n\n-2 5/16\" BALL\n\n-(7)WAY PLUG",
  'HGR-9tf107445': "TRAILERS FOR EVERYTHING AND EVERYTHING FOR TRAILERS\n\n \n\n-5’ INSIDE HEIGHT\n\n-4’6” REAR DOOR OPENING HEIGHT\n\n-49” REAR DOOR OPENING WIDTH\n\n-24\" AERODYNAMIC BULLET FRONT VNOSE\n\n-.030 WHITE EXTERIOR METAL WITH SCREWS AT THE SEAMS ONLY\n\n-(1) PIECE ALUMINUN ROOF\n\n-24\" STONEGUARD\n\n-LIPPERT 3500LB EZ LUBE LEAF SPRING AXLE\n\n-POWDERCOAT SILVER WHEELS WITH CHROME HUB COVERS\n\n-ST205/75/R15 LOAD RANGE C RADIAL TRAILER TIRES\n\n-16\" ON CENTER TUBULAR WALL STUDS\n\n-24\" ON CENTER FLOOR CROSSMEMBERS AND ROOF BOWS\n\n-24” RV SIDE DOOR WITH FLUSHLOCK\n\n-UPGRADED TO MEDIUM DUTY SPRING ASSIST REAR RAMP DOOR\n\n-3/8\" PERFORMAX WALLS\n\n-3/4\" PERFORMAX FLOOR\n\n-12 VOLT DOME LIGHT WITH SWITCH\n\n-SIDEWALL VENTS\n\n-LED TAILLIGHTS\n\n-LED  CLEARANCE LIGHTS\n\n-2\" BALL\n\n-(4)WAY PLUG",
  'HGR-R1240990': "TRAILERS FOR EVERYTHING AND EVERYTHING FOR TRAILERS\n\n \n\n-1/4\" STEEL CONSTRUCTION\n\n-3500LB EZ LUBE LEAF SPRING AXLES WITH BRAKES ON ALL WHEELS\n\n-ST205/75/R15  LOAD RANGE C RADIAL TRAILER TIRES\n\n-POWDERCOAT  TRAILER WHEELS\n\n-82\" BETWEEN FENDERS\n\n-16’ DECK\n\n-14” HIGH  SIDES  WITH ROUND TUBULAR TOP RAIL\n\n-60” SLIDE IN RAMPS\n\n-2\" TREATED PINE DECK\n\n-(3)ROWS OF DECK SCREWS\n\n-2K DROP LEG JACK\n\n-SPARE TIRE MOUNT WITH SPARE\n\n-LED LIGHTING\n\n-(7)WAY PLUG WITH INSULATED WIRING RUN THROUGH GROMMETS WELDED TO THE FRAME(NO HOLES BURNED IN THE FRAME)\n\n-2 5/16 COUPLER",
  'HGR-XSF099743': "TRAILERS FOR EVERYTHING AND EVERYTHING FOR TRAILERS\n\n \n\n-HEAVY-DUTY  TELESCOPING FRONT MOUNT DUMP CYLINDER (MORE POWER TO THE DUMP AND LESS STRESS ON THE MAIN FRAME)\n\n-BLACK IN COLOR\n\n-48\" HIGH SIDES\n\n-16' DECK LENGTH\n\n-77\" BETWEEN THE SIDES\n\n-HEAVY DUTY SWING OPEN REAR DOORS\n\n-TARP KIT\n\n-PAIR OF SIDE MOUNT HEAVY-DUTY RAMPS\n\n-SPARE TIRE MOUNT WITH SPARE\n\n- UPGRADED TO A MORE POWERFUL TELESCOPING DUMP CYLINDER THAT ALSO PROVIDES A HIGHER LIFT THAN CONVENTIONAL SCISSOR LIFTS MAKING IT ALMOST IMPOSSIBLE TO HAVE TOO MUCH FRONT LOAD\n\n-ON BOARD BATTERY CHARGER\n\n-POWER DOWN(YOU DON'T HAVE TO RELY ON GRAVITY TO LOWER YOUR BED)\n\n- 8000LB EZ LUBE LEAF SPRING AXLES\n\n-215/75/R17.5 16 PLY TRAILER TIRES\n\n-ALL RUBBER MOUNTED LIGHTING LED LIGHTING\n\n-12000LB DROP LEG JACK\n\n-2 5/16\" BALL\n\n-(7)WAY PLUG",
  'HGR-3RF091425': "TRAILERS FOR EVERYTHING AND EVERYTHING FOR TRAILERS\n-18' Flat Deck with 2' Dovetail\n- 9990 lb. G.V.W.R\n-Adjustable 2 5/16\" Coupler\n-12k Drop Leg Jack\n-5.2k Ez Lube Leaf Spring Axles with 12\"x2\" Brakes on All Wheels\n-15\" Black Mod Trailer Wheels\n-ST225/75/R15 Load Range D Radial Trailer Tires\n- Stake Pockets\n- Electric Breakaway Kit\n-Heavy Duty Treadplate Steel Fenders\n-24\"x 60\" Heavy Duty Fold Up Ramps\n- 6\" Channel Frame & Full Wrap Tongue\n- 3\" Channel Crossmembers 12\" on Center\n-1/8\" Steel Diamond Plate Flooring\n-2\"x2\"x1/4\" Tube Front Bumper\n- 83\" Wide Deck\n- DOT Approved Flushmount LED Lights\n-7 Way RV Plug\n-Black Paint\n-Tool Tray In Tongue\n-Winch Plate\n-Spare tire mount with spare",
};

test('T1 — all-caps spec lines become Title Case with stopword handling', () => {
  assert.equal(presentCase('FLAT FRONT WITH POLISHED ALUMINUM FRONT CAP'), 'Flat Front with Polished Aluminum Front Cap');
  assert.equal(presentCase('DEXTER 3500LB EZ LUBE TORSION AXLES WITH 10”X2 ¼” BRAKES ON ALL WHEELS'),
    'Dexter 3500LB EZ Lube Torsion Axles with 10”X2 ¼” Brakes on All Wheels');
  assert.equal(presentCase('HEAVY-DUTY TELESCOPING FRONT MOUNT DUMP CYLINDER (MORE POWER TO THE DUMP AND LESS STRESS ON THE MAIN FRAME)'),
    'Heavy-Duty Telescoping Front Mount Dump Cylinder (More Power to the Dump and Less Stress on the Main Frame)');
  assert.equal(presentCase('3/8" STABLEDECK OR EQUIVALENT WALLS'), '3/8" Stabledeck or Equivalent Walls');
  assert.equal(presentCase('UPGRADED TO MEDIUM DUTY SPRING ASSIST REAR RAMP DOOR'), 'Upgraded to Medium Duty Spring Assist Rear Ramp Door');
});

test('T2 — mixed-case source lines are byte-identical', () => {
  for (const s of [
    "18' Flat Deck with 2' Dovetail",
    '9990 lb. G.V.W.R',
    'Adjustable 2 5/16" Coupler',
    '5.2k Ez Lube Leaf Spring Axles with 12"x2" Brakes on All Wheels',
    'DOT Approved Flushmount LED Lights',
    'Cargo / Enclosed Trailer',
    'xyz',
  ]) assert.equal(presentCase(s), s);
  assert.equal(isAllCaps('18\' Flat Deck'), false);
  assert.equal(isAllCaps('2 5/16"'), false); // no letters → not all-caps → untouched
  assert.equal(presentCase('2 5/16"'), '2 5/16"');
});

test('T3 — codes, units, dimensions, tire sizes, capacities, VINs survive unchanged', () => {
  const cases = [
    ['BRAND NEW ST205/75/R15 LOAD RANGE D TRAILER RADIALS', ['ST205/75/R15', ' D ']],
    ['215/75/R17.5 16 PLY TRAILER TIRES', ['215/75/R17.5', '16']],
    ['12000LB DROP LEG JACK', ['12000LB']],
    ['LIPPERT 3500LB EZ LUBE LEAF SPRING AXLE', ['3500LB', 'EZ']],
    ['LED CLEARANCE LIGHTS', ['LED']],
    ['VIN 1ABCD23E4F5678901 GVWR 9990 LB DOT APPROVED', ['VIN', '1ABCD23E4F5678901', 'GVWR', 'LB', 'DOT']],
    ['ARMOR COATED 2"X 6" TRIPLE TUBE TONGUE', ['2"X', '6"']],
    ['24" RV SIDE DOOR WITH FLUSHLOCK', ['24"', 'RV']],
    ['(7)WAY PLUG', ['(7)WAY']],
    ['.030 WHITE EXTERIOR METAL WITH SCREWS AT THE SEAMS ONLY', ['.030']],
    ['2 5/16" BALL', ['2 5/16"']],
  ];
  for (const [line, mustContain] of cases) {
    const out = presentCase(line);
    for (const tok of mustContain) assert.ok(out.includes(tok), `${JSON.stringify(out)} must contain ${JSON.stringify(tok)}`);
  }
  assert.equal(presentCase('VIN 1ABCD23E4F5678901 GVWR 9990 LB DOT APPROVED'), 'VIN 1ABCD23E4F5678901 GVWR 9990 LB DOT Approved');
});

test('T4 — invariant: only letter case changes (every spec line of the five real raws)', () => {
  let lines = 0;
  for (const raw of Object.values(RAW)) {
    for (const l of raw.split(/\r?\n/)) {
      const t = l.replace(/^\s*[-·•]\s*/, '').replace(/\s+/g, ' ').trim();
      if (!t) continue;
      const out = presentCase(t);
      assert.equal(out.toLowerCase(), t.toLowerCase(), `content changed: ${JSON.stringify(t)} -> ${JSON.stringify(out)}`);
      assert.equal(out.length, t.length);
      assert.equal(out.replace(/[A-Za-z]/g, ''), t.replace(/[A-Za-z]/g, ''), 'non-letter bytes must be identical');
      lines++;
    }
  }
  assert.ok(lines > 90, 'corpus exercised: ' + lines);
});

// Local expected map for T5 — intentionally NOT imported from production.
const GOVERNED_HGR_DISPLAY = {
  '(7)WAY PLUG': '7-Way Plug',
  '(4)5000LB DRINGS': '(4) 5,000 LB D-Rings',
};

test('T5 — normalizedLine untouched; displayLine additive; classification unchanged', () => {
  for (const [stock, raw] of Object.entries(RAW)) {
    const n = normalizeTrailerSpecs(raw, 'Trailers');
    assert.equal(n.format, 'hgr_delimited', stock);
    assert.equal(n.handling, 'normalized', stock);
    for (const k of n.keyDetails) {
      // normalizedLine is exactly what normalizeLine produced pre-patch: delimiter stripped, whitespace collapsed
      assert.equal(k.normalizedLine, k.originalLine.replace(/^\s*[-·•]\s*/, '').replace(/\s+/g, ' ').trim(), stock);
      assert.equal(typeof k.displayLine, 'string');
      // Chief-governed HGR display exceptions (2026-09-23): these two EXACT
      // normalizedLine values render their governed display; every other line
      // keeps the case-only contract below, unchanged.
      if (Object.prototype.hasOwnProperty.call(GOVERNED_HGR_DISPLAY, k.normalizedLine)) {
        assert.equal(k.displayLine, GOVERNED_HGR_DISPLAY[k.normalizedLine], stock);
      } else {
        assert.equal(k.displayLine.toLowerCase(), k.normalizedLine.toLowerCase(), stock);
      }
      assert.ok(['high', 'low'].includes(k.confidence));
      assert.equal(typeof k.group, 'string');
    }
  }
  // Mixed-case raw: displayLine === normalizedLine for every line
  const m = normalizeTrailerSpecs(RAW['HGR-3RF091425'], 'Trailers');
  for (const k of m.keyDetails) assert.equal(k.displayLine, k.normalizedLine);
});

test('T6 — bullet-only refusal unchanged (leadProse empty on 4 of 5 raws; XLH has prose)', () => {
  const noProse = ['HGR-9tf107445', 'HGR-R1240990', 'HGR-XSF099743', 'HGR-3RF091425'];
  for (const s of noProse) assert.equal(normalizeTrailerSpecs(RAW[s], 'Trailers').leadProse.length, 0, s);
  assert.ok(normalizeTrailerSpecs(RAW['HGR-XLH001336'], 'Trailers').leadProse.length > 0);
});

test('T6b + T8 — generator: refusal code unchanged; Stock # line still emitted; display casing rendered (model stubbed)', async () => {
  const gen = require('../generate-description.generated');
  // Stub fetch: return a fixed Overview so the Key Details block can be inspected offline.
  const realFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: 'Overview\nStub overview.' }] }) });
  try {
    const unitNoProse = { stock: 'HGR-R1240990', dealer: 'HGR', year: '2024', make: 'Texas Bragg Trailers', model: '16P', category: 'Trailers', subcategory: 'Utility Trailer', trim: 'Utility Trailer', condition: 'Used', raw_description: RAW['HGR-R1240990'] };
    await assert.rejects(() => gen.generateDescription(unitNoProse, 'k'), (e) => e.code === 'INSUFFICIENT_EVIDENCE' && /no factual lead prose/.test(e.message));
    const unitProse = { stock: 'HGR-XLH001336', dealer: 'HGR', year: '2020', make: 'Haulmark', model: 'Grizzly', category: 'Trailers', subcategory: 'Enclosed Trailer', trim: 'Enclosed Trailer', condition: 'Used', raw_description: RAW['HGR-XLH001336'] };
    const out = await gen.generateDescription(unitProse, 'k');
    const text = typeof out === 'string' ? out : (out.description || JSON.stringify(out));
    assert.ok(text.includes('- Stock #: HGR-XLH001336'), 'T8: Stock # line preserved (parked, not fixed)');
    assert.ok(text.includes('- Flat Front with Polished Aluminum Front Cap'), 'display casing rendered');
    assert.ok(text.includes('- LED Clearance Lights'));
    assert.ok(!text.includes('- FLAT FRONT WITH POLISHED ALUMINUM FRONT CAP'), 'all-caps line no longer rendered');
  } finally { global.fetch = realFetch; }
});

test('T9 — non-Trailers categories never reach Stage 1b (no displayLine path)', () => {
  for (const cat of ['Trucks', 'Farm', 'Construction', 'Landscape', 'Other', '', null]) {
    assert.equal(normalizeTrailerSpecs(RAW['HGR-XLH001336'], cat), null, String(cat));
  }
});

test('T10 — Impex / Allied / free_form formats: displayLine equals normalizedLine unless the line is all-caps', () => {
  const impex = 'Quick Highlights:\n- 2019 Model\n- Low Hours\nWhy Choose This Tractor?\nGreat value.';
  const allied = 'Weights & Dimensions\nGVWR: 26,000 lb\nLength: 24 ft';
  const free = 'A clean trailer with new tires and a spare. Ready to go.';
  for (const raw of [impex, allied, free]) {
    const n = normalizeTrailerSpecs(raw, 'Trailers');
    for (const k of (n.keyDetails || [])) {
      if (!isAllCaps(k.normalizedLine)) assert.equal(k.displayLine, k.normalizedLine);
    }
  }
});
