CREATE INDEX IF NOT EXISTS idx_emails_sent_dedup_lead
ON emails_sent (
  template,
  status,
  json_extract(metadata, '$.lead_id')
);

CREATE INDEX IF NOT EXISTS idx_emails_sent_dedup_event
ON emails_sent (
  template,
  status,
  json_extract(metadata, '$.event_id')
);
