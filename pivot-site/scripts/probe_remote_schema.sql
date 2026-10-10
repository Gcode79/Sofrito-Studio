SELECT m.name AS migration_name, m.applied_at
FROM d1_migrations m ORDER BY m.applied_at;
SELECT sql FROM sqlite_master
WHERE type='table' AND lower(name) IN ('leads','scraped_leads','outreach_events','outreach_logs','ab_tests','ab_variants','ab_assignments','ab_test_events','ab_analytics')
ORDER BY name;
SELECT name, type, [notnull], dflt_value
FROM pragma_table_info('leads') ORDER BY cid;
