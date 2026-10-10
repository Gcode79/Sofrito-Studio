SELECT 'leads' AS tbl, cid, name, type, "notnull" AS nn, dflt_value
FROM pragma_table_info('leads')
UNION ALL
SELECT 'scraped_leads', cid, name, type, "notnull", dflt_value
FROM pragma_table_info('scraped_leads')
ORDER BY tbl, cid;
