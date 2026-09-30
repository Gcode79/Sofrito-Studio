// ============================================================
// Sofrito Studio — Pivot Worker (single entry point)
// Job: 1d + 2
// MCP: cloudflare-bindings, cloudflare-observability
// Last updated: 2026-09-04
// Purpose: /api/* edge logic + queue consumers + scheduled CRM
//          automation. Static site serves from public/ via ASSETS.
//
// Routes:
//   GET  /api/health                 -> liveness
//   GET  /api/packages               -> service tiers (KV truth)
//   POST /api/contact                -> lead capture + scoring (D1 + queues)
//   POST /api/founding-application   -> founding round application (D1 leads, founder notify + applicant ack)
//   POST /api/newsletter             -> Buttondown subscribe
//   POST /api/events                 -> server-side analytics events
//   GET  /api/dashboard              -> CRM summary (admin)
//   GET  /api/leads                  -> lead list (admin, filters)
//   PATCH /api/leads/:id             -> update status/notes (admin)
//   GET  /api/revenue                -> revenue report (admin)
//   POST /api/stripe-webhook        -> revenue logging (verifies stripe-signature)
//   POST /api/calendly-webhook     -> booking ledger + mirror lead (verifies signature)
//
// Queue consumers:
//   EMAIL_QUEUE     {kind:'email', ...}  -> Resend send + delivery tracking
//   WEBHOOK_QUEUE   {topic, payload}     -> external webhook fire-and-forget (Zapier)
//
// Scheduled (hourly cron "0 * * * *"):
//   lead nurture, session reminders and follow-ups, checkout recovery,
//   owner reminders, and the Monday 17:00 UTC weekly digest.
// ============================================================

import { timingSafeEqual } from 'node:crypto';
import abandonedNudge from './emails/abandoned-nudge.html';
import abandonedNudge2 from './emails/abandoned-nudge-2.html';
import bookingCancelNotify from './emails/booking-cancel-notify.html';
import bookingLink from './emails/booking-link.html';
import bookingNotify from './emails/booking-notify.html';
import bookingNudge from './emails/booking-nudge.html';
import disputeNotify from './emails/dispute-notify.html';
import followUpDay1 from './emails/follow-up-day1.html';
import followUpDay30 from './emails/follow-up-day30.html';
import followUpLeadReminder from './emails/follow-up-lead-reminder.html';
import formConfirm from './emails/form-confirm.html';
import invoicePaidNotify from './emails/invoice-paid-notify.html';
import invoiceTriggerNotify from './emails/invoice-trigger-notify.html';
import leadWon from './emails/lead-won.html';
import leadAcknowledgement from './emails/lead_acknowledgement.html';
import newLeadNotify from './emails/new-lead-notify.html';
import onboardingPack from './emails/onboarding-pack.html';
import paymentFailedNotify from './emails/payment-failed-notify.html';
import paymentNudge from './emails/payment-nudge.html';
import priceOverrideNotify from './emails/price-override-notify.html';
import receipt from './emails/receipt.html';
import referralInvite from './emails/referral-invite.html';
import refundNotify from './emails/refund-notify.html';
import revenueNotify from './emails/revenue-notify.html';
import sessionReminder from './emails/session-reminder.html';
import unbilledFinalNotify from './emails/unbilled-final-notify.html';
import unbookedSessionNotify from './emails/unbooked-session-notify.html';
import welcome1 from './emails/welcome-1.html';
import welcome2 from './emails/welcome-2.html';
import welcome3 from './emails/welcome-3.html';

const REPO_EMAIL_TEMPLATES = Object.freeze({
  'abandoned-nudge.html': abandonedNudge,
  'abandoned-nudge-2.html': abandonedNudge2,
  'booking-cancel-notify.html': bookingCancelNotify,
  'booking-link.html': bookingLink,
  'booking-notify.html': bookingNotify,
  'booking-nudge.html': bookingNudge,
  'dispute-notify.html': disputeNotify,
  'follow-up-day1.html': followUpDay1,
  'follow-up-day30.html': followUpDay30,
  'follow-up-lead-reminder.html': followUpLeadReminder,
  'form-confirm.html': formConfirm,
  'invoice-paid-notify.html': invoicePaidNotify,
  'invoice-trigger-notify.html': invoiceTriggerNotify,
  'lead-won.html': leadWon,
  'lead_acknowledgement.html': leadAcknowledgement,
  'new-lead-notify.html': newLeadNotify,
  'onboarding-pack.html': onboardingPack,
  'payment-failed-notify.html': paymentFailedNotify,
  'payment-nudge.html': paymentNudge,
  'price-override-notify.html': priceOverrideNotify,
  'receipt.html': receipt,
  'referral-invite.html': referralInvite,
  'refund-notify.html': refundNotify,
  'revenue-notify.html': revenueNotify,
  'session-reminder.html': sessionReminder,
  'unbilled-final-notify.html': unbilledFinalNotify,
  'unbooked-session-notify.html': unbookedSessionNotify,
  'welcome-1.html': welcome1,
  'welcome-2.html': welcome2,
  'welcome-3.html': welcome3,
});

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

const readJson = async (request, maxBytes = MAX_JSON_BYTES) => {
  if (bodyTooLarge(request, maxBytes)) throw tooLargeError();
  const raw = await request.text();
  if (raw.length > maxBytes) throw tooLargeError();
  return JSON.parse(raw);
};

const readWebhookText = async (request) => {
  if (bodyTooLarge(request, MAX_WEBHOOK_BYTES)) throw tooLargeError();
  const raw = await request.text();
  if (raw.length > MAX_WEBHOOK_BYTES) throw tooLargeError();
  return raw;
};

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

// ------------------------------------------------------------
// Lead scoring (KV weights, static-first)
// ------------------------------------------------------------
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

const PACKAGE_FALLBACK = {
  session: { name: 'Sofrito Session', description: '1:1 brand session', price_cents: 40000, billing: 'one_time' },
  sprint: { name: 'Brand & Web Sprint', description: 'Brand + website in 48 hours', price_cents: 99700, billing: 'one_time' },
};

// ------------------------------------------------------------
// Queue helpers
// ------------------------------------------------------------
async function trackEmailQueued(env, job) {
  const tracked = {
    ...job,
    emails_sent_id: uuid(),
    email_log_id: uuid(),
  };
  const metadata = JSON.stringify({
    ...(job.metadata || {}),
    ...(job.lead_id ? { lead_id: job.lead_id } : {}),
  });
  const templateName = job.template || job.log_type || 'direct-email';
  const logType = job.log_type || job.template || 'direct_email';

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT OR IGNORE INTO emails_sent (id, created_at, to_email, template, subject, status, metadata)
         VALUES (?, ?, ?, ?, ?, 'queued', ?)`
      )
        .bind(tracked.emails_sent_id, nowIso(), job.to, templateName, job.subject, metadata),
      env.DB.prepare(
        `INSERT OR IGNORE INTO email_log (id, created_at, lead_id, type, status)
         VALUES (?, ?, ?, ?, 'queued')`
      )
        .bind(tracked.email_log_id, nowIso(), job.log_lead_id || job.lead_id || 'system', logType),
    ]);
  } catch (e) {
    console.error('email tracking insert failed', logType, e.message);
  }

  return tracked;
}

async function updateEmailTracking(env, job, result, providerId = null) {
  const status = result.ok ? 'sent' : 'failed';
  const error = result.ok ? null : String(result.error || `resend_${result.status || 0}`).slice(0, 500);
  try {
    const updates = [];
    if (job.emails_sent_id) {
      updates.push(
        env.DB.prepare(
          `UPDATE emails_sent SET status = ?, provider_id = ? WHERE id = ?`
        )
          .bind(status, providerId, job.emails_sent_id)
      );
    }
    if (job.email_log_id) {
      updates.push(
        env.DB.prepare(
          `UPDATE email_log SET status = ?, provider_id = ?, error = ? WHERE id = ?`
        )
          .bind(status, providerId, error, job.email_log_id)
      );
    }
    if (updates.length) await env.DB.batch(updates);
  } catch (e) {
    console.error('email tracking update failed', job.log_type || job.template || 'direct_email', e.message);
  }
}

async function enqueueEmail(env, job) {
  const tracked = await trackEmailQueued(env, job);
  try {
    await env.EMAIL_QUEUE.send(tracked);
  } catch (e) {
    await updateEmailTracking(env, tracked, { ok: false, error: `queue: ${e.message}` });
    throw e;
  }
}

async function enqueueWebhook(env, topic, payload) {
  await env.WEBHOOK_QUEUE.send({ topic, payload, ts: nowIso() });
}

const TIKTOK_PIXEL_ID = 'DAD07T3C77U98E0UK9L0';

async function tiktokTrack(env, { event, eventId, user, page, contents, value, currency, ip, userAgent }) {
  const token = env.TIKTOK_EVENTS_TOKEN;
  if (!token) return;
  try {
    const norm = {};
    if (user.email) norm.email = await sha256Hex(String(user.email).trim().toLowerCase());
    if (user.phone_number) norm.phone_number = await sha256Hex(String(user.phone_number).replace(/\D/g, ''));
    if (user.external_id) norm.external_id = await sha256Hex(String(user.external_id));
    const context = {};
    if (page) context.page = { url: page };
    if (ip) context.ip = ip;
    if (userAgent) context.user_agent = userAgent;
    const res = await fetch('https://business-api.tiktok.com/open_api/v1.3/event/track/', {
      method: 'POST',
      headers: { 'Access-Token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_source: 'web',
        event_source_id: TIKTOK_PIXEL_ID,
        data: [{
          event,
          event_id: eventId,
          event_time: Math.floor(Date.now() / 1000),
          test_event_code: 'TEST95993',
          user: norm,
          ...(Object.keys(context).length ? { context } : {}),
          properties: {
            contents,
            value: value || 0,
            currency: currency || 'USD',
          },
        }],
      }),
    });
    const body = await res.text();
    if (!res.ok) console.error('tiktok events api failed', res.status, body);
  } catch (e) {
    console.error('tiktok events api error', e.message || e);
  }
}

async function sendResend(env, { to, subject, html }) {
  const key = env.RESEND_API_KEY;
  if (!key) return { ok: false, status: 503, body: '{}' };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${env.RESEND_FROM_NAME} <${env.RESEND_FROM}>`,
      to: [to],
      subject,
      html,
    }),
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

async function processEmailMessage(env, job) {
  let result = null;
  try {
    const kvOverride = await env.CONFIG.get(`templates/emails/${job.template}`);
    // job.html is the escape hatch for server-composed bodies (pipeline
    // digest); template registry otherwise. Without this, the digest would
    // send only the fallback subject line and the founder would get no numbers.
    const htmlRaw = kvOverride || REPO_EMAIL_TEMPLATES[job.template] || job.html;
    const html = substitute(htmlRaw || `<p>${escapeHtml(job.subject)}</p>`, { ...job.data, siteUrl: env.SITE_URL || '' });
    result = await sendResend(env, { to: job.to, subject: job.subject, html });
    let providerId = null;
    if (result.ok) {
      try {
        providerId = JSON.parse(result.body).id || null;
      } catch {
        providerId = null;
      }
    }
    await updateEmailTracking(env, job, result, providerId);
    if (!result.ok) throw new Error(`resend ${result.status}`);
  } catch (e) {
    if (!result) await updateEmailTracking(env, job, { ok: false, error: e.message });
    throw e;
  }
}

async function processWebhookMessage(env, job) {
  const url = env.WEBHOOK_URL;
  if (!url) {
    console.warn('webhook: WEBHOOK_URL not set, dropping');
    return;
  }
  // POST the flat payload (the lead object) so Zapier sees name/email/score at
  // the top level — not wrapped under { topic, payload, ts }.
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(job.payload),
    });
    console.log(`webhook: POST ${res.status} ${res.statusText} topic=${job.topic} id=${job.payload?.id ?? job.id}`);
    if (res.status !== 200 && res.status !== 201 && res.status !== 202) {
      const body = await res.text().catch(() => '');
      console.warn(`webhook: non-ok response: ${body.slice(0, 200)}`);
    }
  } catch (e) {
    console.error('webhook: fetch failed', e.message);
    throw e;
  }
}

// ------------------------------------------------------------
// Public routes
// ------------------------------------------------------------
async function handlePackages(env) {
  const packages = [];
  for (const [slug, fallback] of Object.entries(PACKAGE_FALLBACK)) {
    const raw = await env.CONFIG.get(`packages/${slug}`);
    packages.push({ slug, ...(raw ? { ...fallback, ...JSON.parse(raw) } : fallback) });
  }
  return json({ ok: true, packages });
}

async function handleSiteConfig(env) {
  const fallback = {
    email: 'hello@sofritostudio.com',
    socials: {
      instagram: 'https://instagram.com/sofritostudio',
      facebook: 'https://facebook.com/sofritostudio',
      pinterest: 'https://pinterest.com/sofritostudio',
      tiktok: 'https://tiktok.com/@sofritostudio',
    },
    session_url: null,
    booking_url: null,
  };
  const raw = await env.CONFIG.get('site/config');
  const cfg = raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  return json({ ok: true, ...cfg });
}

// ------------------------------------------------------------
// POST /api/lead — inbound lead capture (Zapier → Google Sheets)
// ------------------------------------------------------------
// SESSION_PRICE_CENTS lives in KV so the price can change without a deploy,
// but a bad value must never reach Stripe (unit_amount requires a positive
// integer). Anything invalid falls back to the $400 default and gets logged.
async function getSessionPriceCents(env) {
  const fallback = '40000';
  let raw = null;
  try {
    raw = await env.CONFIG.get('SESSION_PRICE_CENTS');
  } catch (e) {
    console.error('SESSION_PRICE_CENTS KV read failed', e.message);
    return fallback;
  }
  if (raw == null || String(raw).trim() === '') return fallback;
  const n = Number(String(raw).trim());
  if (!Number.isInteger(n) || n <= 0 || n > 100000000) {
    console.error('invalid SESSION_PRICE_CENTS in KV, using default', String(raw).slice(0, 32));
    return fallback;
  }
  return String(n);
}

// Alerts the founder once per distinct SESSION_PRICE_CENTS override value.
// The advertised price ($400) lives in the site, terms, Stripe description
// and email copy; a KV override changes what clients are actually charged,
// so the founder must update the copy or unset the key.
async function alertOnSessionPriceOverride(env, ctx, priceCents) {
  if (String(priceCents) === '40000') return;
  const flagKey = `price_override_alerted:${priceCents}`;
  try {
    if (await env.CONFIG.get(flagKey)) return;
    await env.CONFIG.put(flagKey, nowIso());
  } catch (e) {
    console.error('price override flag KV failed', e.message);
  }
  const dollars = (Number(priceCents) / 100).toFixed(2);
  ctx.waitUntil(
    enqueueEmail(env, {
      kind: 'email',
      to: env.NOTIFICATION_EMAIL || '',
      template: 'price-override-notify.html',
      subject: `[Price override] Charging $${dollars} — site advertises $400`,
      data: { charged_dollars: dollars, siteUrl: env.SITE_URL || '' },
      lead_id: 'system',
    })
  );
}
async function createStripeCheckoutSession(env, siteUrl, lead, submitKey = null, ctx = null) {
  const stripeKey = env.STRIPE_API_KEY;
  if (!stripeKey) return null;
  // Deriving the key from the per-render submit_key means a retry with the same
  // key replays the original session at Stripe instead of creating a new one.
  // Resolve the charge amount once; a KV override that diverges from the
  // advertised $400 pages the founder so the copy can be updated.
  const sessionPriceCents = await getSessionPriceCents(env);
  if (ctx) await alertOnSessionPriceOverride(env, ctx, sessionPriceCents);
  const headers = {
    Authorization: `Bearer ${stripeKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (submitKey) headers['Idempotency-Key'] = `submit_${submitKey}`;
  const checkoutRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers,
    body: new URLSearchParams({
      mode: 'payment',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][product_data][name]': 'Sofrito Session',
      'line_items[0][price_data][product_data][description]': '45-minute brand strategy session; credited in full toward the $997 Sprint when the sprint starts within 30 days of your session',
      'line_items[0][price_data][unit_amount]': sessionPriceCents,
      'line_items[0][quantity]': '1',
      success_url: `${siteUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/cancelled.html`,
      'metadata[lead_id]': lead.id,
    }),
  });
  if (!checkoutRes.ok) {
    console.error('stripe checkout create failed', checkoutRes.status);
    return null;
  }
  const session = await checkoutRes.json();
  return { id: session.id, url: session.url, expires_at: session.expires_at };
}

async function getStripeCheckoutSession(env, sessionId) {
  if (!sessionId || !env.STRIPE_API_KEY) return null;
  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${env.STRIPE_API_KEY}` },
  });
  if (response.status === 404) return { missing: true };
  if (!response.ok) {
    console.error('stripe checkout retrieve failed', response.status);
    return { unavailable: true };
  }
  return response.json();
}

