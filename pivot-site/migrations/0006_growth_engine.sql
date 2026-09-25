-- ============================================================
-- Migration 0006 — growth engine: scraped leads, outreach
-- pipeline state, and A/B test tracking (schema only — NO
-- worker/cron/outreach code in this migration; that ships
-- separately after founder approval).
-- Job: 1a (growth engine) — D1 layer
-- MCP: cloudflare-bindings (d1)
-- Last updated: 2026-09-05
-- Apply: npx wrangler d1 migrations apply sofrito-db --remote
-- ============================================================
-- Design notes
-- -------------
-- * `scraped_leads` is the RAW ingest ledger: one row per source
--   document (kitchen lease, food-truck/food-stall permit,
--   tasting-menu listing, etc.). `crawled_at` + `source` +
--   `external_id` are the idempotency key — re-scraping the same
--   listing upserts, never duplicates. Rows start
--   `status='raw'` and are promoted to `leads` by the
--   qualifier stage (flagged separately, no code here).
-- * Every lead row carries its outreach/A-B state directly:
--   `variant`, `outreach_status`, `first_contacted_at`,
--   … `last_activity_at`. One row per business (= dedupe by
--   `email`/`business_name` UNIQUE).
-- * `outreach_events` is append-only (idempotent via
--   `(lead_id, kind, external_id)` UNIQUE, no DELETEs, no UPDATEs).
--   Emails are *references* (template + variant), the body is
--   rendered at send time — we never store message bodies here.
-- * `ab_tests` / `ab_variants` / `ab_assignments` /
--   `ab_test_events` are the generic experiment ledger the
--   founder can reuse for BOTH the outreach copy tests and the
--   "Sprint vs. Agency" landing-page split. Assignments carry
--   their own `period` so the hourly cron can roll buckets
--   without touching history.
-- ============================================================

