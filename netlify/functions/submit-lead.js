const { Resend } = require('resend');
const { createClient } = require('@supabase/supabase-js');

// Raw source is stored in Supabase unchanged; this label appears in email subjects.
// Add new explicit cases here; SEO and generic torque_hub_ variants are caught below.
function getSourceLabel(source) {
  switch (source) {
    case 'finance_form':               return 'Finance Form';
    case 'torque_hub_listing':         return 'Finance Form (VDP)';
    case 'torque_hub_direct':          return 'Finance Form';
    case 'torque_hub_homepage':        return 'Finance Form';
    case 'torque_hub_qr':              return 'Finance Form (QR)';
    case 'torque_hub_reel':            return 'Finance Form (Reel)';
    case 'torque_hub_featured':        return 'Finance Form';
    case 'torque_hub_nav':             return 'Finance Form (Site Nav)';
    case 'torque_hub_vdp_nav':         return 'Finance Form (VDP Nav)';
    case 'torque_hub_hero':            return 'Finance Form (Hero)';
    case 'torque_hub_bottom':          return 'Finance Form (Bottom)';
    case 'torque_hub_mobile':          return 'Finance Form (Mobile)';
    case 'vehiclenetwork':              return 'Finance Form (Vehicle Network)';
    case 'autoconnection210':          return 'Finance Form (Auto Connection 210)';
    case 'vdp':                        return 'Vehicle Inquiry';
    case 'lender_partner_application': return 'Lender Partner Inquiry';
    case 'dealer_partner_application': return 'Dealer Partner Inquiry';
    default:
      if (source && source.startsWith('torque_hub_seo_')) return 'Finance Form (SEO)';
      if (source && source.startsWith('torque_hub_'))     return 'Finance Form';
      return source || 'Finance Form';
  }
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

  const source   = payload.source   || 'finance_form';
  const property = payload.property || 'Torque Hub';

  let resolvedLender = payload.lender || null;
  let dealerEmail = null;
  let lenderEmail = null;
  if (payload.stock_number) {
    try {
      const { data: inv } = await supabase
        .from('inventory')
        .select('dealer')
        .eq('stock', payload.stock_number)
        .single();
      if (inv && inv.dealer) {
        const { data: route } = await supabase
          .from('finance_routes')
          .select('lender_name, dealer_notification_email, lender_notification_email')
          .eq('dealer_name', inv.dealer)
          .eq('status', 'active')
          .single();
        if (route) {
          if (route.lender_name) resolvedLender = route.lender_name;
          dealerEmail = route.dealer_notification_email || null;
          lenderEmail = route.lender_notification_email || null;
        }
      }
    } catch (e) {
      // attribution is best-effort; never block a lead from saving
      console.error('finance_routes attribution lookup failed:', e);
    }
  }

  const { data: inserted, error } = await supabase.from('leads').insert([{
    customer_name:  customer_name.trim(),
    customer_phone: customer_phone.trim(),
    customer_email: payload.customer_email || null,
    stock:          payload.stock_number   || null,
    unit_title:     payload.listing_title  || null,
    dealer_name:    payload.dealer_name    || null,
    source_url:     payload.source_url     || null,
    message:        payload.message        || null,
    credit_score:   payload.credit_score   || null,
    lender:         resolvedLender,
    rep:            payload.rep            || null,
    referrer:       payload.referrer       || null,
    source,
    status:         'new'
  }]).select('id').single();

  if (error) {
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

    // ── external forwards (dealer + lender, best-effort) ───────────────────
    let lenderAttempted = false, lenderOk = false;
    let dealerAttempted = false, dealerOk = false;
    const notifErrors = [];

    if (lenderEmail) {
      lenderAttempted = true;
      try {
        const lenderLines = [
          `Finance Lead — ${property}`,
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
          resolvedLender        ? `Lender: ${resolvedLender}`           : null,
          payload.rep           ? `Rep: ${payload.rep}`                 : null,
          payload.message       ? `Message: ${payload.message}`         : null,
          payload.source_url    ? `Source URL: ${payload.source_url}`   : null,
          payload.referrer      ? `Referrer: ${payload.referrer}`       : null,
        ].filter(line => line !== null);
        const lenderOpts = {
          from:    'Torque Hub <noreply@torquedma.com>',
          to:      lenderEmail,
          subject: `Finance Lead — ${customerName}`,
          text:    lenderLines.join('\n'),
        };
        if (payload.customer_email) lenderOpts.replyTo = payload.customer_email;
        await resend.emails.send(lenderOpts);
        lenderOk = true;
      } catch (e) {
        console.error('Lender notification failed:', e.message);
        notifErrors.push('lender: ' + e.message);
      }
    }

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
          from:    'Torque Hub <noreply@torquedma.com>',
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
    if (!lenderAttempted && !dealerAttempted) {
      notifStatus = 'not_configured';
    } else if (lenderAttempted && lenderOk && dealerAttempted && dealerOk) {
      notifStatus = 'sent';
    } else if ((lenderAttempted && lenderOk) || (dealerAttempted && dealerOk)) {
      notifStatus = 'partial';
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

  return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
};
