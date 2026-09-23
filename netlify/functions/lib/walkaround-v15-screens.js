'use strict';
// walkaround-v15-screens.js — PURE logic for the v1.5 governed-evidence Walk Around
// producer (walkaround-v1.5-*-geb). No I/O, no network, no database.
//
//   ENGINES             fixed allowlist: engine label → model id. Nothing else accepted.
//                       Pinned to the accepted production translator (Chief model ruling
//                       2026-09-23: walkaround-v1.5-opus-5-5-geb). The Fable comparison
//                       engine was removed; its rows remain in the queue as evidence.
//   PRODUCTION_ENGINE   the only engine ordinary generation may use.
//   resolveEngine       the label is REQUIRED and must be in ENGINES; anything else
//                       (including a missing label) is rejected, so a stray or mistyped
//                       call is refused rather than spending money and writing rows.
//   renderBundle        turns a frozen understanding_snapshot bundle into the model's
//                       user message, tier by tier, with claim ids.
//   validateShape       the v1.4 rendered contract (same rules as ADMIN publish_walkaround).
//   validateGrounding   every paragraph / checklist item / footer carries >=1 grounding id,
//                       and every id belongs to THIS frozen bundle (claim ids or V1..Vn).
//   screenContent       deterministic screens: numbers must be in evidence, M_X terms only
//                       inside verify-grounded text, photo language only when grounded to a
//                       photo observation, maintenance (Rule 7a), cost/value/market,
//                       reputation/durability, productivity/speed, generalizations, age,
//                       Markdown.

const PRODUCTION_ENGINE = 'walkaround-v1.5-opus-5-5-geb';
const ENGINES = Object.freeze({
  [PRODUCTION_ENGINE]: 'claude-opus-5-5',
});

function resolveEngine(label) {
  if (typeof label !== 'string' || !Object.prototype.hasOwnProperty.call(ENGINES, label)) {
    const err = new Error('unsupported engine label');
    err.code = 'ENGINE_REJECTED';
    throw err;
  }
  return { engine: label, model: ENGINES[label] };
}

const TIER_HEADINGS = {
  unit_fact_dealer_attributed: 'UNIT FACTS AND DEALER STATEMENTS (attributed to the dealer; keep that attribution)',
  manufacturer_fact_applicable: 'MANUFACTURER FACTS THAT APPLY TO THIS UNIT (applicability established; attribute to the manufacturer)',
  photo_observation: 'APPROVED PHOTO OBSERVATIONS (reviewed observations from this listing\'s own photos; use only as stated)',
};

function verifyIds(bundle) {
  return (bundle.verify_on_unit || []).map((_, i) => 'V' + (i + 1));
}

function renderBundle(bundle) {
  const lines = [];
  lines.push('BUYER QUESTION(S) THIS WALKAROUND MUST RESOLVE:');
  (bundle.buyer_questions || []).forEach((q, i) => lines.push(`Q${i + 1}. ${q}`));
  for (const tier of Object.keys(TIER_HEADINGS)) {
    const items = (bundle.items || []).filter(it => it.tier === tier);
    if (!items.length) continue;
    lines.push('');
    lines.push(TIER_HEADINGS[tier] + ':');
    for (const it of items) {
      const flag = it.conflict === 'conflict' ? ' [CONFLICTS WITH OTHER EVIDENCE — unresolved; present as a question, never pick a side]' : '';
      lines.push(`[${it.claim_id}] ${it.text}${flag}`);
    }
  }
  const v = bundle.verify_on_unit || [];
  if (v.length) {
    lines.push('');
    lines.push('VERIFY-ON-UNIT ITEMS (unresolved; may only be used as questions to ask or things to check, never as facts):');
    v.forEach((t, i) => lines.push(`[V${i + 1}] ${t}`));
  }
  lines.push('');
  lines.push('Write The Walkaround from this evidence only. Output only the JSON.');
  return lines.join('\n');
}

// Same rules as ADMIN admin-write validateWalkaroundPayload (v1.4 rendered contract).
function validateShape(p) {
  const errs = [];
  if (!p || typeof p !== 'object' || Array.isArray(p)) return ['payload is not an object'];
  if (p.abstain === true) return [];
  if (p.version != null && p.version !== '1.4') errs.push('version is not 1.4');
  const tt = p.torque_take;
  if (!Array.isArray(tt) || tt.length < 1 || tt.length > 3) errs.push('torque_take must hold 1 to 3 paragraphs');
  else tt.forEach((s, i) => { if (typeof s !== 'string' || !s.trim()) errs.push(`torque_take[${i}] empty`); });
  const df = p.decision_factors;
  if (!df || typeof df !== 'object') errs.push('missing decision_factors');
  else {
    if (!Array.isArray(df.makes_it_a_yes) || df.makes_it_a_yes.length !== 4) errs.push('makes_it_a_yes must hold exactly 4 items');
    else df.makes_it_a_yes.forEach((s, i) => { if (typeof s !== 'string' || !s.trim()) errs.push(`makes_it_a_yes[${i}] empty`); });
    if (typeof df.makes_it_a_yes_footer !== 'string' || !df.makes_it_a_yes_footer.trim()) errs.push('missing footer');
  }
  for (const k of ['meet', 'meet_title', 'identity', 'buyer_checklist']) if (Object.prototype.hasOwnProperty.call(p, k)) errs.push(`obsolete key ${k}`);
  return errs;
}

