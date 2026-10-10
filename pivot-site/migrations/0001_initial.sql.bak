-- ============================================================
-- Migration 0001 — initial schema (mirror of schema.sql)
-- Job: 1b
-- MCP: cloudflare-bindings
-- Last updated: 2026-09-04
-- Apply: npx wrangler d1 migrations apply sofrito-db --remote
-- ============================================================

CREATE TABLE IF NOT EXISTS leads (
  id             TEXT PRIMARY KEY,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  name           TEXT NOT NULL,
  email          TEXT NOT NULL,
  phone          TEXT,
  business_name  TEXT,
  business_type  TEXT,
  package_interest TEXT,
  budget         TEXT,
  message        TEXT,
  channel        TEXT DEFAULT 'contact_form',
  score          INTEGER DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'new',
  notes          TEXT,
  source         TEXT DEFAULT 'organic',
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_leads_status   ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created  ON leads(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_email    ON leads(email);

CREATE TABLE IF NOT EXISTS projects (
  id             TEXT PRIMARY KEY,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  lead_id        TEXT REFERENCES leads(id),
  name           TEXT NOT NULL,
  package_name   TEXT,
  price_cents    INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'discovery',
  started_at     TEXT,
  completed_at   TEXT,
  notes          TEXT,
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_lead   ON projects(lead_id);

CREATE TABLE IF NOT EXISTS revenue (
  id             TEXT PRIMARY KEY,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  occurred_at    TEXT NOT NULL,
  source         TEXT NOT NULL,
  source_id      TEXT NOT NULL,
  project_id     TEXT REFERENCES projects(id),
  amount_cents   INTEGER NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'usd',
  description    TEXT,
  metadata       TEXT,
  paid           INTEGER DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_revenue_source ON revenue(source, source_id);
CREATE INDEX IF NOT EXISTS idx_revenue_occurred ON revenue(occurred_at);

CREATE TABLE IF NOT EXISTS emails_sent (
  id             TEXT PRIMARY KEY,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  to_email       TEXT NOT NULL,
  template       TEXT NOT NULL,
  subject        TEXT,
  status         TEXT DEFAULT 'queued',
  provider_id    TEXT,
  metadata       TEXT
);
CREATE INDEX IF NOT EXISTS idx_emails_sent_to ON emails_sent(to_email, created_at);

CREATE TABLE IF NOT EXISTS events (
  id             TEXT PRIMARY KEY,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  event_name     TEXT NOT NULL,
  session        TEXT,
  page_url       TEXT,
  properties     TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_name ON events(event_name, created_at);

CREATE TABLE IF NOT EXISTS content_calendar (
  id             TEXT PRIMARY KEY,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  scheduled_for  TEXT NOT NULL,
  channel        TEXT NOT NULL,
  type           TEXT NOT NULL,
  topic          TEXT,
  status         TEXT DEFAULT 'draft',
  content_path   TEXT,
  copy_en        TEXT,
  copy_es        TEXT,
  posted_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_content_calendar_sched ON content_calendar(scheduled_for);

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id             TEXT PRIMARY KEY,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  email          TEXT NOT NULL UNIQUE,
  status         TEXT DEFAULT 'subscribed',
  source         TEXT DEFAULT 'site'
);

CREATE VIEW IF NOT EXISTS v_pipeline AS
SELECT
  'leads' AS kind,
  (SELECT COUNT(*) FROM leads WHERE status IN ('new','contacted','qualified')) AS open_leads,
  (SELECT COUNT(*) FROM projects WHERE status IN ('discovery','onboarding','active','review')) AS active_projects,
  (SELECT COALESCE(SUM(amount_cents),0)/100 FROM revenue
     WHERE occurred_at >= date('now','start of month')) AS revenue_mtd_dollars,
  (SELECT COALESCE(SUM(amount_cents),0)/100 FROM revenue
     WHERE occurred_at >= date('now','-30 days')) AS revenue_30d_dollars;

CREATE VIEW IF NOT EXISTS v_monthly_revenue AS
SELECT
  strftime('%Y-%m', occurred_at) AS month,
  source,
  COUNT(*) AS transaction_count,
  SUM(amount_cents)/100 AS dollars,
  COALESCE(SUM(CASE WHEN metadata IS NOT NULL THEN 1 ELSE 0 END),0) AS with_meta
FROM revenue
WHERE paid = 1
GROUP BY month, source
ORDER BY month DESC;

CREATE VIEW IF NOT EXISTS v_top_content AS
SELECT page_url, COUNT(*) AS views
FROM events
WHERE event_name = 'page_view' AND created_at >= date('now','-7 days')
GROUP BY page_url
ORDER BY views DESC
LIMIT 5;