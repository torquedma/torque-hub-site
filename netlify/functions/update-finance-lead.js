const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  // CORS: explicit single-origin allowlist. hub.torquedma.com is the ONLY approved
  // browser origin for this endpoint. Dealer origins (davenportmotors.net,
  // fatdaddystrucksales, wilson-trailer-sales, autoconnection210, etc.) are
  // DELIBERATELY NOT included — dealer sites route finance leads through hub.
  // Server-to-server callers (no Origin header) are still processed; browser
  // callers from any non-listed origin reach the handler but do not receive an
  // Allow-Origin echo, which fails the browser preflight/response check.
  const ALLOWED_ORIGIN = 'https://hub.torquedma.com';
  const reqOrigin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const headers = {
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  if (reqOrigin === ALLOWED_ORIGIN) {
    headers['Access-Control-Allow-Origin'] = ALLOWED_ORIGIN;
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  let payload;
  try { payload = JSON.parse(event.body); }
  catch (e) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const lead_id = payload.lead_id;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!lead_id || !UUID_RE.test(lead_id)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'valid lead_id required' }) };
  }

  // Strict allowlist — only these 7 business-profile columns can be written by
  // this endpoint. Any other key in the payload is silently ignored.
  const allowed = ['business_type','time_in_business','business_street','business_street2','business_city','business_state','business_zip'];
  const updateObj = {};
  for (const key of allowed) {
    if (key in payload) updateObj[key] = payload[key] || null;
  }
  if (Object.keys(updateObj).length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'no business fields to update' }) };
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const { data, error } = await supabase
    .from('leads')
    .update(updateObj)
    .eq('id', lead_id)
    .select('id')
    .single();

  if (error) {
    // PGRST116 = .single() matched 0 rows — bad lead_id, not a server error.
    if (error.code === 'PGRST116') {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'lead not found' }) };
    }
    console.error('update-finance-lead error:', error.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to update lead' }) };
  }

  return { statusCode: 200, headers, body: JSON.stringify({ success: true, lead_id: data.id }) };
};
