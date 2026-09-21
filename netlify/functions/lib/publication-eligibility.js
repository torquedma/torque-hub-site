// publication-eligibility.js — post-DX publication gate for HGR completion lifecycle.
//
// Chief Sam ruling 2026-09-21: publication is a SEPARATE validation step after
// the DX write, applied only to rows in the completion lifecycle (completion_state
// NOT NULL). Legacy rows (completion_state NULL) preserve today's behavior and
// today's DX-success promotion via generate-dx-background — this module is not
// consulted for them.
//
// Contract: pure function of the fully-loaded unit + the DX text that was just
// written + a Set of known dealer names. Returns { eligible, failedCheck }.
// Order matches the brief (§2). failedCheck is the first check that fails; the
// caller writes completion_reason='VALIDATION:<failedCheck>'.
//
// The dealer existence check needs the dealers list. dealers.name is UNIQUE and
// is the same relationship inventory_public_detail uses; inventory has no
// dealer key column, only the dealer name. generate-dx-background fetches the
// names once per invocation and passes them in.

'use strict';

const { CANONICAL_SUBCATEGORIES } = require('./taxonomy.generated.js');

// Reuse the generator's placeholder rule for make: "Unknown"/"Assorted" are
// truthy in JS but epistemically mean missing (matches generate-description.source.js).
const PLACEHOLDER_MAKE_RE = /^(unknown|assorted)$/i;

// Canonical CATEGORY set derived from the subcategory taxonomy. Chief Sam
// ruling names "the canonical category set from taxonomy.generated.js";
// taxonomy.generated.js exports subcategories, and the canonical categories
// are the four inventory buckets the site uses. Enumerated here so a change
// to the site's category vocabulary reaches this gate through a code review.
const CANONICAL_CATEGORIES = new Set(['Trailers', 'Trucks', 'Construction', 'Farm']);

function _nonBlank(v) {
  return typeof v === 'string' ? v.trim().length > 0 : (v != null && String(v).trim().length > 0);
}

function _priceOk(v) {
  if (v == null) return false;
  const stripped = String(v).replace(/[\$,\s]/g, '');
  if (!/^[0-9]+(\.[0-9]{1,2})?$/.test(stripped)) return false;
  return parseFloat(stripped) > 0;
}

function _photoOk(photos) {
  if (!Array.isArray(photos) || photos.length === 0) return false;
  for (const p of photos) {
    if (typeof p === 'string' && p.startsWith('https://')) return true;
    if (p && typeof p === 'object' && typeof p.url === 'string' && p.url.startsWith('https://')) return true;
  }
  return false;
}

function checkPublicationEligibility(unit, dxText, knownDealerNames) {
  const u = unit || {};

  // Order per §2. First failure returns.
  if (!(u.sold === false)) return { eligible: false, failedCheck: 'sold' };
  if (u.status !== 'draft') return { eligible: false, failedCheck: 'status' };
  if (!_priceOk(u.price)) return { eligible: false, failedCheck: 'price' };
  if (!_photoOk(u.photos)) return { eligible: false, failedCheck: 'photos' };
  if (!_nonBlank(u.stock)) return { eligible: false, failedCheck: 'stock' };

  const dealerName = String(u.dealer || '').trim();
  if (!dealerName) return { eligible: false, failedCheck: 'dealer' };
  if (!(knownDealerNames instanceof Set) || !knownDealerNames.has(dealerName)) {
    return { eligible: false, failedCheck: 'dealer' };
  }

  if (!/^(19|20)[0-9]{2}$/.test(String(u.year || '').trim())) return { eligible: false, failedCheck: 'year' };

  const make = String(u.make || '').trim();
  if (!make || PLACEHOLDER_MAKE_RE.test(make)) return { eligible: false, failedCheck: 'make' };

  if (!_nonBlank(u.model)) return { eligible: false, failedCheck: 'model' };

  if (!CANONICAL_CATEGORIES.has(String(u.category || '').trim())) {
    return { eligible: false, failedCheck: 'category' };
  }
  // subcategory NOT required.

  // Envelope of the DX just written: description_source stamp + "Key Details"
  // + Overview section present. This is what publication would render.
  if (u.description_source !== 'torque_hub_dx') return { eligible: false, failedCheck: 'dx_envelope' };
  const text = String(dxText || '');
  if (!text.startsWith('Key Details')) return { eligible: false, failedCheck: 'dx_envelope' };
  if (!/\bOverview\b/.test(text)) return { eligible: false, failedCheck: 'dx_envelope' };

  return { eligible: true, failedCheck: null };
}

// Test hook: expose canonical set for equality assertions.
module.exports = { checkPublicationEligibility, CANONICAL_CATEGORIES };
