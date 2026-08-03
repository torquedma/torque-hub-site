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

// ─────────────────────────────────────────────────────────────────────────────
// assignGroup — first-match-wins over an ORDERED [group, keywords] table.
// Chassis groups first (deck_loading before interior_buildout, etc.) so that
// "2″ Treated Pine Floor" lands in deck_loading rather than interior_buildout.
// Short keywords (length ≤ 3) are word-boundary-anchored on any side that
// ends in a word char; longer keywords use plain case-insensitive substring.
// ─────────────────────────────────────────────────────────────────────────────
const HGR_GROUPS = [
  ['deck_loading',         ['deck', 'dovetail', 'ramp', 'tilt', 'flat deck', 'bed length', 'slide in', 'treated pine', 'pine floor', 'wood floor', 'trailer floor']],
  ['axles_tires_brakes',   ['axle', 'tire', 'radial', 'brake', 'spring', 'suspension', 'wheel', 'gvwr', 'gawr', 'load range', 'lre', 'lr-e', 'dexter', 'lippert']],
  ['frame_construction',   ['frame', 'i-beam', 'ibeam', 'channel', 'crossmember', 'steel', 'tube', 'gauge', 'ga.', 'beavertail', 'bump rail']],
  ['coupling_support',     ['coupler', 'gooseneck', 'hitch', 'jack', 'drop leg', 'ball', 'pintle', 'safety chain', 'landing gear']],
  ['electrical_lighting',  ['light', 'led', 'wiring', 'harness', 'plug', '7 way', 'rv', 'breakaway', 'break away', 'd.o.t', 'dot', 'receptacle', 'recept']],
  ['finish_convenience',   ['powdercoat', 'powder coat', 'paint', 'color', 'primer', 'sandblast', 'acid wash', 'stake pocket', 'toolbox', 'spare', 'side step', 'd-ring', 'tie down', 'pin stripe', 'stoneguard', 'trim']],
  ['interior_buildout',    ['cabinet', 'wall', 'ceiling', 'floor covering', 'vinyl floor', 'rubber floor', 'plywood wall', 'interior height', 'inside height', 'insulation', 'stud', 'door', 'window', 'screen', 'closet', 'escape door', 'kickplate', 'treadplate']],
  ['hvac_plumbing',        ['hvac', 'a/c', 'air conditioner', 'furnace', 'sink', 'water tank', 'water heater', 'plumbing', 'propane', 'exhaust hood', 'mini split', 'fresh water', 'freshwater', 'waste tank']],
  ['appliances_equipment', ['refrigerator', 'freezer', 'microwave', 'generator', 'converter', 'battery', 'stereo', 'appliance', 'winch', 'hot water heater']],
];

// Compile keyword → RegExp ONCE, at module load. Short keywords (≤3 chars) get
// word-boundary anchoring on any side whose adjacent char is a word char.
// A trailing non-word char (e.g. 'ga.') keeps no trailing \b, because \b needs
// a word char on one side.
function _kwToRegex(kw) {
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (kw.length <= 3) {
    const left  = /^\w/.test(kw) ? '\\b' : '';
    const right = /\w$/.test(kw) ? '\\b' : '';
    return new RegExp(left + escaped + right, 'i');
  }
  return new RegExp(escaped, 'i');
}
const HGR_GROUP_MATCHERS = HGR_GROUPS.map(([group, kws]) => [group, kws.map(_kwToRegex)]);

function assignGroup(normalizedLine) {
  const s = normalizedLine == null ? '' : String(normalizedLine);
  for (const [group, matchers] of HGR_GROUP_MATCHERS) {
    for (const rx of matchers) {
      if (rx.test(s)) return group;
    }
  }
  return 'additional_features';
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
 * Contradiction detection and assertAccounting are DEFERRED. conflictsWith stays undefined.
 * Grouping is delegated to assignGroup (chassis-first table); schemaHint is computed
 * afterward by inferSchemaHint in the routing layer.
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
    const normalizedLine = normalizeLine(text);
    keyDetails.push({
      sourceLineId,
      originalLine: text,
      normalizedLine,
      group: assignGroup(normalizedLine),
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
 * inferSchemaHint — advisory schema classification computed AFTER classifyHgr.
 * ADVISORY ONLY: this MUST NOT change any keyDetail's group. It reads the set of
 * groups that classification produced plus the full rawDescription (lowercased).
 *
 * Precedence: living_quarters → concession → chassis → unknown.
 *
 * @param {{ keyDetails: Array, rawDescription: string }} args
 * @returns {'chassis' | 'concession' | 'living_quarters' | 'unknown'}
 */
function inferSchemaHint({ keyDetails, rawDescription }) {
  const groups = new Set((keyDetails || []).map(k => k.group));
  const text = String(rawDescription || '').toLowerCase();

  if (groups.has('interior_buildout') && /bathroom|freshwater|fresh water|furnace|shower|living quarter/i.test(text)) {
    return 'living_quarters';
  }
  if (/concession|vendor|serving|hood|sink/i.test(text) &&
      (groups.has('interior_buildout') || groups.has('electrical_lighting') ||
       groups.has('hvac_plumbing')     || groups.has('appliances_equipment'))) {
    return 'concession';
  }
  if (groups.has('deck_loading') || groups.has('axles_tires_brakes') ||
      groups.has('frame_construction') || groups.has('coupling_support')) {
    return 'chassis';
  }
  return 'unknown';
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
      schemaHint: inferSchemaHint({ keyDetails, rawDescription }),
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

module.exports = { normalizeTrailerSpecs, detectTrailerFormat, splitLines, classifyHgr, assignGroup, inferSchemaHint };
