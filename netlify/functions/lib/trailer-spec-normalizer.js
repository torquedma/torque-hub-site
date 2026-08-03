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
 * classifyHgr — HGR bullet-body classifier. Operates on splitLines() output only;
 * every text field is already trimmed and every empty line is already dropped.
 *
 * FIRST-MATCH-WINS in this exact order (no empty case — splitLines removed those):
 *   1  header           → excluded (rule: HEADER)
 *   2  dealer offer     → excluded (rule: DEALER_OFFER)
 *   3  marketing badge  → excluded (rule: MARKETING)
 *   4  '-'/'·' bullet   → keyDetails (confidence: 'high')
 *   5  pre-bullet prose → leadProse   (only when i < firstBulletIndex AND not spec-shaped)
 *   6  bare spec-shaped → keyDetails (confidence: 'low')
 *   7  fallthrough      → keyDetails (confidence: 'low') + UNCLASSIFIED warning
 *
 * SPEC-SHAPE = a POSITIVE signal, never a word-count guess:
 *   - starts with a recognized label (Length|Width|Height|Axle|GVWR|GAWR|Deck|Frame|Tongue)
 *     followed by a value, OR
 *   - starts with a digit (leading number/measurement), OR
 *   - contains a measurement token: " (inch), ' (foot), or whole-word lb/lbs/amp/volt/ft/in/ga.
 *
 * MOJIBAKE is a WARNING, not a disposition — matching entries still land in keyDetails;
 * normalizedLine strips the leading delimiter and collapses whitespace exactly as normal,
 * preserving garbled bytes without repair.
 *
 * Grouping, schemaHint inference, contradiction detection, and assertAccounting are
 * DEFERRED. group stays 'additional_features'; conflictsWith stays undefined.
 */
function classifyHgr(lines) {
  const leadProse = [];
  const keyDetails = [];
  const excluded = [];
  const warnings = [];

  const HEADER_TEXT_LOWER = 'trailers for everything and everything for trailers';
  const DEALER_OFFER_RX   = /^[-·]?\s*(WE CAN ADD|HGR'?S CAN ADD|HGRS? GUARANTEES)/i;
  const MARKETING_RX      = /^[-·]?\s*GOLD MINE SERIES$/i;
  const DELIMITED_RX      = /^[-·]/;
  const MOJIBAKE_RX       = /Ã|Â|\?1\/2/;
  const SPEC_LABEL_RX     = /^(Length|Width|Height|Axle|GVWR|GAWR|Deck|Frame|Tongue)\b\s*\S/i;
  const STARTS_DIGIT_RX   = /^\d/;
  const MEASUREMENT_RX    = /["']|\b(?:lb|lbs|amp|volt|ft|in|ga)\b/i;

  const isSpecShaped = (t) => SPEC_LABEL_RX.test(t) || STARTS_DIGIT_RX.test(t) || MEASUREMENT_RX.test(t);
  const normalizeLine = (text) => text.replace(/^[-·]\s*/, '').replace(/\s+/g, ' ').trim();

  // Compute pre-bullet boundary ONCE — do not toggle state in the loop.
  const firstBulletIndex = lines.findIndex(({ text }) => DELIMITED_RX.test(text));

  const pushKeyDetail = (sourceLineId, text, confidence) => {
    keyDetails.push({
      sourceLineId,
      originalLine: text,
      normalizedLine: normalizeLine(text),
      group: 'additional_features',
      confidence,
      presentation: 'default',
      conflictsWith: undefined,
    });
    if (MOJIBAKE_RX.test(text)) {
      warnings.push({ code: 'MOJIBAKE', sourceLineIds: [sourceLineId], note: 'Mojibake preserved; not repaired.' });
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const { sourceLineId, text } = lines[i];

    // 1. Header
    if (text.toLowerCase() === HEADER_TEXT_LOWER) {
      excluded.push({ sourceLineId, line: text, rule: 'HEADER' });
      continue;
    }
    // 2. Dealer offer
    if (DEALER_OFFER_RX.test(text)) {
      excluded.push({ sourceLineId, line: text, rule: 'DEALER_OFFER' });
      continue;
    }
    // 3. Marketing badge
    if (MARKETING_RX.test(text)) {
      excluded.push({ sourceLineId, line: text, rule: 'MARKETING' });
      continue;
    }
    // 4. Delimited spec
    if (DELIMITED_RX.test(text)) {
      pushKeyDetail(sourceLineId, text, 'high');
      continue;
    }
    // 5. Lead prose — only strictly before the first bullet, AND not spec-shaped.
    if (firstBulletIndex !== -1 && i < firstBulletIndex && !isSpecShaped(text)) {
      leadProse.push({ sourceLineId, text });
      continue;
    }
    // 6. Bare spec-shaped, no delimiter
    if (isSpecShaped(text)) {
      pushKeyDetail(sourceLineId, text, 'low');
      continue;
    }
    // 7. Fallthrough — retain, flag UNCLASSIFIED
    pushKeyDetail(sourceLineId, text, 'low');
    warnings.push({
      code: 'UNCLASSIFIED',
      sourceLineIds: [sourceLineId],
      note: 'Unclassified line; retained in additional_features.',
    });
  }

  return { leadProse, keyDetails, excluded, warnings };
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
    const { leadProse, keyDetails, excluded, warnings } = classifyHgr(splitLines(rawDescription));
    return {
      format: 'hgr_delimited',
      handling: 'normalized',
      schemaHint: 'unknown',
      leadProse,
      keyDetails,
      excluded,
      warnings,
    };
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

module.exports = { normalizeTrailerSpecs, detectTrailerFormat, splitLines, classifyHgr };
