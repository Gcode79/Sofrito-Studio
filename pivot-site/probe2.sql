-- read-only probe #2: full remote inventory for the drift report
SELECT 'TABLE' AS obj_type, name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf_%' AND name!='d1_migrations' ORDER BY name;
SELECT 'VIEW' AS obj_type, name FROM sqlite_master WHERE type='view' ORDER BY name;
SELECT name, sql FROM sqlite_master WHERE type='table' AND name IN ('leads','scraped_leads','outreach_events','ab_tests','ab_variants');
