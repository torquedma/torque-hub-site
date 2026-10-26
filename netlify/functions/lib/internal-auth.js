'use strict';
// internal-auth.js — shared-secret caller authentication for server functions (security 7c, 2026-10-12).
// One helper for every protected function. The secret value lives only in the function environment;
// it is never logged, returned or compared in a way that leaks its length or content.
const crypto = require('crypto');

// Secrets shorter than this are treated as not configured: a short value is guessable, and a
// missing one must fail closed rather than silently accept every caller.
const MIN_SECRET_LENGTH = 32;

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest();
}

function headerValue(event, headerName) {
  const headers = (event && event.headers) || {};
  const wanted = String(headerName).toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === wanted) return headers[key];
  }
  return undefined;
}

// Returns { ok, reason } with reason one of: ok | missing | mismatch | not_configured.
function checkSharedSecret(event, headerName, envName) {
  const configured = process.env[envName];
  if (typeof configured !== 'string' || configured.length < MIN_SECRET_LENGTH) return { ok: false, reason: 'not_configured' };
  const presented = headerValue(event, headerName);
  if (typeof presented !== 'string' || presented.length === 0) return { ok: false, reason: 'missing' };
  // Compare fixed-length digests so neither the length nor the content of the secret leaks through timing.
  const match = crypto.timingSafeEqual(sha256(presented), sha256(configured));
  return match ? { ok: true, reason: 'ok' } : { ok: false, reason: 'mismatch' };
}

// A mode variable is 'log' only when it says exactly that. Unset, 'enforce' or anything else
// (including a typo) is 'enforce': a misconfiguration fails closed.
function authMode(value) {
  return String(value || '').trim().toLowerCase() === 'log' ? 'log' : 'enforce';
}

module.exports = { checkSharedSecret, authMode, MIN_SECRET_LENGTH };
