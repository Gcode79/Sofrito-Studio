# Graph Report - SofritoStudio  (2026-10-06)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1074 nodes · 1863 edges · 104 communities (55 shown, 49 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ba199751`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 63
- Community 64
- Community 69
- Community 71

## God Nodes (most connected - your core abstractions)
1. `fetch()` - 32 edges
2. `json()` - 29 edges
3. `enqueueEmail()` - 26 edges
4. `handleStripeWebhook()` - 21 edges
5. `nowIso()` - 20 edges
6. `fail()` - 19 edges
7. `handleInvoiceTrigger()` - 17 edges
8. `handleApiLead()` - 15 edges
9. `enqueueWebhook()` - 14 edges
10. `handleCalendlyWebhook()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `weeklyDigest()` --calls--> `sendResend()`  [EXTRACTED]
  pivot-site/src/lib/automations.js → pivot-site/src/lib/email.js
- `weeklyDigest()` --calls--> `updateEmailTracking()`  [EXTRACTED]
  pivot-site/src/lib/automations.js → pivot-site/src/lib/email.js
- `handleCalendlyCreated()` --calls--> `escapeHtml()`  [EXTRACTED]
  pivot-site/src/lib/booking.js → pivot-site/src/lib/http.js
- `handleApiLead()` --calls--> `escapeHtml()`  [EXTRACTED]
  pivot-site/src/worker.js → pivot-site/src/lib/http.js
- `fetch()` --calls--> `abTestTerminated()`  [EXTRACTED]
  pivot-site/src/worker.js → pivot-site/src/lib/automations.js

## Import Cycles
- None detected.

## Communities (104 total, 49 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (95): abCacheKey(), abTestTerminated(), DRIP_PLAN, getAbCache(), getRunningPageTestId(), handleBookingSafetyNet(), handleCheckoutSafetyNet(), handleFlowGenerate() (+87 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (23): base_styles(), build_document(), build_guide(), build_starter_kit(), main(), make_canvas_class(), _draw_header_footer(), save() (+15 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (35): convertImage(), fs, images, path, publicDir, sharp, DEST, fs (+27 more)

### Community 3 - "Community 3"
Cohesion: 0.11
Nodes (21): @remotion/google-fonts, AbuelasIpadComp(), SCENES, Props, RemotionRoot(), ApiScene(), Bands(), Card() (+13 more)

### Community 4 - "Community 4"
Cohesion: 0.10
Nodes (5): extract(), strip_tags(), find_grid(), autocomplete_for(), fix_tag()

### Community 6 - "Community 6"
Cohesion: 0.12
Nodes (30): content_calendar, email_log, emails_sent, events, idx_content_calendar_sched, idx_email_log_lead, idx_email_log_type_status, idx_emails_sent_to (+22 more)

### Community 7 - "Community 7"
Cohesion: 0.13
Nodes (14): appsecret_proof(), auto_ready(), due_posts(), graph(), graph_post(), local_video_path(), main(), post_facebook() (+6 more)

### Community 8 - "Community 8"
Cohesion: 0.10
Nodes (9): breadcrumb_ld(), build(), faq_ld(), li_html(), main(), recipe_ld(), schema_ingredients(), step_html() (+1 more)

### Community 9 - "Community 9"
Cohesion: 0.19
Nodes (15): check_assets(), check_html(), check_js(), check_json(), check_ps(), check_py(), check_spikes(), check_worker_imports() (+7 more)

### Community 11 - "Community 11"
Cohesion: 0.08
Nodes (23): description, devDependencies, sharp, wrangler, engines, node, name, private (+15 more)

### Community 12 - "Community 12"
Cohesion: 0.14
Nodes (20): askHuggingFace(), askOpenRouter(), askSmart(), BANNED, __dirname, loadTemplate(), mdToHtml(), outPath() (+12 more)

### Community 13 - "Community 13"
Cohesion: 0.21
Nodes (19): applyLang(), asMoney(), bindConsent(), bindContactForm(), bindCtaTrack(), bindGuideForm(), bindLangToggle(), consentGiven() (+11 more)

### Community 14 - "Community 14"
Cohesion: 0.19
Nodes (20): ab_assignments, ab_test_events, ab_tests, ab_variants, idx_abassign_subject, idx_abassign_test_period, idx_abevents_test_occurred, idx_abvariants_test (+12 more)

### Community 15 - "Community 15"
Cohesion: 0.18
Nodes (20): content_calendar, emails_sent, events, idx_content_calendar_sched, idx_emails_sent_to, idx_events_name, idx_leads_created, idx_leads_email (+12 more)

### Community 16 - "Community 16"
Cohesion: 0.17
Nodes (10): create_pin(), main(), call(), catalog_map(), create_free_magnet(), load_catalog(), load_config(), main() (+2 more)

### Community 17 - "Community 17"
Cohesion: 0.16
Nodes (10): _api(), demo(), _headers(), load_template(), _onboarding_email(), _seasonal_email(), _seasonal_sequence(), send_flow() (+2 more)

### Community 18 - "Community 18"
Cohesion: 0.13
Nodes (16): d1Exec(), d1ExecFile(), d1Query(), d1QueryFile(), dotenv, event, hasBooking, hasReceipt (+8 more)

### Community 19 - "Community 19"
Cohesion: 0.11
Nodes (17): bothOk, dotenv, encoder, event, insertParams, keyBytes, leadId, now (+9 more)

### Community 20 - "Community 20"
Cohesion: 0.21
Nodes (12): _api(), ensure_automations(), create(), exists(), ensure_emails(), make(), ensure_tags(), _headers() (+4 more)

### Community 21 - "Community 21"
Cohesion: 0.11
Nodes (17): enabled, enabled, deployment, compatibility_flags, target, enabled, type, url (+9 more)

### Community 22 - "Community 22"
Cohesion: 0.19
Nodes (8): _asset_exists(), cta_link(), images_for(), main(), next_slot(), prune(), theme_for(), main()

### Community 23 - "Community 23"
Cohesion: 0.12
Nodes (16): alt, altText, args, c, card(), category, d, emit (+8 more)

### Community 24 - "Community 24"
Cohesion: 0.12
Nodes (16): allowScripts, esbuild@0.28.1, description, prettier, react, react-dom, remotion, @remotion/eslint-config-flat (+8 more)

### Community 25 - "Community 25"
Cohesion: 0.12
Nodes (15): default_agent, permission, bash, edit, external_directory, glob, grep, list (+7 more)

### Community 26 - "Community 26"
Cohesion: 0.13
Nodes (14): description, prettier, react, license, name, private, repository, sideEffects (+6 more)

### Community 27 - "Community 27"
Cohesion: 0.14
Nodes (13): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, jsx, lib, module, moduleResolution, noEmit (+5 more)

### Community 28 - "Community 28"
Cohesion: 0.14
Nodes (13): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, jsx, lib, module, moduleResolution, noEmit (+5 more)

### Community 29 - "Community 29"
Cohesion: 0.17
Nodes (10): counts, img, info, m, png, pngDecode(), strip, svg (+2 more)

### Community 30 - "Community 30"
Cohesion: 0.23
Nodes (6): main(), next_slot(), normalize(), parse_post(), build(), main()

### Community 31 - "Community 31"
Cohesion: 0.18
Nodes (7): sha256Hex(), d1Execute(), d1Query(), dotenv, nowEpoch8, STRIPE_API_KEY, STRIPE_WEBHOOK_SECRET

### Community 32 - "Community 32"
Cohesion: 0.17
Nodes (3): baseEnv, dbStub, noUrl

### Community 33 - "Community 33"
Cohesion: 0.26
Nodes (4): api(), load_token(), local_files_for(), main()

### Community 34 - "Community 34"
Cohesion: 0.27
Nodes (8): ctx, d1Exec(), d1ExecFile(), d1Query(), d1QueryFile(), env, now, sqlFile()

### Community 35 - "Community 35"
Cohesion: 0.24
Nodes (7): buildRequest(), CALENDAR_PATH, here, loadProfile(), main(), pickNextPending(), SCHEDULE_PROFILES

### Community 36 - "Community 36"
Cohesion: 0.27
Nodes (3): main(), png_to_ico(), svg_to_png()

### Community 37 - "Community 37"
Cohesion: 0.22
Nodes (4): m, png, svg, sharp

### Community 38 - "Community 38"
Cohesion: 0.22
Nodes (7): ASSETS, __dirname, markPng, pngMatch, PUBLIC, ROOT, svgSrc

### Community 39 - "Community 39"
Cohesion: 0.22
Nodes (8): name, private, scripts, check, dev, publish, type, version

### Community 40 - "Community 40"
Cohesion: 0.46
Nodes (5): _get_json(), _gumroad_revenue(), _load_env(), main(), _subscriber_count()

### Community 41 - "Community 41"
Cohesion: 0.39
Nodes (5): idx_invoices_milestone, idx_invoices_project, idx_invoices_status, invoices_0013, v_invoice_status

### Community 42 - "Community 42"
Cohesion: 0.25
Nodes (8): dependencies, react, react-dom, remotion, @remotion/cli, @remotion/google-fonts, @remotion/tailwind-v4, tailwindcss

### Community 43 - "Community 43"
Cohesion: 0.52
Nodes (5): idx_invoices_milestone, idx_invoices_project, idx_invoices_status, invoices, v_invoice_status

### Community 44 - "Community 44"
Cohesion: 0.48
Nodes (5): email_log, idx_email_log_lead, idx_leads_nudge_sent, idx_leads_paid_at, idx_leads_stripe_session

### Community 45 - "Community 45"
Cohesion: 0.48
Nodes (5): enqueueWebhook(), fetch(), fetchZapierWebhook(), ISO_NOW(), leadId()

### Community 46 - "Community 46"
Cohesion: 0.33
Nodes (7): processEmailMessage(), processWebhookMessage(), sendResend(), updateEmailTracking(), escapeHtml(), substitute(), queue()

### Community 47 - "Community 47"
Cohesion: 0.29
Nodes (7): dependencies, react, react-dom, remotion, @remotion/cli, @remotion/tailwind-v4, tailwindcss

### Community 48 - "Community 48"
Cohesion: 0.29
Nodes (7): devDependencies, eslint, prettier, @remotion/eslint-config-flat, @types/react, @types/web, typescript

### Community 50 - "Community 50"
Cohesion: 0.29
Nodes (7): devDependencies, eslint, prettier, @remotion/eslint-config-flat, @types/react, @types/web, typescript

### Community 52 - "Community 52"
Cohesion: 0.60
Nodes (3): calendly_bookings, idx_calendly_bookings_email, idx_calendly_bookings_status

### Community 53 - "Community 53"
Cohesion: 0.80
Nodes (4): apply(), current(), init(), syncMeta()

### Community 54 - "Community 54"
Cohesion: 0.40
Nodes (5): scripts, build, dev, lint, upgrade

### Community 56 - "Community 56"
Cohesion: 0.40
Nodes (5): scripts, build, dev, lint, upgrade

### Community 58 - "Community 58"
Cohesion: 0.83
Nodes (3): email_log, idx_email_log_lead, idx_email_log_type_status

### Community 59 - "Community 59"
Cohesion: 0.83
Nodes (3): kv(), kv_file(), seed-kv.sh script

### Community 60 - "Community 60"
Cohesion: 0.83
Nodes (3): expect(), main(), post()

## Knowledge Gaps
- **258 isolated node(s):** `Props`, `DRIP_PLAN`, `MILESTONE_LABELS`, `MILESTONES`, `BUSINESS_TYPES` (+253 more)
  These have ≤1 connection - possible missing edges. (Counts symbols only; 490 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **49 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `sharp` connect `Community 37` to `Community 2`, `Community 11`, `Community 38`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **What connects `Props`, `DRIP_PLAN`, `MILESTONE_LABELS` to the rest of the system?**
  _258 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.07326007326007326 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.07215541165587419 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.048484848484848485 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.10873440285204991 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.0967741935483871 - nodes in this community are weakly interconnected._