// ============================================================
// Sofrito Studio — payment & retry regression tests
// Run: node scripts/test-payments.js   (also via npm run test:payments + CI)
//
// Locks in the CodeRabbit fix batch (2026-10-04). Each test replays the
// original bug against the real helper/SQL and asserts the fixed behavior.
// A failing assertion exits non-zero.
// ============================================================
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  flattenInvoiceMetadata,
  extractIndividualRefund,
  shouldAttemptStripeInvoice,
  resolvePaymentKey,
  isoCutoffSql,
} from '../src/lib/pure.js';

let passed = 0;
function ok(name, cond) {
  if (!cond) {
    console.error(`FAIL: ${name}`);
    process.exitCode = 1;
  } else {
    passed++;
  }
}

// ---- Fix 1: invoice metadata encoding ----
// Bug: nested `metadata: {…}` serialized to the literal "[object Object]".
{
  const meta = { invoice_id: 'inv_123', project_id: 'proj_456', milestone: 'session' };
  const body = new URLSearchParams({
    customer: 'cus_1',
    description: 'Session',
    ...flattenInvoiceMetadata(meta),
  }).toString();
  ok('metadata: no [object Object] in form body', !body.includes('[object Object]'));
  ok('metadata: invoice_id flattened', body.includes('metadata%5Binvoice_id%5D=inv_123'));
  ok('metadata: project_id flattened', body.includes('metadata%5Bproject_id%5D=proj_456'));
  ok('metadata: milestone flattened', body.includes('metadata%5Bmilestone%5D=session'));
  ok('metadata: empty meta flattens to nothing', Object.keys(flattenInvoiceMetadata(null)).length === 0);
}

// ---- Fix 2: failed invoices retry safely ----
// Bug: after a provider failure the row stayed pending but retries returned
// already_exists without contacting Stripe.
{
  const attempt = (isNewInvoice, status, hasApiKey) =>
    shouldAttemptStripeInvoice({ isNewInvoice, status, hasApiKey });
  ok('retry: new invoice attempts', attempt(true, 'pending', true) === true);
  ok('retry: pending row re-attempts after failure', attempt(false, 'pending', true) === true);
  ok('retry: sent row does not re-attempt', attempt(false, 'sent', true) === false);
  ok('retry: paid row does not re-attempt', attempt(false, 'paid', true) === false);
  ok('retry: no API key means no attempt', attempt(true, 'pending', false) === false);
  ok('retry: pending row without key stays quiet', attempt(false, 'pending', false) === false);
}

// ---- Fix 3: refund accounting ----
// Bug: charge.refunded recorded the charge's CUMULATIVE amount_refunded, so a
// $100 refund followed by a $200 refund ledgered -$100 then -$300.
{
  const charge = {
    amount: 30000,
    amount_refunded: 30000,
    refunds: { data: [{ id: 're_200', amount: 20000 }, { id: 're_100', amount: 10000 }] },
  };
  const r = extractIndividualRefund(charge);
  ok('refund: records individual amount, not cumulative', r.amountCents === -20000);
  ok('refund: keyed by refund id', r.refundId === 're_200');
  ok('refund: ledger source id per refund', r.ledgerSourceId === 'stripe:refund:re_200');
  ok('refund: missing refund object returns null', extractIndividualRefund({ refunds: { data: [] } }) === null);
  ok('refund: missing refunds list returns null', extractIndividualRefund({}) === null);
}

// ---- Fix 4: payment email dedup ----
// Bug: the first delivery queued receipt/booking mail with no payment key, so
// a redelivery down the repurchase path mailed everything a second time.
{
  const key = (isLive, completed, sid) =>
    resolvePaymentKey({ isLive, completedPaymentEvent: completed, sessionId: sid });
  ok('paykey: live completed payment keys on session', key(true, true, 'cs_123') === 'cs_123');
  ok('paykey: stable across redeliveries', key(true, true, 'cs_123') === key(true, true, 'cs_123'));
  ok('paykey: non-payment event has no key', key(true, false, 'cs_123') === null);
  ok('paykey: test-mode event has no key', key(false, true, 'cs_123') === null);
  ok('paykey: missing session id has no key', key(true, true, null) === null);
}

// ---- Fix 5: timestamp normalization ----
// Bug: ISO-8601 created_at (with 'T') compared against SQLite datetime('now')
// (space-separated) — 'T' > ' ', so an 11-hour-old lead passed the 15-minute
// idempotency cutoff. Runs the REAL cutoff SQL against in-memory SQLite.
{
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE leads (id TEXT, created_at TEXT)');
  const nowMs = Date.now();
  // 11h old, relative to now (midnight-safe): the exact bug shape. A fixed
  // wall-clock time like `${today}T00:30` breaks when the suite runs near
  // 00:00 UTC — the "stale" row lands inside the 15-minute window.
  const oldIso = new Date(nowMs - 11 * 60 * 60 * 1000).toISOString();
  const newIso = new Date(nowMs - 10 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO leads VALUES (?, ?), (?, ?)').run('old', oldIso, 'new', newIso);
  const rows = db
    .prepare(`SELECT id FROM leads WHERE created_at >= ${isoCutoffSql('-15 minutes')}`)
    .all();
  ok('timestamps: 11h-old ISO row excluded by 15-min cutoff', rows.length === 1 && rows[0].id === 'new');
  const buggy = db
    .prepare(`SELECT id FROM leads WHERE created_at >= datetime('now', '-15 minutes')`)
    .all();
  // Root-cause demo (clock-independent): 'T' (0x54) sorts after ' ' (0x20), so an
  // ISO-8601 timestamp always compares >= the space-separated datetime('now')
  // at the same instant — the old comparison could never exclude a same-day row.
  const leak = db.prepare(`SELECT '2000-01-01T00:00:00.000Z' >= '2000-01-01 00:00:00' AS gte`).get();
  ok("timestamps: 'T' > ' ' lets ISO strings leak past the space-form cutoff", leak.gte === 1);
  db.close();
}

// ---- Fix 6: route handlers awaited inside the error boundary ----
// Bug: `return handleX(...)` without await let async failures bypass the
// try/catch, rejecting the Worker instead of returning the JSON 500.
// The two calendly tail-returns are allowlisted: they sit outside any
// try/catch and their caller awaits them.
{
  const src = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');
  const allowlisted = new Set(['handleCalendlyCanceled', 'handleCalendlyCreated']);
  const bare = [...src.matchAll(/return (?!await )([A-Za-z_$][\w$]*)\(/g)]
    .map((m) => m[1])
    .filter((name) => /^handle[A-Z]/.test(name) && !allowlisted.has(name));
  ok(
    'routes: every handler return inside the boundary is awaited',
    bare.length === 0,
  );
  if (bare.length) console.error('  un-awaited:', [...new Set(bare)].join(', '));
}

console.log(`${passed} assertions passed.`);
