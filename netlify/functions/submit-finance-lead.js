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
    default:
      if (source && source.startsWith('torque_hub_seo_')) return 'Finance Form (SEO)';
      if (source && source.startsWith('torque_hub_'))     return 'Finance Form';
      return source || 'Finance Form';
  }
}

// Price normalization for finance intake.
// Accepts: null/undefined/empty (→ ok:true value:null), '$70,000.00' / '70000' / '70,000.50'.
// Rejects: '70k', 'call for price', anything that isn't a plain dollar amount.
// Non-numeric MUST be rejected — never coerced silently to null.
function normalizePrice(v) {
  if (v === null || v === undefined) return { ok: true, value: null };
  const raw = String(v).trim();
  if (raw === '') return { ok: true, value: null };
  let s = raw;
  if (s.charAt(0) === '$') s = s.slice(1);
  s = s.replace(/,/g, '');
  s = s.replace(/\.00$|\.0$/, '');
  if (/^\d{1,9}(\.\d{1,2})?$/.test(s)) return { ok: true, value: Number(s) };
  return { ok: false, value: null };
}

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

  const { customer_name, customer_phone } = payload;
  if (!customer_name || !customer_phone) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'customer_name and customer_phone are required' }) };
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  const source   = payload.source   || 'finance_form';
  // Inherited from submit-lead; no caller sends payload.property, so this is always 'Torque Hub'.
  const property = payload.property || 'Torque Hub';

  let resolvedLender = payload.lender || null;
  let dealerEmail = null;
  let lenderEmail = null;
  let dealerCode = null;
  let routeCode = null;
  let routeBasis = null;
  let stockExists = false;          // financing-subject validity
  let stockSold = false;            // presentation only — NEVER gates acceptance
  let resolvedDealerName = null;    // retained for persistence
  let routeResolved = false;        // lender-routing validity (replaces stockRouteResolved)
  let listingPriceSnapshot = null;
  if (payload.stock_number) {
    try {
      const { data: inv } = await supabase
        .from('inventory')
        .select('dealer, sold, price')
        .eq('stock', payload.stock_number)
        .single();
      if (inv && inv.dealer) {
        stockExists = true;
        resolvedDealerName = inv.dealer;
        stockSold = !!inv.sold;
        const lp = normalizePrice(inv.price);
        listingPriceSnapshot = lp.ok ? lp.value : null;
        const { data: route } = await supabase
          .from('finance_routes')
          .select('lender_name, dealer_notification_email, lender_notification_email, dealer_code, code')
          .eq('dealer_name', inv.dealer)
          .eq('status', 'active')
          .single();
        if (route) {
          routeResolved = true;
          if (route.lender_name) resolvedLender = route.lender_name;
          dealerEmail = route.dealer_notification_email || null;
          lenderEmail = route.lender_notification_email || null;
          dealerCode = route.dealer_code || null;
          routeCode = route.code || null;
          routeBasis = 'matched';
        }
      }
    } catch (e) {
      // attribution is best-effort; never block a lead from saving
      console.error('finance_routes attribution lookup failed:', e);
    }
  }
  if (!routeResolved && payload.dealer_name && payload.dealer_name !== 'Torque Hub Finance Lead') {
    try {
      const { data: routeByDealer } = await supabase
        .from('finance_routes')
        .select('lender_name, dealer_notification_email, lender_notification_email, dealer_code, code')
        .eq('dealer_name', payload.dealer_name)
        .eq('status', 'active')
        .single();
      if (routeByDealer) {
        if (routeByDealer.lender_name) resolvedLender = routeByDealer.lender_name;
        dealerEmail = routeByDealer.dealer_notification_email || null;
        lenderEmail = routeByDealer.lender_notification_email || null;
        dealerCode = routeByDealer.dealer_code || null;
        routeCode = routeByDealer.code || null;
        routeBasis = 'matched';
      }
    } catch (e) {
      console.error('dealer-name route attribution failed:', e);
    }
  }

  // BRANCH 3: platform-default lender route (fallback). Lender email only — never dealer email.
  if (!routeCode) {
    try {
      const { data: def } = await supabase.from('finance_routes')
        .select('lender_name, lender_notification_email, code')
        .eq('is_default', true).eq('status', 'active').limit(1).single();
      if (def) {
        if (def.lender_name) resolvedLender = def.lender_name;
        lenderEmail = def.lender_notification_email || null;   // lender only — do NOT set dealerEmail
        routeCode   = def.code || null;
        routeBasis  = 'default';
      }
    } catch (e) { console.error('default route lookup failed:', e); }
  }

  const extYear  = String(payload.external_vehicle_year  ?? '').trim();
  const extMake  = String(payload.external_vehicle_make  ?? '').trim();
  const extModel = String(payload.external_vehicle_model ?? '').trim();
  const extPrice = normalizePrice(payload.external_vehicle_price);
  const hasCompleteExternalUnit = !!(extYear && extMake && extModel && extPrice.ok && extPrice.value !== null);

  // PRICE CHECK FIRST — must precede the subject check, or the named price error is
  // unreachable (hasCompleteExternalUnit already requires extPrice.ok).
  if (!stockExists && !extPrice.ok) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'external_vehicle_price must be a dollar amount' }) };
  }

  if (!stockExists && !hasCompleteExternalUnit) {
    return { statusCode: 400, headers, body: JSON.stringify({
      error: 'financing subject required',
      detail: 'Provide a stock_number that resolves to Torque Hub inventory, or all of external_vehicle_year, external_vehicle_make, external_vehicle_model, external_vehicle_price.'
    }) };
  }

  const { data: inserted, error } = await supabase.from('leads').insert([{
    customer_name:  customer_name.trim(),
    customer_phone: customer_phone.trim(),
    customer_email: payload.customer_email || null,
    stock:          payload.stock_number   || null,
    unit_title:     payload.listing_title  || null,
    dealer_name:    payload.dealer_name || resolvedDealerName || null,
    external_vehicle_year:  stockExists ? null : (extYear  || null),
    external_vehicle_make:  stockExists ? null : (extMake  || null),
    external_vehicle_model: stockExists ? null : (extModel || null),
    external_vehicle_price: stockExists ? null : extPrice.value,
    listing_price_snapshot: stockExists ? listingPriceSnapshot : null,
    source_url:     payload.source_url     || null,
    message:        payload.message        || null,
    credit_score:   payload.credit_score   || null,
    lender:         resolvedLender,
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
    console.error('submit-finance-lead error:', error.message);
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
    const formatMoney  = (n) => (n == null ? '' : '$' + Number(n).toLocaleString('en-US'));

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
        // Guarded on hasCompleteExternalUnit, not merely !stockExists: today the gate
        // guarantees these are populated, but the line should be correct by expression
        // rather than by relying on an upstream guard that may later be relaxed.
        (!stockExists && hasCompleteExternalUnit) ? `Unit: ${extYear} ${extMake} ${extModel} (not listed on Torque Hub)` : null,
        (!stockExists && hasCompleteExternalUnit) ? `Approx. Price: ${formatMoney(extPrice.value)}` : null,
        (stockExists && listingPriceSnapshot !== null) ? `Listing Price: ${formatMoney(listingPriceSnapshot)}` : null,
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
          // Guarded on hasCompleteExternalUnit, not merely !stockExists: today the gate
          // guarantees these are populated, but the line should be correct by expression
          // rather than by relying on an upstream guard that may later be relaxed.
          (!stockExists && hasCompleteExternalUnit) ? `Unit: ${extYear} ${extMake} ${extModel} (not listed on Torque Hub)` : null,
          (!stockExists && hasCompleteExternalUnit) ? `Approx. Price: ${formatMoney(extPrice.value)}` : null,
          (stockExists && listingPriceSnapshot !== null) ? `Listing Price: ${formatMoney(listingPriceSnapshot)}` : null,
          payload.credit_score  ? `Credit: ${payload.credit_score}`     : null,
          resolvedLender        ? `Lender: ${resolvedLender}`           : null,
          payload.rep           ? `Rep: ${payload.rep}`                 : null,
          payload.message       ? `Message: ${payload.message}`         : null,
          payload.source_url    ? `Source URL: ${payload.source_url}`   : null,
          payload.referrer      ? `Referrer: ${payload.referrer}`       : null,
        ].filter(line => line !== null);
        const lenderOpts = {
          from:    'Torque Hub <finance@torquedma.com>',
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

  return { statusCode: 200, headers, body: JSON.stringify({ success: true, lead_id: leadId, dealer_code: dealerCode, route_code: routeCode }) };
};
