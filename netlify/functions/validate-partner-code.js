const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  
  const { partner_code } = JSON.parse(event.body || '{}');
  if (!partner_code) return { statusCode: 400, body: JSON.stringify({ error: 'No partner code provided' }) };

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  
  const { data, error } = await supabase
    .from('partners')
    .select('id, partner_code, name, company, status, type')
    .eq('partner_code', partner_code.toUpperCase().trim())
    .single();

  if (error || !data) return { statusCode: 404, body: JSON.stringify({ error: 'Partner code not found' }) };
  if (data.status !== 'active') return { statusCode: 403, body: JSON.stringify({ error: 'Partner code is ' + data.status }) };

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: data.id, name: data.name, company: data.company, partner_code: data.partner_code, type: data.type })
  };
};
