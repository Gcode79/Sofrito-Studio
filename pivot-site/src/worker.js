// ============================================================
// Sofrito Studio — Pivot Worker (composition root)
// Job: 1d + 2
// MCP: cloudflare-bindings, cloudflare-observability
// Last updated: 2026-10-04
// Purpose: /api/* edge logic + queue consumers + scheduled CRM
//          automation. Static site serves from public/ via ASSETS.
// Domain logic lives in src/lib/: http (primitives), email
// (templates + queue + send guards), billing (Stripe/money),
// booking (Calendly), automations (scheduled CRM), pure
// (dependency-free helpers covered by regression tests).
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

import { isoCutoffSql } from './lib/pure.js';
import { dispatchEmailOutbox } from './lib/outbox.js';
import { CORS, stripCors, json, fail, authorized, readJson, verifyTurnstile, nowIso, legacyRedirectFor, badBody, sha256Hex, nowEpoch, escapeHtml, uuid, bodyTooLarge, MAX_WEBHOOK_BYTES, BUSINESS_TYPES, CHANNELS, PACKAGE_FALLBACK, scoreLead, readWebhookText } from './lib/http.js';
import { enqueueEmail, enqueueWebhook, tiktokTrack, processEmailMessage, processWebhookMessage } from './lib/email.js';
import { createStripeCheckoutSession, ensureFreshCheckoutUrl, getSessionPriceCents, getStripeCheckoutSession, handleStripeWebhook, handleInvoiceStatus, handleInvoiceReconcile, handleInvoiceTrigger } from './lib/billing.js';
import { handleCalendlyWebhook } from './lib/booking.js';
import { handlePartnerSignup, handlePartnerClick, handlePartnerPayouts, recordAttributionForPaidLead, normalizeRefCode } from './lib/affiliates.js';
import { handleUnbilledFinalSweep, handleBookingSafetyNet, handleCheckoutSafetyNet, handleSecondCheckoutNudge, runSessionAutomations, runWonLeadFallbacks, runLeadAutomations, weeklyDigest, handleFlowGenerate, getAbCache, putAbCache, getRunningPageTestId, abTestTerminated } from './lib/automations.js';

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
      // pinterest disconnected until the account is fixed: 'https://pinterest.com/sofritostudio',
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
  // Sofrito Partners: referral code carried from the ?ref= cookie by the
  // lead form. Normalized (uppercase A-Z0-9-) so typed codes match.
  const refCode = normalizeRefCode(body.ref_code) || null;

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

  // Idempotency: same email within 15 minutes, status new or checkout_started → return existing lead.
  // created_at is stored ISO-8601 (nowIso), so the cutoff must be ISO too —
  // datetime('now') returns a space-separated format that never compares
  // correctly against ISO strings (an 11-hour-old lead would pass).
  const existing = await env.DB.prepare(
    `SELECT id, created_at, checkout_url FROM leads WHERE email = ? AND created_at >= ${isoCutoffSql('-15 minutes')} AND (status = 'new' OR status = 'checkout_started') LIMIT 1`
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
    `INSERT INTO leads (id, created_at, name, email, phone, business_name, business_type, package_interest, budget, message, channel, status, source, checkout_started_at, submit_key, ref_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'checkout_started', 'lead_api', ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = COALESCE(NULLIF(excluded.name, ''), leads.name),
       phone = COALESCE(NULLIF(excluded.phone, ''), leads.phone),
       business_name = COALESCE(NULLIF(excluded.business_name, ''), leads.business_name),
       business_type = COALESCE(NULLIF(excluded.business_type, ''), leads.business_type),
       package_interest = COALESCE(NULLIF(excluded.package_interest, ''), leads.package_interest),
       budget = COALESCE(NULLIF(excluded.budget, ''), leads.budget),
       message = COALESCE(NULLIF(excluded.message, ''), leads.message),
       channel = COALESCE(NULLIF(excluded.channel, ''), leads.channel),
       ref_code = COALESCE(NULLIF(excluded.ref_code, ''), leads.ref_code)`
  )
    .bind(id, lead.created_at, lead.name, lead.email, lead.phone, lead.business_name, lead.business_type, lead.package_interest, lead.budget, lead.message, lead.channel, now, submitKey, refCode)
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
  const refCode = normalizeRefCode(body.ref_code) || null;

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
      package_interest, message, channel, status, source, notes, updated_at, submit_key, ref_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'founding_round', ?, 'founding_application', 'new', 'founding_round', ?, ?, ?, ?)`
  ).bind(id, created_at, name, email, phone || null, business_name, business_type || null, fit_reason, notes, created_at, submitKey, refCode).run();

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
    ref_code: normalizeRefCode(body.ref_code) || null,
  };
  lead.score = await scoreLead(env, lead);
  const lang = (request.headers.get('accept-language') || '').toLowerCase().startsWith('es') ? 'es' : 'en';

  await env.DB.prepare(
    `INSERT INTO leads (id, created_at, name, email, phone, business_name, business_type, package_interest, budget, stage, timeline, city, decision, message, channel, score, status, source, ref_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`
  )
    .bind(lead.id, lead.created_at, name, email, lead.phone, lead.business_name, lead.business_type, lead.package_interest, lead.budget, lead.stage, lead.timeline, lead.city, lead.decision, message, 'contact_form', lead.score, lead.source, lead.ref_code)
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
// Export
// ------------------------------------------------------------
export default {
  async fetch(request, env, ctx) {
    // CSP violation reports: browsers POST a JSON body here. Drain the body
    // before responding — leaving it unread crashes `wrangler dev` locally
    // ("Can't read from request stream after response has been sent").
    if (new URL(request.url).pathname === '/csp-report') {
      // Drain with the byte-limited reader — a huge report body is not worth
      // buffering; the 204 goes out either way.
      try {
        await readWebhookText(request);
      } catch {}
      return new Response(null, { status: 204 });
    }

    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    if (url.pathname.startsWith('/api/')) {
      try {
        const p = url.pathname;
        if (p === '/api/health') return json({ ok: true, ts: nowIso() });

        if (p === '/api/packages' && request.method === 'GET') return await handlePackages(env);
        if (p === '/api/config' && request.method === 'GET') return await handleSiteConfig(env);
        if (p === '/api/contact' && request.method === 'POST') return await handleContact(request, env, ctx);
        if (p === '/api/lead' && request.method === 'POST') return await handleApiLead(request, env, ctx);
        if (p === '/api/founding-application' && request.method === 'POST') return await handleFoundingApplication(request, env, ctx);
        if (p === '/api/newsletter' && request.method === 'POST') return await handleNewsletter(request, env, ctx);
        if ((p === '/api/events' || p === '/api/analytics') && request.method === 'POST')
          return await handleEvent(request, env, ctx);

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
          return await handleStripeWebhook(request, env, ctx);

        if (p === '/api/checkout-status' && request.method === 'POST')
          return await handleCheckoutStatus(request, env, ctx);

        if (p === '/api/calendly-webhook' && request.method === 'POST')
          return await handleCalendlyWebhook(request, env, ctx);

        if (p === '/api/partners/signup' && request.method === 'POST')
          return await handlePartnerSignup(request, env, ctx);
        if (p === '/api/partners/click' && request.method === 'POST')
          return await handlePartnerClick(request, env);
        if (p === '/api/partners/payouts' && (request.method === 'GET' || request.method === 'PATCH')) {
          const g = adm();
          if (g) return g;
          return stripCors(await handlePartnerPayouts(request, env, url));
        }

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
  '/partners': '/partners.html',
  '/food-truck-branding': '/food-truck-branding.html',
  '/specialty-food-websites': '/specialty-food-websites.html',
  '/pos-locked-websites': '/pos-locked-websites.html',
  '/cottage-food-brand-identity': '/cottage-food-brand-identity.html',
  '/alternatives': '/alternatives.html',
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

    // ── Durable email outbox sweep: redeliver anything the immediate
    // dispatch missed (hourly cron covers the sweep cadence).
    try {
      await dispatchEmailOutbox(env);
    } catch (e) {
      console.error('email outbox sweep failed', e.message);
    }

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
