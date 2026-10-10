// ============================================================
// Sofrito Studio — pure helpers (zero dependencies)
//
// Dependency-free decision logic extracted from the worker so it can be
// covered by regression tests (scripts/test-payments.js). No env, no
// imports, no I/O — safe to load in plain node.
// ============================================================

// Fix 1 (2026-10-04): Stripe's form API has no nested objects. Flatten
// invoice metadata to metadata[key] form fields — passing a nested object
// makes URLSearchParams serialize it to the literal "[object Object]",
// losing the invoice/project identifiers.
export function flattenInvoiceMetadata(meta) {
  const out = {};
  for (const [k, v] of Object.entries(meta || {})) {
    out[`metadata[${k}]`] = v == null ? '' : String(v);
  }
  return out;
}

// Fix 3 (2026-10-04): amount_refunded on a charge is CUMULATIVE across every
// refund on that charge. The individual refund for a charge.refunded event is
// the newest entry in refunds.data (Stripe orders reverse-chronological).
// Returns null when the payload carries no refund object — the caller must
// skip the ledger write rather than record a wrong number.
export function extractIndividualRefund(charge) {
  const list = (charge && charge.refunds && charge.refunds.data) || [];
  const r = list[0] || null;
  if (!r || !r.id) return null;
  return {
    refundId: r.id,
    amountCents: -(r.amount || 0),
    ledgerSourceId: `stripe:refund:${r.id}`,
  };
}

// Fix 2 (2026-10-04): retry the Stripe invoice attempt when the invoice row
// is new OR a previous attempt failed before Stripe succeeded (the row
// stays 'pending'). A row already 'sent'/'paid' must not re-attempt.
export function shouldAttemptStripeInvoice({ isNewInvoice, status, hasApiKey }) {
  if (!hasApiKey) return false;
  // reconciliation_required rows must re-enter the resume path: the helper
  // re-checks Stripe state and preserves the flag without resending.
  // Skipping them as already_exists would hide ambiguous deliveries.
  return isNewInvoice === true || status === 'pending' || status === 'reconciliation_required';
}

// Fix 4 (2026-10-04): receipt/booking emails are keyed on the Stripe payment
// (checkout session id) from the very first delivery — never on the lead
// alone. A redelivery of the same event shares the key (no duplicate mail);
// a genuine repurchase carries a new session id (mails again).
export function resolvePaymentKey({ isLive, completedPaymentEvent, sessionId }) {
  return isLive && completedPaymentEvent && sessionId ? sessionId : null;
}

// Fix 5 (2026-10-04): created_at / occurred_at are stored ISO-8601 (nowIso).
// SQLite's datetime('now') returns a space-separated format that string-
// compares wrongly against ISO timestamps ('T' > ' '), so time-window
// cutoffs must be built in ISO format. `interval` is a developer-supplied
// SQLite modifier such as '-15 minutes' — never user input.
export function isoCutoffSql(interval) {
  return `strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '${interval}')`;
}
