// ============================================================
// Sofrito Studio — http.js
// http.js
// Split from worker.js 2026-10-04. No behavior change.
// ============================================================

import { timingSafeEqual } from 'node:crypto';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Admin routes must not be callable cross-origin: strip the wildcard CORS
// headers so a browser on any other site cannot read admin responses, even
// with a stolen key in play. Same-origin and non-browser clients (curl) are
// unaffected — they never needed CORS.
const stripCors = (res) => {
  const headers = new Headers(res.headers);
  headers.delete('Access-Control-Allow-Origin');
  headers.delete('Access-Control-Allow-Methods');
  headers.delete('Access-Control-Allow-Headers');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
};

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS, ...headers },
  });

const fail = (msg, status = 400) => json({ ok: false, error: msg }, status);

// Body-size guards. Public JSON routes reject anything over 256KB with 413
// before buffering; webhook raw bodies (needed intact for signature
// verification) get a 1MB ceiling. Content-Length is checked first for a fast
// reject, then the buffered text as a backstop (chunked requests omit it).
const MAX_JSON_BYTES = 256 * 1024;
const MAX_WEBHOOK_BYTES = 1024 * 1024;

const bodyTooLarge = (request, maxBytes) => {
  const len = Number(request.headers.get('content-length') || 0);
  return Number.isFinite(len) && len > maxBytes;
};

const tooLargeError = () => {
  const err = new Error('body too large');
  err.status = 413;
  return err;
};

// Read bytes incrementally so chunked requests cannot bypass the memory limit.
const readLimitedText = async (request, maxBytes) => {
  if (bodyTooLarge(request, maxBytes)) throw tooLargeError();
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  const parts = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => {});
        throw tooLargeError();
      }
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
    return parts.join('');
  } finally {
    reader.releaseLock();
  }
};

const readJson = async (request, maxBytes = MAX_JSON_BYTES) =>
  JSON.parse(await readLimitedText(request, maxBytes));

const readWebhookText = (request) => readLimitedText(request, MAX_WEBHOOK_BYTES);

// Maps body-parse errors to responses: 413 for oversized, 400 otherwise.
const badBody = (e) => (e && e.status === 413 ? fail('Request body too large.', 413) : fail('Please send valid JSON.', 400));