// POST /api/checkout-status — lets the success page verify a payment after
// Stripe redirects back to /success.html?session_id=.... Only the session id
// format is trusted from the client; everything else comes from Stripe's API.
// Never expose secrets or amounts in the response. The payer's own stored
// name/email ARE returned on a verified paid session — only to prefill the
// payer's own Calendly booking, and only matched by session id in our DB
// (never from editable URL params).
async function handleCheckoutStatus(request, env, ctx) {
  let sessionId = '';
  try {
    const body = await readJson(request);
    sessionId = String(body.session_id || '');
  } catch (e) {
    return e && e.status === 413 ? json({ status: 'unknown' }, 413) : json({ status: 'unknown' }, 400);
  }
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId) || sessionId.length > 255) {
    return json({ status: 'unknown' }, 400);
  }
  // Rate limit: 10/min per IP. Every valid-format request burns a live
  // Stripe API call, so throttle exactly like /api/lead.
  const xff = request.headers.get('x-forwarded-for') || '';
  const firstForwardedIp = xff.split(',')[0].trim();
  const ip = request.headers.get('cf-connecting-ip') || firstForwardedIp || 'unknown';
  const rlKey = `rl:checkout-status:${ip}`;
  const rlCount = parseInt(await env.CONFIG.get(rlKey) || '0', 10);
  if (rlCount >= 10) return json({ status: 'unknown' }, 429);
  if (ctx) ctx.waitUntil(env.CONFIG.put(rlKey, String(rlCount + 1), { expirationTtl: 60 }));
  const session = await getStripeCheckoutSession(env, sessionId);
  if (!session || session.missing || session.unavailable) return json({ status: 'unknown' });
  if (session.payment_status === 'paid') {
    // Payer's own stored identity for Calendly prefill. Matched by session
    // id in our DB — the success page must not trust ?name=/ ?email= URL
    // params, which the payer can freely edit.
    let name = '';
    let email = '';
    try {
      let lead = await env.DB.prepare(
        `SELECT name, email FROM leads WHERE stripe_session_id = ? LIMIT 1`
      )
        .bind(sessionId)
        .first();
      // P2-5: after a session-id rotation the success URL carries the
      // superseded session id, so the lookup above misses and Calendly
      // prefill goes blank. Fall back to the deterministic lead_id in the
      // session metadata (returned by the Stripe retrieve above).
      if (!lead) {
        const metaLeadId = session.metadata && session.metadata.lead_id;
        if (metaLeadId) {
          lead = await env.DB.prepare(
            `SELECT name, email FROM leads WHERE id = ? LIMIT 1`
          )
            .bind(metaLeadId)
            .first();
        }
      }
      if (lead) {
        name = lead.name || '';
        email = lead.email || '';
      }
    } catch (e) {
      // Prefill is cosmetic — the paid state stands without it.
    }
    return json({ status: 'paid', name, email });
  }
  if (session.status === 'open' && session.url) {
    return json({ status: 'requires_action', checkout_url: session.url });
  }
  return json({ status: 'unknown' });
}

async function ensureFreshCheckoutUrl(env, lead) {
  const existing = await getStripeCheckoutSession(env, lead.stripe_session_id);
  if (existing?.unavailable || existing?.status === 'complete') return null;
  const expiresAt = Number(existing?.expires_at || 0);
  const hasFreshUrl = existing?.status === 'open' && existing?.url && expiresAt > nowEpoch() + 1800;
  if (hasFreshUrl) {
    if (existing.url !== lead.checkout_url) {
      await env.DB.prepare(`UPDATE leads SET checkout_url = ? WHERE id = ?`).bind(existing.url, lead.id).run();
    }
    return existing.url;
  }
  if (existing && !existing.missing && existing.status !== 'open' && existing.status !== 'expired') return null;
  const fresh = await createStripeCheckoutSession(env, env.SITE_URL || 'https://sofritostudio.com', lead);
  if (!fresh?.id || !fresh?.url) return null;
  const update = await env.DB.prepare(
    `UPDATE leads SET stripe_session_id = ?, checkout_url = ? WHERE id = ? AND paid_at IS NULL`
  )
    .bind(fresh.id, fresh.url, lead.id)
    .run();
  if (!update.meta?.changes) return null;
  return fresh.url;
}

async function handleApiLead(request, env, ctx) {
  let body;
  try {
    body = await readJson(request);
  } catch (e) {
    return badBody(e);
  }
  const email = String(body.email || '').trim().toLowerCase();
  const name = String(body.name || '').trim();
  const phone = String(body.phone || '').trim();
  const business_type = String(body.business_type || '').trim();
  const channel = String(body.channel || 'api').trim();
  const turnstileToken = String(body.turnstile_token || body['cf-turnstile-response'] || '').trim();
  // Client-generated once per page render. Enforced by UNIQUE(submit_key) so a
  // concurrent double-submit cannot open two checkout sessions. Optional: a
  // request without it still works, it just loses the race protection.
  const submitKey = String(body.submit_key || '').trim().slice(0, 64) || null;

  // Turnstile verification
  const turnstileOk = await verifyTurnstile(env, turnstileToken);
  if (!turnstileOk) return fail('Turnstile verification failed.', 422);

  // Strict validation
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) {
    return fail('Please include a valid email and your name.', 422);
  }
  // Phone is required: the founder personally calls every lead before the
  // session, especially out-of-state ones. The form marks it required; the
  // API enforces it so a direct POST can't create a phoneless lead.
  if (phone.replace(/\D/g, '').length < 7) {
    return fail('Please include a valid phone number so we can reach you before your session.', 422);
  }
  if (business_type && !BUSINESS_TYPES.includes(business_type)) {
    return fail('Invalid business type.', 422);
  }
  if (channel && !CHANNELS.includes(channel)) {
    return fail('Invalid channel.', 422);
  }

  // Rate limit: 10/min per IP
  const xff = request.headers.get('x-forwarded-for') || '';
  const firstForwardedIp = xff.split(',')[0].trim();
  const ip = request.headers.get('cf-connecting-ip') || firstForwardedIp || 'unknown';
  const ipRlKey = `rl:ip:${ip}`;
  const ipCount = parseInt(await env.CONFIG.get(ipRlKey) || '0', 10);
  if (ipCount >= 10) return fail('You just submitted. Check your inbox.', 429);
  ctx.waitUntil(env.CONFIG.put(ipRlKey, String(ipCount + 1), { expirationTtl: 60 }));

  // Idempotency: same email within 15 minutes, status new or checkout_started → return existing lead
  const existing = await env.DB.prepare(
    `SELECT id, created_at, checkout_url FROM leads WHERE email = ? AND created_at >= datetime('now', '-15 minutes') AND (status = 'new' OR status = 'checkout_started') LIMIT 1`
  )
    .bind(email)
    .first();
  if (existing && existing.checkout_url) {
    return json({ ok: true, id: existing.id, created_at: existing.created_at, checkout_url: existing.checkout_url }, 201);
  }

  // Same submit_key already used (double-click on one page render) → hand back
  // the checkout that was already created instead of creating a second one.
  if (submitKey) {
    const byKey = await env.DB.prepare(
      `SELECT id, created_at, checkout_url, status FROM leads WHERE submit_key = ? LIMIT 1`
    )
      .bind(submitKey)
      .first();
    if (byKey) {
      if (byKey.checkout_url) {
        return json({ ok: true, id: byKey.id, created_at: byKey.created_at, checkout_url: byKey.checkout_url, duplicate: true }, 200);
      }
      // Same submit_key, but the first attempt never produced a checkout URL (Stripe call failed).
      // Retry checkout creation for the existing lead instead of returning 202 with a null URL.
      if (byKey.status !== 'paid') {
        const retrySiteUrl = env.SITE_URL || new URL(request.url).origin;
        const retryCheckout = await createStripeCheckoutSession(env, retrySiteUrl, { id: byKey.id, name, email }, submitKey, ctx);
        if (retryCheckout && retryCheckout.url) {
          await env.DB.prepare(
            `UPDATE leads SET stripe_session_id = ?, checkout_url = ? WHERE id = ? AND paid_at IS NULL`
          ).bind(retryCheckout.id, retryCheckout.url, byKey.id).run();
          return json({ ok: true, id: byKey.id, created_at: byKey.created_at, checkout_url: retryCheckout.url, duplicate: true }, 200);
        }
      }
      return json({ ok: true, id: byKey.id, created_at: byKey.created_at, checkout_url: null, pending: true }, 202);
    }
  }

  // Deterministic id from the email → re-posts never create duplicates.
  const id = `lead_${(await sha256Hex(email)).slice(0, 24)}`;
  const now = nowEpoch();

  const lead = {
    id,
    created_at: nowIso(),
    name,
    email,
    phone,
    business_name: String(body.business_name || '').trim(),
    business_type,
    package_interest: String(body.package_interest || '').trim(),
    budget: String(body.budget || '').trim(),
    message: String(body.message || '').trim(),
    channel,
  };

  // Lead id is deterministic from the email, so a resubmission hits the same
  // row. Refresh the mutable detail fields instead of ignoring the new data —
  // a lead who resubmits with a new phone number or message must not keep the
  // stale one. created_at, status, source, and checkout timestamps are
  // preserved; empty resubmitted values do not wipe existing data.
  await env.DB.prepare(
    `INSERT INTO leads (id, created_at, name, email, phone, business_name, business_type, package_interest, budget, message, channel, status, source, checkout_started_at, submit_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'checkout_started', 'lead_api', ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = COALESCE(NULLIF(excluded.name, ''), leads.name),
       phone = COALESCE(NULLIF(excluded.phone, ''), leads.phone),
       business_name = COALESCE(NULLIF(excluded.business_name, ''), leads.business_name),
       business_type = COALESCE(NULLIF(excluded.business_type, ''), leads.business_type),
       package_interest = COALESCE(NULLIF(excluded.package_interest, ''), leads.package_interest),
       budget = COALESCE(NULLIF(excluded.budget, ''), leads.budget),
       message = COALESCE(NULLIF(excluded.message, ''), leads.message),
       channel = COALESCE(NULLIF(excluded.channel, ''), leads.channel)`
  )
    .bind(id, lead.created_at, lead.name, lead.email, lead.phone, lead.business_name, lead.business_type, lead.package_interest, lead.budget, lead.message, lead.channel, now, submitKey)
    .run();

  // Already-paid guard: the lead id is deterministic from the email, so a
  // resubmission lands on the same row with status preserved. Without this
  // check a paid client would get a second $400 checkout — and paying it
  // records revenue with no receipt, because the webhook only marks leads
  // whose status isn't already 'paid'. A deliberate re-purchase after 90
  // days still works.
  const paidRow = await env.DB.prepare(
    `SELECT 1 FROM leads WHERE id = ? AND status = 'paid' AND paid_at > unixepoch() - 7776000 LIMIT 1`
  ).bind(id).first();
  if (paidRow) {
    return fail('This email already has a paid Sofrito Session. Check your inbox for your booking link, or reply to any of our emails if you need it resent.', 409);
  }

  const siteUrl = env.SITE_URL || new URL(request.url).origin;
  const checkout = await createStripeCheckoutSession(env, siteUrl, lead, submitKey, ctx);
  const checkoutUrl = checkout?.url || null;
  if (checkout) {
    await env.DB.prepare(
      `UPDATE leads SET stripe_session_id = ?, checkout_url = ? WHERE id = ?`
    )
      .bind(checkout.id, checkout.url, lead.id)
      .run();
  }

  const checkoutStatusText = checkoutUrl
    ? 'Your secure checkout is ready below.'
    : 'We could not create checkout automatically, so there is no payment link in this message.';
  const checkoutAction = checkoutUrl
    ? `<a href="${escapeHtml(checkoutUrl)}" style="display:inline-block;background:#EA580C;color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:8px;">Book Your Sofrito Session</a>`
    : '<p style="font-size:14px;color:#64748B;margin:0;">Please return to the form and submit again, or reply so we can help.</p>';
  const ownerLead = { ...lead, score: 0, source: 'lead_api' };

  ctx.waitUntil(
    enqueueWebhook(env, 'lead.new', {
      id: lead.id,
      created_at: lead.created_at,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      business_name: lead.business_name,
      business_type: lead.business_type,
      package_interest: lead.package_interest,
      budget: lead.budget,
      message: lead.message,
      channel: lead.channel,
    })
  );
  ctx.waitUntil(
    Promise.all([
      enqueueEmail(env, {
        kind: 'email',
        to: lead.email,
        template: 'lead_acknowledgement.html',
        subject: 'Thanks for reaching out - Sofrito Studio',
        data: { name: lead.name, checkout_status_text: checkoutStatusText, checkout_action: checkoutAction },
        lead_id: lead.id,
      }),
      enqueueEmail(env, {
        kind: 'email',
        to: env.NOTIFICATION_EMAIL || '',
        template: 'new-lead-notify.html',
        subject: `New lead received: ${lead.name}`,
        data: { lead: ownerLead, siteUrl: env.SITE_URL || '' },
        lead_id: lead.id,
      }),
    ])
  );

  return json({ ok: true, id: lead.id, created_at: lead.created_at, checkout_url: checkoutUrl }, 201);
}

// POST /api/founding-application — founding client round applications
// ------------------------------------------------------------------
// Same trust stack as /api/lead (Turnstile, 10/min IP rate limit, strict
// validation). Applications land in the leads table with
// channel='founding_application' so the CRM, the admin dashboard, and the
// lead.new webhook (Zapier → Sheets) treat them as leads — no D1 migration
// needed. There is deliberately no founding checkout: the founder reviews
// every application personally and accepted founders get a private booking
// path, which keeps the 10-spot scarcity claim honest.
async function handleFoundingApplication(request, env, ctx) {
  let body;
  try {
    body = await readJson(request);
  } catch (e) {
    return badBody(e);
  }
  const email = String(body.email || '').trim().toLowerCase();
  const name = String(body.name || '').trim();
  const phone = String(body.phone || '').trim();
  const business_name = String(body.business_name || '').trim();
  const business_type = String(body.business_type || '').trim();
  const instagram = String(body.instagram || '').trim().replace(/^@/, '').slice(0, 40);
  const website = String(body.website || '').trim().slice(0, 200);
  const fit_reason = String(body.fit_reason || '').trim();
  const turnstileToken = String(body.turnstile_token || body['cf-turnstile-response'] || '').trim();
  const submitKey = String(body.submit_key || '').trim().slice(0, 64) || null;

  const turnstileOk = await verifyTurnstile(env, turnstileToken);
  if (!turnstileOk) return fail('Turnstile verification failed.', 422);

  // Strict validation — every message is user-facing copy.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) {
    return fail('Please include a valid email and your name.', 422);
  }
  if (!business_name) {
    return fail('Please include your business name.', 422);
  }
  // We need to see the business: at least one public presence is required.
  if (!instagram && !website) {
    return fail('Please include your Instagram handle or website so we can see your business.', 422);
  }
  if (fit_reason.length < 10) {
    return fail('Please tell us a little about why the timing is right — a sentence or two is enough.', 422);
  }
  if (business_type && !BUSINESS_TYPES.includes(business_type)) {
    return fail('Invalid business type.', 422);
  }
  if (phone && phone.replace(/\D/g, '').length < 7) {
    return fail('That phone number looks incomplete — you can also leave it blank.', 422);
  }

  // Rate limit: 10/min per IP (same budget as /api/lead, separate key).
  const xff = request.headers.get('x-forwarded-for') || '';
  const firstForwardedIp = xff.split(',')[0].trim();
  const ip = request.headers.get('cf-connecting-ip') || firstForwardedIp || 'unknown';
  const ipRlKey = `rl:founding:${ip}`;
  const ipCount = parseInt(await env.CONFIG.get(ipRlKey) || '0', 10);
  if (ipCount >= 10) return fail('You just submitted. Check your inbox.', 429);
  ctx.waitUntil(env.CONFIG.put(ipRlKey, String(ipCount + 1), { expirationTtl: 60 }));

  // Deterministic id from the email → re-posts refresh the same application
  // instead of creating duplicates. The founding_ prefix keeps applications
  // distinct from checkout leads even for the same email address.
  const id = `founding_${(await sha256Hex(email)).slice(0, 24)}`;
  const created_at = nowIso();
  const notes = `Instagram: ${instagram ? '@' + instagram : '—'} | Website: ${website || '—'}`;

  const existing = await env.DB.prepare(`SELECT id FROM leads WHERE id = ? LIMIT 1`).bind(id).first();
  if (existing) {
    await env.DB.prepare(
      `UPDATE leads SET name = ?, phone = COALESCE(NULLIF(?, ''), phone),
        business_name = ?, business_type = COALESCE(NULLIF(?, ''), business_type),
        message = ?, notes = ?, updated_at = ?, submit_key = COALESCE(?, submit_key)
       WHERE id = ?`
    ).bind(name, phone, business_name, business_type, fit_reason, notes, created_at, submitKey, id).run();
    return json({ ok: true, id, duplicate: true }, 200);
  }

  await env.DB.prepare(
    `INSERT INTO leads (id, created_at, name, email, phone, business_name, business_type,
      package_interest, message, channel, status, source, notes, updated_at, submit_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'founding_round', ?, 'founding_application', 'new', 'founding_round', ?, ?, ?)`
  ).bind(id, created_at, name, email, phone || null, business_name, business_type || null, fit_reason, notes, created_at, submitKey).run();

  const app = { id, created_at, name, email, phone, business_name, business_type, instagram, website, fit_reason };

  // The existing lead.new consumer (Zapier → Sheets) picks this up as a lead;
  // the channel field distinguishes founding applications downstream.
  ctx.waitUntil(enqueueWebhook(env, 'lead.new', { ...app, channel: 'founding_application', source: 'founding_round' }));
  ctx.waitUntil(
    Promise.all([
      enqueueEmail(env, {
        kind: 'email',
        to: env.NOTIFICATION_EMAIL || '',
        template: 'founding-application-notify.html',
        subject: `New founding application: ${name} — ${business_name}`,
        data: { app },
        lead_id: id,
      }),
      enqueueEmail(env, {
        kind: 'email',
        to: email,
        template: 'founding-application-ack.html',
        subject: 'We got your founding application — Sofrito Studio',
        data: { name },
        lead_id: id,
      }),
    ])
  );

  return json({ ok: true, id, created_at }, 201);
}

