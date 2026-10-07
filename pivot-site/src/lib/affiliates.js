// ============================================================
// Sofrito Studio — affiliates.js
// Sofrito Partners: $100 flat commission per first payment.
// ============================================================
//
// Flow:
//   1. Partner signs up at /partners -> POST /api/partners/signup
//      (Turnstile + 10/min IP rate limit, same trust stack as /api/lead).
//      Gets a unique CODE and a shareable link: /?ref=CODE
//   2. Visitor lands with ?ref=CODE -> JS sets 30-day cookie `sofrito_ref`
//      and beacons POST /api/partners/click (stats only, never payout).
//   3. Lead forms carry ref_code (from the cookie) -> stored on leads.ref_code.
//      Calendly bookings capture it from the "referral code" invitee question.
//   4. Stripe webhook marks the lead paid -> recordAttributionForPaidLead()
//      creates ONE affiliate_attributions row ($100 flat). The UNIQUE index
//      on lead_id makes redeliveries no-op: one commission per lead, ever.
//   5. Payouts are manual: GET /api/partners/payouts (admin) lists pending
//      commissions grouped by affiliate; the founder pays and marks paid.
//
// Commission rule (founder decision 2026-10-07): $100 flat on FIRST payment
// per lead — session ($400) or sprint ($997), whichever comes first. The
// partner delivered a paying customer; session->sprint conversion is the
// business's job, not the partner's.

import { json, fail, readJson, badBody, nowIso, uuid, verifyTurnstile, authorized } from './http.js';

const COMMISSION_CENTS = 10000; // $100 flat
const REF_COOKIE_DAYS = 30;

// Uppercase letters, digits, dashes only. Codes are generated, but typed
// codes (Calendly Q&A, manual entry) go through this too.
function normalizeRefCode(code) {
  return String(code || '')
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 24);
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
function randomSuffix(n = 4) {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

// CODE format: FIRSTNAME-XXXX (e.g. MARIA-7X2Q). Retries on collision.
async function generateUniqueCode(env, name) {
  const stem = String(name || '')
    .split(/\s+/)[0]
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 12) || 'PARTNER';
  for (let i = 0; i < 5; i++) {
    const code = `${stem}-${randomSuffix()}`;
    const hit = await env.DB.prepare(`SELECT 1 FROM affiliates WHERE code = ? LIMIT 1`).bind(code).first();
    if (!hit) return code;
  }
  // Fallback: uuid suffix can never collide in practice.
  return `${stem}-${uuid().slice(0, 8).toUpperCase()}`;
}

async function findAffiliateByCode(env, code) {
  const norm = normalizeRefCode(code);
  if (!norm) return null;
  return env.DB.prepare(`SELECT * FROM affiliates WHERE code = ? LIMIT 1`).bind(norm).first();
}

// ------------------------------------------------------------
// POST /api/partners/signup — public partner enrollment
// Body: { name, email, payout_method, payout_details?, turnstile_token }
// ------------------------------------------------------------
async function handlePartnerSignup(request, env, ctx) {
  let body;
  try {
    body = await readJson(request);
  } catch (e) {
    return badBody(e);
  }
  const name = String(body.name || '').trim().slice(0, 120);
  const email = String(body.email || '').trim().toLowerCase().slice(0, 254);
  const payoutMethod = String(body.payout_method || '').trim().toLowerCase().slice(0, 24);
  const payoutDetails = String(body.payout_details || '').trim().slice(0, 200);

  const turnstileOk = await verifyTurnstile(env, body.turnstile_token);
  if (!turnstileOk) return fail('Turnstile verification failed.', 422);

  if (!name) return fail('Please include your name.', 422);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('Please include a valid email.', 422);
  const METHODS = ['cashapp', 'venmo', 'zelle', 'bank', 'other'];
  if (!METHODS.includes(payoutMethod)) return fail('Please choose how we pay you.', 422);

  // Rate limit: 10/min per IP (same budget shape as /api/lead).
  const xff = request.headers.get('x-forwarded-for') || '';
  const ip = request.headers.get('cf-connecting-ip') || xff.split(',')[0].trim() || 'unknown';
  const rlKey = `rl:partners:signup:${ip}`;
  const count = parseInt((await env.CONFIG.get(rlKey)) || '0', 10);
  if (count >= 10) return fail('You just signed up. Check your inbox.', 429);
  ctx.waitUntil(env.CONFIG.put(rlKey, String(count + 1), { expirationTtl: 60 }));

  // Re-signup with the same email hands back the existing code — never
  // mints a second affiliate row for one person.
  const existing = await env.DB.prepare(`SELECT code FROM affiliates WHERE email = ? LIMIT 1`).bind(email).first();
  const siteUrl = (env.SITE_URL || 'https://sofritostudio.com').replace(/\/$/, '');
  if (existing) {
    return json({ ok: true, code: existing.code, link: `${siteUrl}/?ref=${existing.code}`, returning: true }, 200);
  }

  const code = await generateUniqueCode(env, name);
  const id = `aff_${uuid().slice(0, 24)}`;
  await env.DB.prepare(
    `INSERT INTO affiliates (id, created_at, code, name, email, payout_method, payout_details, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`
  ).bind(id, nowIso(), code, name, email, payoutMethod, payoutDetails || null).run();

  return json({ ok: true, code, link: `${siteUrl}/?ref=${code}` }, 201);
}

