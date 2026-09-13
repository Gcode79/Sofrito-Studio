# Research — Sources Base (reference + validation gaps)

> The research gate (business-model.md) requires every decision to be grounded in research. This file is the index: what is already cited/evidenced, what is pending, and where the base is thin. Entries are honest about provenance — "benchmarked" means a real comparison was performed and is on record; "pending" means it has not happened.

## Already grounded (on record)
| Subject | Basis | Where it lives |
|---|---|---|
| Session pricing ($400/90-min, $267/hr effective) | established-consultant benchmark band ($300–600 for 90-min) from earlier session-pricing research; site copy live | business-model.md D1 + services/session pages |
| Stripe vs Gumroad for sessions | cost comparison at $400 ($11.90 vs ~$52) + B2B invoice expectation + US services tax posture | business-model.md D2 |
| Lead scoring weights | engineering-derived intent signals (package/budget/effort/decision-power), tuned to this pipeline | worker.js `DEFAULT_WEIGHTS` + KV `scoring/weights` |
| Referral-only positioning research | pretext supporting La Mesa exclusivity | **to be re-validated** (OD5 pending) |
| Content/posting gate | platform-exact image specs enforced by `pivot-site/scripts/` generators | pivot-site scripts (gate fails non-zero) |

## Live data currently being produced (fresh research, must keep flowing)
| Feed | Purpose | Status |
|---|---|---|
| D1 leads (15 rows) | **All 15 re-audited 2026-09-09 as QA/deploy artifacts (test names, test sources, deploy-window timestamps; founder self-test row). Zero verified real inquiries.** Demand signal: NONE YET | re-audit at first real-traffic milestone |
| Newsletter (9 subs) + guide conversions | Magnet health, content-to-lead rate | accumulate |
| Social lead scan (2026-09-07) | Tier A enrichment candidates (DavIsa/El Inquieto, Growee, El Chilar HF, Paldy) | scan done; enrichment pending (GooseWorks was down) |
| Analytics/events pipeline | Page views, CTA clicks, TikTok events (`TEST95993`) | UNKNOWN — extract first real report |

## Validation gaps (research still owed before certain decisions)
| # | Question | Needed for | Priority |
|---|---|---|---|
| R1 | Brand Foundation price & scope band (proposed $1k–$1.5k) | OD4 decision | High |
| R2 | Retainer-demand volume for $1.5k–$4k/mo content retainers specifically in food-brand niche | OD2 + scenario A/B fill-rates | High |
| R3 | Referral-incentive benchmarks (what makes a food-brand client actually refer) | OD5 La Mesa policy | Med |
| R4 | Competitor ad intel / positioning sweep (food-brand studios: what they offer, message, price) | Messaging + differentiation refresh | Med |
| R5 | Session pricing validation at $400 after first 3 sessions (survey questions to ask) | D1 revisit | Med (after first wins) |
| R6 | Cost baseline research (Resend plan, Zapier/Make, tooling, any freelancer rates) | `ops/financial-model.md` section 1–2 | Low but loads the model |

## Research procedure (standing)
1. State the question (reference R#).
2. Pull ≥3 independent sources where external claims are involved; prefer primary data (own D1/analytics) over opinion pages for demand questions.
3. Record the finding + source link in an evidence line; label confidence (evidence / starting_point).
4. Only then does the decision enter `ops/decision-log.md` (to close the gate).

## Explicit non-sources
- The legacy repo's old-model docs (retail pricing, Gumroad KPIs) — retired by pivot confinement; not admissible as market evidence.
- Any un-labeled personal opinion replacing a data point — flag as `starting_point`, never present as evidence.