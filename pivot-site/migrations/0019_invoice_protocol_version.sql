-- Protocol version marker for invoice idempotency (CodeRabbit round 3).
-- Split from 0018: databases that already applied the earlier 0018 must get
-- this column via a new migration, not an amended file they'd skip.
-- v2 = created by the new idempotency protocol; NULL = pre-cutover legacy row.
-- Legacy pending rows without a Stripe ID reconcile via metadata lookup;
-- v2 rows that fail transiently can safely retry creation.
ALTER TABLE invoices ADD COLUMN protocol_version TEXT;
