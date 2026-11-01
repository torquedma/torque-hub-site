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

// -- Paid-campaign attribution (TH-HEAD_SITE_TECH-20261030-035) ---------------
// Five discrete, nullable campaign fields. They are CLIENT-SUPPLIED and never
// verified: they describe how the buyer says they arrived, not platform-confirmed
// ad identity. An invalid value becomes NULL; it never blocks or alters a lead.
// The same character rule is used by vehicle.html and finance.html.
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
const UTM_VALUE_RE = /^[A-Za-z0-9 ._\-+:|\/()~,]{1,128}$/;
function cleanUtmValue(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/ {2,}/g, ' ');
  if (!UTM_VALUE_RE.test(s)) return null;           // length, control chars, @, %, =, &, quotes ...
  if (/\d{10,}/.test(s)) return null;               // phone-like digit run
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(s)) return null; // SSN-like
  return s;
}
function readCampaignFields(payload) {
  const out = {};
  UTM_KEYS.forEach(function (k) { out[k] = cleanUtmValue(payload ? payload[k] : undefined); });
  return out;
}

// Click identifiers are personal marketing identifiers. They are never persisted
// or forwarded: removed from URL-shaped fields before storage and email. A value
// with no click identifier is returned byte-for-byte unchanged.
const CLICK_ID_PARAMS = ['fbclid', 'gclid', 'gbraid', 'wbraid', 'dclid', 'msclkid', 'ttclid', 'twclid', 'li_fat_id', 'igshid', 'mc_eid', '_fbc', '_fbp'];
function stripClickIds(value) {
  if (typeof value !== 'string' || value.indexOf('?') === -1) return value;
  let u;
  try { u = new URL(value); } catch (e) { return value; }
  let removed = false;
  Array.from(u.searchParams.keys()).forEach(function (k) {
    if (CLICK_ID_PARAMS.indexOf(k.toLowerCase()) !== -1) { u.searchParams.delete(k); removed = true; }
  });
  return removed ? u.toString() : value;
}

