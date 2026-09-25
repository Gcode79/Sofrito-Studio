PRAGMA defer_foreign_keys = true;

DROP VIEW IF EXISTS v_invoice_status;

CREATE TABLE invoices_0013 (
  id                  TEXT PRIMARY KEY,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  project_id          TEXT NOT NULL REFERENCES projects(id),
  milestone           TEXT NOT NULL CHECK (milestone IN ('session','final')),
  amount_cents        INTEGER NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'usd',
  stripe_invoice_id   TEXT,
  status              TEXT NOT NULL DEFAULT 'pending',
  sent_at             TEXT,
  paid_at             TEXT,
  approval_confirmed_at TEXT,
  files_delivered_at  TEXT,
  notes               TEXT
);

INSERT INTO invoices_0013 (
  id,
  created_at,
  project_id,
  milestone,
  amount_cents,
  currency,
  stripe_invoice_id,
  status,
  sent_at,
  paid_at,
  approval_confirmed_at,
  files_delivered_at,
  notes
)
SELECT
  id,
  created_at,
  project_id,
  CASE milestone
    WHEN 'deposit' THEN 'session'
    WHEN 'final_25' THEN 'final'
    ELSE milestone
  END,
  amount_cents,
  currency,
  stripe_invoice_id,
  status,
  sent_at,
  paid_at,
  approval_confirmed_at,
  files_delivered_at,
  notes
FROM invoices;

DROP TABLE invoices;

ALTER TABLE invoices_0013 RENAME TO invoices;

CREATE INDEX idx_invoices_project ON invoices(project_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE UNIQUE INDEX idx_invoices_milestone ON invoices(project_id, milestone);

CREATE VIEW v_invoice_status AS
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