// ------------------------------------------------------------
// POST /api/partners/click — click beacon (stats only)
// Body: { code, landing_page? }
// ------------------------------------------------------------
async function handlePartnerClick(request, env) {
  let body;
  try {
    body = await readJson(request);
  } catch (e) {
    return badBody(e);
  }
  const aff = await findAffiliateByCode(env, body.code);
  if (!aff || aff.status !== 'active') return json({ ok: true, tracked: false });
  await env.DB.prepare(
    `INSERT INTO affiliate_clicks (id, clicked_at, affiliate_id, landing_page)
     VALUES (?, ?, ?, ?)`
  ).bind(`clk_${uuid().slice(0, 24)}`, nowIso(), aff.id, String(body.landing_page || '').slice(0, 200) || null).run();
  return json({ ok: true, tracked: true });
}

// ------------------------------------------------------------
// GET /api/partners/payouts — admin payout ledger
// Lists pending commissions grouped by affiliate, plus lifetime totals.
// The founder pays manually, then PATCHes attributions to 'paid'.
// ------------------------------------------------------------
async function handlePartnerPayouts(request, env, url) {
  if (!authorized(env, request)) return fail('unauthorized', 401);
  const markPaid = url.searchParams.get('mark_paid');
  if (request.method === 'PATCH' && markPaid) {
    // Mark one attribution paid after the manual payout goes out.
    const row = await env.DB.prepare(`SELECT id, status FROM affiliate_attributions WHERE id = ? LIMIT 1`).bind(markPaid).first();
    if (!row) return fail('attribution not found', 404);
    if (row.status === 'paid') return json({ ok: true, already: true });
    await env.DB.prepare(`UPDATE affiliate_attributions SET status = 'paid', paid_at = ? WHERE id = ?`).bind(nowIso(), markPaid).run();
    return json({ ok: true, paid: markPaid });
  }
  const pending = await env.DB.prepare(
    `SELECT at.id AS attribution_id, at.created_at, at.amount_cents, at.commission_cents,
            af.code, af.name, af.email, af.payout_method, af.payout_details, at.lead_id
     FROM affiliate_attributions at
     JOIN affiliates af ON af.id = at.affiliate_id
     WHERE at.status = 'pending'
     ORDER BY at.created_at ASC`
  ).all();
  const totals = await env.DB.prepare(
    `SELECT af.code, af.name, af.email, af.payout_method,
            SUM(CASE WHEN at.status = 'pending' THEN at.commission_cents ELSE 0 END) AS pending_cents,
            SUM(CASE WHEN at.status = 'paid' THEN at.commission_cents ELSE 0 END) AS paid_cents,
            COUNT(at.id) AS conversions
     FROM affiliates af
     LEFT JOIN affiliate_attributions at ON at.affiliate_id = af.id
     GROUP BY af.id
     HAVING conversions > 0
     ORDER BY pending_cents DESC`
  ).all();
  return json({ ok: true, pending: pending.results || [], totals: totals.results || [] });
}

// ------------------------------------------------------------
// recordAttributionForPaidLead — called from the Stripe webhook
// right after a lead is marked paid. Idempotent: the UNIQUE index on
// affiliate_attributions(lead_id) makes redeliveries no-op.
// Returns the attribution row, or null when there's nothing to pay.
// ------------------------------------------------------------
async function recordAttributionForPaidLead(env, leadId, amountCents) {
  const lead = await env.DB.prepare(`SELECT id, ref_code FROM leads WHERE id = ? LIMIT 1`).bind(leadId).first();
  const refCode = normalizeRefCode(lead && lead.ref_code);
  if (!refCode) return null;
  const aff = await findAffiliateByCode(env, refCode);
  if (!aff || aff.status !== 'active') {
    console.log('affiliate attribution skipped: unknown/inactive code', refCode, 'lead', leadId);
    return null;
  }
  const id = `atr_${uuid().slice(0, 24)}`;
  const res = await env.DB.prepare(
    `INSERT INTO affiliate_attributions (id, created_at, affiliate_id, lead_id, event_type, amount_cents, commission_cents, status)
     VALUES (?, ?, ?, ?, 'first_payment', ?, ?, 'pending')
     ON CONFLICT(lead_id) DO NOTHING`
  ).bind(id, nowIso(), aff.id, leadId, amountCents || 0, COMMISSION_CENTS).run();
  // changes === 0 means the lead already has an attribution (redelivery).
  if (res.meta && res.meta.changes === 0) return null;
  console.log('affiliate attribution created', id, 'code', refCode, 'lead', leadId);
  return { id, code: refCode, commission_cents: COMMISSION_CENTS };
}

export {
  COMMISSION_CENTS,
  REF_COOKIE_DAYS,
  normalizeRefCode,
  findAffiliateByCode,
  handlePartnerSignup,
  handlePartnerClick,
  handlePartnerPayouts,
  recordAttributionForPaidLead,
};
