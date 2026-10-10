-- Latest paid purchase identity: a refund of an older purchase must not
-- invalidate the current one. Legacy rows intentionally remain unmapped.
ALTER TABLE leads ADD COLUMN stripe_payment_intent_id TEXT;
CREATE INDEX IF NOT EXISTS idx_leads_payment_intent ON leads(stripe_payment_intent_id);

-- Durable receipt and booking delivery. Persist both before acknowledging
-- Stripe; queue publication may be retried with the same delivery identity.
CREATE TABLE IF NOT EXISTS email_outbox (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  dispatched_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_email_outbox_pending ON email_outbox(dispatched_at, created_at);

-- A processed payment must not re-anchor a lead or reverse a later refund
-- when Stripe redelivers it, even before its receipt reaches the queue.
CREATE TABLE IF NOT EXISTS stripe_payments (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  paid_at INTEGER NOT NULL
);