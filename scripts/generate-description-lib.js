#!/usr/bin/env node
'use strict';

// Generator for the canonical description library. ONE source of truth in
// torque-hub-site emits CJS mirrors into BOTH repos' netlify/functions/lib/.
//
// BUILD-TIME TARGET PROFILES (2026-09-13)
// ---------------------------------------
// Site and admin run the SAME canonical policy but are NOT identical by
// intent. Admin holds Stage 1b (trailer normalization) dormant per admin
// commit a18fadb, "Revert Stage 1b mirror activation - presentation not
// ready for fleet-wide". Site later received shared Canonical-DX changes,
// including price decoupling, while admin intentionally remained off
// Stage 1b — and because the previous generator wrote byte-identical output
// to both targets, there was no way to deliver the shared changes without
// also reactivating Stage 1b. So admin received neither, and drifted.
//
// Each target now receives a generated profile block. Everything else is
// shared source and reaches both automatically. Reactivating Stage 1b on
// admin when Stage 2 lands is a one-line profile change here; the source is
// not touched.
//
// Run: node scripts/generate-description-lib.js

const fs   = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT       = path.join(__dirname, '..');
const ADMIN_ROOT = path.join(process.env.HOME || '', 'torquedma/torque-hub-admin');
const SRC        = path.join(ROOT, 'netlify/functions/lib/generate-description.source.js');
const REL        = 'netlify/functions/lib/generate-description.generated.js';

const HEADER       = '// GENERATED FROM generate-description.source.js — DO NOT EDIT. Run node scripts/generate-description-lib.js\n';
const PROFILE_MARK = '// GENERATED PROFILE: ';

const GUARD_NEW    = 'const normalized = STAGE1B_ENABLED && hasRawEvidence';
const GUARD_LEGACY = 'const normalized = hasRawEvidence';

const PROFILES = [
  { label: 'hub-site CJS', root: ROOT,       profile: 'site',  stage1b: true  },
  { label: 'admin CJS',    root: ADMIN_ROOT, profile: 'admin', stage1b: false },
];

function fail(msg) {
  console.error('REFUSED: ' + msg);
  process.exit(1);
}

function preambleFor(p) {
  return PROFILE_MARK + p.profile + '\n' +
         'const STAGE1B_ENABLED = ' + p.stage1b + ';\n';
}

// Recognise ONLY the two known generated shapes, exactly:
//   (1) HEADER + this target's exact profile preamble + body
//   (2) HEADER + body                      (legacy generator, pre-profile)
// Anything else returns null and is refused. A correct HEADER followed by a
// malformed or foreign profile declaration must NOT fall through as legacy —
// otherwise those declaration lines would be absorbed into the body and a
// clean committed malformed artifact could pass preflight.
function stripPreamble(text, p) {
  if (!text.startsWith(HEADER)) return null;
  const rest = text.slice(HEADER.length);

  const expectedProfile = preambleFor(p);
  if (rest.startsWith(expectedProfile)) return rest.slice(expectedProfile.length);

  if (rest.startsWith(PROFILE_MARK) || rest.startsWith('const STAGE1B_ENABLED')) return null;

  return rest;
}

// The canonical source as it read BEFORE the profile guard was introduced.
// Used only to recognise a target generated from the immediately-previous
// source state during this one architectural migration. Permits exactly one
// difference — the profile guard line — and nothing else. Does not bless
// arbitrary stale output.
function legacyPreProfileBody(source) {
  const hits = source.split(GUARD_NEW).length - 1;
  if (hits !== 1) fail('expected exactly one Stage 1b profile guard in canonical source, found ' + hits);
  return source.replace(GUARD_NEW, GUARD_LEGACY);
}

const sourceText = fs.readFileSync(SRC, 'utf8');
const legacyBody = legacyPreProfileBody(sourceText);

// ── PRE-WRITE GATE ────────────────────────────────────────────────────────
// Refuse UNEXPLAINED drift, not all drift. A target may legitimately be
// stale-but-clean, or dirty-but-explainable as generated output of the
// current or immediately-previous source. What must never be overwritten
// silently is a hand-edit corresponding to no source state at all.
for (const p of PROFILES) {
  let top = '';
  try {
    top = execFileSync('git', ['rev-parse', '--show-toplevel'],
      { cwd: p.root, encoding: 'utf8' }).trim();
  } catch (e) {
    fail(p.profile + ' target is not a git worktree: ' + p.root);
  }
  if (fs.realpathSync(top) !== fs.realpathSync(p.root)) {
    fail(p.profile + ' path resolves to a different repository root: ' + p.root + ' -> ' + top);
  }

  const target = path.join(p.root, REL);
  if (!fs.existsSync(target)) {
    fail(p.profile + ' generated target does not exist: ' + target +
         ' (this generator overwrites known targets; it does not create them)');
  }
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', REL],
      { cwd: p.root, stdio: 'ignore' });
  } catch (e) {
    fail(p.profile + ' generated target is not tracked by git: ' + target);
  }

  const body = stripPreamble(fs.readFileSync(target, 'utf8'), p);
  if (body === null) {
    fail(p.profile + ' target does not carry a recognised generated preamble — ' +
         'refusing to overwrite: ' + target);
  }

  let porcelain = '';
  try {
    porcelain = execFileSync('git', ['status', '--porcelain', '--', REL],
      { cwd: p.root, encoding: 'utf8' }).trim();
  } catch (e) {
    fail('could not read git status in ' + p.root + ': ' + e.message);
  }

  if (porcelain && body !== sourceText && body !== legacyBody) {
    fail(p.profile + ' target is dirty AND its body matches neither the current ' +
         'source nor the immediately-previous source state. This is an ' +
         'unexplained direct edit to a generated file: ' + target);
  }
}

// ── WRITE ─────────────────────────────────────────────────────────────────
for (const p of PROFILES) {
  p.target   = path.join(p.root, REL);
  p.expected = HEADER + preambleFor(p) + sourceText;
  fs.writeFileSync(p.target, p.expected, 'utf8');
  console.log('Wrote [' + p.label + '] profile=' + p.profile +
              ' STAGE1B_ENABLED=' + p.stage1b + ': ' + p.target);
}

// ── POST-WRITE VERIFICATION ───────────────────────────────────────────────
// Proves the filesystem holds what was intended — catches truncated or
// partial writes — and that both targets carry the identical canonical body.
for (const p of PROFILES) {
  const readBack = fs.readFileSync(p.target, 'utf8');
  if (readBack !== p.expected)                   fail('post-write mismatch for ' + p.profile + ': ' + p.target);
  if (stripPreamble(readBack, p) !== sourceText) fail('post-write body diverges from source for ' + p.profile + ': ' + p.target);
}
console.log('\nVerified: both targets carry the identical canonical body; only the profile block differs.');
console.log('Done.');
