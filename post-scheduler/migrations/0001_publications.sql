-- Claim each approved calendar id once before contacting a provider.
-- A claim with an uncertain outcome requires manual reconciliation; it must
-- never be automatically reset because publication may already have happened.
CREATE TABLE publications (
  id TEXT PRIMARY KEY,
  claimed_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'publishing',
  provider_id TEXT,
  completed_at TEXT
);