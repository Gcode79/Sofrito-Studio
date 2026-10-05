// ============================================================
// Sofrito Studio — booking.js
// booking.js
// Split from worker.js 2026-10-04. No behavior change.
// ============================================================

import { json, fail, nowIso } from './http.js';
import { enqueueEmail, enqueueWebhook, sentAlready } from './email.js';

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
export {
  parseCalendlySignature,
  calendlyBookingUuid,
  calendlyField,
  handleCalendlyWebhook,
  handleCalendlyCreated,
  handleCalendlyCanceled,
  bookingLead,
};
