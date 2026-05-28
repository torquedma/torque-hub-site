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

    // Pass 1: dealer-scoped if dealer provided
    if (dealerRaw) {
      const { data: pass1, error: pass1err } = await supabase
        .from('inventory')
        .select('*')
        .eq('dealer', dealerRaw)
        .in('stock', variants)
        .limit(1);
      if (pass1err) throw pass1err;
      if (pass1 && pass1.length) unit = pass1[0];
    }

    // Pass 2: unscoped fallback (only if not found in pass 1, or no dealer was provided)
    if (!unit) {
      const { data: pass2, error: pass2err } = await supabase
        .from('inventory')
        .select('*')
        .in('stock', variants)
        .limit(1);
      if (pass2err) throw pass2err;
      if (pass2 && pass2.length) unit = pass2[0];
    }

    if (!unit) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'not found', stock: stockRaw, dealer: dealerRaw, variants }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify(unit) };
  } catch (e) {
    console.error('vehicle-by-stock error:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
