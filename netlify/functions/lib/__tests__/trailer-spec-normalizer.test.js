'use strict';

// T1.2-C Stage 1a — Step 6b. Behavior contract tests for trailer-spec-normalizer.
// node:test + node:assert/strict, no external deps.
//
// Deliberately DOES NOT freeze any implementation observation: no golden
// keyDetails contents, no normalizedLine strings, no group keys, no confidence
// values, no schemaHint values, no excluded rules, no warning counts beyond
// what the contract dictates. Those live in Step 6c after review of the
// inspection dump.

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

const { normalizeTrailerSpecs, assertAccounting } = require('../trailer-spec-normalizer');
const { FIXTURES, raw } = require('./fixtures/trailer-spec-normalizer.fixtures');
const { GOLDEN_GROUPS } = require('./fixtures/trailer-spec-normalizer.goldens');

function sha16(str) {
  return createHash('sha256').update(str, 'utf8').digest('hex').slice(0, 16);
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 1 — FIXTURE INTEGRITY (must run first; everything else depends on it)
// ─────────────────────────────────────────────────────────────────────────────
test('BLOCK 1 — fixture integrity', async (t) => {
  await t.test('FIXTURES.length === 15', () => {
    assert.equal(FIXTURES.length, 15);
  });

  await t.test('ids 1..15 present exactly once', () => {
    const ids = FIXTURES.map((f) => f.id).slice().sort((a, b) => a - b);
    assert.deepStrictEqual(ids, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });

  for (const f of FIXTURES) {
    await t.test(`${f.stock} (id ${f.id}) matches manifest`, () => {
      const decoded = raw(f);
      assert.equal(decoded.length, f.chars, 'chars');
      assert.equal(Buffer.byteLength(decoded, 'utf8'), f.bytes, 'bytes');
      assert.equal(sha16(decoded), f.sha256, 'sha256');
      assert.equal(decoded.includes('\t'), f.hasTab, 'hasTab');
      assert.equal(decoded.includes('\u200B'), f.hasZwsp, 'hasZwsp');
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 2 — GATE
// DSE-6556 body is delimiter-shaped on purpose so a non-null result under
// category='Trailers' proves the gate — not body unparseability — is what
// produces null under category='Trucks'.
// ─────────────────────────────────────────────────────────────────────────────
test('BLOCK 2 — category gate (DSE-6556)', async (t) => {
  const dse = FIXTURES.find((f) => f.stock === 'DSE-6556');
  const body = raw(dse);

  await t.test('category="Trucks" returns strictly null', () => {
    assert.strictEqual(normalizeTrailerSpecs(body, 'Trucks'), null);
  });

  await t.test('same body with category="Trailers" is detected as hgr_delimited', () => {
    // Stronger than not-null: proves the body IS parseable as HGR-delimited,
    // so the null under 'Trucks' can only be the gate firing before detection.
    const result = normalizeTrailerSpecs(body, 'Trailers');
    assert.equal(result.format, 'hgr_delimited');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 3 — PER-FIXTURE CONTRACT
// One subtest per non-null fixture. Byte-identity of the decoded input string
// is captured at THIS call site (assertAccounting cannot see it).
// ─────────────────────────────────────────────────────────────────────────────
test('BLOCK 3 — per-fixture contract', async (t) => {
  for (const f of FIXTURES) {
    if (f.expectsNull) continue;

    await t.test(`${f.stock} (id ${f.id})`, () => {
      const decoded = raw(f);
      const before = decoded;

      const result = normalizeTrailerSpecs(decoded, f.category);

      // BYTE IDENTITY AT THE CALL SITE — the assertion that could not live
      // inside assertAccounting because it only sees one reference.
      assert.strictEqual(decoded, before, 'decoded input reference changed across call');
      assert.equal(sha16(decoded), f.sha256, 'decoded input drifted from fixture sha256');

      assert.equal(result.format, f.expectedFormat, 'format');
      assert.equal(result.handling, f.expectedHandling, 'handling');

      if (result.handling === 'safe_fallback') {
        assert.equal(result.schemaHint, 'unknown', 'schemaHint');
        assert.equal(result.leadProse.length, 0, 'leadProse.length');
        assert.equal(result.keyDetails.length, 0, 'keyDetails.length');
        assert.equal(result.excluded.length, 0, 'excluded.length');
        assert.equal(result.warnings.length, 1, 'warnings.length');
        assert.equal(result.warnings[0].code, f.expectedWarningCode, 'warnings[0].code');
      } else if (result.handling === 'normalized') {
        const accounting = assertAccounting(result, decoded);
        assert.ok(
          accounting.ok,
          'assertAccounting violations: ' + JSON.stringify(accounting.violations),
        );
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 4 — CONTRADICTION MUTATION
// Targeted test of detectContradictions using a locally-mutated copy of
// HGR-T1261698. The bare "Axle 3500" line becomes "Axle 5200" so the low
// bare entry disagrees with the high bulleted "3500#" axle entry. 1a keeps
// BOTH entries (no deletion), marks the low one suppressed, and pushes ONE
// CONTRADICTION warning.
// ─────────────────────────────────────────────────────────────────────────────
test('BLOCK 4 — contradiction mutation (HGR-T1261698)', async (t) => {
  const f = FIXTURES.find((x) => x.stock === 'HGR-T1261698');
  const original = raw(f);
  const mutated = original.replace('Axle 3500', 'Axle 5200');

  await t.test('mutation did not touch the fixture', () => {
    const reDecoded = raw(f);
    assert.strictEqual(reDecoded, original, 'fixture bytes changed after re-decode');
    assert.equal(sha16(reDecoded), f.sha256, 'fixture sha256 drifted');
    assert.notStrictEqual(mutated, original, 'sanity: mutation actually changed something');
  });

  const result = normalizeTrailerSpecs(mutated, 'Trailers');

  // Locate the two entries by content, not by index — index-based lookups
  // would silently break if group ordering ever changes.
  const bulletedAxle = result.keyDetails.find(
    (k) => k.originalLine.includes('3500#') && /axle/i.test(k.originalLine),
  );
  const bareAxle = result.keyDetails.find((k) => k.originalLine === 'Axle 5200');

  await t.test('bulleted 3500 axle entry still present (1a never deletes)', () => {
    assert.ok(bulletedAxle, 'bulleted 3500 axle entry missing from keyDetails');
  });

  await t.test('bare 5200 axle entry still present (1a never deletes)', () => {
    assert.ok(bareAxle, 'bare "Axle 5200" entry missing from keyDetails');
  });

  await t.test('low-confidence entry marked suppressed_due_to_conflict', () => {
    assert.equal(bareAxle.presentation, 'suppressed_due_to_conflict');
  });

  await t.test('conflictsWith points at the high entry sourceLineId', () => {
    assert.equal(bareAxle.conflictsWith, bulletedAxle.sourceLineId);
  });

  await t.test('exactly one CONTRADICTION warning', () => {
    const contradictions = result.warnings.filter((w) => w.code === 'CONTRADICTION');
    assert.equal(contradictions.length, 1);
  });

  await t.test('assertAccounting still ok on the mutated result', () => {
    const accounting = assertAccounting(result, mutated);
    assert.ok(
      accounting.ok,
      'assertAccounting violations: ' + JSON.stringify(accounting.violations),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BLOCK 5 — GOLDEN GROUPING
// Frozen expected `group` per keyDetails sourceLineId for the 8 HGR fixtures.
// Failure here means CODE BEHAVIOR changed; failure in BLOCK 1 means SOURCE
// BYTES drifted — keep the two diagnostics separate. See the goldens file
// header for the "regression vs intentional improvement" resolution protocol.
// ─────────────────────────────────────────────────────────────────────────────
test('BLOCK 5 — golden grouping', async (t) => {
  const HGR_STOCKS = FIXTURES
    .filter((f) => !f.expectsNull && f.expectedHandling === 'normalized' && f.stock.startsWith('HGR-'))
    .map((f) => f.stock);

  await t.test('golden stocks match HGR normalized fixtures', () => {
    assert.deepStrictEqual(
      Object.keys(GOLDEN_GROUPS).slice().sort(),
      HGR_STOCKS.slice().sort(),
    );
  });

  await t.test('well-formedness: group non-empty string; provenance non-empty string when present', () => {
    for (const stock of Object.keys(GOLDEN_GROUPS)) {
      for (const id of Object.keys(GOLDEN_GROUPS[stock])) {
        const e = GOLDEN_GROUPS[stock][id];
        assert.ok(
          typeof e.group === 'string' && e.group.length > 0,
          `${stock} ${id}: group must be a non-empty string (got ${JSON.stringify(e.group)})`,
        );
        if ('provenance' in e) {
          assert.ok(
            typeof e.provenance === 'string' && e.provenance.length > 0,
            `${stock} ${id}: provenance must be a non-empty string when present (got ${JSON.stringify(e.provenance)})`,
          );
        }
      }
    }
  });

  for (const stock of HGR_STOCKS) {
    await t.test(stock, () => {
      const f = FIXTURES.find((x) => x.stock === stock);
      const result = normalizeTrailerSpecs(raw(f), f.category);
      const goldForStock = GOLDEN_GROUPS[stock];

      // Completeness, both directions — report BY NAME.
      const goldIds = new Set(Object.keys(goldForStock));
      const actualIds = result.keyDetails.map((k) => k.sourceLineId);
      const actualSet = new Set(actualIds);
      const missing = actualIds.filter((id) => !goldIds.has(id));
      const foreign = [...goldIds].filter((id) => !actualSet.has(id));
      assert.equal(missing.length, 0, `${stock}: missing golden ids: ${missing.join(', ')}`);
      assert.equal(foreign.length, 0, `${stock}: foreign golden ids (present in golden but not produced): ${foreign.join(', ')}`);

      // Per-line group check with provenance appended on failure.
      for (const k of result.keyDetails) {
        const g = goldForStock[k.sourceLineId];
        if (!g) continue; // already flagged by completeness check
        const suffix = g.provenance ? ` (provenance: ${g.provenance})` : '';
        assert.equal(
          k.group,
          g.group,
          `${stock} ${k.sourceLineId}: expected ${g.group}, received ${k.group}${suffix}`,
        );
      }
    });
  }
});