const hmacSha256 = (secret, body) =>
  crypto.subtle
    .importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    .then((k) => crypto.subtle.sign('HMAC', k, new TextEncoder().encode(body)))
    .then((sig) => [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join(''));

const sha256Hex = (str) =>
  crypto.subtle
    .digest('SHA-256', new TextEncoder().encode(String(str)))
    .then((buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join(''));

const safeEqual = (a, b) => {
  const A = new TextEncoder().encode(String(a));
  const B = new TextEncoder().encode(String(b));
  if (A.byteLength !== B.byteLength) return false;
  return timingSafeEqual(A, B);
};

const authorized = (env, request) => {
  const key = env.ADMIN_KEY;
  if (!key) return false;
  const header = request.headers.get('authorization') || '';
  return header.startsWith('Bearer ') && safeEqual(header.slice(7), key);
};

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);

// Template substitution for HTML emails. Values are HTML-escaped by default
// because most interpolated data is lead-controlled (name, business, message,
// email). Use triple braces {{{key}}} ONLY for server-rendered HTML fragments
// that are already escaped at build time (currently: the checkout button in
// lead_acknowledgement.html). Never pass raw lead input through {{{}}}.
const substitute = (html, data = {}) =>
  html.replace(/{{{([\w.]+)}}}|{{([\w.]+)}}/g, (_, rawKey, escKey) => {
    const k = rawKey || escKey;
    const v = k.split('.').reduce((acc, part) => (acc == null ? acc : acc[part]), data);
    if (v == null) return '';
    return rawKey ? String(v) : escapeHtml(v);
  });

const uuid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();
const nowEpoch = () => Math.floor(Date.now() / 1000);
// leads.paid_at is INTEGER epoch seconds (migration 0009). Never feed it to
// new Date() directly — epoch seconds read as milliseconds land in Jan 1970.
// paidAtMs() normalizes both epoch seconds and ISO strings to milliseconds.
const paidAtMs = (v) => (typeof v === 'number' ? v * 1000 : new Date(v).getTime());
// Calendly prefill links must be URL-encoded server-side: template
// substitution HTML-escapes but does not URL-encode, so a name like
// "R&B Foods" would corrupt the query string and break prefill.
const calendlyPrefillUrl = (name, email) =>
  `https://calendly.com/sofrito-studio/sofrito-strategy-session?name=${encodeURIComponent(name || '')}&email=${encodeURIComponent(email || '')}`;

async function verifyTurnstile(env, token) {
  if (!token) return false;
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) return false;
  // Fail closed on hostname mismatch: a token minted for another site must
  // not verify here. Expected hostname comes from SITE_URL (production:
  // sofritostudio.com).
  let expectedHostname = 'sofritostudio.com';
  try {
    expectedHostname = new URL(env.SITE_URL || 'https://sofritostudio.com').hostname;
  } catch {
    /* keep default */
  }
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
    });
    const data = await res.json();
    if (!data.success) return false;
    if (!data.hostname || data.hostname !== expectedHostname) {
      console.error('turnstile hostname mismatch', data.hostname);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

const BUSINESS_TYPES = ['food_truck', 'restaurant', 'cpg', 'other'];
const CHANNELS = ['sprint_page', 'boh_sprint_page', 'sprint_boh', 'api', 'calendly', 'google_my_business', 'social', 'referral', 'founding_application', 'other'];

// ------------------------------------------------------------
// Shared package fallback + lead scoring (moved from worker.js —
// billing.js, booking.js and automations.js also use these, and lib
// modules cannot import from the worker entry point).
// ------------------------------------------------------------
const PACKAGE_FALLBACK = {
  session: { name: 'Sofrito Session', description: '1:1 brand session', price_cents: 40000, billing: 'one_time' },
  sprint: { name: 'Brand & Web Sprint', description: 'Brand + website in 48 hours', price_cents: 99700, billing: 'one_time' },
};

const DEFAULT_WEIGHTS = {
  package_specific: 30,
  budget_set: 20,
  message_length_30: 25,
  business_name: 15,
  phone: 10,
  stage_timeline_set: 20,
  decision_owner: 5,
  max: 100,
};

async function scoreLead(env, lead) {
  const raw = await env.CONFIG.get('scoring/weights');
  const w = raw ? { ...DEFAULT_WEIGHTS, ...JSON.parse(raw) } : DEFAULT_WEIGHTS;
  let score = 0;
  if (lead.package_interest) score += w.package_specific;
  if (lead.budget) score += w.budget_set;
  if ((lead.message || '').trim().length >= 30) score += w.message_length_30;
  if (lead.business_name) score += w.business_name;
  if (lead.phone) score += w.phone;
  if (lead.stage && lead.timeline) score += w.stage_timeline_set;
  if (lead.decision === 'owner-operator') score += w.decision_owner;
  return Math.min(score, w.max);
}

// ------------------------------------------------------------
// Legacy retail redirects (shelved 2026-09-05)
// The assets `_redirects` engine cannot express these safely: its globs apply
// to real files too, so `/privacy*` → /privacy.html loops, and `/blog/*` would
// swallow /blog/*.html posts. The Worker runs first, so it can redirect only
// the paths that are NOT real assets on disk.
// ------------------------------------------------------------
const LEGACY_REDIRECTS = [
  { match: (p) => p.startsWith('/privacy'), to: '/privacy.html' },
  { match: (p) => p.startsWith('/terms'), to: '/terms.html' },
  { match: (p) => p.startsWith('/services'), to: '/' },
  { match: (p) => p.startsWith('/pricing'), to: '/' },
    { match: (p) => p.startsWith('/blog/'), to: '/' },
    { match: (p) => p.startsWith('/posts/'), to: '/' },
    { match: (p) => p === '/sprint.html', to: '/' },
];

function legacyRedirectFor(pathname) {
  for (const rule of LEGACY_REDIRECTS) {
    if (rule.match(pathname)) return rule.to;
  }
  return null;
}

const daySince = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

function formatSessionDate(value, timezone, options = {}) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'UTC',
      ...options,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...options }).format(date);
  }
}
export {
  CORS,
  stripCors,
  json,
  fail,
  MAX_JSON_BYTES,
  MAX_WEBHOOK_BYTES,
  bodyTooLarge,
  tooLargeError,
  readJson,
  readWebhookText,
  badBody,
  hmacSha256,
  sha256Hex,
  safeEqual,
  authorized,
  escapeHtml,
  substitute,
  uuid,
  nowIso,
  nowEpoch,
  paidAtMs,
  daySince,
  formatSessionDate,
  calendlyPrefillUrl,
  verifyTurnstile,
  legacyRedirectFor,
  BUSINESS_TYPES,
  CHANNELS,
  PACKAGE_FALLBACK,
  DEFAULT_WEIGHTS,
  scoreLead,
};
