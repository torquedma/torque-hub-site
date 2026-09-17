const VPIC_URL = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/';

// "Other Engine Info" comes back like "560 Torque" — extract the number
function extractTorque(raw) {
  if (!raw) return null;
  const match = String(raw).match(/(\d{2,4})\s*(?:lb|torque|ft)/i);
  return match ? match[1] : null;
}

// 2026-09-13 RC-7 — ABSTAIN ON RANGES.
// vPIC publishes engine output as a PAIR: "Engine Brake (hp) From" and
// "Engine Brake (hp) To". Reading only From and writing it to the flat
// horsepower column published the FLOOR of a range as though it were the
// unit's rating. Measured 2026-09-13: 8 buyer-live rows affected, worst
// case a 2017 Kenworth K270 and a 2018 Peterbilt 337 shown at 200 HP
// against a vPIC range of 200-360 — understating the possible rating by
// 160 HP. Six of the eight were heavy trucks, where the figure matters most.
//
// R30 (Joe's closeout): NORMALIZATION MUST NOT REMOVE UNCERTAINTY. Where
// vPIC gives a range we do not manufacture a single number. We abstain,
// and the column stays empty for a human or a dealer feed to fill.
// A single rating (To empty, or To equal to From) is still returned.
//
// NOT a range-rendering change: emitting "235-334 HP" into the flat column
// would introduce a value shape whose consumers (DX generator, VDP spec
// table, anything parsing the number) are NOT established. Revisit only
// after those are verified.
function hpSingleRating(from, to) {
  if (!from) return null;
  if (!to) return from;
  if (String(from).trim() === String(to).trim()) return from;
  return null;   // genuine range -> abstain
}

// Returns null on invalid VIN or API failure (best-effort — never blocks DX generation)
// VIN validation: exactly 17 chars, alphanumeric, no I/O/Q. Single definition shared with the
// sync receiver's existing-row VIN identity guard (2026-09-16) so both use the same rule.
function isValidVin(vin) {
  if (!vin) return false;
  const clean = String(vin).trim().toUpperCase();
  return clean.length === 17 && !/[IOQ]/.test(clean) && /^[A-Z0-9]+$/.test(clean);
}

async function decodeVin(vin) {
  if (!vin) return null;
  const clean = String(vin).trim().toUpperCase();
  if (!isValidVin(clean)) return null;

  let data;
  try {
    const res = await fetch(VPIC_URL + clean + '?format=json');
    if (!res.ok) return null;
    data = await res.json();
  } catch (e) {
    return null;
  }
  const results = data && data.Results;
  if (!Array.isArray(results)) return null;

  // Flatten to { Variable: Value }
  const m = results.reduce((acc, r) => { acc[r.Variable] = r.Value; return acc; }, {});

  // Treat empty / sentinel / whitespace values as absent
  const val = (key) => {
    const raw = m[key];
    if (raw == null) return null;
    const v = String(raw).trim();
    if (!v || ['Not Applicable', 'Not Available', 'N/A', '0'].includes(v)) return null;
    return v;
  };

  return {
    engineManufacturer: val('Engine Manufacturer'),
    displacementL:      val('Displacement (L)'),
    fuelTypePrimary:    val('Fuel Type - Primary'),
    gvwrClass:          val('Gross Vehicle Weight Rating From'),
    bodyClass:          val('Body Class'),
    driveType:          val('Drive Type'),
    horsepower:         hpSingleRating(val('Engine Brake (hp) From'), val('Engine Brake (hp) To')),
    torque:             extractTorque(val('Other Engine Info')),
  };
}

module.exports = { decodeVin, isValidVin };
