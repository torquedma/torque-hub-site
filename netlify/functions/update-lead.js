const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  // '*' covers hub.torquedma.com. When dealer sites post to this function,
  // switch to an explicit allowlist of their origins.
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
    console.error('update-lead error:', error.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to update lead' }) };
  }

  return { statusCode: 200, headers, body: JSON.stringify({ success: true, lead_id: data.id }) };
};
