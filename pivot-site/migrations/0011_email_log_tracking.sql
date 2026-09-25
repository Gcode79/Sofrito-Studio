DROP INDEX IF EXISTS idx_email_log_lead;
ALTER TABLE email_log RENAME TO email_log_legacy;

CREATE TABLE email_log (
  id          TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  lead_id     TEXT NOT NULL,
  type        TEXT NOT NULL,
  status      TEXT DEFAULT 'queued',
  provider_id TEXT,
  error       TEXT
);

INSERT INTO email_log (id, created_at, lead_id, type, status, provider_id, error)
SELECT id, created_at, lead_id, type, status, provider_id, error FROM email_log_legacy;

DROP TABLE email_log_legacy;
DROP INDEX IF EXISTS idx_email_log_type_status;
CREATE INDEX idx_email_log_lead ON email_log(lead_id);
CREATE INDEX idx_email_log_type_status ON email_log(type, status);
