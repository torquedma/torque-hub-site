const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  let payload;
  try { payload = JSON.parse(event.body); } catch(e) { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { partner_code, partner_id } = payload;
  if (!partner_code || !partner_id) return { statusCode: 400, body: JSON.stringify({ error: 'Missing partner credentials' }) };

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // Verify partner is still active
  const { data: partner, error: pErr } = await supabase
    .from('partners')
    .select('id, status')
    .eq('partner_code', partner_code)
    .eq('id', partner_id)
    .single();

  if (pErr || !partner || partner.status !== 'active') {
    return { statusCode: 403, body: JSON.stringify({ error: 'Invalid or inactive partner' }) };
  }

  const submission = {
    partner_code: partner_code,
    submitted_by_partner_id: partner_id,
    dealer_name: payload.dealer_name || null,
    dealer_contact: payload.dealer_contact || null,
    dealer_phone: payload.dealer_phone || null,
    dealer_email: payload.dealer_email || null,
    dealer_location: payload.dealer_location || null,
    unit_type: payload.unit_type || null,
    year: payload.year || null,
    make: payload.make || null,
    model: payload.model || null,
    price: payload.price || null,
    mileage: payload.mileage || null,
    vin: payload.vin || null,
    engine: payload.engine || null,
    transmission: payload.transmission || null,
    drivetrain: payload.drivetrain || null,
    fuel: payload.fuel || null,
    condition: payload.condition || 'Used',
    description: payload.description || null,
    notes: payload.notes || null,
    photo_urls: payload.photo_urls || null,
    dealer_permission: payload.dealer_permission || false,
    status: 'submitted',
    source_type: payload.source_type || 'partner'
  };

  const { error: iErr } = await supabase.from('inventory_submissions').insert([submission]);
  if (iErr) return { statusCode: 500, body: JSON.stringify({ error: 'Submission failed: ' + iErr.message }) };

  return { statusCode: 200, body: JSON.stringify({ success: true }) };
};