async function handleContact(request, env, ctx) {
  let body;
  try {
    body = await readJson(request);
  } catch (e) {
    return badBody(e);
  }
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const message = String(body.message || '').trim();
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || message.length < 10) {
    return fail('Please include your name, a valid email, and a few words about your business.', 422);
  }

  const rlKey = `rl:contact:${email}`;
  if (await env.CONFIG.get(rlKey)) return fail('You just sent a message. Reply and I will get back to you soon.', 429);
  ctx.waitUntil(env.CONFIG.put(rlKey, nowIso(), { expirationTtl: 300 }));

  const lead = {
    id: uuid(),
    created_at: nowIso(),
    name,
    email,
    phone: String(body.phone || '').trim(),
    business_name: String(body.business_name || '').trim(),
    business_type: String(body.business_type || '').trim(),
    package_interest: String(body.package_interest || '').trim(),
    budget: String(body.budget || '').trim(),
    stage: String(body.stage || '').trim(),
    timeline: String(body.timeline || '').trim(),
    city: String(body.city || '').trim(),
    decision: String(body.decision || '').trim(),
    message,
    source: String(body.source || 'organic').trim(),
    channel: 'contact_form',
  };
  lead.score = await scoreLead(env, lead);
  const lang = (request.headers.get('accept-language') || '').toLowerCase().startsWith('es') ? 'es' : 'en';

  await env.DB.prepare(
    `INSERT INTO leads (id, created_at, name, email, phone, business_name, business_type, package_interest, budget, stage, timeline, city, decision, message, channel, score, status, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)`
  )
    .bind(lead.id, lead.created_at, name, email, lead.phone, lead.business_name, lead.business_type, lead.package_interest, lead.budget, lead.stage, lead.timeline, lead.city, lead.decision, message, 'contact_form', lead.score, lead.source)
    .run();

  const baseData = { lead, lang, siteUrl: env.SITE_URL || '' };
  ctx.waitUntil(Promise.all([
    enqueueEmail(env, {
      kind: 'email',
      to: email,
      template: 'form-confirm.html',
      subject: lang === 'es' ? 'Recibimos tu mensaje — Sofrito Studio' : 'Your message is in — Sofrito Studio',
      data: baseData,
      lead_id: lead.id,
    }),
  ]));
  ctx.waitUntil(enqueueWebhook(env, 'lead.new', { ...lead, lang }));
  ctx.waitUntil(
    tiktokTrack(env, {
      event: 'Lead',
      eventId: `lead-${lead.id}`,
      user: { email: lead.email, phone_number: lead.phone, external_id: lead.id },
      page: (env.SITE_URL || 'https://sofritostudio.com') + '/contact.html',
      ip: request.headers.get('cf-connecting-ip') || '',
      userAgent: request.headers.get('user-agent') || '',
      contents: [{
        content_id: lead.package_interest || 'general-enquiry',
        content_type: 'product',
        content_name: lead.package_interest || 'Contact',
      }],
      value: 0,
      currency: 'USD',
    })
  );

  return json({ ok: true, id: lead.id, score: lead.score }, 201);
}

