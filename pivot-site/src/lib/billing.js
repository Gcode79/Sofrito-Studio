// ============================================================
// Sofrito Studio — billing.js
// billing.js
// Split from worker.js 2026-10-04. No behavior change.
// ============================================================

import { flattenInvoiceMetadata, extractIndividualRefund, shouldAttemptStripeInvoice, resolvePaymentKey, isoCutoffSql } from './pure.js';
import { json, fail, nowIso, nowEpoch, uuid, calendlyPrefillUrl, readJson, badBody, readWebhookText, hmacSha256, safeEqual, PACKAGE_FALLBACK, paidAtMs } from './http.js';
import { persistPaymentEmails, dispatchEmailOutbox } from './outbox.js';
import { enqueueEmail, enqueueWebhook, sentAlready, emailRecordedByEvent, sentPaymentEmailAlready, updateLeadPaidState, getLeadPaidAmountCents } from './email.js';
import { recordAttributionForPaidLead } from './affiliates.js';

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

async function stripeRequest(env, method, path, form, extraHeaders) {
  const body = new URLSearchParams(form).toString();
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.STRIPE_API_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(extraHeaders || {}),
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

// Blocker fix (CodeRabbit PR #1): the idempotency key format changed from
// `sofrito-invoice:<id>` to `sofrito-invoice:<id>:invoice`. A legacy row that
// is pending without a Stripe ID may already have a payable invoice on
// Stripe created under the OLD key. Creating with the new key would bypass
// Stripe's idempotency and issue a duplicate. Reconcile first: search Stripe
// for an invoice carrying our metadata before allowing creation.
async function reconcileLegacyInvoice(env, canonicalId) {
  let after = '';
  do {
    const page = await stripeRequest(env, 'GET', `/invoices?limit=100${after ? `&starting_after=${encodeURIComponent(after)}` : ''}`);
    const match = (page.data || []).find(inv =>
      inv.metadata && inv.metadata.invoice_id === canonicalId
    );
    if (match) return match.id;
    after = page.has_more ? page.data?.at(-1)?.id : '';
  } while (after);
  return null;
}

async function createAndSendStripeInvoice(env, { customerEmail, customerName, description, meta, line, idempotencyKey, invoiceId, onCreated }) {
  if (!idempotencyKey) throw new Error('Invoice creation requires an idempotency key');
  const headers = (step) => ({ 'Idempotency-Key': `${idempotencyKey}:${step}` });
  let invoice;
  if (invoiceId) {
    invoice = await stripeRequest(env, 'GET', `/invoices/${encodeURIComponent(invoiceId)}`);
  } else {
    const search = await stripeRequest(env, 'GET', `/customers?email=${encodeURIComponent(customerEmail || '')}&limit=1`);
    let customerId = search.data && search.data[0] ? search.data[0].id : null;
    if (!customerId) {
      const created = await stripeRequest(env, 'POST', '/customers', { email: customerEmail, name: customerName }, headers('customer'));
      customerId = created.id;
    }
    // Stripe's form API has no nested objects: metadata is flattened to
    // metadata[key] (see flattenInvoiceMetadata) — a nested object would
    // serialize to the literal "[object Object]".
    invoice = await stripeRequest(env, 'POST', '/invoices', {
      customer: customerId,
      description,
      collection_method: 'send_invoice',
      days_until_due: '0',
      auto_advance: 'false',
      ...flattenInvoiceMetadata(meta),
    }, headers('invoice'));
    // Persist before adding a line or finalizing, so retries after Stripe's
    // idempotency retention window resume the same invoice.
    if (onCreated) await onCreated(invoice.id);
    // Creation replay can return stale draft state after a partial success.
    invoice = await stripeRequest(env, 'GET', `/invoices/${encodeURIComponent(invoice.id)}`);
  }
  if (!['draft', 'open', 'paid'].includes(invoice.status)) throw new Error('Invoice requires manual reconciliation');
  let finalizedHere = false;
  if (invoice.status === 'draft') {
    // Inspect all lines before retrying even if the provider's idempotency
    // window has elapsed. The line marker survives a lost HTTP response.
    let after = '';
    let hasLine = false;
    do {
      const page = await stripeRequest(env, 'GET', `/invoices/${encodeURIComponent(invoice.id)}/lines?limit=100${after ? `&starting_after=${encodeURIComponent(after)}` : ''}`);
      if ((page.data || []).some(item => item.metadata?.sofrito_line !== idempotencyKey)) {
        throw new Error('Unrecognized invoice line requires manual reconciliation');
      }
      hasLine ||= (page.data || []).some(item => item.metadata?.sofrito_line === idempotencyKey);
      after = page.has_more ? page.data?.at(-1)?.id : '';
    } while (after);
    if (!hasLine) {
      await stripeRequest(env, 'POST', '/invoiceitems', {
        customer: typeof invoice.customer === 'string' ? invoice.customer : invoice.customer.id,
        invoice: invoice.id, amount: String(line.amountCents), currency: 'usd', description: line.description,
        'metadata[sofrito_line]': idempotencyKey,
      }, headers('line'));
    }
    invoice = await stripeRequest(env, 'POST', `/invoices/${invoice.id}/finalize`, {}, headers('finalize'));
    finalizedHere = true;
  }
  // Finding 4 fix: never re-send an already-open resumed invoice. If
  // /send_invoice succeeded but its response was lost, the invoice is 'open'
  // and retrying would email the customer again after Stripe's idempotency
  // retention expires. A missed send (crash between finalize and send) is
  // recoverable via the Stripe dashboard; a duplicate email is not.
  // Only send when we created or finalized the invoice in this run.
  const resumedOpen = !!invoiceId && !finalizedHere && invoice.status === 'open';
  if (resumedOpen) {
    console.error('invoice send ambiguous, requires manual verification', invoice.id);
  } else if (invoice.status !== 'paid') {
    invoice = await stripeRequest(env, 'POST', `/invoices/${invoice.id}/send_invoice`, {}, headers('send'));
  }
  return { id: invoice.id, number: invoice.number, url: invoice.hosted_invoice_url,
    status: invoice.status, paidAt: invoice.status === 'paid' ? nowIso() : null };
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
    `SELECT id, status, stripe_invoice_id, amount_cents FROM invoices WHERE project_id = ? AND milestone = ?`
  )
    .bind(project.id, milestone)
    .first();
  if (!canonical) return fail('invoice row not found after upsert', 500);

  const isNewInvoice = canonical.id === invoiceId;
  // A prior attempt may have written the row but failed before Stripe
  // succeeded (status stays 'pending'). Retrying must resume that invoice
  // instead of reporting already_exists — the idempotency key keeps Stripe
  // from creating a duplicate invoice on retry.
  const needsStripeAttempt = shouldAttemptStripeInvoice({
    isNewInvoice,
    status: canonical.status,
    hasApiKey: !!env.STRIPE_API_KEY,
  });
  const stripe = { attempted: false };
  if (needsStripeAttempt) {
    try {
      // Blocker fix: legacy pending rows without a Stripe ID may already
      // exist on Stripe under the OLD idempotency key format. Reconcile
      // via metadata before creating — never auto-create blind.
      let resumeId = canonical.stripe_invoice_id;
      if (!resumeId && !isNewInvoice) {
        resumeId = await reconcileLegacyInvoice(env, canonical.id);
        if (resumeId) {
          await env.DB.prepare(`UPDATE invoices SET stripe_invoice_id = ? WHERE id = ?`)
            .bind(resumeId, canonical.id).run();
        } else {
          throw new Error('Legacy pending invoice requires manual reconciliation: no Stripe invoice found with matching metadata');
        }
      }
      const created = await createAndSendStripeInvoice(env, {
        customerEmail: project.client_email,
        customerName: project.name,
        description: `${MILESTONE_LABELS[milestone]} — ${project.package_name || 'Sofrito Studio'}`,
        meta: { invoice_id: canonical.id, project_id: project.id, milestone },
        line: { description: MILESTONE_LABELS[milestone], amountCents: canonical.amount_cents },
        idempotencyKey: `sofrito-invoice:${canonical.id}`,
        invoiceId: resumeId,
        onCreated: async (id) => {
          await env.DB.prepare(`UPDATE invoices SET stripe_invoice_id = ? WHERE id = ?`).bind(id, canonical.id).run();
        },
      });
      // Record the actual Stripe status: a resumed invoice may already be
      // paid. Never overwrite a locally-paid row with 'sent' — the
      // invoice.paid webhook owns the paid transition.
      const localStatus = created.status === 'paid' ? 'paid' : 'sent';
      await env.DB.prepare(
        `UPDATE invoices SET status = ?, sent_at = ?, stripe_invoice_id = ?
         WHERE id = ? AND status != 'paid'`
      )
        .bind(localStatus, nowIso(), created.id, canonical.id)
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
  } else if (!env.STRIPE_API_KEY && (isNewInvoice || canonical.status === 'pending')) {
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
  // Stripe delivers webhooks at-least-once: the ledger row above is deduped
  // by UNIQUE(source_id) and the lead-status transitions are conditional, so
  // the founder email is the only non-idempotent step — guard it on the
  // Stripe event id so a redelivery can't duplicate it.
  if (await emailRecordedByEvent(env, 'dispute-notify.html', event.id)) return;
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
    metadata: { event_id: event.id },
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
  const fields = header.split(',').map(part => part.trim().split('='));
  const ts = fields.find(([key]) => key === 't')?.[1];
  const signatures = fields.filter(([key]) => key === 'v1').map(([, value]) => value);
  if (!ts || !/^\d+$/.test(ts) || !signatures.length) return fail('missing signature', 400);
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return fail('stale signature', 401);
  const expected = await hmacSha256(secret, `${ts}.${raw}`);
  if (!signatures.some(signature => safeEqual(expected, signature))) return fail('invalid signature', 401);
  let event;
  try { event = JSON.parse(raw); } catch { return fail('invalid json', 400); }
  if (!event || typeof event.type !== 'string' || !event.data?.object) return fail('invalid event', 400);
  if (event.livemode !== true) return json({ ok: true, handled: false, reason: 'test_mode' });
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
  let refundLedgerSourceId = null;
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
    console.error('stripe async payment failed', failedSession.id);
    if (event.livemode === true && env.NOTIFICATION_EMAIL) {
      // At-least-once delivery: guard the founder email on the Stripe event
      // id so a redelivery can't duplicate it.
      if (await emailRecordedByEvent(env, 'payment-failed-notify.html', event.id)) {
        return json({ ok: true, handled: true });
      }
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
        metadata: { event_id: event.id },
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
    const charge = event.data.object;
    // amount_refunded on the charge is cumulative — extractIndividualRefund
    // pulls this event's individual refund (newest in refunds.data) so the
    // ledger records -$100 then -$200, not -$100 then -$300.
    const refund = extractIndividualRefund(charge);
    if (!refund) {
      console.error('charge.refunded without refund object', event.id);
      return json({ ok: true, handled: false, reason: 'no refund object' });
    }
    amountCents = refund.amountCents;
    description = 'refund';
    refundCharge = charge;
    refundLedgerSourceId = refund.ledgerSourceId;
  }
  if (!amountCents) return json({ ok: true, handled: false });

  // Lead payment state from checkout sessions — lookup first so we can pass details to the notification email.
  // Test-mode events (livemode:false) must never mutate production lead state.
  const isLive = event.livemode === true;
  let leadData = null;
  // Key receipt/booking emails on the Stripe payment (session id) from the
  // very first delivery — never on the lead alone. A redelivery of the same
  // event (e.g. Stripe retries after a 500 past mark-paid) takes the
  // repurchase path below, where a lead-level guard would miss the first
  // delivery's sends and mail twice. The session id is stable across
  // redeliveries of one event and unique per payment, so genuine
  // repurchases still mail again.
  const paymentKey = resolvePaymentKey({
    isLive,
    completedPaymentEvent,
    sessionId: event.data && event.data.object ? event.data.object.id : null,
  });
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
      const paidAt = Number(event.created);
      // P2-3: persist the actual paid amount for the final-invoice credit.
      await updateLeadPaidState(env, leadRow.id, paidAt, amountCents, event.data.object.payment_intent, paymentKey);
      // Sofrito Partners: first payment triggers the $100 commission.
      // Idempotent — the UNIQUE index on attributions(lead_id) no-ops redeliveries.
      await recordAttributionForPaidLead(env, leadRow.id, amountCents);
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
      const alreadyProcessed = await sentPaymentEmailAlready(env, 'receipt.html', repurchaseRow.id, paymentKey);
      leadData = repurchaseRow;
      if (!alreadyProcessed) {
        const paidAt = Number(event.created);
        await updateLeadPaidState(env, repurchaseRow.id, paidAt, amountCents, event.data.object.payment_intent, paymentKey);
        // Sofrito Partners: see the leadRow path above — same idempotency.
        await recordAttributionForPaidLead(env, repurchaseRow.id, amountCents);
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
      source_id: refundLedgerSourceId || event.id,
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
  // Refunds match by payment intent, never by email: a refund of an older
  // purchase must not invalidate the current one.
  if (isLive && refundCharge && refundCharge.amount_refunded >= refundCharge.amount) {
    const paymentIntent = typeof refundCharge.payment_intent === 'string'
      ? refundCharge.payment_intent : refundCharge.payment_intent?.id;
    if (paymentIntent) {
      const refundedLead = await env.DB.prepare(
        `SELECT id, name, email FROM leads WHERE stripe_payment_intent_id = ? LIMIT 1`
      ).bind(paymentIntent).first();
      if (refundedLead) {
        await env.DB.prepare(
          `UPDATE leads SET status = 'refunded' WHERE id = ? AND stripe_payment_intent_id = ? AND status IN ('paid','disputed')`
        ).bind(refundedLead.id, paymentIntent).run();
        // Await notification enqueue so a provider retry can recover failures.
        if (!await emailRecordedByEvent(env, 'refund-notify.html', event.id)) {
          await enqueueEmail(env, {
            kind: 'email',
            to: env.NOTIFICATION_EMAIL || '',
            template: 'refund-notify.html',
            subject: `[Refund] ${refundedLead.name} — session refunded`,
            data: {
              lead: refundedLead,
              amount: (refundCharge.amount_refunded / 100).toFixed(2),
              siteUrl: env.SITE_URL || '',
            },
            metadata: { event_id: event.id },
            lead_id: refundedLead.id,
          });
        }
      } else {
        console.error('refund requires reconciliation: no matching payment', event.id);
      }
    } else {
      console.error('refund requires reconciliation: missing payment identity', event.id);
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
    // Durable delivery: persist both emails before acknowledging Stripe.
    // The outbox survives partial enqueue failures; the hourly sweep
    // redelivers anything the immediate dispatch missed. Stable delivery
    // IDs keyed on the payment make retries idempotent.
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const shared = {
      kind: 'email', to: receiptLead.email, lead_id: receiptLead.id,
      metadata: { payment_key: paymentKey },
      data: { lead_id: receiptLead.id, lead: receiptLead, date,
        booking_url: calendlyPrefillUrl(receiptLead.name, receiptLead.email), amount: (amountCents / 100).toFixed(2) },
    };
    await persistPaymentEmails(env, paymentKey, [
      { ...shared, template: 'receipt.html', subject: 'Your Sofrito Session receipt' },
      { ...shared, template: 'booking-link.html', subject: 'Book your Sofrito Session' },
    ]);
    ctx.waitUntil(dispatchEmailOutbox(env));
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

export {
  SESSION_CENTS,
  MILESTONES,
  MILESTONE_LABELS,
  splitMilestoneAmounts,
  getSessionPriceCents,
  alertOnSessionPriceOverride,
  stripeRequest,
  createAndSendStripeInvoice,
  reconcileLegacyInvoice,
  createStripeCheckoutSession,
  getStripeCheckoutSession,
  ensureFreshCheckoutUrl,
  handleInvoiceStatus,
  handleInvoiceReconcile,
  handleInvoiceTrigger,
  insertRevenue,
  handleDisputeEvent,
  handleCheckoutExpired,
  handleStripeWebhook,
};
