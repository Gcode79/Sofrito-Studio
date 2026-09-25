-- ============================================================
-- Migration 0009 — checkout lifecycle (applied 2026-09-20)
-- Adds Stripe checkout session tracking and lead status
-- lifecycle for the payment-gated lead flow.
-- ============================================================

ALTER TABLE leads ADD COLUMN stripe_session_id TEXT;
ALTER TABLE leads ADD COLUMN checkout_started_at INTEGER;
ALTER TABLE leads ADD COLUMN paid_at INTEGER;
ALTER TABLE leads ADD COLUMN nudge_sent_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_leads_stripe_session ON leads(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_leads_paid_at ON leads(paid_at);
CREATE INDEX IF NOT EXISTS idx_leads_nudge_sent ON leads(nudge_sent_at);

CREATE TABLE IF NOT EXISTS email_log (
  id             TEXT PRIMARY KEY,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  lead_id        TEXT NOT NULL REFERENCES leads(id),
  type           TEXT NOT NULL,
  status         TEXT DEFAULT 'queued',
  provider_id    TEXT,
  error          TEXT
);

CREATE INDEX IF NOT EXISTS idx_email_log_lead ON email_log(lead_id);
