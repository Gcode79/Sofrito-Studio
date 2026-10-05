// ============================================================
// Sofrito Studio — email.js
// email.js
// Split from worker.js 2026-10-04. No behavior change.
// ============================================================

import { escapeHtml, substitute, uuid, nowIso, json, fail } from './http.js';

import abandonedNudge from '../emails/abandoned-nudge.html';
import abandonedNudge2 from '../emails/abandoned-nudge-2.html';
import bookingCancelNotify from '../emails/booking-cancel-notify.html';
import bookingLink from '../emails/booking-link.html';
import bookingNotify from '../emails/booking-notify.html';
import bookingNudge from '../emails/booking-nudge.html';
import disputeNotify from '../emails/dispute-notify.html';
import followUpDay1 from '../emails/follow-up-day1.html';
import followUpDay30 from '../emails/follow-up-day30.html';
import followUpLeadReminder from '../emails/follow-up-lead-reminder.html';
import formConfirm from '../emails/form-confirm.html';
import invoicePaidNotify from '../emails/invoice-paid-notify.html';
import invoiceTriggerNotify from '../emails/invoice-trigger-notify.html';
import leadWon from '../emails/lead-won.html';
import leadAcknowledgement from '../emails/lead_acknowledgement.html';
import newLeadNotify from '../emails/new-lead-notify.html';
import onboardingPack from '../emails/onboarding-pack.html';
import paymentFailedNotify from '../emails/payment-failed-notify.html';
import paymentNudge from '../emails/payment-nudge.html';
import priceOverrideNotify from '../emails/price-override-notify.html';
import receipt from '../emails/receipt.html';
import referralInvite from '../emails/referral-invite.html';
import refundNotify from '../emails/refund-notify.html';
import revenueNotify from '../emails/revenue-notify.html';
import sessionReminder from '../emails/session-reminder.html';
import unbilledFinalNotify from '../emails/unbilled-final-notify.html';
import unbookedSessionNotify from '../emails/unbooked-session-notify.html';
import welcome1 from '../emails/welcome-1.html';
import welcome2 from '../emails/welcome-2.html';
import welcome3 from '../emails/welcome-3.html';

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

async function sendResend(env, { to, subject, html, idempotencyKey }) {
  const key = env.RESEND_API_KEY;
  if (!key) return { ok: false, status: 503, body: '{}' };
  // Idempotency-Key makes queue redeliveries safe: the same job retried
  // within Resend's 24h window will not send twice. The key must be stable
  // per job — callers pass job.emails_sent_id (generated once at enqueue).
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      from: `${env.RESEND_FROM_NAME} <${env.RESEND_FROM}>`,
      to: [to],
      subject,
      html,
    }),
    signal: AbortSignal.timeout(15000),
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
    result = await sendResend(env, {
      to: job.to,
      subject: job.subject,
      html,
      // Stable per job (generated once at enqueue): redeliveries dedupe at Resend.
      idempotencyKey: job.emails_sent_id || job.id || null,
    });
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
    // Explicit opt-out is quiet; a missing URL without the flag is a
    // misconfiguration and must be loud, never a silent drop.
    if (env.WEBHOOK_DISABLED === 'true') {
      console.log('webhook: disabled by WEBHOOK_DISABLED flag, skipping');
      return;
    }
    throw new Error('webhook: WEBHOOK_URL is not set and WEBHOOK_DISABLED is not true');
  }
  // POST the flat payload (the lead object) so Zapier sees name/email/score at
  // the top level — not wrapped under { topic, payload, ts }.
  const id = job.payload?.id ?? job.id;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(job.payload),
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      console.log(`webhook: POST ${res.status} topic=${job.topic} id=${id}`);
      return;
    }
    const body = await res.text().catch(() => '');
    if (res.status === 429 || res.status >= 500) {
      // Retryable: throw so the queue retries with backoff, then dead-letters.
      // Never silently acknowledge a delivery that did not happen.
      const err = new Error(`webhook: retryable status ${res.status} topic=${job.topic} id=${id}`);
      err.retryable = true;
      throw err;
    }
    // Permanent client error: retrying cannot help. Loud log, acknowledged.
    console.error(`webhook: permanent failure ${res.status} topic=${job.topic} id=${id} body=${body.slice(0, 200)}`);
  } catch (e) {
    // Network errors, aborts, and retryable statuses all land here: rethrow
    // so the queue consumer retries, then routes to the dead-letter queue.
    if (!e.retryable) console.error('webhook: delivery failed', e.message);
    throw e;
  }
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

// Per-payment email idempotency. Receipt/booking sends are keyed on the
// Stripe session id from the first delivery onward: redeliveries of the same
// event share the key (no duplicates), and a genuine repurchase carries a new
// session id (mails again).
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
export {
  REPO_EMAIL_TEMPLATES,
  trackEmailQueued,
  updateEmailTracking,
  enqueueEmail,
  enqueueWebhook,
  tiktokTrack,
  sendResend,
  processEmailMessage,
  processWebhookMessage,
  sentAlready,
  emailRecordedByEvent,
  sentPaymentEmailAlready,
  updateLeadPaidState,
  getLeadPaidAmountCents,
};
