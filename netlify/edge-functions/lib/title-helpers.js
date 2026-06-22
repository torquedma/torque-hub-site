// title-helpers.js — Edge (Deno ESM) variant.
//
// HAND-MAINTAINED TWIN of /js/title-helpers.js (browser IIFE). The two files
// MUST stay byte-identical in behavior — any change here requires the same
// change in the browser twin, or SSR vs hydration will produce different
// titles. canonicalize() comes from the GENERATED ESM taxonomy file (single
// source of truth, regenerated from taxonomy.json via npm run gen-taxonomy).

import { canonicalize } from './taxonomy.esm.js';

const MODEL_FRAG = /^\d+[A-Za-z]{0,4}$/;

// cleanTrim — returns the unit's trim string ONLY if it would add value to a
// display title. Returns '' to suppress. Rules (all must pass to keep):
//   - non-empty after trim
//   - not 'used' / 'new' (condition leaking into trim field)
//   - not equal (case-insensitive) to make or model (dedupe guard)
//   - NOT a bare model fragment like '3500' / '3500HD'  (regex)
//   - canonicalize(t) === ''   (taxonomy firewall — no body-type duplicates)
export function cleanTrim(unit) {
  const t = (unit.trim || '').toString().trim();
  if (!t) return '';
  const low = t.toLowerCase();
  if (low === 'used' || low === 'new') return '';
  if (low === String(unit.make || '').toLowerCase()) return '';
  if (low === String(unit.model || '').toLowerCase()) return '';
  if (MODEL_FRAG.test(t)) return '';
  if (canonicalize(t) !== '') return '';
  return t;
}

// buildDisplayTitle — buyer-facing title. year + make + model + optional clean
// trim. Subcategory is NEVER appended, under any condition.
export function buildDisplayTitle(unit) {
  const base = [unit.year, unit.make, unit.model].filter(Boolean).join(' ');
  const ct = cleanTrim(unit);
  return (base + (ct ? ' ' + ct : '')).trim() || 'Unit Available';
}

// buildSeoTitle — for <title>, og:title, SEO H2, meta description. Uses the
// strongest SINGLE descriptor: clean trim if present, otherwise the canonical
// subcategory. When a clean trim exists, subcategory is NOT also added.
// 65-char budget: drops ' | Torque Hub' first, then location — unit +
// descriptor always survive.
export function buildSeoTitle(unit, cityState) {
  const base = [unit.year, unit.make, unit.model].filter(Boolean).join(' ');
  const ct = cleanTrim(unit);
  const descriptor = ct || canonicalize(unit.subcategory || '') || '';
  const core = (base + (descriptor ? ' ' + descriptor : '')).trim();
  const full = core + ' for Sale' + (cityState ? ' in ' + cityState : '') + ' | Torque Hub';
  if (full.length <= 65) return full;
  const noBrand = core + ' for Sale' + (cityState ? ' in ' + cityState : '');
  if (noBrand.length <= 65) return noBrand;
  return core + ' for Sale';
}
