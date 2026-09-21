const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');

// Raw source is stored in Supabase unchanged; this label appears in email subjects.
// This is the GENERIC lead endpoint. Finance sources are served by submit-finance-lead;
// if one appears here it is stale traffic - persisted and warned, never finance-routed.
function getSourceLabel(source) {
  switch (source) {
    case 'vdp':                        return 'Vehicle Inquiry';
    case 'lender_partner_application': return 'Lender Partner Inquiry';
    case 'dealer_partner_application': return 'Dealer Partner Inquiry';
    default:                           return source || 'Lead';
  }
}

// Finance-shaped detection. Two independent signals: a finance source label, or the
// presence of finance-only payload fields. Detection NEVER changes handling - the lead
// still follows the generic persistence path. It only decides whether the warning fires.
const FINANCE_FIELDS = ['credit_score', 'business_name', 'monthly_revenue', 'down_payment', 'timeframe'];

function financeShapedSignals(payload, source) {
  const signals = [];
  const financeSource = source === 'finance_form'
    || source === 'vehiclenetwork'
    || source === 'autoconnection210'
    || (typeof source === 'string' && source.startsWith('torque_hub_'));
  if (financeSource) signals.push('source:' + source);
  for (const f of FINANCE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, f)) {
      signals.push('field:' + f);
    }
  }
  return signals;
}

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

  const source   = payload.source   || 'generic';
  const property = payload.property || 'Torque Hub';

  // Cutover debt, not a routing decision. A finance-shaped payload here means a stale
  // client still posts to the generic endpoint. The request still follows the generic
  // persistence path; this only makes the stale-client fact visible. Never throws into
  // the save path.
  const financeSignals = financeShapedSignals(payload, source);
  if (financeSignals.length) {
    console.warn('submit-lead: finance-shaped payload reached the generic endpoint -', financeSignals.join(', '));
  }

  // Seller matching runs only for inquiries on seller inventory. This is a POSITIVE
  // eligibility test on purpose: the previous negative guard excluded one hardcoded
  // placeholder ('Torque Hub Finance Lead') while the partner forms sent a different
  // one ('Torque Hub Partner Lead'), slipping through into route lookup.
  const SELLER_INVENTORY_SOURCES = new Set(['vdp']);
  const sellerMatchEligible = SELLER_INVENTORY_SOURCES.has(source);

  let dealerEmail = null;
  let dealerCode = null;
  let routeCode = null;
  let routeBasis = null;
  let stockRouteResolved = false;
  let resolvedListingId = null;     // canonical inventory.id — set on inventory resolution,
                                    // independently of finance-route resolution

  if (sellerMatchEligible && payload.stock_number) {
    try {
      const { data: inv } = await supabase
        .from('inventory')
        .select('id, dealer')
        .eq('stock', payload.stock_number)
        .single();
      if (inv && inv.dealer) {
        resolvedListingId = inv.id || null;
        const { data: route } = await supabase
          .from('finance_routes')
          .select('dealer_notification_email, dealer_code, code')
          .eq('dealer_name', inv.dealer)
          .eq('status', 'active')
          .single();
        if (route) {
          stockRouteResolved = true;
          dealerEmail = route.dealer_notification_email || null;
          dealerCode  = route.dealer_code || null;
          routeCode   = route.code || null;
          routeBasis  = 'matched';
        }
      }
    } catch (e) {
      // attribution is best-effort; never block a lead from saving
      console.error('seller route lookup by stock failed:', e);
    }
  }

  if (sellerMatchEligible && !stockRouteResolved && payload.dealer_name) {
    try {
      const { data: routeByDealer } = await supabase
        .from('finance_routes')
        .select('dealer_notification_email, dealer_code, code')
        .eq('dealer_name', payload.dealer_name)
        .eq('status', 'active')
        .single();
      if (routeByDealer) {
        dealerEmail = routeByDealer.dealer_notification_email || null;
        dealerCode  = routeByDealer.dealer_code || null;
        routeCode   = routeByDealer.code || null;
        routeBasis  = 'matched';
      }
    } catch (e) {
      console.error('seller route lookup by dealer_name failed:', e);
    }
  }

  // Configuration gap, not cutover debt. A vehicle inquiry that resolves no seller
  // delivery reaches Torque DMA internally and nobody else. Deliberately a different
  // warning from the finance-shaped one: different defect, different remedy.
  if (sellerMatchEligible && !dealerEmail) {
    console.warn('submit-lead: vdp inquiry resolved no seller delivery -',
      'dealer_name=' + (payload.dealer_name || 'none'),
      'stock=' + (payload.stock_number || 'none'));
  }

  // Submission identity. A valid UUID enables replay protection; a missing or
  // malformed value degrades to NULL and the lead is accepted normally. Never
  // manufacture one server-side - the server does not know the browser's
  // submission identity.
  const SUBMISSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const submissionId = (typeof payload.submission_id === 'string' && SUBMISSION_ID_RE.test(payload.submission_id))
    ? payload.submission_id
    : null;
  const { data: inserted, error } = await supabase.from('leads').insert([{
    customer_name:  customer_name.trim(),
    customer_phone: customer_phone.trim(),
    customer_email: payload.customer_email || null,
    stock:          payload.stock_number   || null,
    unit_title:     payload.listing_title  || null,
    listing_id:     resolvedListingId,
    dealer_name:    payload.dealer_name    || null,
    source_url:     payload.source_url     || null,
    submission_url: payload.submission_url || null,
    submission_id:  submissionId,
    message:        payload.message        || null,
    credit_score:   payload.credit_score   || null,
    rep:            payload.rep            || null,
    referrer:       payload.referrer       || null,
    dealer_code:    dealerCode,
    business_name:   payload.business_name   || null,
    monthly_revenue: payload.monthly_revenue || null,
    down_payment:    payload.down_payment    || null,
    timeframe:       payload.timeframe       || null,
    source,
    status:         'new',
    route_code:  routeCode,
    route_basis: routeBasis
  }]).select('id').single();

  if (error) {
    // REPLAY: this submission attempt was already accepted. Resolve to the
    // original result. No second lead, no re-notification, and later no second
    // server conversion - the early return below precedes the notification block.
    if (error.code === '23505' && submissionId) {
      const { data: prior } = await supabase
        .from('leads')
        .select('id, dealer_code, route_code')
        .eq('submission_id', submissionId)
        .single();
      if (prior && prior.id) {
        return { statusCode: 200, headers, body: JSON.stringify({
          success: true, lead_id: prior.id, dealer_code: prior.dealer_code,
          route_code: prior.route_code, replay: true }) };
      }
    }
    console.error('submit-lead error:', error.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to save lead' }) };
  }

  const leadId = inserted ? inserted.id : null;

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.error('RESEND_API_KEY not set — skipping email notification');
  } else {
    const resend       = new Resend(resendKey);
    const formLabel    = getSourceLabel(source);
    const customerName = customer_name.trim();
    const subject      = `${formLabel} — ${customerName}`;

    // ── internal notification (safety net — always fires) ──────────────────
    try {
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
        from:    'Torque Hub <leads@torquedma.com>',
        to:      'leads@torquedma.com',
        subject,
        text:    lines.join('\n'),
      };
      if (payload.customer_email) sendOpts.replyTo = payload.customer_email;

      await resend.emails.send(sendOpts);
    } catch (emailErr) {
      console.error('Resend notification failed:', emailErr.message);
    }

    // ── seller forward (best-effort) ───────────────────────────────────────
    let dealerAttempted = false, dealerOk = false;
    const notifErrors = [];

    if (dealerEmail) {
      dealerAttempted = true;
      try {
        const dealerLines = [
          `New Lead — ${property}`,
          '',
          `Name: ${customerName}`,
          `Phone: ${customer_phone.trim()}`,
          payload.customer_email ? `Email: ${payload.customer_email}`   : null,
          payload.dealer_name   ? `Dealer: ${payload.dealer_name}`      : null,
          payload.listing_title ? `Unit: ${payload.listing_title}`      : null,
          payload.stock_number  ? `Stock: ${payload.stock_number}`      : null,
          payload.message       ? `Message: ${payload.message}`         : null,
          payload.source_url    ? `Source URL: ${payload.source_url}`   : null,
        ].filter(line => line !== null);
        let dealerSubject;
        if (payload.listing_title && payload.stock_number) {
          dealerSubject = `New Finance Lead — ${payload.listing_title} (${payload.stock_number})`;
        } else if (payload.listing_title) {
          dealerSubject = `New Finance Lead — ${payload.listing_title}`;
        } else {
          dealerSubject = `New Finance Lead — ${customerName}`;
        }
        const dealerOpts = {
          from:    'Torque Hub <leads@torquedma.com>',
          to:      dealerEmail,
          subject: dealerSubject,
          text:    dealerLines.join('\n'),
        };
        if (payload.customer_email) dealerOpts.replyTo = payload.customer_email;
        await resend.emails.send(dealerOpts);
        dealerOk = true;
      } catch (e) {
        console.error('Dealer notification failed:', e.message);
        notifErrors.push('dealer: ' + e.message);
      }
    }

    // ── notification_status ─────────────────────────────────────────────────
    let notifStatus;
    if (!dealerAttempted) {
      notifStatus = 'not_configured';
    } else if (dealerOk) {
      notifStatus = 'sent';
    } else {
      notifStatus = 'failed';
    }
    const notifError = notifErrors.length ? notifErrors.join('; ') : null;

    // ── audit update (best-effort, non-blocking) ────────────────────────────
    if (leadId) {
      try {
        await supabase.from('leads').update({
          notification_status: notifStatus,
          notification_error:  notifError,
          notified_at:         new Date().toISOString(),
        }).eq('id', leadId);
      } catch (e) {
        console.error('notification status update failed:', e.message);
      }
    }
  }

  return { statusCode: 200, headers, body: JSON.stringify({ success: true, lead_id: leadId, dealer_code: dealerCode, route_code: routeCode }) };
};
