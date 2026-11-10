'use strict';
// dx-draft-first-no-promotion.test.js - DRAFT-FIRST (Owner standing direction Ingest -> Draft;
// Chief 1 HGR Draft-first defect, 2026-11-06). generate-dx-background must never set status.
// Behaviour is covered by lib/__tests__/dx-draft-lifecycle-guard.test.js (stubbed handler runs);
// this file is the static tripwire that stops the promotion from being reintroduced.
// Run: node --test netlify/functions/__tests__/dx-draft-first-no-promotion.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'generate-dx-background.js'), 'utf8');
const code = SRC.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n'); // comments excluded

test('N1: no status assignment to published anywhere in generate-dx-background', () => {
  assert.ok(!/status\s*[:=]\s*['"`]published['"`]/.test(code), 'found a published status write');
  assert.ok(!/\.status\s*=(?!=)/.test(code), 'found a status assignment');
});

test('N2: the retired promotion predicate is no longer imported or called', () => {
  assert.ok(!/dxMayPromoteDraft/.test(code));
});

test('N3: every inventory update payload in the file is built without a status key', () => {
  // The only literal objects passed to .update( are DX/completion payloads; none may carry status.
  const updates = code.match(/\.update\(\{[\s\S]*?\}\)/g) || [];
  for (const u of updates) assert.ok(!/\bstatus\s*:/.test(u), 'status key in: ' + u.slice(0, 80));
});

test('N4: the draft path still records the withheld promotion for observability', () => {
  assert.ok(/draft_promotion_withheld\+\+/.test(code));
  assert.ok(/\[DRAFT-LIFECYCLE-NO-PROMOTE\]/.test(code));
});
