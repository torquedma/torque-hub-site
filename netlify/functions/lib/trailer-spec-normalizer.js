'use strict';

// trailer-spec-normalizer.js — Stage 0 SKELETON.
// Public entry: normalizeTrailerSpecs(rawDescription, category).
// CommonJS, zero external deps. No handlers yet: HGR/Impex/Allied/free-form all
// route through the skeleton to either a normalized-empty payload (HGR, TODO) or
// safe_fallback with a warning. safe_fallback MUST NOT mutate rawDescription.

/**
 * splitLines — the single source of truth for the sourceLineId scheme.
 * assertAccounting and every future disposition writer will reuse this helper,
 * so the ID rule lives here and nowhere else.
 *
 * Rules:
 *   - Split on newlines; empty / whitespace-only lines are DROPPED (no id).
 *   - The Nth non-empty physical line (0-based) receives parent index N.
 *     Its base id is 'L' + N (e.g. L0, L1, ...).
 *   - Parent indexing is decided BEFORE tab-splitting, so the count of sub-lines
 *     NEVER shifts subsequent parent indices. The physical non-empty line after
 *     L8 is always L9, whether L8 tab-split into two subs or none.
 *   - Tab-split pre-step: if a non-empty line matches /\t+(?=[-·])/, split it
 *     into sub-lines. Sub-lines carry the parent index with alpha suffixes:
 *     L8a, L8b, L8c, ... Empty sub-segments (e.g. from a leading tab) drop.
 *   - A line that does NOT tab-split keeps its bare parent id (L8, not L8a).
 *
 * @param {string} rawDescription
 * @returns {Array<{sourceLineId: string, text: string}>}
 */
function splitLines(rawDescription) {
  const out = [];
  if (rawDescription == null) return out;
  const physicalLines = String(rawDescription).split(/\r?\n/);
  const TAB_SPLIT = /\t+(?=[-·])/;

  let parentIndex = -1;
  for (const rawLine of physicalLines) {
    if (rawLine.trim() === '') continue;      // empty / whitespace-only → no id, no parent bump
    parentIndex += 1;

    if (TAB_SPLIT.test(rawLine)) {
      const segments = rawLine.split(TAB_SPLIT);
      let suffixCode = 'a'.charCodeAt(0);
      for (const seg of segments) {
        const t = seg.trim();
        if (t === '') continue;               // drop empty sub-segments (e.g. leading-tab artifact)
        out.push({ sourceLineId: 'L' + parentIndex + String.fromCharCode(suffixCode), text: t });
        suffixCode += 1;
      }
    } else {
      out.push({ sourceLineId: 'L' + parentIndex, text: rawLine.trim() });
    }
  }
  return out;
}

/**
 * detectTrailerFormat — SHAPE only (no action/judgment values). Order matters:
 * most-specific-first, because Impex and Allied bodies can incidentally contain
 * bulleted lines that would otherwise satisfy the HGR rule.
 *   1 impex_labeled_sections   — "Quick Highlights:" and/or a "Why Choose" header
 *   2 allied_key_value         — "Weights & Dimensions" or "Category Specific"
 *   3 hgr_delimited            — ≥1 line whose first non-whitespace char is '-' or '·'
 *   4 free_form                — non-empty prose, none of the above
 *   5 unknown                  — empty / whitespace-only
 */
function detectTrailerFormat(rawDescription) {
  const src = String(rawDescription == null ? '' : rawDescription);
  if (src.trim() === '') return 'unknown';

  if (src.includes('Quick Highlights:') || /(^|\n)\s*Why Choose/i.test(src)) {
    return 'impex_labeled_sections';
  }
  if (src.includes('Weights & Dimensions') || src.includes('Category Specific')) {
    return 'allied_key_value';
  }
  for (const line of src.split(/\r?\n/)) {
    const t = line.trimStart();
    if (t.startsWith('-') || t.startsWith('·')) return 'hgr_delimited';
  }
  return 'free_form';
}

/**
 * normalizeTrailerSpecs — public entry. GATE FIRST, then detect and route.
 */
function normalizeTrailerSpecs(rawDescription, category) {
  // LOAD-BEARING: gate precedes detection. Never detect-then-gate.
  if (category !== 'Trailers') return null;

  const format = detectTrailerFormat(rawDescription);

  const base = {
    format,
    handling: 'safe_fallback',
    schemaHint: 'unknown',
    leadProse: [],
    keyDetails: [],
    excluded: [],
    warnings: [],
  };

  if (format === 'hgr_delimited') {
    // TODO Stage: HGR handler
    return { ...base, handling: 'normalized' };
  }

  if (format === 'impex_labeled_sections') {
    return { ...base, warnings: [{
      code: 'FORMAT_HANDLER_DEFERRED',
      sourceLineIds: [],
      note: 'Impex format detected; existing description path preserved.',
    }] };
  }

  if (format === 'allied_key_value') {
    return { ...base, warnings: [{
      code: 'FORMAT_HANDLER_DEFERRED',
      sourceLineIds: [],
      note: 'Allied format detected; existing description path preserved.',
    }] };
  }

  if (format === 'free_form') {
    return { ...base, warnings: [{
      code: 'FORMAT_FREE_FORM',
      sourceLineIds: [],
      note: 'No structured format detected; existing description path preserved.',
    }] };
  }

  // format === 'unknown'
  return { ...base, warnings: [{
    code: 'FORMAT_UNKNOWN',
    sourceLineIds: [],
    note: 'Raw description is empty or unparseable; existing description path preserved.',
  }] };
}

module.exports = { normalizeTrailerSpecs, detectTrailerFormat, splitLines };