// Grounding map contract: { torque_take: [[ids],...], checklist: [[ids] x4], footer: [ids] }
function validateGrounding(p, g, bundle) {
  const errs = [];
  if (p && p.abstain === true) return errs;
  const allowed = new Set([...(bundle.items || []).map(it => it.claim_id), ...verifyIds(bundle)]);
  if (!g || typeof g !== 'object') return ['missing _grounding'];
  const check = (ids, where) => {
    if (!Array.isArray(ids) || !ids.length) { errs.push(`${where}: no grounding ids`); return; }
    for (const id of ids) if (!allowed.has(id)) errs.push(`${where}: id ${id} not in frozen snapshot`);
  };
  const tt = (p.torque_take || []);
  if (!Array.isArray(g.torque_take) || g.torque_take.length !== tt.length) errs.push('grounding.torque_take length mismatch');
  else g.torque_take.forEach((ids, i) => check(ids, `torque_take[${i}]`));
  const items = (p.decision_factors && p.decision_factors.makes_it_a_yes) || [];
  if (!Array.isArray(g.checklist) || g.checklist.length !== items.length) errs.push('grounding.checklist length mismatch');
  else g.checklist.forEach((ids, i) => check(ids, `checklist[${i}]`));
  check(g.footer, 'footer');
  return errs;
}

// ---- content screens -------------------------------------------------------
const SCREENS = [
  ['MAINTENANCE_7A', /\b(service|maintenance)\s+(record|records|history|log|logs|documentation)|\brepair history|\breceipts?\b|\binvoices?\b|last serviced/i],
  ['COST_VALUE_MARKET', /\b(cost|costs|costly|money|cheap|expensive|value|worth|resale|bargain|deal|priced|affordable|savings?|save you|discount|discounted|market)\b/i],
  ['REPUTATION_DURABILITY', /\b(reliab\w*|durab\w*|proven|known for|legendary|long[- ]lasting|lifespan|longevity|dependab\w*|bulletproof|workhorse)\b/i],
  ['PRODUCTIVITY_SPEED', /\b(faster|quicker|productiv\w*|efficien\w*|saves? (?:you )?time|more work|in less time)\b/i],
  ['GENERALIZATION', /\b(usually|typically|tends? to|generally|most buyers|experienced (?:crews|buyers|operators)|first-time buyers)\b/i],
  ['AGE_ARITHMETIC', /\b\d+[- ]year[- ]old\b|\bdecades? old\b/i],
  ['MARKDOWN', /(\*\*|__|^#|`|^\s*[-*•]\s)/m],
];
// Chief-accepted idioms (2026-09-23 model ruling) — EXACTLY the two phrasings accepted as
// false positives, and nothing broader:
//   "worth seeing in person"                    (not "worth seeing," followed by anything else)
//   "<is|are|was|were|be> part of the deal"     (not "the best part of the deal", etc.)
// Removed ONLY from the text the COST_VALUE_MARKET screen reads; every other screen sees
// the full text, and any other value wording in the sentence still fires.
const COST_VALUE_IDIOMS = /\bworth seeing in person\b|\b(?:is|are|was|were|be) part of the deal\b/gi;

const PHOTO_WORDS = /\b(photo|photos|pictured|picture|image|images|shown in)\b/i;

function numbersIn(s) {
  return (String(s).match(/\d[\d,]*(?:\.\d+)?/g) || []).map(n => n.replace(/,/g, ''));
}

function screenContent(p, g, bundle, mxClaims) {
  const findings = [];
  if (!p || p.abstain === true) return findings;
  const evidenceText = [
    ...(bundle.items || []).map(it => it.text),
    ...(bundle.verify_on_unit || []),
    ...(bundle.buyer_questions || []),
  ].join(' \n ');
  const evidenceNums = new Set(numbersIn(evidenceText));
  // photo numbering in evidence is 1-based "photo 1", "photos 2 to 5"
  const photoIds = new Set((bundle.items || []).filter(it => it.tier === 'photo_observation').map(it => it.claim_id));
  const vIds = new Set(verifyIds(bundle));
  const units = [];
  (p.torque_take || []).forEach((t, i) => units.push({ where: `torque_take[${i}]`, text: t, ids: (g && g.torque_take && g.torque_take[i]) || [] }));
  ((p.decision_factors && p.decision_factors.makes_it_a_yes) || []).forEach((t, i) => units.push({ where: `checklist[${i}]`, text: t, ids: (g && g.checklist && g.checklist[i]) || [] }));
  if (p.decision_factors) units.push({ where: 'footer', text: p.decision_factors.makes_it_a_yes_footer || '', ids: (g && g.footer) || [] });

  for (const u of units) {
    for (const [name, re] of SCREENS) {
      const txt = name === 'COST_VALUE_MARKET' ? u.text.replace(COST_VALUE_IDIOMS, ' ') : u.text;
      if (re.test(txt)) findings.push({ screen: name, where: u.where, match: (txt.match(re) || [''])[0] });
    }
    for (const n of numbersIn(u.text)) if (!evidenceNums.has(n)) findings.push({ screen: 'NUMBER_NOT_IN_EVIDENCE', where: u.where, match: n });
    if (PHOTO_WORDS.test(u.text) && !u.ids.some(id => photoIds.has(id))) findings.push({ screen: 'PHOTO_CLAIM_UNGROUNDED', where: u.where, match: (u.text.match(PHOTO_WORDS) || [''])[0] });
    for (const mx of (mxClaims || [])) {
      for (const term of ((mx.value && mx.value.assert_terms) || [])) {
        if (u.text.toLowerCase().includes(String(term).toLowerCase()) && !u.ids.some(id => vIds.has(id))) {
          findings.push({ screen: 'MX_AS_FACT', where: u.where, match: term });
        }
      }
    }
  }
  return findings;
}

module.exports = { ENGINES, PRODUCTION_ENGINE, resolveEngine, renderBundle, validateShape, validateGrounding, screenContent, verifyIds };
