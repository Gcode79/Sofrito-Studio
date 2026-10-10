-- Migration: 0001_growth_engine_init
-- Purpose: Tables for automated lead tracking, AI outreach, and A/B split testing
-- STATUS: REPLACED — the live D1 already has a more complete leads schema
--   (name, email, score, channel, etc. were added via manual schema alignment
--   before migrations 0006/0007/0008 were written). This file is kept for
--   history but is a no-op on the current database.

-- NO-OP: schema already exists via subsequent alignment migrations.