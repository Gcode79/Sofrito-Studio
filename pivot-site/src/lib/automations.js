// ============================================================
// Sofrito Studio — automations.js
// automations.js
// Split from worker.js 2026-10-04. No behavior change.
// ============================================================

import { json, fail, uuid, nowIso, daySince, formatSessionDate, paidAtMs, PACKAGE_FALLBACK, calendlyPrefillUrl, nowEpoch, readWebhookText } from './http.js';
import { isoCutoffSql } from './pure.js';
import { enqueueEmail, enqueueWebhook, sentAlready, emailRecordedByEvent, trackEmailQueued, sendResend, updateEmailTracking, getLeadPaidAmountCents } from './email.js';
import { getSessionPriceCents, ensureFreshCheckoutUrl, splitMilestoneAmounts } from './billing.js';
import { bookingLead } from './booking.js';

// ------------------------------------------------------------
// Scheduled CRM automation (hourly cron)
// ------------------------------------------------------------
const DRIP_PLAN = [
  { day: 2, template: 'welcome-1.html', subject: "Día 2 / Day 2 — Your food has a story" },
  { day: 5, template: 'welcome-2.html', subject: "Día 5 / Day 5 — Where most food brands go wrong" },
  { day: 9, template: 'welcome-3.html', subject: "Día 9 / Day 9 — Let's put it on the table" },
];


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
       AND b.created_at < ${isoCutoffSql('-1 day')}
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
    `SELECT COUNT(*) AS n FROM leads WHERE created_at >= ${isoCutoffSql('-24 hours')}`
  ).first();
  const checkouts24h = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM leads WHERE checkout_started_at >= unixepoch() - 86400`
  ).first();
  const paid24h = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM leads WHERE paid_at >= unixepoch() - 86400`
  ).first();
  const rev24h = await env.DB.prepare(
    `SELECT COALESCE(SUM(amount_cents),0) AS total FROM revenue WHERE occurred_at >= ${isoCutoffSql('-24 hours')} AND paid = 1`
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

export {
  DRIP_PLAN,
  handleUnbilledFinalSweep,
  handleBookingSafetyNet,
  handleCheckoutSafetyNet,
  handleSecondCheckoutNudge,
  runSessionAutomations,
  runWonLeadFallbacks,
  runLeadAutomations,
  weeklyDigest,
  handleFlowGenerate,
  getAbCache,
  putAbCache,
  getRunningPageTestId,
  abTestTerminated,
};
