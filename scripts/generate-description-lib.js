#!/usr/bin/env node
'use strict';

// Generator for the canonical description library. Reads the single source of
// truth in torque-hub-site and emits CJS mirrors into BOTH repos' netlify/
// functions/lib/. Mirrors the usage-display / taxonomy generator pattern.
// Run: node scripts/generate-description-lib.js

const fs   = require('fs');
const path = require('path');

const ROOT       = path.join(__dirname, '..');
const ADMIN_ROOT = path.join(process.env.HOME, 'torquedma/torque-hub-admin');
const SRC        = path.join(ROOT, 'netlify/functions/lib/generate-description.source.js');

const HEADER = '// GENERATED FROM generate-description.source.js — DO NOT EDIT. Run node scripts/generate-description-lib.js\n';

const sourceText = fs.readFileSync(SRC, 'utf8');
const emitted    = HEADER + sourceText;

const TARGETS = [
  { path: path.join(ROOT,       'netlify/functions/lib/generate-description.generated.js'), label: 'hub-site CJS' },
  { path: path.join(ADMIN_ROOT, 'netlify/functions/lib/generate-description.generated.js'), label: 'admin CJS' },
];

for (const t of TARGETS) {
  fs.mkdirSync(path.dirname(t.path), { recursive: true });
  fs.writeFileSync(t.path, emitted, 'utf8');
  console.log(`Wrote [${t.label}]: ${t.path}`);
}

console.log('\nDone.');
