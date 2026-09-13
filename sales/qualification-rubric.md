# Sales — Qualification Rubric (D1 intake + enrichment prospects + all future inflow)

> Applies to future real D1 intake and the known enrichment prospects. As of 2026-09-09 the D1 pool contained zero real leads (15/15 QA/deploy artifacts, re-audited), so this rubric is the standing tool for the first real captures. The rubric maps to the scoring system already live in the worker (`scoreLead`, weights below), so a D1 lead's `score` is the starting sort key. **Nothing here authorizes contacting anyone** — send only after OD1 sign-off.

## Scoring system currently live (D1 `score`, 0–100)
| Factor | Weight | Notes |
|---|---|---|
| package_interest set | 30 | Concrete = high intent |
| budget set | 20 | Gates affordability |
| message ≥30 chars | 25 | Effort = seriousness |
| business_name present | 15 | Real business, not a survey |
| phone present | 10 | Willing to talk |
| stage + timeline set | 20 | Has a fire |
| decision = owner-operator | 5 | Can say yes today |
| **max** | **100** | |

An untouched lead is already scored at ingest; triage = verify that score against the rubric below.

## Tiering (primary: fit → budget → timing)
| Tier | Definition | Action | Response target |
|---|---|---|---|
| **A** | Fit (food business) + budget ≥ $2,500 + timeline ≤ quarter | Reply 1:1, offer Sofrito Session ($400) as the paid door OR direct project qual; push to `/api/leads/` PATCH `qualified` | Same day |
| **B** | Fit + budget/timing vague or session-only | Nurture: Digital Guide + session invite; PATCH `contacted`; drip already runs | ≤24h |
| **C** | Weak fit (not food, hobbyist, "thinking in 6 mo") | Guide auto-drip only; no manual reply; PATCH `contacted` | None |
| **Discard** | Test/fake/junk | PATCH `discarded`; don't email | — |

## Fit check (aspects the reply must confirm, not assume)
- Is it a **food business** (restaurant/truck/CPG/salsa/specialty/catering)? Out of niche → C at best.
- Is the **12-month economic reality** plausible (not a pre-idea)? Stage that says "just planning" with no business_name → C.
- Is the budget real? `under-2500` with package `plato` = the Session story, not a $5k project.
- **Decision power:** owner-operator is the strongest signal (+5 in score) — a hired-marketing lead is a longer sales loop.

## First-reply skeleton (draft — not for sending without OD1 sign-off)
1. 2-line acknowledgment that names THEIR food/business (never a template opener).
2. One honest observation from their message (shows the form is read).
3. The path: "If you want a direct read, the Sofrito Session is $400/90-min and the cost applies to a project if you move forward."
4. A single question to qualify the deal's shape (budget confirm OR timeline hard-date).
5. Reassure the 24-hour promise and the no-sequence guarantee.

## Known qualified-looking leads already surfaced (from `analysis/social-leads-2026-09-07.md`)
> These came from a social-lead scan, NOT the D1 pool. Treat as enrichment leads: verify fit/activity before ranking. Contacts NOT yet enriched (GooseWorks was down at scan time).
| Lead | Category | Fit for |
|---|---|---|
| DavIsa Group / El Inquieto | brand / salsa CPG family | Tier A — The Sofrito or Plato; later content retainer |
| Growee Foods | packaged/convenience | Tier A — Plato; retainer for launch |
| El Chilar HF | salsa brand | Tier A — launch investment; conform to language/brand depth |
| Paldy | emerging food brand | Tier B — verify scale, likely session-first |

## Post-triage protocol
- Every PATCH changes D1 `status`; weekly snapshot lives in `ops/scorecard.md`.
- When a lead becomes `won`, record the invoice in D1 immediately (data hygiene rule) and the case study becomes portfolio material.
- Never move a lead to `won` without a signed agreement (client-templates/ exist for this).