async function handleNewsletter(request, env, ctx) {
  let body;
  try {
    body = await readJson(request);
  } catch (e) {
    return badBody(e);
  }
  const email = String(body.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('Enter a valid email address.', 422);
  await env.DB.prepare(`INSERT OR IGNORE INTO newsletter_subscribers (id, created_at, email, status, source) VALUES (?, ?, ?, 'subscribed', ?)`)
    .bind(uuid(), nowIso(), email, String(body.source || 'site'))
    .run();
  ctx.waitUntil(
    (async () => {
      const key = env.BUTTONDOWN_API_KEY;
      if (!key) return;
      try {
        await fetch('https://api.buttondown.com/v1/subscribers', {
          method: 'POST',
          headers: { Authorization: `Token ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email_address: email, type: 'regular', referrer_url: body.referrer_url || '' }),
        });
      } catch (e) {
        console.error('buttondown subscribe failed', e);
      }
    })()
  );
  ctx.waitUntil(
    tiktokTrack(env, {
      event: 'CompleteRegistration',
      eventId: `guide-${uuid()}`,
      user: { email },
      page: (env.SITE_URL || 'https://sofritostudio.com') + '/',
      contents: [{ content_id: 'digital-guide', content_type: 'product', content_name: 'Sofrito Digital Guide' }],
    })
  );
  return json({ ok: true, guide_url: (env.SITE_URL || 'https://sofritostudio.com') + '/freebies/digital-guide.md' });
}

async function handleEvent(request, env, ctx) {
  let body;
  try {
    body = await readJson(request);
  } catch (e) {
    return badBody(e);
  }
  const name = String(body.name || '').trim();
  if (!name) return fail('event name required', 422);
  ctx.waitUntil(
    env.DB.prepare(`INSERT INTO events (id, created_at, event_name, session, page_url, properties) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(uuid(), nowIso(), name, body.session || null, body.page_url || null, JSON.stringify(body.properties || {}))
      .run()
  );
  return json({ ok: true });
}

// ------------------------------------------------------------
// Admin routes (Bearer ADMIN_KEY)
// ------------------------------------------------------------
async function handleDashboard(request, env) {
  const [pipeline, leads, revenue, top] = await Promise.all([
    env.DB.prepare(`SELECT * FROM v_pipeline`).first(),
    env.DB.prepare(`SELECT id, created_at, name, email, business_name, package_interest, score, status FROM leads ORDER BY created_at DESC LIMIT 8`).all(),
    env.DB.prepare(`SELECT * FROM v_monthly_revenue LIMIT 6`).all(),
    env.DB.prepare(`SELECT page_url, views FROM v_top_content`).all(),
  ]);
  return json({ ok: true, pipeline, leads: leads.results, revenue: revenue.results, top_content: top.results });
}

async function handleLeads(request, env, url) {
  const status = url.searchParams.get('status');
  const search = url.searchParams.get('search');
  const stale = url.searchParams.get('stale') === '1';
  let sql = `SELECT id, created_at, name, email, phone, business_name, business_type, package_interest, budget, score, status, source FROM leads`;
  const where = [];
  const binds = [];
  if (stale) {
    where.push(`status = 'new' AND created_at < ?`);
    binds.push(new Date(Date.now() - 24 * 3600 * 1000).toISOString());
  }
  if (status) {
    where.push(`status = ?`);
    binds.push(status);
  }
  if (search) {
    where.push(`(name LIKE ? OR email LIKE ? OR business_name LIKE ?)`);
    const like = `%${search}%`;
    binds.push(like, like, like);
  }
  if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
  sql += ` ORDER BY created_at DESC LIMIT 100`;
  const res = await env.DB.prepare(sql).bind(...binds).all();
  return json({ ok: true, leads: res.results });
}

async function handleLeadUpdate(request, env, ctx, url) {
  const id = url.pathname.split('/').pop();
  let body;
  try {
    body = await readJson(request);
  } catch (e) {
    return badBody(e);
  }
  const previousLead = await env.DB.prepare(`SELECT * FROM leads WHERE id = ?`).bind(id).first();
  if (!previousLead) return fail('lead not found', 404);
  const fields = [];
  const binds = [];
  if (body.status) {
    fields.push('status = ?');
    binds.push(body.status);
  }
  if (body.notes !== undefined) {
    fields.push('notes = ?');
    binds.push(body.notes);
  }
  if (!fields.length) return fail('nothing to update', 400);
  fields.push('updated_at = ?');
  binds.push(nowIso());
  binds.push(id);
  await env.DB.prepare(`UPDATE leads SET ${fields.join(', ')} WHERE id = ?`).bind(...binds).run();

  const becameWon = body.status === 'won' && previousLead.status !== 'won';
  if (body.status === 'won' || body.status === 'complete') {
    const pkg = previousLead.package_interest
      ? await env.CONFIG.get(`packages/${previousLead.package_interest}`).then((r) => (r ? JSON.parse(r) : null))
      : null;
    await env.DB.prepare(
      `INSERT INTO projects (id, created_at, lead_id, name, package_name, price_cents, status)
       SELECT ?, ?, ?, ?, ?, ?, 'active'
       WHERE NOT EXISTS (SELECT 1 FROM projects WHERE lead_id = ?)`
    )
      .bind(uuid(), nowIso(), id, previousLead.business_name || previousLead.name, previousLead.package_interest, pkg ? pkg.price_cents : 0, id)
      .run();
  }

  if (becameWon) {
    const lead = { ...previousLead, status: 'won', updated_at: nowIso() };
    ctx.waitUntil(
      Promise.all([
        enqueueEmail(env, {
          kind: 'email',
          to: env.NOTIFICATION_EMAIL || '',
          template: 'lead-won.html',
          subject: `New client confirmed: ${lead.business_name || lead.name}`,
          data: { lead, source: lead.source || 'crm', siteUrl: env.SITE_URL || '' },
          lead_id: lead.id,
        }),
        enqueueEmail(env, {
          kind: 'email',
          to: lead.email,
          template: 'onboarding-pack.html',
          subject: 'Welcome aboard — Sofrito Studio',
          data: { lead, siteUrl: env.SITE_URL || '' },
          lead_id: lead.id,
        }),
      ])
    );
  }

  return json({ ok: true });
}

async function handleRevenue(env) {
  const [rows, byPackage] = await Promise.all([
    env.DB.prepare(`SELECT * FROM v_monthly_revenue LIMIT 12`).all(),
    env.DB.prepare(
      `SELECT COALESCE(NULLIF(description,''), 'no description') AS label, SUM(amount_cents)/100.0 AS dollars, COUNT(*) AS n
       FROM revenue WHERE paid = 1 GROUP BY description ORDER BY dollars DESC LIMIT 10`
    ).all(),
  ]);
  return json({ ok: true, monthly: rows.results, by_label: byPackage.results });
}

// ------------------------------------------------------------
// Invoice triggers (binary milestone ledger) — S13/S14
// POST /api/invoice-trigger : founder logs a written-milestone
//   trigger (agreement signed / brand approved / files delivered).
//   Records the stamp in `invoices` (the binary evidence), then
//   creates + sends the matching Stripe invoice when STRIPE_API_KEY
//   is set. GET /api/invoice-status : the founder's morning view
//   (same row-set the Sheets mirror reads).
// ------------------------------------------------------------
const SESSION_CENTS = 40000;
const MILESTONES = [
  { key: 'session', label: 'Sofrito Session', cents: SESSION_CENTS },
  { key: 'final', label: 'Final balance', cents: null },
];
const MILESTONE_LABELS = Object.fromEntries(MILESTONES.map((m) => [m.key, m.label]));

// Two-offer schedule: the $400 Sofrito Session is charged up front and
// credits toward the Sprint; the final balance is whatever remains
// (Sprint = 99700 - 40000 = 59700, billed before launch).
// sessionCents comes from validated KV (getSessionPriceCents), not the
// constant below, so a price change propagates to invoice splits too.
const splitMilestoneAmounts = (priceCents, sessionCents) => {
  const session = Math.min(priceCents, sessionCents);
  return { session, final: priceCents - session };
};

async function stripeRequest(env, method, path, form) {
  const body = new URLSearchParams(form).toString();
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.STRIPE_API_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: method === 'GET' ? undefined : body,
  });
  const txt = await res.text();
  let data = null;
  try {
    data = JSON.parse(txt);
  } catch {}
  if (!res.ok) throw new Error(data && data.error ? data.error.message : `stripe ${res.status}`);
  return data;
}

async function createAndSendStripeInvoice(env, { customerEmail, customerName, description, meta, line }) {
  const search = await stripeRequest(env, 'GET', `/customers?email=${encodeURIComponent(customerEmail || '')}&limit=1`);
  let customerId = search.data && search.data[0] ? search.data[0].id : null;
  if (!customerId) {
    const created = await stripeRequest(env, 'POST', '/customers', { email: customerEmail, name: customerName });
    customerId = created.id;
  }
  const invoice = await stripeRequest(env, 'POST', '/invoices', {
    customer: customerId,
    description,
    metadata: meta,
  });
  await stripeRequest(env, 'POST', '/invoiceitems', {
    customer: customerId,
    invoice: invoice.id,
    amount: String(line.amountCents),
    currency: 'usd',
    description: line.description,
  });
  const finalized = await stripeRequest(env, 'POST', `/invoices/${invoice.id}/finalize`, {});
  const sent = await stripeRequest(env, 'POST', `/invoices/${finalized.id}/send_invoice`, {});
  return { id: sent.id, number: sent.number, url: sent.hosted_invoice_url };
}

async function handleInvoiceStatus(env) {
  const [invoices, projects] = await Promise.all([
    env.DB.prepare(`SELECT * FROM v_invoice_status`).all(),
    env.DB.prepare(`SELECT id, name, package_name, price_cents, status, created_at FROM projects ORDER BY created_at DESC`).all(),
  ]);
  const totals = {
    billed: invoices.results.reduce((s, r) => s + (r.amount_cents || 0), 0),
    outstanding: invoices.results.filter((r) => r.computed_status === 'sent' || r.computed_status === 'overdue').reduce((s, r) => s + (r.amount_cents || 0), 0),
    overdue: invoices.results.filter((r) => r.computed_status === 'overdue').reduce((s, r) => s + (r.amount_cents || 0), 0),
  };
  return json({ ok: true, invoices: invoices.results, projects: projects.results, totals });
}

// GET /api/invoice-reconcile (admin) — diffs local invoice rows against
// Stripe's record. Catches the drift a silent webhook failure leaves behind:
// local says sent/unpaid while Stripe says paid, amounts disagree, or Stripe
// voided the invoice while local still shows it outstanding. On-demand (the
// founder's morning check), capped at 25 rows so it can't fan out into dozens
// of Stripe calls.
async function handleInvoiceReconcile(env) {
  const rows = await env.DB.prepare(
    `SELECT id, project_id, milestone, amount_cents, status, stripe_invoice_id
     FROM invoices WHERE stripe_invoice_id IS NOT NULL AND status != 'paid'
     ORDER BY created_at DESC LIMIT 25`
  ).all();
  const mismatches = [];
  let checked = 0;
  for (const inv of rows.results || []) {
    checked += 1;
    let si;
    try {
      si = await stripeRequest(env, 'GET', `/invoices/${inv.stripe_invoice_id}`);
    } catch (e) {
      mismatches.push({ invoice_id: inv.id, stripe_invoice_id: inv.stripe_invoice_id, issue: 'stripe_unreachable', detail: String(e.message).slice(0, 200) });
      continue;
    }
    if (si.status === 'paid' && inv.status !== 'paid') {
      mismatches.push({ invoice_id: inv.id, stripe_invoice_id: inv.stripe_invoice_id, issue: 'paid_at_stripe', local_status: inv.status });
    } else if (si.status === 'void' && (inv.status === 'sent' || inv.status === 'pending')) {
      mismatches.push({ invoice_id: inv.id, stripe_invoice_id: inv.stripe_invoice_id, issue: 'void_at_stripe', local_status: inv.status });
    } else if (typeof si.amount_due === 'number' && si.amount_due !== inv.amount_cents && si.status !== 'paid') {
      mismatches.push({ invoice_id: inv.id, stripe_invoice_id: inv.stripe_invoice_id, issue: 'amount_differs', local_cents: inv.amount_cents, stripe_cents: si.amount_due });
    }
  }
  return json({ ok: true, checked, mismatches });
}

async function handleInvoiceTrigger(request, env, ctx) {
  let body;
  try {
    body = await readJson(request);
  } catch (e) {
    return badBody(e);
  }
  const projectId = String(body.project_id || '').trim();
  const milestone = String(body.milestone || '').trim();
  const note = String(body.note || '').trim();
  if (!projectId) return fail('project_id required', 422);
  if (!MILESTONES.some((m) => m.key === milestone)) return fail('milestone must be session|final', 422);

  const project = await env.DB.prepare(
    `SELECT p.id, p.name, p.package_name, p.price_cents, p.status, p.lead_id, l.email AS client_email, l.paid_at AS session_paid_at
     FROM projects p LEFT JOIN leads l ON l.id = p.lead_id WHERE p.id = ?`
  )
    .bind(projectId)
    .first();
  if (!project) return fail(`project not found: ${projectId}`, 404);

  const pkgFallback = PACKAGE_FALLBACK[project.package_name] || {};
  if (pkgFallback.billing === 'monthly') return fail('retainer packages are billed monthly, not by milestone trigger', 422);

  const priceCents = project.price_cents && project.price_cents > 0 ? project.price_cents : pkgFallback.price_cents || 0;
  if (!priceCents) return fail(`no price on record for ${project.name}; fix projects.price_cents first`, 422);

  // 30-day credit window: the advertised term credits the $400 session
  // toward the $997 sprint only when the sprint starts within 30 days of the
  // session. The anchor is the actual session date (the Calendly booking),
  // falling back to the payment date when there is no booking row (e.g. a
  // session held outside Calendly). Past the window the final invoice bills
  // the full sprint price unless the founder explicitly passes honor_expired_credit: true.
  let daysSinceSession = null;
  let creditExpired = false;
  if (milestone === 'final' && project.lead_id) {
    const booking = await env.DB.prepare(
      `SELECT scheduled_for FROM calendly_bookings
       WHERE lead_id = ? AND (status IS NULL OR status != 'cancelled')
       ORDER BY scheduled_for ASC LIMIT 1`
    ).bind(project.lead_id).first();
    const anchor = (booking && booking.scheduled_for) || project.session_paid_at;
    if (anchor) {
      daysSinceSession = Math.floor((Date.now() - paidAtMs(anchor)) / 86400000);
      creditExpired = daysSinceSession > 30;
    }
  }
  const honorExpired = String(body.honor_expired_credit || '').toLowerCase() === 'true';
  // P2-3: credit what the client actually paid, not the current KV price —
  // the founder may have changed SESSION_PRICE_CENTS since the payment.
  // Falls back to the KV price for pre-existing paid rows (or pre-migration).
  let sessionCreditCents = Number(await getSessionPriceCents(env));
  if (milestone === 'final' && project.lead_id) {
    const paidCents = await getLeadPaidAmountCents(env, project.lead_id);
    if (paidCents) sessionCreditCents = paidCents;
  }
  const sessionPriceForSplit = (milestone === 'final' && creditExpired && !honorExpired)
    ? 0
    : sessionCreditCents;
  const amountCents = splitMilestoneAmounts(priceCents, sessionPriceForSplit)[milestone];
  const invoiceId = uuid();
  const stamp = milestone === 'final' ? 'files_delivered_at' : null;
  const stampVal = stamp ? nowIso() : null;

  // Upsert. UNIQUE(project_id, milestone) = the trigger is binary:
  // one invoice per milestone per project, never double-billed.
  // COALESCE preserves the ORIGINAL written-trigger timestamp.
  await env.DB.prepare(
    `INSERT INTO invoices (id, created_at, project_id, milestone, amount_cents, currency, status, notes, approval_confirmed_at, files_delivered_at)
     VALUES (?, ?, ?, ?, ?, 'usd', 'pending', ?, ?, ?)
     ON CONFLICT(project_id, milestone) DO UPDATE SET
       notes = excluded.notes,
       approval_confirmed_at = COALESCE(invoices.approval_confirmed_at, excluded.approval_confirmed_at),
       files_delivered_at = COALESCE(invoices.files_delivered_at, excluded.files_delivered_at)`
  )
    .bind(invoiceId, nowIso(), project.id, milestone, amountCents, note || null, stamp === 'approval_confirmed_at' ? stampVal : null, stamp === 'files_delivered_at' ? stampVal : null)
    .run();

  const canonical = await env.DB.prepare(
    `SELECT id FROM invoices WHERE project_id = ? AND milestone = ?`
  )
    .bind(project.id, milestone)
    .first();
  if (!canonical) return fail('invoice row not found after upsert', 500);

  const isNewInvoice = canonical.id === invoiceId;
  const stripe = { attempted: false };
  if (isNewInvoice && env.STRIPE_API_KEY) {
    try {
      const created = await createAndSendStripeInvoice(env, {
        customerEmail: project.client_email,
        customerName: project.name,
        description: `${MILESTONE_LABELS[milestone]} — ${project.package_name || 'Sofrito Studio'}`,
        meta: { invoice_id: canonical.id, project_id: project.id, milestone },
        line: { description: MILESTONE_LABELS[milestone], amountCents },
      });
      await env.DB.prepare(`UPDATE invoices SET status = 'sent', sent_at = ?, stripe_invoice_id = ? WHERE id = ?`)
        .bind(nowIso(), created.id, canonical.id)
        .run();
      stripe.attempted = true;
      stripe.ok = true;
      stripe.invoice_id = created.id;
      stripe.number = created.number || null;
      stripe.url = created.url || null;
    } catch (e) {
      stripe.attempted = true;
      stripe.ok = false;
      stripe.error = e.message;
    }
  } else if (isNewInvoice) {
    stripe.warning = 'STRIPE_API_KEY not set — trigger recorded, no invoice sent.';
  } else {
    stripe.skipped = 'already_exists';
  }

  const finalRow = await env.DB.prepare(
    `SELECT * FROM invoices WHERE project_id = ? AND milestone = ?`
  )
    .bind(project.id, milestone)
    .first();
  if (!finalRow) return fail('invoice row not found after upsert', 500);

  ctx.waitUntil(
    Promise.all([
      enqueueWebhook(env, 'invoice.trigger', {
        event: 'invoice.trigger',
        project_id: project.id,
        project_name: project.name,
        client_email: project.client_email || null,
        package_name: project.package_name || null,
        milestone,
        milestone_label: MILESTONE_LABELS[milestone],
        amount_cents: amountCents,
        amount_dollars: (amountCents / 100).toFixed(2),
        status: finalRow.status,
        sent_at: finalRow.sent_at || null,
        approval_confirmed_at: finalRow.approval_confirmed_at,
        files_delivered_at: finalRow.files_delivered_at,
        stripe_invoice_id: finalRow.stripe_invoice_id || null,
        note: finalRow.notes || null,
        days_since_session: daysSinceSession,
        credit_expired: creditExpired,
        credit_honored_override: honorExpired,
      }),
      enqueueEmail(env, {
        kind: 'email',
        to: env.NOTIFICATION_EMAIL || '',
        template: 'invoice-trigger-notify.html',
        subject: `[Milestone] ${MILESTONE_LABELS[milestone]} — ${project.name} ($${(amountCents / 100).toFixed(2)})${creditExpired && !honorExpired ? ' — credit expired' : ''}`,
        data: {
          invoice: finalRow,
          project,
          milestone_label: MILESTONE_LABELS[milestone],
          amount_dollars: (amountCents / 100).toFixed(2),
          credit_note: milestone === 'final'
            ? (creditExpired
              ? (honorExpired
                ? `Session paid ${daysSinceSession} days ago — 30-day credit window expired, but the $400 credit was honored by explicit override.`
                : `Session paid ${daysSinceSession} days ago — 30-day credit window expired, so the full sprint price was billed (no $400 credit).`)
              : (daysSinceSession == null
                ? 'No session payment date on record — $400 credit applied.'
                : `Session paid ${daysSinceSession} days ago — inside the 30-day window, $400 credit applied.`))
            : '',
        },
        lead_id: `invoice-${finalRow.id}`,
      }),
    ])
  );

  return json({ ok: true, invoice: finalRow, stripe }, 201);
}

// ------------------------------------------------------------
// Webhooks (idempotent revenue logging)
// ------------------------------------------------------------
async function insertRevenue(env, ctx, row, lead = null) {
  try {
    await env.DB.prepare(
      `INSERT INTO revenue (id, created_at, occurred_at, source, source_id, project_id, amount_cents, currency, description, metadata, paid)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(uuid(), nowIso(), row.occurred_at, row.source, row.source_id, row.project_id || null, row.amount_cents, row.currency || 'usd', row.description || null, row.metadata ? JSON.stringify(row.metadata) : null, row.paid === false ? 0 : 1)
      .run();
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return false;
    // Non-duplicate DB failure: never send the "Payment logged" notification
    // for a row that was not recorded. Throw so the webhook 500s and Stripe
    // retries the event instead of silently dropping it.
    throw new Error(`revenue insert failed (${row.source}/${row.source_id}): ${e.message}`);
  }

  const paidAt = new Date(row.occurred_at).toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  // Negative ledger entries are refunds or disputes — label them honestly
  // instead of "Payment logged: $-400.00".
  const absAmt = (Math.abs(row.amount_cents) / 100).toFixed(2);
  const entryKind = row.amount_cents < 0
    ? (String(row.description || '').startsWith('dispute') ? 'Dispute' : 'Refund')
    : 'Payment';
  ctx.waitUntil(
    enqueueEmail(env, {
      kind: 'email',
      to: env.NOTIFICATION_EMAIL || '',
      template: 'revenue-notify.html',
      subject: `${entryKind} logged: $${absAmt}${lead?.name ? ` — ${lead.name}` : ''}`,
      data: {
        amount: (row.amount_cents / 100).toFixed(2),
        source: row.source,
        description: row.description || '',
        lead_id: row.project_id || '',
        name: lead?.name || '',
        email: lead?.email || '',
        paid_at: paidAt,
        session_id: row.session_id || '',
      },
      lead_id: 'revenue',
    })
  );
  return true;
}

// Chargebacks (S-stripe): a dispute pulls the funds while it is open, so it
// needs the same bookkeeping as a refund — a contra ledger entry, the lead
// moved out of 'paid' so the sweeps stop nudging, and a founder alert with
// the evidence deadline. On close: won → funds return, lead restored to
// 'paid' (only if still 'disputed', so an intervening refund wins); lost →
// money is gone, treated like a refund.
async function handleDisputeEvent(env, ctx, event) {
  const dispute = event.data.object || {};
  const isCreated = event.type === 'charge.dispute.created';
  const won = dispute.status === 'won';
  const amountCents = Number(dispute.amount || 0);
  const occurredAt = new Date(event.created * 1000).toISOString();

  // Resolve the payer email: dispute.charge may be an expanded object or an id.
  let chargeId = '';
  let email = '';
  const chargeRef = dispute.charge;
  if (chargeRef && typeof chargeRef === 'object') {
    chargeId = String(chargeRef.id || '');
    email = String(
      chargeRef.receipt_email ||
      (chargeRef.billing_details && chargeRef.billing_details.email) ||
      ''
    ).trim().toLowerCase();
  } else {
    chargeId = String(chargeRef || '');
    if (chargeId && env.STRIPE_API_KEY) {
      try {
        const ch = await stripeRequest(env, 'GET', `/charges/${chargeId}`);
        email = String(
          ch.receipt_email ||
          (ch.billing_details && ch.billing_details.email) ||
          ''
        ).trim().toLowerCase();
      } catch (e) {
        console.error('dispute charge lookup failed', chargeId, e.message);
      }
    }
  }

  const lead = email
    ? await env.DB.prepare(
        `SELECT id, name, email FROM leads WHERE email = ? AND status IN ('paid', 'disputed') ORDER BY paid_at DESC LIMIT 1`
      ).bind(email).first()
    : null;

  if (isCreated) {
    await insertRevenue(env, ctx, {
      occurred_at: occurredAt,
      source: 'stripe',
      source_id: event.id,
      session_id: chargeId,
      amount_cents: -amountCents,
      currency: dispute.currency || 'usd',
      description: 'dispute opened',
      metadata: { event_type: event.type },
      paid: false,
    }, lead);
    if (lead) {
      await env.DB.prepare(`UPDATE leads SET status = 'disputed' WHERE id = ? AND status = 'paid'`).bind(lead.id).run();
    }
  } else if (won) {
    await insertRevenue(env, ctx, {
      occurred_at: occurredAt,
      source: 'stripe',
      source_id: event.id,
      session_id: chargeId,
      amount_cents: amountCents,
      currency: dispute.currency || 'usd',
      description: 'dispute won — funds returned',
      metadata: { event_type: event.type },
      paid: true,
    }, lead);
    if (lead) {
      await env.DB.prepare(`UPDATE leads SET status = 'paid' WHERE id = ? AND status = 'disputed'`).bind(lead.id).run();
    }
  } else {
    // lost (or any other terminal state): money is gone — same as a refund.
    if (lead) {
      await env.DB.prepare(`UPDATE leads SET status = 'refunded' WHERE id = ? AND status IN ('paid', 'disputed')`).bind(lead.id).run();
    }
  }

  const evidenceDue = dispute.evidence_details && dispute.evidence_details.due_by
    ? new Date(dispute.evidence_details.due_by * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';
  const outcome = isCreated ? 'opened' : won ? 'WON — funds returned' : 'LOST — funds withdrawn';
  await enqueueEmail(env, {
    kind: 'email',
    to: env.NOTIFICATION_EMAIL || '',
    template: 'dispute-notify.html',
    subject: `[Dispute ${isCreated ? 'opened' : won ? 'won' : 'lost'}] ${lead?.name || email || chargeId} — $${(amountCents / 100).toFixed(2)}`,
    data: {
      lead: lead || { name: email || '(no matching lead — look up in Stripe)', email: email || '' },
      amount: (amountCents / 100).toFixed(2),
      outcome,
      reason: dispute.reason || '',
      evidence_due: evidenceDue,
      charge_id: chargeId,
      siteUrl: env.SITE_URL || '',
    },
    lead_id: lead?.id,
  });
}

async function handleCheckoutExpired(env, ctx, event) {
  const sessionId = String(event?.data?.object?.id || '');
  if (!sessionId) return false;
  const nudgeAt = nowEpoch();
  const result = await env.DB.prepare(
    `UPDATE leads
     SET status = 'abandoned', nudge_sent_at = ?
     WHERE stripe_session_id = ? AND nudge_sent_at IS NULL AND paid_at IS NULL AND checkout_url IS NOT NULL`
  )
    .bind(nudgeAt, sessionId)
    .run();
  if (!result.meta?.changes) return false;
  const lead = await env.DB.prepare(
    `SELECT id, name, email, stripe_session_id, checkout_url FROM leads WHERE stripe_session_id = ? LIMIT 1`
  )
    .bind(sessionId)
    .first();
  if (!lead) return false;
  // P2-2: the stored checkout_url is the just-expired session's link — mint
  // or refresh a live one so the nudge's call to action never opens Stripe's
  // expired-session page. Skip the nudge when no live URL exists, exactly
  // like the second checkout nudge does.
  let checkoutUrl = null;
  try {
    checkoutUrl = await ensureFreshCheckoutUrl(env, lead);
  } catch (e) {
    console.error('expired-session nudge checkout recovery failed', lead.id, e.message);
  }
  if (!checkoutUrl) return false;
  ctx.waitUntil(
    enqueueEmail(env, {
      kind: 'email',
      to: lead.email,
      template: 'abandoned-nudge.html',
      subject: 'Your Sofrito Session — still interested?',
      data: { lead_id: lead.id, name: lead.name, checkout_url: checkoutUrl },
      lead_id: lead.id,
    })
  );
  return true;
}

async function handleStripeWebhook(request, env, ctx) {
  const secret = env.STRIPE_WEBHOOK_SECRET;
  let raw;
  try {
    raw = await readWebhookText(request);
  } catch (e) {
    return fail(e && e.status === 413 ? 'body too large' : 'unreadable body', e && e.status === 413 ? 413 : 400);
  }
  const header = request.headers.get('stripe-signature');
  if (!secret || !header) return fail('missing signature', 400);
  const [t, ...rest] = header.split(',');
  const ts = t.replace('t=', '');
  const v1 = rest.find((p) => p.startsWith('v1=')).replace('v1=', '');
  const signed = `${ts}.${raw}`;
  const expected = await hmacSha256(secret, signed);
  if (!safeEqual(expected, v1)) return fail('invalid signature', 401);
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return fail('stale signature', 401);

  const event = JSON.parse(raw);
  // Disputes are handled on their own path: they carry no payment amount
  // (amountCents would be 0 and the generic flow would drop them), but a
  // chargeback still needs a ledger entry, a lead-status move, and a
  // founder alert. NOTE: these events only arrive if charge.dispute.*
  // is subscribed on the Stripe endpoint — that subscription is on the
  // Dashboard side.
  if (event.type === 'charge.dispute.created' || event.type === 'charge.dispute.closed') {
    const live = event.livemode === true;
    if (live) {
      await handleDisputeEvent(env, ctx, event);
    } else {
      console.log('stripe webhook skipped (test mode)', event.type, event.id);
    }
    return json({ ok: true, handled: live });
  }
  if (event.type === 'checkout.session.expired') {
    return json({ ok: true, handled: await handleCheckoutExpired(env, ctx, event) });
  }
  let amountCents = 0;
  let description = event.type;
  let stripeInvoiceId = null;
  let refundCharge = null;
  // checkout.session.completed and checkout.session.async_payment_succeeded
  // both mean collected funds. A completed session with payment_status
  // 'unpaid' is an async method (bank redirect etc.) whose money hasn't
  // arrived — ignore it until async_payment_succeeded / _failed arrives.
  const completedPaymentEvent =
    event.type.startsWith('checkout.session.completed') ||
    event.type === 'checkout.session.async_payment_succeeded';
  if (completedPaymentEvent && event.data.object.payment_status === 'unpaid') {
    return json({ ok: true, handled: false, reason: 'async_payment_pending' });
  }
  if (event.type === 'checkout.session.async_payment_failed') {
    const failedSession = event.data.object || {};
    const failedEmail = String((failedSession.customer_details && failedSession.customer_details.email) || '').trim().toLowerCase();
    console.error('stripe async payment failed', failedSession.id, failedEmail);
    if (event.livemode === true && env.NOTIFICATION_EMAIL) {
      await enqueueEmail(env, {
        kind: 'email',
        to: env.NOTIFICATION_EMAIL,
        template: 'payment-failed-notify.html',
        subject: `[Payment failed] ${failedEmail || failedSession.id} — async payment failed`,
        data: {
          email: failedEmail || '—',
          session_id: failedSession.id || '—',
          amount: ((failedSession.amount_total || 0) / 100).toFixed(2),
          siteUrl: env.SITE_URL || '',
        },
      });
    }
    return json({ ok: true, handled: event.livemode === true });
  }
  if (completedPaymentEvent) {
    amountCents = event.data.object.amount_total || 0;
    description = 'stripe checkout';
    stripeInvoiceId = event.data.object.invoice || null;
  } else if (event.type === 'invoice.paid') {
    amountCents = event.data.object.amount_paid || 0;
    description = event.data.object.description || 'invoice';
    stripeInvoiceId = event.data.object.id;
  } else if (event.type === 'charge.refunded') {
    amountCents = -(event.data.object.amount_refunded || 0);
    description = 'refund';
    refundCharge = event.data.object;
  }
  if (!amountCents) return json({ ok: true, handled: false });

  // Lead payment state from checkout sessions — lookup first so we can pass details to the notification email.
  // Test-mode events (livemode:false) must never mutate production lead state.
  const isLive = event.livemode === true;
  let leadData = null;
  let repurchasePaymentKey = null;
  if (isLive && completedPaymentEvent) {
    const sessionId = event.data.object.id;
    const metaLeadId = event.data.object.metadata && event.data.object.metadata.lead_id;
    let leadRow = await env.DB.prepare(
      `SELECT id FROM leads WHERE stripe_session_id = ? AND status != 'paid' LIMIT 1`
    )
      .bind(sessionId)
      .first();
    // Cycle-3 P1: resubmission rotates stripe_session_id while the previous
    // session stays payable at Stripe for 24h. A payment completing on the
    // superseded session matches no row above, so the lead would never be
    // marked paid. Fall back to the deterministic lead_id written into the
    // session's metadata at creation (guarded: metadata may be absent on
    // non-checkout event types).
    if (!leadRow && metaLeadId) {
      leadRow = await env.DB.prepare(
        `SELECT id FROM leads WHERE id = ? AND status != 'paid' LIMIT 1`
      )
        .bind(metaLeadId)
        .first();
    }
    // P2-1: deliberate re-purchase — the lead paid 90+ days ago, so both
    // lookups above miss (status is already 'paid'). Treat it as a fresh
    // paid lead: refresh paid_at (re-anchoring the 30-day credit window),
    // persist the new paid amount, and send receipt + booking emails keyed
    // on this payment so the original purchase's sends can't duplicate.
    // A redelivery of the same event is safe: revenue UNIQUE(source_id)
    // dedupes the ledger row, and the per-payment email guard below makes
    // the sends a no-op.
    let repurchaseRow = null;
    if (!leadRow && metaLeadId) {
      repurchaseRow = await env.DB.prepare(
        `SELECT id, name, email FROM leads WHERE id = ? AND status = 'paid' LIMIT 1`
      )
        .bind(metaLeadId)
        .first();
    }
    if (leadRow) {
      const paidAt = nowEpoch();
      // P2-3: persist the actual paid amount for the final-invoice credit.
      await updateLeadPaidState(env, leadRow.id, paidAt, amountCents);
      leadData = await env.DB.prepare(
        `SELECT id, name, email FROM leads WHERE id = ? LIMIT 1`
      )
        .bind(leadRow.id)
        .first();
      // Cycle-2 P1-1: the visitor may have booked via the public Calendly
      // URL BEFORE paying. That booking points at a throwaway uuid lead
      // row; re-link it to the paid deterministic row so the safety-net
      // nudges and the 30-day anchors see the real booking. Both emails
      // are stored lowercased.
      if (leadData && leadData.email) {
        await env.DB.prepare(
          `UPDATE calendly_bookings SET lead_id = ?
           WHERE lower(invitee_email) = lower(?) AND lead_id != ?
             AND (status IS NULL OR status != 'cancelled')`
        ).bind(leadData.id, leadData.email, leadData.id).run();
      }
    } else if (repurchaseRow) {
      // P2-1: a redelivery of the same payment must not refresh the paid_at
      // anchor again — only the first processing of this payment re-anchors
      // the 30-day credit window. If the first delivery failed after the
      // update but before the receipt was tracked, the retry re-runs the
      // full flow, which is the desired recovery path.
      const alreadyProcessed = await sentPaymentEmailAlready(env, 'receipt.html', repurchaseRow.id, sessionId);
      leadData = repurchaseRow;
      repurchasePaymentKey = sessionId;
      if (!alreadyProcessed) {
        const paidAt = nowEpoch();
        await updateLeadPaidState(env, repurchaseRow.id, paidAt, amountCents);
      }
      if (leadData.email) {
        await env.DB.prepare(
          `UPDATE calendly_bookings SET lead_id = ?
           WHERE lower(invitee_email) = lower(?) AND lead_id != ?
             AND (status IS NULL OR status != 'cancelled')`
        ).bind(leadData.id, leadData.email, leadData.id).run();
      }
    }
  }

  // Test-mode Stripe events carry livemode:false and must never be recorded as
  // production revenue. This is the worker's only revenue write path, so the
  // guard covers checkout.session.completed, invoice.paid and charge.refunded.
  let inserted = false;
  if (isLive) {
    inserted = await insertRevenue(env, ctx, {
      occurred_at: new Date(event.created * 1000).toISOString(),
      source: 'stripe',
      source_id: event.id,
      session_id: completedPaymentEvent ? event.data.object.id : '',
      amount_cents: amountCents,
      currency: event.data.object.currency,
      description,
      metadata: { event_type: event.type },
      paid: amountCents >= 0,
    }, leadData);
  } else {
    console.log('stripe webhook skipped (test mode)', event.type, event.id);
  }

  // Refunds: a refunded client must not keep status='paid', or the sweeps
  // keep nudging them to book and the founder gets false "unbooked" alerts.
  // Full refunds (amount_refunded >= amount) flip the lead to 'refunded' and
  // alert the founder. Partial refunds leave the lead paid.
  if (isLive && refundCharge && refundCharge.amount_refunded >= refundCharge.amount) {
    const refundEmail = String(
      refundCharge.receipt_email ||
      (refundCharge.billing_details && refundCharge.billing_details.email) ||
      ''
    ).trim().toLowerCase();
    if (refundEmail) {
      const updated = await env.DB.prepare(
        `UPDATE leads SET status = 'refunded' WHERE email = ? AND status IN ('paid','disputed')`
      ).bind(refundEmail).run();
      if (updated.meta.changes > 0) {
        const refundedLead = await env.DB.prepare(
          `SELECT id, name, email FROM leads WHERE email = ? AND status = 'refunded' ORDER BY paid_at DESC LIMIT 1`
        ).bind(refundEmail).first();
        await enqueueEmail(env, {
          kind: 'email',
          to: env.NOTIFICATION_EMAIL || '',
          template: 'refund-notify.html',
          subject: `[Refund] ${refundedLead?.name || refundEmail} — session refunded`,
          data: {
            lead: refundedLead || { name: refundEmail, email: refundEmail },
            amount: (refundCharge.amount_refunded / 100).toFixed(2),
            siteUrl: env.SITE_URL || '',
          },
          lead_id: refundedLead?.id,
        });
      }
    }
  }

  // Receipt + booking emails only for live-mode payments: a test event must
  // never email a customer as if they paid.
  // Cycle-2 P2-4: if a transient failure (e.g. the revenue insert threw)
  // 500'd the first delivery after the lead was marked paid, Stripe's retry
  // finds leadData null. Re-fetch the paid lead and send unless the receipt
  // already went out.
  let receiptLead = leadData;
  if (isLive && !receiptLead && completedPaymentEvent) {
    receiptLead = await env.DB.prepare(
      `SELECT id, name, email FROM leads WHERE stripe_session_id = ? AND status = 'paid' LIMIT 1`
    ).bind(event.data.object.id).first();
    // Cycle-3 P1: same superseded-session gap as the paid-marking block —
    // a retry after a partial first delivery can't match the rotated
    // session id, so fall back to metadata.lead_id.
    if (!receiptLead) {
      const metaLeadId = event.data.object.metadata && event.data.object.metadata.lead_id;
      if (metaLeadId) {
        receiptLead = await env.DB.prepare(
          `SELECT id, name, email FROM leads WHERE id = ? AND status = 'paid' LIMIT 1`
        ).bind(metaLeadId).first();
      }
    }
  }
  if (isLive && receiptLead) {
    // P2-1: a re-purchase keys the receipt/booking sends on the payment
    // (Stripe session id) — the lead-level guard would wrongly suppress
    // them because the first purchase already mailed. A first purchase
    // keeps the original lead-level guard.
    const receiptDone = repurchasePaymentKey
      ? await sentPaymentEmailAlready(env, 'receipt.html', receiptLead.id, repurchasePaymentKey)
      : await sentAlready(env, 'receipt.html', receiptLead.id);
    if (!receiptDone) {
      const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const paymentMeta = repurchasePaymentKey ? { payment_key: repurchasePaymentKey } : undefined;
      ctx.waitUntil(Promise.all([
        enqueueEmail(env, {
          kind: 'email',
          to: receiptLead.email,
          template: 'receipt.html',
          subject: 'Your Sofrito Session receipt',
          data: { lead_id: receiptLead.id, lead: receiptLead, date, booking_url: calendlyPrefillUrl(receiptLead.name, receiptLead.email), amount: (amountCents / 100).toFixed(2) },
          metadata: paymentMeta,
          lead_id: receiptLead.id,
        }),
        enqueueEmail(env, {
          kind: 'email',
          to: receiptLead.email,
          template: 'booking-link.html',
          subject: 'Book your Sofrito Session',
          data: { lead_id: receiptLead.id, lead: receiptLead, booking_url: calendlyPrefillUrl(receiptLead.name, receiptLead.email) },
          metadata: paymentMeta,
          lead_id: receiptLead.id,
        }),
      ]));
    }
  }

  // S14: close the invoice ledger on payment. Match by our own
  // metadata.invoice_id first, then by the Stripe invoice id.
  // Live-mode only: a test event must never close a production invoice.
  if (isLive && event.type === 'invoice.paid') {
    const metaInvoiceId = (event.data.object.metadata && event.data.object.metadata.invoice_id) || '';
    const paidAt = new Date(event.created * 1000).toISOString();
    const found = await env.DB.prepare(
      `SELECT id, project_id, milestone FROM invoices WHERE id = ? OR stripe_invoice_id = ? LIMIT 1`
    )
      .bind(metaInvoiceId, stripeInvoiceId || '')
      .first();
    if (found) {
      await env.DB.prepare(`UPDATE invoices SET status = 'paid', paid_at = ? WHERE id = ?`).bind(paidAt, found.id).run();
      // P2-4: Stripe delivers webhooks at-least-once. The UPDATE above is
      // idempotent, but the founder email + Zapier webhook below are not —
      // guard them on the sent record so a redelivery is a no-op. (The
      // webhook has no tracking row of its own; it is enqueued atomically
      // with the email, so the email record covers both.)
      if (await sentAlready(env, 'invoice-paid-notify.html', `invoice-${found.id}`)) {
        return json({ ok: true, handled: inserted });
      }
      const project = await env.DB.prepare(`SELECT name FROM projects WHERE id = ?`).bind(found.project_id).first();
      ctx.waitUntil(
        Promise.all([
          enqueueWebhook(env, 'invoice.paid', {
            event: 'invoice.paid',
            invoice_id: found.id,
            project_id: found.project_id,
            project_name: (project && project.name) || '',
            milestone: found.milestone,
            amount_cents: amountCents,
            amount_dollars: (amountCents / 100).toFixed(2),
            paid_at: paidAt,
            stripe_invoice_id: stripeInvoiceId,
          }),
          enqueueEmail(env, {
            kind: 'email',
            to: env.NOTIFICATION_EMAIL || '',
            template: 'invoice-paid-notify.html',
            subject: `[Paid] $${(amountCents / 100).toFixed(2)} — ${(project && project.name) || found.milestone}`,
            data: {
              invoice: found,
              project: project || {},
              amount_dollars: (amountCents / 100).toFixed(2),
              paid_at: paidAt,
            },
            lead_id: `invoice-${found.id}`,
          }),
        ])
      );
    }
  }
  return json({ ok: true, handled: inserted });
}

// ------------------------------------------------------------
// Calendly bookings (S19) — session GMV + owner handoff
// POST /api/calendly-webhook : Calendly invites endpoint
//   (invitee.created / invitee.canceled). Signature verified over
//   `t.v1` hex HMAC-SHA256 (mirrors the Stripe parser above) with a
//   5-minute replay tolerance. A created booking upserts a
//   calendly_bookings row (`booking_uuid` UNIQUE, idempotent via
//   ON CONFLICT DO NOTHING + WHERE NOT EXISTS), mirrors the booking as
//   a leads row (channel 'calendly', source 'calendly_booking', status
//   'contacted'), and notifies the owner by email + booking.new webhook.
//   Cancellations flip both rows to 'cancelled' and emit
//   booking.cancelled. Optional Stripe invoicing stays gated by KV
//   `config/booking_billing` (default 'none'); stripe_invoice_id is
//   reserved on the table for the invoice-after-call flow.
// ------------------------------------------------------------
function parseCalendlySignature(header) {
  const parts = {};
  for (const pair of String(header || '').split(',')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    parts[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return { t: parts.t || '', v1: parts.v1 || '' };
}

function calendlyBookingUuid(uri) {
  const m = String(uri || '').match(/scheduled_events\/([0-9a-fA-F-]+)/);
  return m ? m[1].toLowerCase() : '';
}

function calendlyField(payload, keys) {
  for (const k of keys) {
    const v = payload && payload[k];
    const vv = v == null ? '' : String(v).trim();
    if (vv) return vv;
  }
  return '';
}

async function handleCalendlyWebhook(request, env, ctx) {
  const secret = env.CALENDLY_WEBHOOK_SIGNING_KEY;
  let raw;
  try {
    raw = await readWebhookText(request);
  } catch (e) {
    return fail(e && e.status === 413 ? 'body too large' : 'unreadable body', e && e.status === 413 ? 413 : 400);
  }
  const { t, v1 } = parseCalendlySignature(request.headers.get('calendly-webhook-signature'));
  if (!secret || !t || !v1) return fail('missing signature', 400);
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return fail('stale signature', 401);
  const expected = await hmacSha256(secret, `${t}.${raw}`);
  if (!safeEqual(expected, v1)) return fail('invalid signature', 401);

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return fail('invalid json', 400);
  }

  const kind = String(event.event || '');
  const payload = event.payload || {};
  if (kind !== 'invitee.created' && kind !== 'invitee.canceled') {
    return json({ ok: true, handled: false, reason: `unhandled:${kind}` });
  }

  const scheduledEvent = payload.scheduled_event && typeof payload.scheduled_event === 'object'
    ? payload.scheduled_event
    : typeof payload.scheduled_event === 'string'
      ? { uri: payload.scheduled_event }
      : {};
  const evUri = calendlyField(payload.event, ['uri']) || calendlyField(scheduledEvent, ['uri']);
  const buildingUuid =
    calendlyBookingUuid(evUri) ||
    calendlyBookingUuid(calendlyField(payload.invitee, ['uri', 'scheduled_event'])) ||
    calendlyBookingUuid(calendlyField(scheduledEvent, ['uri'])) ||
    calendlyBookingUuid(calendlyField(payload, ['uri']));
  if (!buildingUuid) return json({ ok: true, handled: false, reason: 'no booking uuid' });

  if (kind === 'invitee.canceled') return handleCalendlyCanceled(env, ctx, payload, buildingUuid);
  return handleCalendlyCreated(env, ctx, payload, buildingUuid);
}

async function handleCalendlyCreated(env, ctx, payload, bookingUuid) {
  const nestedInvitee = payload.invitee && typeof payload.invitee === 'object' ? payload.invitee : {};
  const nestedEvent = payload.event && typeof payload.event === 'object' ? payload.event : {};
  const scheduledEvent = payload.scheduled_event && typeof payload.scheduled_event === 'object'
    ? payload.scheduled_event
    : typeof payload.scheduled_event === 'string'
      ? { uri: payload.scheduled_event }
      : {};
  const invitee = { ...payload, ...nestedInvitee };
  const event = Object.keys(nestedEvent).length ? nestedEvent : scheduledEvent;
  const rawQuestions = invitee.questions_and_answers || payload.questions_and_answers;
  const questions = Array.isArray(rawQuestions) ? rawQuestions : [];
  const answers = questions
    .filter((qa) => qa && qa.answer != null && String(qa.answer).trim())
    .map((qa) => ({ q: String(qa.question || '').trim(), a: String(qa.answer).trim() }));
  const answerFor = (...needles) => {
    const hit = answers.find((qa) => needles.some((n) => qa.q.toLowerCase().includes(n)));
    return hit ? hit.a : '';
  };

  const name =
    calendlyField(invitee, ['name']) ||
    `${calendlyField(payload, ['first_name'])} ${calendlyField(payload, ['last_name'])}`.trim() ||
    answerFor('name', 'tu nombre');
  // Normalized to match leads.email, which /api/lead stores lowercased —
  // otherwise a case difference silently breaks the paid-lead match below.
  const email = String(calendlyField(invitee, ['email']) || calendlyField(payload, ['email']) || '').trim().toLowerCase();
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ ok: true, handled: false, reason: 'incomplete invitee' });
  }

  const scheduledFor = event.start_time || calendlyField(payload, ['scheduled_for', 'start_time']) || calendlyField(invitee, ['scheduled_for', 'start_time']);
  const timezone = calendlyField(invitee, ['timezone']) || calendlyField(event, ['timezone']) || calendlyField(payload, ['timezone']);

  const now = nowIso();
  const lead = {
    id: uuid(),
    created_at: now,
    name: name.slice(0, 120),
    email,
    phone: answerFor('phone', 'tel'),
    business_name: answerFor('business', 'company', 'negocio', 'restaurant'),
    business_type: 'session',
    package_interest: 'session',
    budget: '$400',
    message: `Booked a 45-minute Sofrito Session via Calendly${scheduledFor ? ` for ${scheduledFor}` : ''}. Booking ${bookingUuid}.`,
    source: 'calendly_booking',
    channel: 'calendly',
    score: 0,
    status: 'contacted',
  };
  lead.score = await scoreLead(env, lead);

  const booking = {
    booking_uuid: bookingUuid,
    invitee_email: email,
    invitee_name: name,
    scheduled_for: scheduledFor || null,
    timezone: timezone || null,
    event_name: calendlyField(event, ['name']) || calendlyField(payload, ['event_name']) || 'Sofrito Session',
    answers: answers.length ? JSON.stringify(answers) : null,
    reschedule_url: calendlyField(payload, ['reschedule_url']) || calendlyField(invitee, ['reschedule_url']),
    cancel_url: calendlyField(payload, ['cancel_url']) || calendlyField(invitee, ['cancel_url']),
  };

  // Payment matching: if the invitee email already has a paid session lead,
  // link the booking to that paid lead instead of minting a duplicate row.
  // This also drives the paid/unpaid flag in the owner notification so an
  // unpaid booking can never look like a paying client.
  const paidLead = await env.DB.prepare(
    `SELECT id, name, email, paid_at FROM leads WHERE email = ? AND status = 'paid' LIMIT 1`
  ).bind(email).first();
  const bookingLeadId = paidLead ? paidLead.id : lead.id;
  const paymentIsPaid = !!paidLead;

  // D1 batch is a transaction: the lead insert is keyed to NOT EXISTS so a
  // retry race can never mint a second lead for the same booking, and it is
  // skipped entirely when the email already has a paid lead.
  const batchResults = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO leads (id, created_at, name, email, phone, business_name, business_type, package_interest, budget, message, channel, score, status, source)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'calendly', ?, 'contacted', 'calendly_booking'
       WHERE NOT EXISTS (SELECT 1 FROM calendly_bookings WHERE booking_uuid = ?)
         AND NOT EXISTS (SELECT 1 FROM leads WHERE email = ? AND status = 'paid')`
    ).bind(lead.id, now, lead.name, lead.email, lead.phone, lead.business_name, lead.business_type, lead.package_interest, lead.budget, lead.message, lead.score, bookingUuid, email),
    env.DB.prepare(
      `INSERT INTO calendly_bookings (id, created_at, booking_uuid, invitee_email, invitee_name, scheduled_for, timezone, event_name, answers, reschedule_url, cancel_url, lead_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
       ON CONFLICT(booking_uuid) DO NOTHING`
    ).bind(uuid(), now, booking.booking_uuid, booking.invitee_email, booking.invitee_name, booking.scheduled_for, booking.timezone, booking.event_name, booking.answers, booking.reschedule_url, booking.cancel_url, bookingLeadId),
  ]);
  const bookingCreated = batchResults[1]?.meta?.changes === 1;

  const saved = await env.DB.prepare(
    `SELECT id, lead_id, reschedule_url, cancel_url FROM calendly_bookings WHERE booking_uuid = ?`
  )
    .bind(bookingUuid)
    .first();
  if (!saved) return json({ ok: true, handled: false, reason: 'no booking row' });
  if (booking.reschedule_url || booking.cancel_url) {
    await env.DB.prepare(
      `UPDATE calendly_bookings
       SET reschedule_url = COALESCE(NULLIF(?, ''), reschedule_url),
           cancel_url = COALESCE(NULLIF(?, ''), cancel_url),
           updated_at = COALESCE(updated_at, ?)
       WHERE booking_uuid = ?`
    )
      .bind(booking.reschedule_url, booking.cancel_url, now, bookingUuid)
      .run();
  }
  if (!bookingCreated) return json({ ok: true, handled: false, reason: 'booking already processed' });

  const flat = {
    event: 'booking.new',
    id: saved.lead_id || lead.id,
    booking_id: saved.id,
    booking_uuid: bookingUuid,
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    business_name: lead.business_name,
    package_interest: 'session',
    budget: lead.budget,
    message: lead.message,
    channel: 'calendly',
    source: 'calendly_booking',
    score: lead.score,
    status: 'contacted',
    scheduled_for: scheduledFor || null,
    timezone: timezone || null,
    event_name: booking.event_name,
  };

  const answersText = answers.map((qa) => `${qa.q}: ${qa.a}`).join('\n');
  // Owner-facing payment banner: server-rendered (trusted values only —
  // paidLead fields are Stripe-verified, never lead input) so the
  // notification can never claim a payment that was not found.
  const paidOn = paidLead && paidLead.paid_at
    ? new Date(paidAtMs(paidLead.paid_at)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  // Cycle-3 P2: the session price is KV-overridable — never hardcode $400.
  const sessionPriceDollars = `$${(Number(await getSessionPriceCents(env)) / 100).toFixed(0)}`;
  const paymentBanner = paymentIsPaid
    ? `<div style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:8px;padding:12px 16px;font-size:14px;color:#065F46;margin:0 0 16px;"><strong>Payment verified:</strong> ${sessionPriceDollars} Sofrito Session paid${paidOn ? ' on ' + escapeHtml(paidOn) : ''}.</div>`
    : `<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;font-size:14px;color:#991B1B;margin:0 0 16px;"><strong>⚠ No payment found:</strong> no ${sessionPriceDollars} session payment matches this email. Verify in Stripe before the session — or collect it then.</div>`;
  const paymentFooterNote = paymentIsPaid
    ? await (async () => {
        // 30-day credit window — same rule as /api/invoice-trigger and the
        // unbilled-final sweep: the footer must not promise a $597 remainder
        // when the session credit has already expired (then it is $997).
        const sprintCents = (PACKAGE_FALLBACK.sprint || {}).price_cents || 99700;
        let creditExpired = false;
        try {
          const firstBooking = await env.DB.prepare(
            `SELECT scheduled_for FROM calendly_bookings
             WHERE lead_id = ? AND (status IS NULL OR status != 'cancelled')
             ORDER BY scheduled_for ASC LIMIT 1`
          )
            .bind(bookingLeadId)
            .first();
          const anchor = (firstBooking && firstBooking.scheduled_for) || paidLead.paid_at;
          if (anchor) creditExpired = Math.floor((Date.now() - paidAtMs(anchor)) / 86400000) > 30;
        } catch (e) {
          // Unknown anchor: fall through to the standard $597 remainder.
        }
        // P2-3: the recorded payment is what the client actually paid, not
        // the current KV price — the founder may have changed it since.
        const paidCents = await getLeadPaidAmountCents(env, bookingLeadId);
        const sessionPriceCents = paidCents || Number(await getSessionPriceCents(env));
        const sessionCents = creditExpired ? 0 : sessionPriceCents;
        const remaining = `$${(splitMilestoneAmounts(sprintCents, sessionCents).final / 100).toFixed(0)}`;
        return `The $${(sessionPriceCents / 100).toFixed(0)} Stripe payment is recorded against this lead. The remaining ${remaining} is due after written direction lock if the client starts the $${(sprintCents / 100).toFixed(0)} Brand & Web Sprint.`;
      })()
    : `No ${sessionPriceDollars} payment is linked to this booking yet. If the client paid under a different email, link it manually before the session.`;
  ctx.waitUntil(
    Promise.all([
      enqueueWebhook(env, 'booking.new', { ...flat, payment_status: paymentIsPaid ? 'paid' : 'unpaid' }),
      enqueueEmail(env, {
        kind: 'email',
        to: env.NOTIFICATION_EMAIL || '',
        template: 'booking-notify.html',
        subject: `[Booking${paymentIsPaid ? '' : ' — UNPAID'}] ${lead.name} — Sofrito Session${scheduledFor ? ' · ' + scheduledFor : ''}`,
        data: {
          lead: { name: lead.name, email: lead.email, phone: lead.phone, business_name: lead.business_name },
          booking: { ...booking, booking_id: saved.id, answers_text: answersText },
          payment_banner: paymentBanner,
          payment_footer_note: paymentFooterNote,
          siteUrl: env.SITE_URL || '',
        },
        lead_id: `booking-${bookingUuid}`,
      }),
    ])
  );

  return json({ ok: true, handled: true, booking_id: saved.id, lead_id: saved.lead_id || lead.id }, 201);
}

async function handleCalendlyCanceled(env, ctx, payload, bookingUuid) {
  const booking = await env.DB.prepare(`SELECT * FROM calendly_bookings WHERE booking_uuid = ?`)
    .bind(bookingUuid)
    .first();
  if (!booking) return json({ ok: true, handled: false, reason: 'unknown booking' });
  if (booking.status === 'cancelled') return json({ ok: true, handled: false, reason: 'already cancelled' });

  const now = nowIso();
  const cancellation = payload.cancellation || {};
  const reason =
    calendlyField(cancellation, ['reason']) ||
    `canceled by ${calendlyField(cancellation, ['canceler_name', 'canceler_type'])}`.trim() ||
    '';

  await env.DB.prepare(
    `UPDATE calendly_bookings
     SET status = 'cancelled', updated_at = ?, cancelled_at = ?,
         cancel_url = COALESCE(NULLIF(?, ''), cancel_url)
     WHERE booking_uuid = ?`
  )
    .bind(now, now, calendlyField(payload, ['cancel_url']), bookingUuid)
    .run();
  // A paid lead stays 'paid' when its booking is cancelled. The booking
  // safety net keys on status='paid' (48h client nudge, 7d founder alert),
  // and a reschedule's invitee.created must re-match the paid lead — not
  // mint a duplicate row and send a false "complete your payment" nudge to
  // someone who already paid $400.
  if (booking.lead_id) {
    await env.DB.prepare(`UPDATE leads SET status = 'cancelled', updated_at = ? WHERE id = ? AND status != 'paid'`)
      .bind(now, booking.lead_id)
      .run();
  }

  let answersText = '';
  try {
    answersText = booking.answers ? JSON.parse(booking.answers).map((qa) => `${qa.q}: ${qa.a}`).join('\n') : '';
  } catch {
    answersText = '';
  }

  ctx.waitUntil(
    Promise.all([
      enqueueWebhook(env, 'booking.cancelled', {
        event: 'booking.cancelled',
        booking_id: booking.id,
        booking_uuid: bookingUuid,
        lead_id: booking.lead_id || null,
        name: booking.invitee_name || '',
        email: booking.invitee_email,
        scheduled_for: booking.scheduled_for || null,
        reason,
      }),
      enqueueEmail(env, {
        kind: 'email',
        to: env.NOTIFICATION_EMAIL || '',
        template: 'booking-cancel-notify.html',
        subject: `[Cancelled] ${booking.invitee_name || booking.invitee_email} — Sofrito Session${booking.scheduled_for ? ' · ' + booking.scheduled_for : ''}`,
        data: {
          booking: {
            booking_id: booking.id,
            invitee_name: booking.invitee_name,
            invitee_email: booking.invitee_email,
            scheduled_for: booking.scheduled_for,
            event_name: booking.event_name,
            answers_text: answersText,
            cancelled_at: now,
          },
          reason,
          siteUrl: env.SITE_URL || '',
        },
        lead_id: `booking-${bookingUuid}`,
      }),
    ])
  );

  return json({ ok: true, handled: true, booking_id: booking.id, lead_id: booking.lead_id });
}

// ------------------------------------------------------------
// Scheduled CRM automation (hourly cron)
// ------------------------------------------------------------
const DRIP_PLAN = [
  { day: 2, template: 'welcome-1.html', subject: "Día 2 / Day 2 — Your food has a story" },
  { day: 5, template: 'welcome-2.html', subject: "Día 5 / Day 5 — Where most food brands go wrong" },
  { day: 9, template: 'welcome-3.html', subject: "Día 9 / Day 9 — Let's put it on the table" },
];

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

function bookingLead(booking) {
  return {
    id: booking.lead_id || `booking-${booking.booking_uuid}`,
    name: booking.lead_name || booking.invitee_name || 'there',
    email: booking.lead_email || booking.invitee_email,
    phone: booking.phone || '',
    business_name: booking.business_name || booking.invitee_name || '',
    business_type: booking.business_type || 'session',
    package_interest: booking.package_interest || 'session',
    budget: booking.budget || '$400',
  };
}

async function sentAlready(env, template, leadId) {
  const row = await env.DB.prepare(
    `SELECT 1 FROM emails_sent WHERE template = ? AND json_extract(metadata, '$.lead_id') = ? AND status IN ('queued','sent') LIMIT 1`
  )
    .bind(template, leadId)
    .first();
  return !!row;
}

async function emailRecordedByEvent(env, template, eventId) {
  const row = await env.DB.prepare(
    `SELECT 1 FROM emails_sent WHERE template = ? AND json_extract(metadata, '$.event_id') = ? AND status IN ('queued','sent') LIMIT 1`
  )
    .bind(template, eventId)
    .first();
  return !!row;
}

// P2-1: per-payment email idempotency. The lead-level sentAlready guard is
// correct for a first purchase (one receipt per lead), but a deliberate
// re-purchase must mail again — keyed on the Stripe session id so the
// original payment's sends and Stripe redeliveries can't duplicate.
async function sentPaymentEmailAlready(env, template, leadId, paymentKey) {
  const row = await env.DB.prepare(
    `SELECT 1 FROM emails_sent WHERE template = ? AND json_extract(metadata, '$.lead_id') = ? AND json_extract(metadata, '$.payment_key') = ? AND status IN ('queued','sent') LIMIT 1`
  )
    .bind(template, leadId, paymentKey)
    .first();
  return !!row;
}

// P2-3: persist the actual paid amount on the lead at mark-paid time, so the
// final-invoice session credit uses what the client paid instead of the
// current SESSION_PRICE_CENTS KV value. Tolerant: paid_amount_cents may not
// exist in D1 yet (no migration applied) — a missing column must never break
// the webhook, so fall back to the column-less write and rethrow anything else.
async function updateLeadPaidState(env, leadId, paidAt, amountCents) {
  try {
    await env.DB.prepare(
      `UPDATE leads SET status = 'paid', paid_at = ?, paid_amount_cents = ? WHERE id = ?`
    )
      .bind(paidAt, amountCents, leadId)
      .run();
  } catch (e) {
    if (/no such column/i.test(String((e && e.message) || ''))) {
      await env.DB.prepare(
        `UPDATE leads SET status = 'paid', paid_at = ? WHERE id = ?`
      )
        .bind(paidAt, leadId)
        .run();
    } else {
      throw e;
    }
  }
}

// P2-3 reader: the amount the lead actually paid, or null when unknown
// (pre-existing paid rows, or the column absent pre-migration). Callers fall
// back to getSessionPriceCents(env).
async function getLeadPaidAmountCents(env, leadId) {
  if (!leadId) return null;
  try {
    const row = await env.DB.prepare(
      `SELECT paid_amount_cents FROM leads WHERE id = ? LIMIT 1`
    )
      .bind(leadId)
      .first();
    const v = Number(row && row.paid_amount_cents);
    return Number.isFinite(v) && v > 0 ? Math.round(v) : null;
  } catch (e) {
    return null;
  }
}

// Founder nudge for the larger half of every deal: a paid $400 session with
// no final $997-split invoice 7+ days after payment. One nudge per lead
// (deduped through emails_sent), sent only if direction could plausibly be
// locked — the founder still decides when to trigger /api/invoice-trigger.
async function handleUnbilledFinalSweep(env) {
  const rows = await env.DB.prepare(
    `SELECT l.id, l.name, l.email, l.paid_at, p.id AS project_id, p.name AS project_name
     FROM leads l
     LEFT JOIN projects p ON p.lead_id = l.id
     WHERE l.status = 'paid'
       AND l.paid_at IS NOT NULL
       AND l.paid_at < unixepoch() - 604800
       AND NOT EXISTS (
         SELECT 1 FROM invoices i WHERE i.project_id = p.id AND i.milestone = 'final'
       )`
  ).all();
  if (!rows.results?.length) return;
  for (const row of rows.results) {
    if (await sentAlready(env, 'unbilled-final-notify.html', row.id)) continue;
    // 30-day credit window — the same rule /api/invoice-trigger enforces:
    // the $400 session credit only counts toward the sprint when the
    // session was within the last 30 days. Past the window the true
    // collectible final balance is the full $997 sprint price, not $597.
    // Quoting $597 here would risk under-billing a late session.
    let creditExpired = false;
    const booking = await env.DB.prepare(
      `SELECT scheduled_for FROM calendly_bookings
       WHERE lead_id = ? AND (status IS NULL OR status != 'cancelled')
       ORDER BY scheduled_for ASC LIMIT 1`
    )
      .bind(row.id)
      .first();
    const anchor = (booking && booking.scheduled_for) || row.paid_at;
    if (anchor) creditExpired = Math.floor((Date.now() - paidAtMs(anchor)) / 86400000) > 30;
    const sprintCents = (PACKAGE_FALLBACK.sprint || {}).price_cents || 99700;
    // P2-3: credit what the client actually paid (falls back to the KV
    // price for pre-existing paid rows or pre-migration).
    const paidCents = await getLeadPaidAmountCents(env, row.id);
    const sessionCents = creditExpired ? 0 : (paidCents || Number(await getSessionPriceCents(env)));
    const finalCents = splitMilestoneAmounts(sprintCents, sessionCents).final;
    const finalBalance = `$${(finalCents / 100).toFixed(0)}`;
    const creditNote = creditExpired
      ? `The 30-day session-credit window has passed, so the full $${(sprintCents / 100).toFixed(0)} sprint price applies (no session credit).`
      : '';
    const days = row.paid_at
      ? Math.floor((Date.now() - paidAtMs(row.paid_at)) / 86400000)
      : null;
    await enqueueEmail(env, {
      kind: 'email',
      to: env.NOTIFICATION_EMAIL || '',
      template: 'unbilled-final-notify.html',
      subject: `[Unbilled ${finalBalance}] ${row.name || row.email} — final Sprint invoice not triggered`,
      data: {
        lead: {
          name: row.name || row.email,
          email: row.email,
          paid_at: row.paid_at ? new Date(paidAtMs(row.paid_at)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '',
        },
        days_since_paid: days == null ? '—' : String(days),
        final_balance: finalBalance,
        credit_note: creditNote,
        project: { id: row.project_id || '', name: row.project_name || '(no project row yet)' },
        siteUrl: env.SITE_URL || '',
      },
      lead_id: row.id,
    });
  }
}

// Booking safety net: two silent-drop gaps the other sweeps miss.
// (a) Paid session, no booking: the Stripe webhook marks payers status='paid',
// which neither the warm drip (paid_at IS NULL) nor the won-lead fallback
// (status='won') selects. A payer who closes the tab before Calendly would
// drift forever — nudge the client once at 48h, alert the founder once at 7d.
// (b) Booking, no payment: a Calendly booking whose email has no paid lead.
// Nudge the booker once at 24h to complete payment (their slot isn't held).
// Cancelled bookings are excluded from both.
async function handleBookingSafetyNet(env) {
  const unbooked = await env.DB.prepare(
    `SELECT l.id, l.name, l.email, l.phone, l.paid_at
     FROM leads l
     WHERE l.status = 'paid' AND l.paid_at IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM calendly_bookings b
         WHERE b.lead_id = l.id AND (b.status IS NULL OR b.status != 'cancelled')
       )`
  ).all();
  for (const lead of unbooked.results || []) {
    const days = (Date.now() - paidAtMs(lead.paid_at)) / 86400000;
    if (days >= 2 && !(await sentAlready(env, 'booking-nudge.html', lead.id))) {
      await enqueueEmail(env, {
        kind: 'email',
        to: lead.email,
        template: 'booking-nudge.html',
        subject: 'Pick your Sofrito Session time',
        data: { lead, siteUrl: env.SITE_URL || '', booking_url: calendlyPrefillUrl(lead.name, lead.email) },
        lead_id: lead.id,
      });
    }
    if (days >= 7 && !(await sentAlready(env, 'unbooked-session-notify.html', lead.id))) {
      // The paid amount, not a hardcoded $400: SESSION_PRICE_CENTS may be overridden.
      const paidDollars = `$${(Number(await getSessionPriceCents(env)) / 100).toFixed(0)}`;
      await enqueueEmail(env, {
        kind: 'email',
        to: env.NOTIFICATION_EMAIL || '',
        template: 'unbooked-session-notify.html',
        subject: `[Unbooked session] ${lead.name || lead.email} paid ${paidDollars}, never booked`,
        data: {
          lead: {
            name: lead.name || lead.email,
            email: lead.email,
            phone: lead.phone || '—',
            paid_at: lead.paid_at
              ? new Date(paidAtMs(lead.paid_at)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : '',
          },
          days_since_paid: String(Math.floor(days)),
          paid_dollars: paidDollars,
          siteUrl: env.SITE_URL || '',
        },
        lead_id: lead.id,
      });
    }
  }

  const unpaid = await env.DB.prepare(
    `SELECT b.booking_uuid, b.invitee_email, b.invitee_name, b.scheduled_for, b.created_at
     FROM calendly_bookings b
     WHERE (b.status IS NULL OR b.status != 'cancelled')
       AND b.created_at < datetime('now', '-1 day')
       AND NOT EXISTS (
         SELECT 1 FROM leads l
         WHERE l.id = b.lead_id AND l.paid_at IS NOT NULL
       )`
    // NOTE: paid_at (not status) is the exclusion: paid_at is never cleared,
    // so a refunded or dispute-lost lead still counts as "already paid" and
    // never receives a false "Complete your payment" demand.
  ).all();
  for (const booking of unpaid.results || []) {
    if (await emailRecordedByEvent(env, 'payment-nudge.html', booking.booking_uuid)) continue;
    const when = booking.scheduled_for
      ? ` for ${new Date(booking.scheduled_for).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`
      : '';
    await enqueueEmail(env, {
      kind: 'email',
      to: booking.invitee_email,
      template: 'payment-nudge.html',
      subject: 'Complete your payment to hold your session time',
      data: {
        lead: { name: booking.invitee_name || 'there', email: booking.invitee_email },
        scheduled_for: when,
        siteUrl: env.SITE_URL || '',
        book_url: `${env.SITE_URL || ''}/#book?email=${encodeURIComponent(booking.invitee_email)}&name=${encodeURIComponent(booking.invitee_name || '')}`,
      },
      metadata: { event_id: booking.booking_uuid },
    });
  }
}

async function handleCheckoutSafetyNet(env, ctx) {
  const threshold = nowEpoch() - 7200;
  const leads = await env.DB.prepare(
    `SELECT id, email, name, stripe_session_id, checkout_url FROM leads
     WHERE status = 'checkout_started' AND checkout_started_at < ? AND nudge_sent_at IS NULL`
  )
    .bind(threshold)
    .all();
  if (!leads.results?.length) return;
  for (const lead of leads.results) {
    const nudgeAt = nowEpoch();
    const result = await env.DB.prepare(
      `UPDATE leads SET nudge_sent_at = ?, status = 'abandoned'
       WHERE id = ? AND status = 'checkout_started' AND nudge_sent_at IS NULL AND paid_at IS NULL AND checkout_url IS NOT NULL`
    )
      .bind(nudgeAt, lead.id)
      .run();
    if (!result.meta?.changes) continue;
    // P2-2: the stored checkout_url may be expired or superseded — refresh
    // it so the nudge links a live session. Skip when none exists.
    let checkoutUrl = null;
    try {
      checkoutUrl = await ensureFreshCheckoutUrl(env, lead);
    } catch (e) {
      console.error('safety-net nudge checkout recovery failed', lead.id, e.message);
    }
    if (!checkoutUrl) continue;
    await enqueueEmail(env, {
      kind: 'email',
      to: lead.email,
      template: 'abandoned-nudge.html',
      subject: 'Your Sofrito Session — still interested?',
      data: { lead_id: lead.id, name: lead.name, checkout_url: checkoutUrl },
      lead_id: lead.id,
    });
  }
}

async function handleSecondCheckoutNudge(env) {
  const threshold = nowEpoch() - 86400;
  const leads = await env.DB.prepare(
    `SELECT id, email, name, stripe_session_id, checkout_url FROM leads
     WHERE checkout_started_at < ? AND nudge_sent_at IS NOT NULL AND paid_at IS NULL
     ORDER BY checkout_started_at ASC LIMIT 200`
  )
    .bind(threshold)
    .all();
  for (const lead of leads.results || []) {
    if (await sentAlready(env, 'abandoned-nudge-2.html', lead.id)) continue;
    let checkoutUrl = null;
    try {
      checkoutUrl = await ensureFreshCheckoutUrl(env, lead);
    } catch (e) {
      console.error('second nudge checkout recovery failed', lead.id, e.message);
    }
    if (!checkoutUrl) continue;
    const deadline = formatSessionDate(new Date(Date.now() + 86400000).toISOString(), 'UTC', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
    await enqueueEmail(env, {
      kind: 'email',
      to: lead.email,
      template: 'abandoned-nudge-2.html',
      subject: 'Your Sofrito Session is still here',
      data: { lead_id: lead.id, name: lead.name, checkout_url: checkoutUrl, deadline },
      lead_id: lead.id,
    });
  }
}

async function runSessionAutomations(env) {
  const reminderQuery = `SELECT b.*, l.name AS lead_name, l.email AS lead_email, l.phone, l.business_name, l.business_type, l.package_interest, l.budget, l.status AS lead_status
    FROM calendly_bookings b
    LEFT JOIN leads l ON l.id = b.lead_id
    WHERE b.status = 'active' AND b.scheduled_for IS NOT NULL
      AND julianday(b.scheduled_for) BETWEEN julianday('now', '+20 hours') AND julianday('now', '+28 hours')
    ORDER BY b.scheduled_for ASC`;
  const reminders = await env.DB.prepare(reminderQuery).all();
  // Cycle-3 P2: the session price is KV-overridable — never hardcode $400.
  const sessionPriceDollars = `$${(Number(await getSessionPriceCents(env)) / 100).toFixed(0)}`;
  for (const booking of reminders.results || []) {
    if (await emailRecordedByEvent(env, 'session-reminder.html', booking.booking_uuid)) continue;
    const lead = bookingLead(booking);
    // An unpaid booker must not get a reminder that reads like a confirmed
    // session: their slot isn't held until payment completes. Paid bookers
    // get the plain reminder.
    const bookingIsPaid = booking.lead_status === 'paid';
    const payUrl = `${env.SITE_URL || ''}/#book?email=${encodeURIComponent(lead.email || '')}&name=${encodeURIComponent(lead.name === 'there' ? '' : lead.name)}`;
    const paymentBanner = bookingIsPaid
      ? ''
      : `<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:14px 16px;font-size:14px;color:#991B1B;margin:0 0 16px;"><strong>Heads up:</strong> we haven't received your ${sessionPriceDollars} payment yet, so your session time isn't held. <a href="${payUrl}" style="color:#991B1B;font-weight:700;">Complete your payment</a> to lock it in.</div>`;
    const scheduledLabel = formatSessionDate(booking.scheduled_for, booking.timezone, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
    const subjectDate = formatSessionDate(booking.scheduled_for, booking.timezone, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const rescheduleUrl = booking.reschedule_url ||
      `mailto:hello@sofritostudio.com?subject=${encodeURIComponent(`Change my Sofrito Session — ${subjectDate}`)}`;
    const rescheduleLabel = booking.reschedule_url
      ? 'Review or reschedule your Sofrito Session'
      : 'Contact us to change your Sofrito Session time';
    await enqueueEmail(env, {
      kind: 'email',
      to: lead.email,
      template: 'session-reminder.html',
      subject: `Tomorrow: your Sofrito Session — ${subjectDate}`,
      data: {
        lead,
        booking: {
          scheduled_label: scheduledLabel,
          timezone: booking.timezone || 'UTC',
          reschedule_url: rescheduleUrl,
          reschedule_label: rescheduleLabel,
        },
        payment_banner: paymentBanner,
      },
      lead_id: lead.id,
      metadata: { booking_id: booking.id, booking_uuid: booking.booking_uuid, event_id: booking.booking_uuid },
    });
  }

  const day1Query = `SELECT b.*, l.name AS lead_name, l.email AS lead_email, l.phone, l.business_name, l.business_type, l.package_interest, l.budget
    FROM calendly_bookings b
    LEFT JOIN leads l ON l.id = b.lead_id
    WHERE b.status = 'active' AND b.scheduled_for IS NOT NULL
      AND julianday(b.scheduled_for) <= julianday('now', '-1 hour')
      AND julianday(b.scheduled_for) >= julianday('now', '-48 hours')
    ORDER BY b.scheduled_for ASC`;
  const day1Bookings = await env.DB.prepare(day1Query).all();
  for (const booking of day1Bookings.results || []) {
    const lead = bookingLead(booking);
    if (
      (await emailRecordedByEvent(env, 'follow-up-day1.html', booking.booking_uuid)) ||
      (await sentAlready(env, 'follow-up-day1.html', lead.id))
    ) continue;
    await enqueueEmail(env, {
      kind: 'email',
      to: lead.email,
      template: 'follow-up-day1.html',
      subject: 'Thank you for your Sofrito Session',
      data: { lead, siteUrl: env.SITE_URL || '' },
      lead_id: lead.id,
      metadata: { booking_id: booking.id, booking_uuid: booking.booking_uuid, event_id: booking.booking_uuid },
    });
  }

  const day30Query = `SELECT b.*, l.name AS lead_name, l.email AS lead_email, l.phone, l.business_name, l.business_type, l.package_interest, l.budget
    FROM calendly_bookings b
    LEFT JOIN leads l ON l.id = b.lead_id
    WHERE b.status = 'active' AND b.scheduled_for IS NOT NULL
      AND julianday(b.scheduled_for) <= julianday('now', '-30 days')
    ORDER BY b.scheduled_for ASC`;
  const day30Bookings = await env.DB.prepare(day30Query).all();
  for (const booking of day30Bookings.results || []) {
    const lead = bookingLead(booking);
    if (
      (await emailRecordedByEvent(env, 'follow-up-day30.html', booking.booking_uuid)) ||
      (await sentAlready(env, 'follow-up-day30.html', lead.id))
    ) continue;
    await enqueueEmail(env, {
      kind: 'email',
      to: lead.email,
      template: 'follow-up-day30.html',
      subject: 'Thirty days after your Sofrito Session',
      data: { lead, siteUrl: env.SITE_URL || '' },
      lead_id: lead.id,
      metadata: { booking_id: booking.id, booking_uuid: booking.booking_uuid, event_id: booking.booking_uuid },
    });
  }
}

async function runWonLeadFallbacks(env) {
  const fallback = await env.DB.prepare(
    `SELECT l.* FROM leads l
     WHERE l.status = 'won' AND NOT EXISTS (SELECT 1 FROM calendly_bookings b WHERE b.lead_id = l.id)
     ORDER BY l.updated_at ASC LIMIT 200`
  ).all();
  for (const lead of fallback.results || []) {
    const sinceClose = daySince(lead.updated_at);
    if (sinceClose >= 1 && !(await sentAlready(env, 'follow-up-day1.html', lead.id))) {
      await enqueueEmail(env, {
        kind: 'email',
        to: lead.email,
        template: 'follow-up-day1.html',
        subject: 'Thank you for your Sofrito Session',
        data: { lead, siteUrl: env.SITE_URL || '' },
        lead_id: lead.id,
      });
    }
    if (sinceClose >= 30 && !(await sentAlready(env, 'follow-up-day30.html', lead.id))) {
      await enqueueEmail(env, {
        kind: 'email',
        to: lead.email,
        template: 'follow-up-day30.html',
        subject: 'Thirty days after your Sofrito Session',
        data: { lead, siteUrl: env.SITE_URL || '' },
        lead_id: lead.id,
      });
    }
  }
}

async function runLeadAutomations(env) {
  const warm = await env.DB.prepare(
    `SELECT id, created_at, name, email, phone, business_name, business_type, package_interest, budget, message, channel, score, source, updated_at, status
     FROM leads
     WHERE status IN ('new','contacted','qualified','checkout_started','abandoned','won')
       AND paid_at IS NULL AND unsubscribed_at IS NULL
     ORDER BY created_at ASC LIMIT 200`
  ).all();

  for (const lead of warm.results) {
    const day = daySince(lead.created_at);

    for (const step of DRIP_PLAN) {
      if (day >= step.day && !(await sentAlready(env, step.template, lead.id))) {
        await enqueueEmail(env, {
          kind: 'email',
          to: lead.email,
          template: step.template,
          subject: step.subject,
          data: { lead, siteUrl: env.SITE_URL || '' },
          lead_id: lead.id,
        });
      }
    }

    if (lead.status === 'new' && day >= 1 && !(await sentAlready(env, 'follow-up-lead-reminder.html', lead.id))) {
      await enqueueEmail(env, {
        kind: 'email',
        to: env.NOTIFICATION_EMAIL || '',
        template: 'follow-up-lead-reminder.html',
        subject: `24h follow-up needed: ${lead.name}`,
        data: { lead, siteUrl: env.SITE_URL || '' },
        lead_id: lead.id,
      });
      await enqueueWebhook(env, 'lead.reminder', lead);
    }

    if (
      lead.status === 'won' &&
      daySince(lead.updated_at) >= 7 &&
      !(await sentAlready(env, 'referral-invite.html', lead.id))
    ) {
      await enqueueEmail(env, {
        kind: 'email',
        to: lead.email,
        template: 'referral-invite.html',
        subject: 'Your referral invitation',
        data: {
          lead,
          referral_reward: 'For every referral who completes a Brand & Web Sprint, we send you $100. No limit.',
          siteUrl: env.SITE_URL || '',
        },
        lead_id: lead.id,
      });
    }
  }

  await runWonLeadFallbacks(env);
}

async function weeklyDigest(env) {
  const day24h = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM leads WHERE created_at >= datetime('now','-24 hours')`
  ).first();
  const checkouts24h = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM leads WHERE checkout_started_at >= unixepoch() - 86400`
  ).first();
  const paid24h = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM leads WHERE paid_at >= unixepoch() - 86400`
  ).first();
  const rev24h = await env.DB.prepare(
    `SELECT COALESCE(SUM(amount_cents),0) AS total FROM revenue WHERE occurred_at >= datetime('now','-24 hours') AND paid = 1`
  ).first();
  const abandoned = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM leads WHERE checkout_started_at IS NOT NULL AND paid_at IS NULL AND checkout_started_at < unixepoch() - 7200`
  ).first();
  const booked7d = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM calendly_bookings WHERE created_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days') AND (status IS NULL OR status != 'cancelled')`
  ).first();
  const mtdRev = await env.DB.prepare(
    `SELECT COALESCE(SUM(amount_cents),0) AS total FROM revenue WHERE strftime('%Y-%m', occurred_at) = strftime('%Y-%m','now') AND paid = 1`
  ).first();
  const mtdOrders = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM revenue WHERE strftime('%Y-%m', occurred_at) = strftime('%Y-%m','now') AND paid = 1`
  ).first();
  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;color:#0F172A;max-width:600px;margin:0 auto;padding:24px;">',
    '<h1 style="font-size:20px">Sofrito Studio — pipeline digest</h1>',
    `<p><strong>New leads (24h):</strong> ${day24h.n || 0}</p>`,
    `<p><strong>Checkouts started (24h):</strong> ${checkouts24h.n || 0}</p>`,
    `<p><strong>Payments completed (24h):</strong> ${paid24h.n || 0}</p>`,
    `<p><strong>Revenue collected (24h):</strong> $${((rev24h.total || 0) / 100).toFixed(2)}</p>`,
    `<p><strong>Abandoned checkouts:</strong> ${abandoned.n || 0}</p>`,
    `<p><strong>Sessions booked (7d):</strong> ${booked7d.n || 0}</p>`,
    `<p><strong>MTD revenue:</strong> $${((mtdRev.total || 0) / 100).toFixed(2)}</p>`,
    `<p><strong>MTD orders:</strong> ${mtdOrders.n || 0}</p>`,
    '<p><a href="https://dash.cloudflare.com" style="color:#EA580C">Open Cloudflare</a> to dig in.</p>',
    '</div>',
  ].join('');
  const job = await trackEmailQueued(env, {
    kind: 'email',
    to: env.NOTIFICATION_EMAIL || '',
    template: 'pipeline-digest.html',
    log_type: 'pipeline_digest',
    log_lead_id: 'system',
    subject: 'Sofrito Studio — pipeline digest',
    html,
  });
  let res = null;
  try {
    res = await sendResend(env, {
      to: job.to,
      subject: job.subject,
      html,
    });
    let providerId = null;
    if (res.ok) {
      try {
        providerId = JSON.parse(res.body).id || null;
      } catch {
        providerId = null;
      }
    }
    await updateEmailTracking(env, job, res, providerId);
    if (!res.ok) throw new Error(`resend ${res.status}`);
  } catch (e) {
    if (!res) await updateEmailTracking(env, job, { ok: false, error: e.message });
    throw e;
  }
  console.log('digest', res.status);
}

async function handleFlowGenerate(request, env) {
  const backendUrl = env.BACKEND_URL;
  if (!backendUrl) return json({ ok: false, error: 'backend not configured' }, 500);
  let body;
  try {
    body = await readWebhookText(request);
  } catch (e) {
    return fail(e && e.status === 413 ? 'body too large' : 'unreadable body', e && e.status === 413 ? 413 : 400);
  }
  try {
    const res = await fetch(`${backendUrl}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const data = await res.json();
    return json(data, res.status);
  } catch (e) {
    return json({ ok: false, error: `backend unreachable: ${e.message}` }, 502);
  }
}

const AB_CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;
const abCacheKey = (visitorId) => `ab:${visitorId}`;

async function getAbCache(env, visitorId) {
  try {
    return await env.CONFIG.get(abCacheKey(visitorId));
  } catch (e) {
    console.error('ab cache read failed', e.message);
    return null;
  }
}

async function putAbCache(env, visitorId, variantLabel) {
  try {
    await env.CONFIG.put(abCacheKey(visitorId), variantLabel, { expirationTtl: AB_CACHE_TTL_SECONDS });
    return true;
  } catch (e) {
    console.error('ab cache write failed', e.message);
    return false;
  }
}

// Cache the running page-test lookup (including the negative "no running
// test" outcome) in KV with a short TTL, so cookieless first visits don't
// each burn a D1 read on the same empty result. A newly started test goes
// live within AB_RUNNING_TEST_TTL_SECONDS.
const AB_RUNNING_TEST_TTL_SECONDS = 300;

async function getRunningPageTestId(env) {
  try {
    const cached = await env.CONFIG.get('ab:running_page_test');
    if (cached === 'none') return null;
    if (cached) return cached;
  } catch (e) {
    console.error('ab running-test cache read failed', e.message);
  }
  try {
    const testRow = await env.DB.prepare(
      "SELECT id FROM ab_tests WHERE entity = 'page' AND status = 'running' LIMIT 1"
    ).first();
    const id = testRow ? testRow.id : null;
    try {
      await env.CONFIG.put('ab:running_page_test', id || 'none', { expirationTtl: AB_RUNNING_TEST_TTL_SECONDS });
    } catch (e) {
      console.error('ab running-test cache write failed', e.message);
    }
    return id;
  } catch (e) {
    console.error('ab running test lookup failed', e.message);
    return null;
  }
}

async function abTestTerminated(env) {
  try {
    const flag = await env.CONFIG.get('ab_test_terminated');
    return !!flag && flag !== '0';
  } catch (e) {
    console.error('ab termination flag read failed', e.message);
    return false;
  }
}

// ------------------------------------------------------------
// Export
// ------------------------------------------------------------
export default {
  async fetch(request, env, ctx) {
    // CSP violation reports: browsers POST a JSON body here. Drain the body
    // before responding — leaving it unread crashes `wrangler dev` locally
    // ("Can't read from request stream after response has been sent").
    if (new URL(request.url).pathname === '/csp-report') {
      // Drain small bodies only — a huge report body is not worth buffering;
      // the 204 goes out either way.
      try {
        if (!bodyTooLarge(request, MAX_WEBHOOK_BYTES)) await request.text();
      } catch {}
      return new Response(null, { status: 204 });
    }

    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    if (url.pathname.startsWith('/api/')) {
      try {
        const p = url.pathname;
        if (p === '/api/health') return json({ ok: true, ts: nowIso() });

        if (p === '/api/packages' && request.method === 'GET') return handlePackages(env);
        if (p === '/api/config' && request.method === 'GET') return handleSiteConfig(env);
        if (p === '/api/contact' && request.method === 'POST') return handleContact(request, env, ctx);
        if (p === '/api/lead' && request.method === 'POST') return handleApiLead(request, env, ctx);
        if (p === '/api/founding-application' && request.method === 'POST') return handleFoundingApplication(request, env, ctx);
        if (p === '/api/newsletter' && request.method === 'POST') return handleNewsletter(request, env, ctx);
        if ((p === '/api/events' || p === '/api/analytics') && request.method === 'POST')
          return handleEvent(request, env, ctx);

        const adm = () => {
          if (!authorized(env, request)) return stripCors(json({ ok: false, error: 'unauthorized' }, 401));
        };
        if (p === '/api/dashboard' && request.method === 'GET') {
          const g = adm();
          if (g) return g;
          return stripCors(await handleDashboard(request, env));
        }
        if (p === '/api/leads' && request.method === 'GET') {
          const g = adm();
          if (g) return g;
          return stripCors(await handleLeads(request, env, url));
        }
        if (p.startsWith('/api/leads/') && request.method === 'PATCH') {
          const g = adm();
          if (g) return g;
          return stripCors(await handleLeadUpdate(request, env, ctx, url));
        }
        if (p === '/api/revenue' && request.method === 'GET') {
          const g = adm();
          if (g) return g;
          return stripCors(await handleRevenue(env));
        }
        if (p === '/api/invoice-status' && request.method === 'GET') {
          const g = adm();
          if (g) return g;
          return stripCors(await handleInvoiceStatus(env));
        }
        if (p === '/api/invoice-reconcile' && request.method === 'GET') {
          const g = adm();
          if (g) return g;
          return stripCors(await handleInvoiceReconcile(env));
        }
        if (p === '/api/invoice-trigger' && request.method === 'POST') {
          const g = adm();
          if (g) return g;
          return stripCors(await handleInvoiceTrigger(request, env, ctx));
        }

        if (p === '/api/flow/generate' && request.method === 'POST') {
          const g = adm();
          if (g) return g;
          return stripCors(await handleFlowGenerate(request, env));
        }

        if (p === '/api/stripe-webhook' && request.method === 'POST')
          return handleStripeWebhook(request, env, ctx);

        if (p === '/api/checkout-status' && request.method === 'POST')
          return handleCheckoutStatus(request, env, ctx);

        if (p === '/api/calendly-webhook' && request.method === 'POST')
          return handleCalendlyWebhook(request, env, ctx);

        return fail('not_found', 404);
      } catch (e) {
        return fail(`server_error: ${e.message}`, 500);
      }
    }

    // html_handling = "none" means the platform serves exact files only, so map
    // the extensionless root and bare directory names to their .html files here
    // (mirrors every canonical tag + sitemap entry).
        // ------------------------------------------------------------
    // A/B split test for the landing page (entity='page')
    // ------------------------------------------------------------
    const assetUrl = new URL(request.url);
    const pathname = assetUrl.pathname;

    // Only apply the test to GET/HEAD on the root or the extensionless /sprint path
    if ((request.method === "GET" || request.method === "HEAD") &&
        (pathname === "/" || pathname === "/sprint")) {

      // ----- 1. Read existing cookies -----
      const cookieHeader = request.headers.get('Cookie') || '';
      const cookies = Object.fromEntries(
        cookieHeader.split('; ')
          .map(c => c.trim())
          .filter(c => c)
          .map(c => {
            const [k, v] = c.split('=');
            return [k, decodeURIComponent(v)];
          })
      );

      let variantLabel = cookies['sofrito_ab_page'];
      let visitorId = cookies['sofrito_ab_vid'];

      // ----- 2. If no variant yet, decide and set cookies -----
      const terminated = await abTestTerminated(env);
      if (terminated) {
        variantLabel = null;
      } else if (!variantLabel) {
        if (!visitorId) visitorId = crypto.randomUUID();
        variantLabel = await getAbCache(env, visitorId);
        if (!variantLabel) {
          try {
            const testId = await getRunningPageTestId(env);

            if (testId) {
              const existingAssignment = await env.DB.prepare(
                `SELECT v.label
                 FROM ab_assignments a
                 JOIN ab_variants v ON v.id = a.variant_id
                 WHERE a.test_id = ? AND a.subject_id = ?
                 ORDER BY a.created_at DESC
                 LIMIT 1`
              )
                .bind(testId, visitorId)
                .first();

              if (existingAssignment) {
                variantLabel = existingAssignment.label;
              } else {
                const variants = await env.DB.prepare(
                  "SELECT id, label, weight FROM ab_variants WHERE test_id = ? ORDER BY id"
                ).bind(testId).all();

                const totalWeight = variants.results.reduce((sum, v) => sum + v.weight, 0);
                let r = Math.random() * totalWeight;
                let chosen = null;
                for (const v of variants.results) {
                  if (r < v.weight) {
                    chosen = v;
                    break;
                  }
                  r -= v.weight;
                }
                if (!chosen && variants.results.length) chosen = variants.results[variants.results.length - 1];

                if (chosen) {
                  const period = new Date().toISOString().slice(0, 10);
                  await env.DB.prepare(
                    "INSERT INTO ab_assignments (id, test_id, subject_id, variant_id, period, assignment_type) VALUES (?, ?, ?, ?, ?, 'random_roll')"
                  )
                    .bind(crypto.randomUUID(), testId, visitorId, chosen.id, period)
                    .run();
                  variantLabel = chosen.label;
                }
              }

              if (variantLabel) await putAbCache(env, visitorId, variantLabel);
            }
          } catch (e) {
            variantLabel = null;
            console.error('ab test lookup failed, serving default', e.message);
          }
        }
      }

      // ----- 5. Serve the appropriate asset -----
      // The homepage now lives at public/index.html, so / and /sprint are canonical.
      // /sprint.html is retired and 301s to / (see LEGACY_REDIRECTS).
      const servePath = '/index.html';
      const assetReq = new Request(assetUrl.origin + servePath, request);

      let res = await env.ASSETS.fetch(assetReq);

      // If we decided to set cookies, inject them into the response
      if (visitorId && variantLabel) {
        const visitorCookie = `sofrito_ab_vid=${encodeURIComponent(visitorId)}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
        const variantCookie = `sofrito_ab_page=${encodeURIComponent(variantLabel)}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
        const newHeaders = new Headers(res.headers);
        newHeaders.append('Set-Cookie', visitorCookie);
        newHeaders.append('Set-Cookie', variantCookie);
        res = new Response(res.body, {
          status: res.status,
          statusText: res.statusText,
          headers: newHeaders
        });
      }

      return res;
    }
// Pretty URLs: serve the .html asset internally at the canonical pretty
// path (200, URL unchanged, no redirect chain) so the served URL always
// matches the canonical tag. The .html URLs keep serving directly — Stripe's
// success_url/cancel_url point at /success.html and /cancelled.html with
// query params (?session_id=), so those must never 301.
const PRETTY_URLS = {
  '/terms': '/terms.html',
  '/privacy': '/privacy.html',
  '/success': '/success.html',
  '/cancelled': '/cancelled.html',
};
    if ((request.method === 'GET' || request.method === 'HEAD') && PRETTY_URLS[pathname]) {
      const assetReq = new Request(assetUrl.origin + PRETTY_URLS[pathname], request);
      const prettyRes = await env.ASSETS.fetch(assetReq);
      if (prettyRes.status !== 404) return prettyRes;
      // Fall through to the legacy/404 handling below if the file is missing.
    }
// Legacy retail redirects that the _redirects engine can't express (its globs
    // hit real files). Probe ASSETS first: if the path is an actual file, serve
    // it; only redirect the paths that genuinely 404.
    if (request.method === 'GET' || request.method === 'HEAD') {
      const to = legacyRedirectFor(assetUrl.pathname);
      if (to) {
        const probe = await env.ASSETS.fetch(request);
        if (probe.status === 404) {
          return Response.redirect(new URL(to, request.url).toString(), 301);
        }
        return probe;
      }
    }

    return env.ASSETS.fetch(request);
  },

  async queue(batch, env) {
    for (const msg of batch.messages) {
      const job = msg.body;
      try {
        if (job.kind === 'email') await processEmailMessage(env, job);
        else await processWebhookMessage(env, job);
      } catch (e) {
        console.error('queue message failed', e.message);
        msg.retry();
      }
    }
  },

  async scheduled(controller, env, ctx) {
    // ── A/B test termination (one-time) ──
    const alreadyTerminated = await env.CONFIG.get('ab_test_terminated');
    if (!alreadyTerminated) {
      try {
        await env.DB.prepare(
          "UPDATE ab_tests SET status = 'completed', winner_variant = 'control' WHERE entity = 'page' AND status = 'running'"
        ).run();
        await env.CONFIG.put('ab_test_terminated', '1');
      } catch (e) {
        console.error('ab test termination failed', e.message);
      }
    }

    const now = new Date();
    const utcDay = now.getUTCDay();
    const utcHour = now.getUTCHours();

    // ── Lead and booking automations ──
    try {
      await runLeadAutomations(env);
    } catch (e) {
      console.error('lead automation failed', e.message);
    }

    try {
      await runSessionAutomations(env);
    } catch (e) {
      console.error('session automation failed', e.message);
    }

    // ── Checkout safety net ──
    try {
      await handleCheckoutSafetyNet(env, ctx);
    } catch (e) {
      console.error('checkout safety net failed', e.message);
    }

    try {
      await handleSecondCheckoutNudge(env);
    } catch (e) {
      console.error('second checkout nudge failed', e.message);
    }

    // ── Unbilled final-balance sweep (paid session, no $597 invoice) ──
    try {
      await handleUnbilledFinalSweep(env);
    } catch (e) {
      console.error('unbilled final sweep failed', e.message);
    }

    // ── Booking safety net (paid/no-booking, booking/no-payment) ──
    try {
      await handleBookingSafetyNet(env);
    } catch (e) {
      console.error('booking safety net failed', e.message);
    }

    // ── Weekly digest (Monday 17:00 UTC) ──
    if (utcDay === 1 && utcHour === 17) {
      try {
        await weeklyDigest(env);
      } catch (e) {
        console.error('digest failed', e.message);
      }
    }
  },
};
