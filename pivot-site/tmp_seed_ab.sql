INSERT INTO ab_tests (id, entity, status, name, start_at) VALUES ('local_page_test', 'page', 'running', 'Local Page A/B Test', '2026-01-01T00:00:00Z');
INSERT INTO ab_variants (id, test_id, label, weight, config, is_control) VALUES ('control', 'local_page_test', 'sprint_page', 0.5, '{}', 1);
INSERT INTO ab_variants (id, test_id, label, weight, config, is_control) VALUES ('variant_a', 'local_page_test', 'sprint_boh', 0.5, '{}', 0);
