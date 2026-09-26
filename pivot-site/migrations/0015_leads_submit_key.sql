-- Migration 0015 — leads.submit_key
--
-- Closes the concurrent double-submit race on the lead/checkout creation path
-- (POST /api/lead). The handler already derives a deterministic lead id from
-- the email, so a repeat submit collides on the primary key and does not create
-- a second LEAD row. What it could still do is create a second STRIPE CHECKOUT
-- SESSION, because a SELECT-before-INSERT guard cannot help when two requests
-- interleave between the SELECT and the INSERT.
--
-- The client generates one submit_key per page render and sends it with the
-- form. Enforcing it with a UNIQUE index closes that interleaving window at the
-- database rather than in application code. A per-render key (rather than
-- UNIQUE(email)) is deliberate: re-rendering the page produces a fresh key, so a
-- genuine repeat purchase by the same person is never blocked.
--
-- SQLite permits multiple NULLs in a UNIQUE index, so pre-existing lead rows
-- (submit_key IS NULL) are unaffected.

ALTER TABLE leads ADD COLUMN submit_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_submit_key ON leads(submit_key);