// The placeholder finance.html sends when no seller is known. It is not identity.
const NO_SELLER_PLACEHOLDER = 'Torque Hub Finance Lead';

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
  let resolvedListingId = null;     // canonical inventory.id — retained for persistence

  // Identity inputs (035, amended 036/037). Client stock and dealer are HINTS; the
  // inventory row is the authority, and client dealer text never selects a row.
  // A supplied stock ends in exactly one inventory state:
  //   'resolved'  - exactly one row: canonical identity and Branch 1 routing; a
  //                 contradicting client dealer is rejected (409) before any write.
  //   'no_match'  - lookup succeeded, no row: not a financing subject. The existing
  //                 rule applies (a complete external unit, or 400).
  //   'ambiguous' - several rows (stock is unique per dealer, not globally): not a
  //                 financing subject either; same rule as no_match. Client dealer
  //                 text is never used to choose a row.
  //   'error'     - the lookup itself failed: identity cannot be determined, so the
  //                 request is refused with a retryable 503 before anything is
  //                 saved, sent or routed.
  // Only a 'resolved' stock can reach a lender. Unresolved stocks never fall back
  // to client dealer-name routing (Branch 2) or the platform default (Branch 3),
  // and their client seller text is never stored or shown as the dealer.
  const stockIn = (payload.stock_number === null || payload.stock_number === undefined)
    ? '' : String(payload.stock_number).trim();
  const clientDealer = (typeof payload.dealer_name === 'string'
      && payload.dealer_name.trim() !== '' && payload.dealer_name !== NO_SELLER_PLACEHOLDER)
    ? payload.dealer_name.trim() : null;
  let inventoryState = 'none';
  let inv = null;
  if (stockIn) {
    try {
      const { data: invRows, error: invErr } = await supabase
        .from('inventory')
        .select('id, dealer, sold, price')
        .eq('stock', stockIn)
        .limit(2);
      if (invErr) throw invErr;
      const rows = Array.isArray(invRows) ? invRows.filter(function (r) { return r && r.dealer; }) : [];
      if (rows.length === 1) { inv = rows[0]; inventoryState = 'resolved'; }
      else if (rows.length === 0) { inventoryState = 'no_match'; }
      else { inventoryState = 'ambiguous'; }
    } catch (e) {
      inventoryState = 'error';
    }
  }
  if (inventoryState === 'error') {
    console.error('submit-finance-lead: inventory lookup failed; 503 returned, nothing saved');
    return { statusCode: 503, headers: Object.assign({ 'Retry-After': '5' }, headers), body: JSON.stringify({
      error: 'inventory_lookup_unavailable',
      detail: 'The inventory lookup for stock_number failed. Nothing was saved. Retry the request.'
    }) };
  }
  if (inv && clientDealer && clientDealer !== inv.dealer) {
    return { statusCode: 409, headers, body: JSON.stringify({
      error: 'identity_conflict',
      detail: 'dealer_name does not match the Torque Hub inventory dealer for stock_number.'
    }) };
  }
  if (inv) {
    stockExists = true;
    resolvedDealerName = inv.dealer;
    resolvedListingId = inv.id || null;
    stockSold = !!inv.sold;
    const lp = normalizePrice(inv.price);
    listingPriceSnapshot = lp.ok ? lp.value : null;
    try {
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
    } catch (e) {
      // attribution is best-effort; never block a lead from saving
      console.error('finance_routes attribution lookup failed:', e);
    }
  }
  // A supplied stock that did not resolve to exactly one row stays Torque-only.
  const unresolvedStock = !!stockIn && !stockExists;
  // An unresolved stock is never a financing subject; such a lead exists only when
  // the buyer also supplied a complete external unit (subject gate below).
  const manualReviewLine = {
    no_match:  'Stock not found in Torque Hub inventory - Torque-only, manual review',
    ambiguous: 'Stock matches more than one inventory dealer - seller not verified; Torque-only, manual review'
  }[inventoryState] || null;

  // BRANCH 2 (dealer name) applies ONLY when no stock was supplied (external unit,
  // including the ATC ?src=autoconnection210 referral). A supplied stock is routed
  // by inventory or not at all.
  if (!stockIn && !routeResolved && clientDealer) {
    try {
      const { data: routeByDealer } = await supabase
        .from('finance_routes')
        .select('lender_name, dealer_notification_email, lender_notification_email, dealer_code, code')
        .eq('dealer_name', clientDealer)
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
  // An unresolved stock stays Torque-only (no platform default either).
  if (!routeCode && !unresolvedStock) {
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
  // Every request without a resolved stock - no stock, a confirmed no-match or an
  // ambiguous stock - must carry an independently valid external subject (036/037).
  if (!stockExists && !extPrice.ok) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'external_vehicle_price must be a dollar amount' }) };
  }

  if (!stockExists && !hasCompleteExternalUnit) {
    return { statusCode: 400, headers, body: JSON.stringify({
      error: 'financing subject required',
      detail: 'Provide a stock_number that resolves to Torque Hub inventory, or all of external_vehicle_year, external_vehicle_make, external_vehicle_model, external_vehicle_price.'
    }) };
  }

  // Submission identity. A valid UUID enables replay protection; a missing or
  // malformed value degrades to NULL and the lead is accepted normally. Never
  // manufacture one server-side - the server does not know the browser's
  // submission identity.
  const SUBMISSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const submissionId = (typeof payload.submission_id === 'string' && SUBMISSION_ID_RE.test(payload.submission_id))
    ? payload.submission_id
    : null;
  const campaign = readCampaignFields(payload);
  const hasCampaign = UTM_KEYS.some(function (k) { return campaign[k] !== null; });
  const sourceUrlOut     = stripClickIds(payload.source_url     || null);
  const submissionUrlOut = stripClickIds(payload.submission_url || null);
  const referrerOut      = stripClickIds(payload.referrer       || null);
  // Dealer identity (037): a resolved stock persists and presents the inventory
  // dealer. A supplied stock that did not resolve persists NO dealer; the seller the
  // buyer named appears only in the internal email, labelled unverified. Requests
  // without a stock keep today's behaviour (buyer-selected seller / ATC referral).
  const dealerNameOut    = stockExists ? resolvedDealerName
    : (unresolvedStock ? null : (payload.dealer_name || null));
  const unverifiedSellerLine = (unresolvedStock && clientDealer)
    ? `Seller named by buyer (unverified, not used for routing): ${clientDealer}` : null;

  const leadRow = {
    customer_name:  customer_name.trim(),
    customer_phone: customer_phone.trim(),
    customer_email: payload.customer_email || null,
    stock:          stockIn || null,
    unit_title:     payload.listing_title  || null,
    dealer_name:    dealerNameOut,
    external_vehicle_year:  stockExists ? null : (extYear  || null),
    external_vehicle_make:  stockExists ? null : (extMake  || null),
    external_vehicle_model: stockExists ? null : (extModel || null),
    external_vehicle_price: stockExists ? null : extPrice.value,
    listing_price_snapshot: stockExists ? listingPriceSnapshot : null,
    listing_id:     resolvedListingId,
    source_url:     sourceUrlOut,
    submission_url: submissionUrlOut,
    submission_id:  submissionId,
    message:        payload.message        || null,
    credit_score:   payload.credit_score   || null,
    lender:         resolvedLender,
    rep:            payload.rep            || null,
    referrer:       referrerOut,
    dealer_code:    dealerCode,
    business_name:   payload.business_name   || null,
    monthly_revenue: payload.monthly_revenue || null,
    down_payment:    payload.down_payment    || null,
    timeframe:       payload.timeframe       || null,
    source,
    status:         'new',
    route_code:  routeCode,
    route_basis: routeBasis
  };
  // Campaign columns are written only when at least one value is present, so a
  // lead without campaign data never depends on them.
  if (hasCampaign) UTM_KEYS.forEach(function (k) { leadRow[k] = campaign[k]; });

  let { data: inserted, error } = await supabase.from('leads').insert([leadRow]).select('id').single();
  // Release-order safety (037): if PostgREST reports PGRST204 AND the missing column
  // it names is verifiably one of the five approved campaign columns, save the lead
  // once more without them. Any other PGRST204 - another column, no column named, an
  // unreadable message - is NOT retried and fails exactly as before. Exactly one
  // retry. The diagnostic is one bounded line: fixed keys, the allowlisted column
  // (or "unverified"), the outcome and an allowlisted error code - never the payload,
  // URLs, campaign values or the raw database message.
  let campaignFallback = false;
  if (error && error.code === 'PGRST204' && hasCampaign) {
    const msg = typeof error.message === 'string' ? error.message.slice(0, 300) : '';
    const m = /Could not find the '([^']{1,64})' column/.exec(msg);
    const verifiedColumn = (m && UTM_KEYS.indexOf(m[1]) !== -1) ? m[1] : null;
    let outcome = 'skipped';
    if (verifiedColumn) {
      const fallbackRow = Object.assign({}, leadRow);
      UTM_KEYS.forEach(function (k) { delete fallbackRow[k]; });
      ({ data: inserted, error } = await supabase.from('leads').insert([fallbackRow]).select('id').single());
      campaignFallback = !error;
      outcome = error ? 'failed' : 'saved';
    }
    console.warn(JSON.stringify({
      event: 'finance_lead_campaign_fallback',
      code: 'PGRST204',
      column: verifiedColumn || 'unverified',
      retry: outcome,
      retry_code: (outcome === 'failed' && typeof error.code === 'string' && /^[A-Z0-9]{1,10}$/.test(error.code)) ? error.code : null
    }));
  }

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
        dealerNameOut         ? `Dealer: ${dealerNameOut}`            : null,
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
        sourceUrlOut          ? `Source URL: ${sourceUrlOut}`         : null,
        referrerOut           ? `Referrer: ${referrerOut}`            : null,
        manualReviewLine,
        unverifiedSellerLine,
        campaignFallback      ? 'Campaign attribution not stored: database columns unavailable (PGRST204)' : null,
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
          dealerNameOut         ? `Dealer: ${dealerNameOut}`            : null,
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
          sourceUrlOut          ? `Source URL: ${sourceUrlOut}`         : null,
          referrerOut           ? `Referrer: ${referrerOut}`            : null,
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
          dealerNameOut         ? `Dealer: ${dealerNameOut}`            : null,
          payload.listing_title ? `Unit: ${payload.listing_title}`      : null,
          payload.stock_number  ? `Stock: ${payload.stock_number}`      : null,
          payload.message       ? `Message: ${payload.message}`         : null,
          sourceUrlOut          ? `Source URL: ${sourceUrlOut}`         : null,
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
