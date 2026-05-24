const VPIC_URL = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/';

// "Other Engine Info" comes back like "560 Torque" — extract the number
function extractTorque(raw) {
  if (!raw) return null;
  const match = String(raw).match(/(\d{2,4})\s*(?:lb|torque|ft)/i);
  return match ? match[1] : null;
}

// Returns null on invalid VIN or API failure (best-effort — never blocks DX generation)
async function decodeVin(vin) {
  if (!vin) return null;
  const clean = String(vin).trim().toUpperCase();
  // VIN validation: exactly 17 chars, alphanumeric, no I/O/Q
  if (clean.length !== 17 || /[IOQ]/.test(clean) || !/^[A-Z0-9]+$/.test(clean)) return null;

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
    horsepower:         val('Engine Brake (hp) From'),
    torque:             extractTorque(val('Other Engine Info')),
  };
}

module.exports = { decodeVin };
