const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  let payload;
  try { payload = JSON.parse(event.body); }
  catch (e) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { customer_name, customer_phone } = payload;
  if (!customer_name || !customer_phone) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'customer_name and customer_phone are required' }) };
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const { error } = await supabase.from('leads').insert([{
    customer_name:  customer_name.trim(),
    customer_phone: customer_phone.trim(),
    customer_email: payload.customer_email || null,
    stock:          payload.stock_number   || null,
    unit_title:     payload.listing_title  || null,
    dealer_name:    payload.dealer_name    || null,
    source_url:     payload.source_url     || null,
    message:        payload.message        || null,
    credit_score:   payload.credit_score   || null,
    lender:         payload.lender         || null,
    rep:            payload.rep            || null,
    referrer:       payload.referrer       || null,
    source:         payload.source         || 'finance_form',
    status:         'new'
  }]);

  if (error) {
    console.error('submit-lead error:', error.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to save lead' }) };
  }

  return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
};
