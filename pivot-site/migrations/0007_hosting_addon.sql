-- ============================================================
-- Migration 0007 — Engine Maintenance hosting add-on
-- Purpose: Add the opt-in Engine add-on column to leads so the
-- $49/mo maintenance toggle can be persisted end-to-end.
-- Job: A3 (founder-approved — "Full backend support")
-- MCP: cloudflare-bindings (d1), cloudflare (d1 migrations)
-- Last updated: 2026-09-05
-- Apply: npx wrangler d1 migrations apply sofrito-db --remote
-- ============================================================

ALTER TABLE leads ADD COLUMN hosting_addon INTEGER NOT NULL DEFAULT 0;
