const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');

// All finance variants collapse to 'Finance Form' in notifications; raw source is
// still stored in Supabase unchanged. Add new sources here as forms are added.
const SOURCE_LABELS = {
  torque_hub_listing:         'Finance Form',
  torque_hub_qr:              'Finance Form',
  torque_hub_reel:            'Finance Form',
  torque_hub_featured:        'Finance Form',
  torque_hub_homepage:        'Finance Form',
  torque_hub_direct:          'Finance Form',
  finance_form:               'Finance Form',
  vdp:                        'Vehicle Inquiry',
  lender_partner_application: 'Lender Partner Inquiry',
  dealer_partner_application: 'Dealer Partner Inquiry',
};

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

  const { customer_name, customer_phone } = payload;
  if (!customer_name || !customer_phone) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'customer_name and customer_phone are required' }) };
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const source   = payload.source   || 'finance_form';
  const property = payload.property || 'Torque Hub';

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
    source,
    status:         'new'
  }]);

  if (error) {
    console.error('submit-lead error:', error.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to save lead' }) };
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.error('RESEND_API_KEY not set — skipping email notification');
  } else {
    try {
      const resend       = new Resend(resendKey);
      const formLabel    = SOURCE_LABELS[source] || source;
      const customerName = customer_name.trim();
      const subject      = `[${property}] ${formLabel} from ${customerName}`;

      const lines = [
        `New Lead — ${property}`,
        '',
        `Name: ${customerName}`,
        `Phone: ${customer_phone.trim()}`,
        payload.customer_email ? `Email: ${payload.customer_email}`   : null,
        `Source: ${formLabel}`,
        `Source detail: ${source}`,
        payload.dealer_name   ? `Dealer: ${payload.dealer_name}`      : null,
        payload.listing_title ? `Unit: ${payload.listing_title}`      : null,
        payload.stock_number  ? `Stock: ${payload.stock_number}`      : null,
        payload.credit_score  ? `Credit: ${payload.credit_score}`     : null,
        payload.lender        ? `Lender: ${payload.lender}`           : null,
        payload.rep           ? `Rep: ${payload.rep}`                 : null,
        payload.message       ? `Message: ${payload.message}`         : null,
        payload.source_url    ? `Source URL: ${payload.source_url}`   : null,
        payload.referrer      ? `Referrer: ${payload.referrer}`       : null,
      ].filter(line => line !== null);

      const sendOpts = {
        from:    'Torque Hub <noreply@torquedma.com>',
        to:      'leads@torquedma.com',
        subject,
        text:    lines.join('\n'),
      };
      if (payload.customer_email) sendOpts.replyTo = payload.customer_email;

      await resend.emails.send(sendOpts);
    } catch (emailErr) {
      console.error('Resend notification failed:', emailErr.message);
    }
  }

  return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
};
