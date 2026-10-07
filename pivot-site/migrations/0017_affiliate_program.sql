-- Migration 0017 — Sofrito Partners affiliate program
--
-- Tables:
--   affiliates              — partner signups; code is the referral identifier
--   affiliate_clicks        — click log for ?ref=CODE visits (stats, not payout)
--   affiliate_attributions  — one row per paid conversion; $100 flat commission
--
-- Also adds leads.ref_code (nullable) so a referral captured at lead time
-- survives to payment time, when the attribution is created.
--
-- Commission rule: $100 (10000 cents) on FIRST payment per lead (session or
-- sprint). Attribution is created once per lead — the UNIQUE index on
-- affiliate_attributions(lead_id) enforces it at the DB level, so webhook
-- redeliveries can never double-pay.
--
-- STATUS: NOT APPLIED to remote D1. Apply only with explicit approval:
--   npx wrangler d1 execute sofrito-db --remote --file pivot-site/migrations/0017_affiliate_program.sql
--

CREATE TABLE IF NOT EXISTS affiliates (
  id              TEXT PRIMARY KEY,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  code            TEXT NOT NULL,              -- referral code, e.g. MARIA-7X2Q
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  payout_method   TEXT NOT NULL,              -- cashapp|venmo|zelle|bank|other
  payout_details  TEXT,                       -- handle / email / last4 — partner-supplied
  status          TEXT NOT NULL DEFAULT 'active'  -- active|paused
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliates_code  ON affiliates(code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliates_email ON affiliates(email);

CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id            TEXT PRIMARY KEY,
  clicked_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  affiliate_id  TEXT NOT NULL REFERENCES affiliates(id),
  landing_page  TEXT
);

CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_affiliate ON affiliate_clicks(affiliate_id);

CREATE TABLE IF NOT EXISTS affiliate_attributions (
  id               TEXT PRIMARY KEY,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  affiliate_id     TEXT NOT NULL REFERENCES affiliates(id),
  lead_id          TEXT NOT NULL REFERENCES leads(id),
  event_type       TEXT NOT NULL DEFAULT 'first_payment',  -- first_payment
  amount_cents     INTEGER NOT NULL,         -- what the customer paid
  commission_cents INTEGER NOT NULL,         -- flat $100 = 10000
  status           TEXT NOT NULL DEFAULT 'pending',  -- pending|paid
  paid_at          TEXT
);

-- One commission per lead, ever. Webhook redeliveries hit this and no-op.
CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliate_attributions_lead ON affiliate_attributions(lead_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_attributions_status ON affiliate_attributions(affiliate_id, status);

-- Referral captured at lead time (contact form, founding application, Calendly
-- Q&A). NULLABLE so old code keeps working until the worker writes it.
ALTER TABLE leads ADD COLUMN ref_code TEXT;

-- Lookups by ref_code happen on every Stripe webhook payment; without this
-- index they scan the full leads table.
CREATE INDEX IF NOT EXISTS idx_leads_ref_code ON leads(ref_code);
