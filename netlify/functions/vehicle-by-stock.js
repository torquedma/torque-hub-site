const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=300'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    const params = event.queryStringParameters || {};
    const stockRaw = (params.stock || '').trim();
    const dealerRaw = (params.dealer || '').trim();

    if (!stockRaw) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'stock parameter required' }) };
    }

    // Build stock variants — current rule is only MPX-XXX <-> MPXXXX swap
    const variants = [stockRaw];
    if (/^MPX-/i.test(stockRaw)) {
      variants.push(stockRaw.replace(/^MPX-/i, 'MPX'));
    } else if (/^MPX[^-]/i.test(stockRaw)) {
      variants.push('MPX-' + stockRaw.slice(3));
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    let unit = null;

    // Public projection — read from inventory_public_detail, the SAME governed public
    // view the VDP edge reads. The view enforces status='published' and derives
    // listing_state ('live' | 'sold' | 'departed') once, so this fallback and the SSR
    // path hand the browser an identical, already-derived lifecycle value (2B).
    // The column set below is the view's projection; the browser never receives
    // sold_at or sold_type and never derives lifecycle from `sold`.
    // ★ 2026-09-14 — do NOT restore select('*'). select('*') previously
    //   served internal fields (notes, raw_description, description_source,
    //   dx_locked, sold_type, provenance, etc.) to the public payload.
    //   Withdrawal tombstones in `notes` were reaching buyers.
    const PUBLIC_COLUMNS = 'id, stock, dealer, year, make, model, trim, price, photos, category, subcategory, mileage, engine, horsepower, hours, fuel, condition, transmission, drivetrain, description, sold, vin, buyer_intelligence, contact_phone, contact_location, listing_state';

    // Pass 1: dealer-scoped if dealer provided
    if (dealerRaw) {
      const { data: pass1, error: pass1err } = await supabase
        .from('inventory_public_detail')
        .select(PUBLIC_COLUMNS)
        .eq('dealer', dealerRaw)
        .in('stock', variants)
        .limit(1);
      if (pass1err) throw pass1err;
      if (pass1 && pass1.length) unit = pass1[0];
    }

    // Pass 2: unscoped fallback (only if not found in pass 1, or no dealer was provided)
    if (!unit) {
      const { data: pass2, error: pass2err } = await supabase
        .from('inventory_public_detail')
        .select(PUBLIC_COLUMNS)
        .in('stock', variants)
        .limit(1);
      if (pass2err) throw pass2err;
      if (pass2 && pass2.length) unit = pass2[0];
    }

    if (!unit) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'not found', stock: stockRaw, dealer: dealerRaw, variants }) };
    }

    // 2B FAIL CLOSED: the row exists but its lifecycle authority is absent/invalid
    // (view projection missing or malformed). Never normalize to live; never 404.
    if (unit.listing_state !== 'live' && unit.listing_state !== 'sold' && unit.listing_state !== 'departed') {
      console.error(`vehicle-by-stock invalid lifecycle authority for ${unit.stock}: listing_state=${JSON.stringify(unit.listing_state)}`);
      return { statusCode: 503, headers: { ...headers, 'Cache-Control': 'no-store' }, body: JSON.stringify({ error: 'lifecycle authority unavailable', stock: unit.stock }) };
    }

    let dealerRow = null;
    try {
      const res = await supabase
        .from('dealers')
        .select('name, phone, address')
        .eq('name', unit.dealer)
        .maybeSingle();
      dealerRow = res.data;
    } catch (_) {}
    unit._dealer = {
      phone: unit.contact_phone || dealerRow?.phone || '',
      address: unit.contact_location || dealerRow?.address || ''
    };

    return { statusCode: 200, headers, body: JSON.stringify(unit) };
  } catch (e) {
    console.error('vehicle-by-stock error:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
