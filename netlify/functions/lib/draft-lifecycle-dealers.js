'use strict';
// draft-lifecycle-dealers.js — dealers on the Apify Draft-to-Live lifecycle.
//
// Chief ruling 2026-09-24 (S2): for these dealers, publication is a separate,
// human-approved step after buyer-readiness PASS. DX generation may write or
// refresh DX, but it must NEVER promote status 'draft' → 'published'.
//
// inventory has no dealer key column; inventory.dealer carries dealers.name
// (UNIQUE). Values below are the exact dealers.name strings. Comparison is
// trim + case-insensitive so whitespace/case drift in a dealer string fails
// CLOSED (guarded), never open.
//
// This is the single list for the lifecycle. The receiver (S1) is expected to
// read the same list when it lands; do not copy it elsewhere.

const DRAFT_LIFECYCLE_DEALERS = Object.freeze([
  'Allied Truck & Trailer Sales',
  'Impex Heavy Metal',
]);

const _normalized = new Set(DRAFT_LIFECYCLE_DEALERS.map(d => d.trim().toLowerCase()));

function isDraftLifecycleDealer(dealer) {
  return typeof dealer === 'string' && _normalized.has(dealer.trim().toLowerCase());
}

// True when DX generation may flip this unit's status from 'draft' to
// 'published'. False for every Draft-to-Live lifecycle dealer.
function dxMayPromoteDraft(unit) {
  return !isDraftLifecycleDealer(unit && unit.dealer);
}

module.exports = { DRAFT_LIFECYCLE_DEALERS, isDraftLifecycleDealer, dxMayPromoteDraft };
