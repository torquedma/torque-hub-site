// title-helpers.js — Browser IIFE variant.
//
// HAND-MAINTAINED TWIN of /netlify/edge-functions/lib/title-helpers.js (Deno
// ESM). The two files MUST stay byte-identical in behavior — any change here
// requires the same change in the edge twin, or SSR vs hydration will produce
// different titles. canonicalize() comes from window.TAXONOMY, populated by
// /js/taxonomy.browser.js — that script MUST be loaded BEFORE this one.
(function (root) {
  if (!root.TAXONOMY || typeof root.TAXONOMY.canonicalize !== 'function') {
    throw new Error('TITLE_HELPERS: window.TAXONOMY.canonicalize missing — load /js/taxonomy.browser.js before /js/title-helpers.js');
  }
  var canonicalize = root.TAXONOMY.canonicalize;
  var MODEL_FRAG = /^\d+[A-Za-z]{0,4}$/;

  // cleanTrim — see edge twin for full rule notes.
  function cleanTrim(unit) {
    var t = (unit.trim || '').toString().trim();
    if (!t) return '';
    var low = t.toLowerCase();
    if (low === 'used' || low === 'new') return '';
    if (low === String(unit.make || '').toLowerCase()) return '';
    if (low === String(unit.model || '').toLowerCase()) return '';
    if (MODEL_FRAG.test(t)) return '';
    if (canonicalize(t) !== '') return '';
    return t;
  }

  // buildDisplayTitle — buyer-facing. ymm + optional clean trim. No subcategory.
  function buildDisplayTitle(unit) {
    var base = [unit.year, unit.make, unit.model].filter(Boolean).join(' ');
    var ct = cleanTrim(unit);
    return (base + (ct ? ' ' + ct : '')).trim() || 'Unit Available';
  }

  // trimContains — true when the clean trim already names the given type.
  function trimContains(ct, sub) {
    return !!(ct && sub && ct.toLowerCase().indexOf(sub.toLowerCase()) !== -1);
  }

  // subcategoryLabel — subcategory text shown under a display title; '' when the
  // clean trim already contains it, so the type never appears twice.
  function subcategoryLabel(unit) {
    var sub = (unit.subcategory || '').toString().trim();
    if (!sub) return '';
    return trimContains(cleanTrim(unit), sub) ? '' : sub;
  }

  // buildSeoTitle — clean trim plus canonical subcategory (subcategory skipped when
  // the trim already contains it). Drops brand, then location, to fit ~65 chars.
  function buildSeoTitle(unit, cityState) {
    var base = [unit.year, unit.make, unit.model].filter(Boolean).join(' ');
    var ct = cleanTrim(unit);
    var sub = canonicalize(unit.subcategory || '') || '';
    var descriptor = [ct, trimContains(ct, sub) ? '' : sub].filter(Boolean).join(' ');
    var core = (base + (descriptor ? ' ' + descriptor : '')).trim();
    var full = core + ' for Sale' + (cityState ? ' in ' + cityState : '') + ' | Torque Hub';
    if (full.length <= 65) return full;
    var noBrand = core + ' for Sale' + (cityState ? ' in ' + cityState : '');
    if (noBrand.length <= 65) return noBrand;
    return core + ' for Sale';
  }

  root.TITLE_HELPERS = {
    cleanTrim: cleanTrim,
    buildDisplayTitle: buildDisplayTitle,
    buildSeoTitle: buildSeoTitle,
    subcategoryLabel: subcategoryLabel
  };
}(typeof window !== 'undefined' ? window : this));
