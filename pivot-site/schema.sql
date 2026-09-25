-- ============================================================
-- Sofrito Studio — Canonical D1 Schema
-- Job: 1b
-- MCP: cloudflare-bindings
-- Last updated: 2026-09-04
-- Purpose: Source of truth for ALL business data.
--   D1 = SQLite dialect. No JSON columns -> TEXT + JSON.stringify/parse.
--   Money stored as INTEGER cents. Booleans as INTEGER 0/1.
-- Apply: wrangler d1 migrations apply sofrito-db --remote
-- ============================================================

CREATE TABLE IF NOT EXISTS leads (
  -- Core (schema.sql canonical)
  id             TEXT PRIMARY KEY,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  name           TEXT NOT NULL,
  email          TEXT NOT NULL,
  phone          TEXT,
  business_name  TEXT,
  business_type  TEXT,
  package_interest TEXT,
  budget         TEXT,
  stage          TEXT,                               -- added migration 0002
  timeline       TEXT,                               -- added migration 0002
  city           TEXT,                               -- added migration 0002
  decision       TEXT,                               -- added migration 0002
  message        TEXT,
  channel        TEXT DEFAULT 'contact_form',
  score          INTEGER DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'new',        -- new|contacted|qualified|proposal|won|lost
  notes          TEXT,
  source         TEXT DEFAULT 'organic',
  updated_at     TEXT NOT NULL,
  -- Outreach (migration 0006)
  variant            TEXT,                           -- A/B variant id
  outreach_status    TEXT DEFAULT 'not_started',     -- not_started|scheduled|in_progress|paused|done
  first_contacted_at TEXT,
  last_contacted_at  TEXT,
  last_replied_at    TEXT,
  opens_count        INTEGER NOT NULL DEFAULT 0,
  replies_count      INTEGER NOT NULL DEFAULT 0,
  meetings_booked    INTEGER NOT NULL DEFAULT 0,
  last_activity_at   TEXT,
  unsubscribed_at    TEXT,
  lead_source_detail TEXT,                           -- source doc id (scraped_leads.id / calendly booking_uuid)
  -- Hosting (migration 0007)
  hosting_addon INTEGER NOT NULL DEFAULT 0,         -- $49/mo maintenance toggle
  stripe_session_id TEXT,
  checkout_started_at INTEGER,
  paid_at INTEGER,
  nudge_sent_at INTEGER,
  checkout_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_leads_status     ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created    ON leads(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_email      ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_outreach   ON leads(outreach_status, last_activity_at);
CREATE INDEX IF NOT EXISTS idx_leads_variant    ON leads(variant);

-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
  id             TEXT PRIMARY KEY,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  lead_id        TEXT REFERENCES leads(id),
  name           TEXT NOT NULL,
  package_name   TEXT,
  price_cents    INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'discovery', -- discovery|onboarding|active|review|complete|cancelled
  started_at     TEXT,
  completed_at   TEXT,
  notes          TEXT,
  updated_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_lead   ON projects(lead_id);

-- ============================================================
-- revenue: one row per money event. Dedupe-safe via (source, source_id).
CREATE TABLE IF NOT EXISTS revenue (
  id             TEXT PRIMARY KEY,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  occurred_at    TEXT NOT NULL,
  source         TEXT NOT NULL,        -- stripe|manual
  source_id      TEXT NOT NULL,        -- payment_intent_xxx | sale id
  project_id     TEXT REFERENCES projects(id),
  amount_cents   INTEGER NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'usd',
  description    TEXT,
  metadata       TEXT,                 -- TEXT = JSON.stringify({...})
  paid           INTEGER DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_revenue_source ON revenue(source, source_id);
CREATE INDEX IF NOT EXISTS idx_revenue_occurred ON revenue(occurred_at);

-- ============================================================
CREATE TABLE IF NOT EXISTS emails_sent (
  id             TEXT PRIMARY KEY,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  to_email       TEXT NOT NULL,
  template       TEXT NOT NULL,
  subject        TEXT,
  status         TEXT DEFAULT 'queued',  -- queued|sent|failed
  provider_id    TEXT,                   -- Resend message id
  metadata       TEXT
);

CREATE INDEX IF NOT EXISTS idx_emails_sent_to ON emails_sent(to_email, created_at);

CREATE TABLE IF NOT EXISTS email_log (
  id             TEXT PRIMARY KEY,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  lead_id        TEXT NOT NULL,
  type           TEXT NOT NULL,
  status         TEXT DEFAULT 'queued',
  provider_id    TEXT,
  error          TEXT
);

CREATE INDEX IF NOT EXISTS idx_email_log_lead ON email_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_email_log_type_status ON email_log(type, status);

-- ============================================================
CREATE TABLE IF NOT EXISTS events (
  id             TEXT PRIMARY KEY,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  event_name     TEXT NOT NULL,          -- form_submission|cta_click|package_view|session_booked|blog_read|purchase
  session        TEXT,
  page_url       TEXT,
  properties     TEXT                    -- TEXT = JSON.stringify({...})
);

CREATE INDEX IF NOT EXISTS idx_events_name ON events(event_name, created_at);

-- ============================================================
CREATE TABLE IF NOT EXISTS content_calendar (
  id             TEXT PRIMARY KEY,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  scheduled_for  TEXT NOT NULL,
  channel        TEXT NOT NULL,          -- instagram|linkedin|newsletter|blog
  type           TEXT NOT NULL,          -- social|newsletter_section|blog_post
  topic          TEXT,
  status         TEXT DEFAULT 'draft',   -- draft|approved|scheduled|posted
  content_path   TEXT,                   -- /content/queue/... when generated
  copy_en        TEXT,
  copy_es        TEXT,
  posted_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_content_calendar_sched ON content_calendar(scheduled_for);

-- ============================================================
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id             TEXT PRIMARY KEY,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  email          TEXT NOT NULL UNIQUE,
  status         TEXT DEFAULT 'subscribed', -- subscribed|unsubscribed
  source         TEXT DEFAULT 'site'
);

-- ============================================================
-- VIEW: v_pipeline — everything the owner needs on one line.
CREATE VIEW IF NOT EXISTS v_pipeline AS
SELECT
  'leads' AS kind,
  (SELECT COUNT(*) FROM leads WHERE status IN ('new','contacted','qualified')) AS open_leads,
  (SELECT COUNT(*) FROM projects WHERE status IN ('discovery','onboarding','active','review')) AS active_projects,
  (SELECT COALESCE(SUM(amount_cents),0)/100.0 FROM revenue
     WHERE occurred_at >= date('now','start of month')) AS revenue_mtd_dollars,
  (SELECT COALESCE(SUM(amount_cents),0)/100.0 FROM revenue
     WHERE occurred_at >= date('now','-30 days')) AS revenue_30d_dollars;

-- ============================================================
-- VIEW: v_monthly_revenue — per-month totals for reports.
CREATE VIEW IF NOT EXISTS v_monthly_revenue AS
SELECT
  strftime('%Y-%m', occurred_at) AS month,
  source,
  COUNT(*) AS transaction_count,
  SUM(amount_cents)/100.0 AS dollars,
  COALESCE(SUM(CASE WHEN metadata IS NOT NULL THEN 1 ELSE 0 END),0) AS with_meta
FROM revenue
WHERE paid = 1
GROUP BY month, source
ORDER BY month DESC;

-- ============================================================
-- invoices: one row per milestone invoice per project. 0003.
-- approval_confirmed_at / files_delivered_at ARE the binary
-- trigger evidence. UNIQUE(project_id, milestone) blocks
-- double-billing a milestone. 'overdue' is computed live in
-- v_invoice_status (never stored, can't go stale).
CREATE TABLE IF NOT EXISTS invoices (
  id                  TEXT PRIMARY KEY,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  project_id          TEXT NOT NULL REFERENCES projects(id),
  milestone           TEXT NOT NULL CHECK (milestone IN ('deposit','milestone_25','final_25')),
  amount_cents        INTEGER NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'usd',
  stripe_invoice_id   TEXT,
  status              TEXT NOT NULL DEFAULT 'pending',   -- pending|sent|paid
  sent_at             TEXT,
  paid_at             TEXT,
  approval_confirmed_at TEXT,                             -- milestone_25: client's written "approved" logged
  files_delivered_at  TEXT,                               -- final_25: deliverables sent to client
  notes               TEXT
);

CREATE INDEX IF NOT EXISTS idx_invoices_project ON invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status  ON invoices(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_milestone ON invoices(project_id, milestone);

-- ============================================================
-- VIEW: v_invoice_status — payment state per milestone,
-- with overdue computed from sent_at (no stale flags).
CREATE VIEW IF NOT EXISTS v_invoice_status AS
SELECT
  p.id                AS project_id,
  p.name              AS client_name,
  p.package_name      AS package,
  p.price_cents       AS project_value_cents,
  i.milestone,
  i.amount_cents,
  i.status,
  i.sent_at,
  i.paid_at,
  CASE
    WHEN i.paid_at IS NOT NULL THEN 'paid'
    WHEN i.sent_at IS NOT NULL AND julianday('now') - julianday(i.sent_at) > 7 THEN 'overdue'
    WHEN i.sent_at IS NOT NULL THEN 'sent'
    ELSE 'pending'
  END                 AS computed_status,
  i.approval_confirmed_at,
  i.files_delivered_at
FROM invoices i
JOIN projects p ON i.project_id = p.id
ORDER BY i.created_at DESC;

-- ============================================================
-- VIEW: v_top_content — highest-value pages for the weekly digest.
CREATE VIEW IF NOT EXISTS v_top_content AS
SELECT page_url, COUNT(*) AS views
FROM events
WHERE event_name = 'page_view' AND created_at >= date('now','-7 days')
GROUP BY page_url
ORDER BY views DESC
LIMIT 5;