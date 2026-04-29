const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch(e) { return { statusCode: 400, body: 'Invalid JSON' }; }

  console.log('Webhook payload:', JSON.stringify(body).slice(0, 500));

  const apifyToken = process.env.APIFY_API_TOKEN;

  // Handle both direct dataset ID and Apify webhook payload formats
  let datasetId = body?.defaultDatasetId || body?.eventData?.defaultDatasetId;
  const actorRunId = body?.actorRunId || body?.eventData?.actorRunId;
  const dealerName = body?.dealerName || 'Impex Heavy Metal';

  // If no dataset ID but have run ID, fetch dataset ID from run
  if (!datasetId && actorRunId) {
    console.log('Fetching dataset from run:', actorRunId);
    const runRes = await fetch(`https://api.apify.com/v2/actor-runs/${actorRunId}?token=${apifyToken}`);
    const runData = await runRes.json();
    datasetId = runData?.data?.defaultDatasetId;
    console.log('Got dataset ID from run:', datasetId);
  }

  if (!datasetId) {
    console.error('No dataset ID found in payload:', JSON.stringify(body));
    return { statusCode: 400, body: 'No dataset ID found' };
  }

  const datasetUrl = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apifyToken}&format=json&clean=true&limit=10000`;

  let items;
  try {
    const res = await fetch(datasetUrl);
    if (!res.ok) throw new Error(`Apify fetch failed: ${res.status}`);
    items = await res.json();
  } catch(e) {
    console.error('Failed to fetch dataset:', e.message);
    return { statusCode: 500, body: 'Dataset fetch failed: ' + e.message };
  }

  if (!items || !items.length) {
    return { statusCode: 200, body: JSON.stringify({ synced: 0, message: 'No items in dataset' }) };
  }

  console.log(`Processing ${items.length} listings for ${dealerName}`);

  const dealer = dealerName || (items[0] && items[0].dealer) || 'Unknown Dealer';

  // Get existing inventory for this dealer
  const { data: existing } = await supabase
    .from('inventory')
    .select('stock, id')
    .eq('dealer', dealer)
    .eq('sold', false);

  const existingStocks = new Set((existing || []).map(u => u.stock));
  const incomingStocks = new Set();

  let synced = 0, errors = 0;

  for (const item of items) {
    try {
      const stock = item.stock || (item.listingId ? `IHM${item.listingId}` : null);
      if (!stock) continue;

      incomingStocks.add(stock);

      const photos = Array.isArray(item.photos) ? item.photos : [];

      let mileage = item.mileage || '';
      if (!mileage && item.description) {
        const m = item.description.match(/Mileage[:\s]+([0-9,]+)/i) || item.description.match(/([0-9,]+)\s*[Mm]iles/);
        if (m) mileage = m[1].replace(/,/g, '');
      }

      let engine = item.engine || '';
      if (!engine && item.description) {
        const m = item.description.match(/Engine[:\s•]+([^\n•✔]{5,60})/i);
        if (m) engine = m[1].trim();
      }

      let transmission = item.transmission || '';
      if (!transmission && item.description) {
        const m = item.description.match(/Transmission[:\s•]+([^\n•✔]{5,40})/i);
        if (m) transmission = m[1].trim();
      }

      let drivetrain = item.drivetrain || '';
      if (!drivetrain && item.description) {
        const m = item.description.match(/Drivetrain[:\s•]+([^\n•✔]{3,20})/i)
          || item.description.match(/\b(4WD|RWD|AWD|2WD|4x4|4x2|6x4|6x2)\b/i);
        if (m) drivetrain = m[1].trim();
      }

      const make = (item.make && item.make !== 'undefined') ? item.make : '';
      const model = (item.model && item.model !== 'undefined') ? item.model : '';

      const unit = {
        stock,
        dealer,
        year: item.year ? String(item.year) : '',
        make,
        model,
        price: item.price ? String(item.price).replace(/[^0-9.]/g, '') : '',
        mileage,
        vin: item.vin || '',
        engine,
        transmission,
        drivetrain,
        fuel: item.fuel || 'Diesel',
        condition: item.condition || 'Used',
        description: item.description || item.title || '',
        category: item.category || 'Trucks',
        subcategory: '',
        sold: false,
        featured: 0,
        days: '0',
        photos,
        source_type: 'truckpaper_apify',
        source_url: item.source_url || item.url || '',
      };

      const isExisting = existingStocks.has(stock);

      const { error } = isExisting
        ? await supabase.from('inventory').update(unit).eq('stock', stock).eq('dealer', dealer)
        : await supabase.from('inventory').insert([unit]);

      if (error) {
        console.error(`Error on ${stock}:`, error.message);
        errors++;
      } else {
        synced++;
      }
    } catch(e) {
      console.error('Item error:', e.message);
      errors++;
    }
  }

  // Mark removed units as sold
  let markedSold = 0;
  for (const stock of existingStocks) {
    if (!incomingStocks.has(stock)) {
      await supabase.from('inventory').update({ sold: true, sold_type: 'feed_removed' }).eq('stock', stock).eq('dealer', dealer);
      markedSold++;
    }
  }

  const result = { synced, errors, markedSold, total: items.length, dealer };
  console.log('Sync complete:', result);
  return { statusCode: 200, body: JSON.stringify(result) };
};