-- ============================================================
-- 1. Scrapped / syndicated leads ledger (raw ingest)
-- ============================================================
CREATE TABLE IF NOT EXISTS scraped_leads (
  id             TEXT PRIMARY KEY,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  crawled_at     TEXT NOT NULL,
  source         TEXT NOT NULL,                 -- open_business, food_truck_registry, calendly_partner, gmb, yelp, other
  external_id    TEXT NOT NULL,                 -- id in the source system
  external_url   TEXT,                          -- canonical listing URL (never stored as a hint field)
  business_name  TEXT NOT NULL,
  address        TEXT,
  city           TEXT,
  region         TEXT,
  postal_code    TEXT,
  country        TEXT DEFAULT 'us',
  lat            REAL,
  lng            REAL,
  phone          TEXT,
  email          TEXT,
  website        TEXT,
  category       TEXT,                          -- raw category/NAICS-ish tag from source
  license_type   TEXT,                          -- e.g. 'food_truck', 'caterer', 'tasting_menu'
  license_number TEXT,
  description    TEXT,
  rating         REAL,
  review_count   INTEGER,
  employees      INTEGER,                       -- proxy for scale (0 = unknown)
  metadata       TEXT,                          -- JSON blob of source-specific extras
  status         TEXT NOT NULL DEFAULT 'raw',   -- raw|qualified|merged|rejected
  score          REAL DEFAULT 0,                -- lead_score from KV formula (0..1)
  qualified_at   TEXT,
  merged_lead_id TEXT,                          -- set when promoted into leads
  source_hash    TEXT NOT NULL                  -- dedupe: sha256(crawled_at,source,external_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_scraped_dedupe
  ON scraped_leads(source, external_id);
CREATE INDEX IF NOT EXISTS idx_scraped_status   ON scraped_leads(status, score DESC);
CREATE INDEX IF NOT EXISTS idx_scraped_crawled  ON scraped_leads(crawled_at);
CREATE INDEX IF NOT EXISTS idx_scraped_name     ON scraped_leads(business_name);

-- ============================================================
-- 2. Leads — outreach pipeline + A/B variant state
--    (columns added to the existing `leads` table, additive only)
-- ============================================================
ALTER TABLE leads ADD COLUMN variant            TEXT; -- A/B variant id (control|variant_x)
ALTER TABLE leads ADD COLUMN outreach_status    TEXT DEFAULT 'not_started'; -- not_started|scheduled|in_progress|paused|done
ALTER TABLE leads ADD COLUMN first_contacted_at TEXT;
ALTER TABLE leads ADD COLUMN last_contacted_at  TEXT;
ALTER TABLE leads ADD COLUMN last_replied_at    TEXT;
ALTER TABLE leads ADD COLUMN opens_count        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN replies_count      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN meetings_booked    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN last_activity_at   TEXT;
ALTER TABLE leads ADD COLUMN unsubscribed_at    TEXT;
ALTER TABLE leads ADD COLUMN lead_source_detail TEXT; -- source doc id (scraped_leads.id / calendly booking_uuid)
CREATE INDEX IF NOT EXISTS idx_leads_outreach        ON leads(outreach_status, last_activity_at);
CREATE INDEX IF NOT EXISTS idx_leads_variant         ON leads(variant);

-- ============================================================
-- 3. Outreach events ledger (append-only)
--    Every touchpoint row is idempotent on
--    (lead_id, kind, external_id) — reprocessing a webhook or a
--    cron re-scan never double-counts.
-- ============================================================
CREATE TABLE IF NOT EXISTS outreach_events (
  id             TEXT PRIMARY KEY,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  lead_id        TEXT NOT NULL REFERENCES leads(id),
  kind           TEXT NOT NULL,                 -- email_sent|email_opened|email_replied|meeting_booked|meeting_no_show|unsubscribed|custom
  external_id    TEXT,                          -- resend id / calendly booking_uuid / stripe id
  occurred_at    TEXT NOT NULL,
  variant        TEXT,                          -- which A/B variant produced this event
  metadata       TEXT,                          -- JSON (template name, subject-render hints, etc.)
  status         TEXT NOT NULL DEFAULT 'recorded'
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_outreach_unique
  ON outreach_events(lead_id, kind, external_id);
CREATE INDEX IF NOT EXISTS idx_outreach_lead_time
  ON outreach_events(lead_id, occurred_at DESC);

-- ============================================================
-- 4. A/B test framework
-- ============================================================
CREATE TABLE IF NOT EXISTS ab_tests (
  id             TEXT PRIMARY KEY,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  name           TEXT NOT NULL,
  description    TEXT,
  entity         TEXT NOT NULL,                 -- 'lead' (outreach) | 'page' (landing/copy)
  status         TEXT NOT NULL DEFAULT 'running', -- draft|running|paused|complete
  start_at       TEXT NOT NULL,
  end_at         TEXT,
  primary_metric TEXT NOT NULL DEFAULT 'reply_rate', -- reply_rate|book_rate|click_rate|page_view_rate
  winner_variant TEXT,                          -- set when promoted
  promoted_at    TEXT,
  created_by     TEXT
);

CREATE TABLE IF NOT EXISTS ab_variants (
  id             TEXT PRIMARY KEY,
  test_id        TEXT NOT NULL REFERENCES ab_tests(id),
  label          TEXT NOT NULL,                 -- 'control', 'variant_a', 'variant_b'…
  weight         REAL NOT NULL DEFAULT 0.5,     -- split proportion (all weights sum to 1)
  config         TEXT,                          -- JSON: copy template, subject template, page route, etc.
  is_control     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_abvariants_test ON ab_variants(test_id, is_control);

CREATE TABLE IF NOT EXISTS ab_assignments (
  id             TEXT PRIMARY KEY,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  test_id        TEXT NOT NULL REFERENCES ab_tests(id),
  subject_id     TEXT NOT NULL,                 -- lead id (entity='lead') or visit/session (entity='page')
  variant_id     TEXT NOT NULL REFERENCES ab_variants(id),
  period         TEXT NOT NULL,                 -- strftime bucket e.g. '2026-09-05' — cron rolls buckets
  assignment_type TEXT NOT NULL DEFAULT 'deterministic', -- deterministic|random_roll
  UNIQUE (test_id, subject_id, period, variant_id)
);
CREATE INDEX IF NOT EXISTS idx_abassign_test_period
  ON ab_assignments(test_id, period);
CREATE INDEX IF NOT EXISTS idx_abassign_subject
  ON ab_assignments(subject_id);

CREATE TABLE IF NOT EXISTS ab_test_events (
  id             TEXT PRIMARY KEY,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  test_id        TEXT NOT NULL REFERENCES ab_tests(id),
  assignment_id  TEXT REFERENCES ab_assignments(id),
  subject_id     TEXT NOT NULL,
  event_type     TEXT NOT NULL,                 -- exposure|conversion (primary_metric fired)
  metric_value   REAL,                          -- 1.0 for binary conversions (or ms for page_view elapsed)
  occurred_at    TEXT NOT NULL,
  metadata       TEXT
);
CREATE INDEX IF NOT EXISTS idx_abevents_test_occurred
  ON ab_test_events(test_id, event_type, occurred_at);

-- ============================================================
-- 5. Read-only reporting views
-- ============================================================
CREATE VIEW IF NOT EXISTS v_ab_results AS
SELECT
  t.id            AS test_id,
  t.name          AS test_name,
  t.primary_metric,
  v.id            AS variant_id,
  v.label         AS variant_label,
  v.is_control,
  COUNT(DISTINCT a.id)                                        AS assigned,
  COUNT(DISTINCT e.id) FILTER (WHERE e.event_type='exposure') AS exposures,
  COUNT(DISTINCT e.id) FILTER (WHERE e.event_type='conversion') AS conversions,
  ROUND(
    CASE WHEN COUNT(DISTINCT e.id) FILTER (WHERE e.event_type='exposure') = 0
         THEN 0
         ELSE 100.0 * COUNT(DISTINCT e.id) FILTER (WHERE e.event_type='conversion')
              / COUNT(DISTINCT e.id) FILTER (WHERE e.event_type='exposure')
    END, 2
  ) AS conversion_rate_pct
FROM ab_tests t
JOIN ab_variants v ON v.test_id = t.id
LEFT JOIN ab_assignments a ON a.variant_id = v.id
LEFT JOIN ab_test_events e ON e.assignment_id = a.id
WHERE t.status = 'running'
GROUP BY t.id, v.id;

CREATE VIEW IF NOT EXISTS v_outreach_funnel AS
SELECT
  COUNT(*)                                                          AS scraped_total,
  COUNT(*) FILTER (WHERE status='raw')                              AS scraped_raw,
  COUNT(*) FILTER (WHERE status IN ('qualified','merged'))          AS scraped_qualified,
  (SELECT COUNT(*) FROM leads WHERE outreach_status != 'not_started') AS leads_in_outreach,
  (SELECT COUNT(*) FROM leads WHERE opens_count > 0)                AS leads_opened,
  (SELECT COUNT(*) FROM leads WHERE replies_count > 0)              AS leads_replied,
  (SELECT COUNT(*) FROM leads WHERE meetings_booked > 0)            AS leads_booked
FROM scraped_leads;
