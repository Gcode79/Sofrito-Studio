-- Migration 0010 — checkout URL storage
-- Adds checkout_url column to leads for storing real Stripe session URLs.

ALTER TABLE leads ADD COLUMN checkout_url TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_checkout_url ON leads(checkout_url);
