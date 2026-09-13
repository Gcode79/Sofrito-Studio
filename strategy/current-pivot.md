# Strategy — Current Pivot State (verified 2026-09-09)

> Status: baseline document for the Profitable Operations Directive. Every number below was pulled from the live site, worker code, KV, and D1 on 2026-09-09 — not from memory. Items marked `UNKNOWN` are genuine gaps, not assumptions.

## Positioning (verified from public site)
Brand studio for food businesses — restaurants, CPG/salsa, food trucks, specialty food. Cultural storytelling through brand identity, websites, and content systems. Tagline live: "Brand foundations for food businesses." Origin story: started in the grandmother's kitchen; voice rejects "recipe brands" in favor of real food-business brands.

## Live offer ladder (prices verified in services.html + KV packages/*)
| Offer | Price | Billing | Status on site |
|---|---|---|---|
| Sofrito Session | $400 / 90 min | one-time | Bookable CTA → contact form (no checkout) |
| The Sofrito — Brand Identity | $2,500 | one-time | "~3 weeks", 1 revision round |
| The Plato — Brand + Website | $5,000 | one-time | MOST POPULAR badge |
| La Mesa — Full Launch | $7,500 | one-time | **BY REFERRAL ONLY** |
| Essentials retainer | $1,500/mo | monthly | On waitlist — **no capture mechanism** |
| Growth retainer | $2,500/mo | monthly | On waitlist — **no capture mechanism** |
| Fractional retainer | $4,000/mo | monthly | On waitlist — **no capture mechanism** |
| Tier 3 digital products ($197–$497 course, $27–$97 templates) | — | — | Not built; owner approval required to revive |

- Brand Foundation (a named offer in research) has **no price and no deliverables defined anywhere** — open founder decision.
- Retainer "waitlist" CTAs on services.html are inert spans — they do not email anyone, write to D1, or capture a lead. Meaning: the entire retainer business is un-sellable from the site today.

## Pipeline state (verified live 2026-09-09)
| Metric | Value | Source |
|---|---|---|
| Leads in D1 | 15 — **all QA/deploy artifacts** (see next rows) | D1 `leads` full pull 2026-09-09 |
| Verified real leads | **0** — every row re-audited as test (DEBUG/S1/E2E Verify, Zapier/Hook tests, Live Publish/Deploy Verify, founder self-test) | D1 full pull 2026-09-09 |
| Interest mix | QA records chose `sofrito`/`plato` to test scoring — **not** evidence of demand | D1 |
| Lead window | 2026-09-05 (pipeline tests) + 2026-09-08 06:44–07:51 (deploy-window tests) | D1 |
| Newsletter subscribers | 9 | D1 `newsletter_subscribers` |
| Emails sent (queued pipeline) | 54 | D1 `emails_sent` |
| Calendly bookings | 0 | D1 `calendly_bookings` |
| Invoices | 0 | D1 `invoices` |
| Revenue entries | 0 | D1 `revenue` |
| Lead routing | /api/contact → D1 → `lead.new` webhook → Make scenario (ACTIVE 6162070) | worker.js + business-model.md |
| Lead scoring | Live on ingest (package/budget/message/business_name/phone/stage/timeline/decision), max 100 | worker.js `scoreLead` |

**Interpretation (corrected):** the containment pipeline works end-to-end and was successfully tested — but the entire D1 lead pool is QA/deploy verification records, not customer inquiries. **Zero real demand evidence exists yet**, and zero money is on record. The single biggest gap is therefore: **prove real traffic reaches and converts the funnel**, and get one or two real conversations started (enrichment prospects from the social scan are the only real people identified).

## CRM email delivery issue (verified — REAL defect)
- `src/emails/` contains 16 HTML templates (welcome-1/2/3, form-confirm, follow-up-*, new-lead-notify, invoicing, booking, revenue, onboarding-pack).
- Only **2** are seeded to KV (`templates/emails/booking-notify.html`, `booking-cancel-notify.html`).
- `processEmailMessage` falls back to `<p>{subject}</p>` when the KV template is missing (worker.js:224-225).
- Visible harm: the welcome drip (day 2/5/9), contact-form confirmation, and lead-follow-up emails are being delivered as **bare subject-line emails** to leads and the owner. 54 "emails_sent" records are therefore mostly placeholder bodies.
- Fix (safe, reversible): seed the remaining `src/emails/*.html` into KV. No code change.

## Config verified in KV
- `site/config`: session_url = null, booking_url = null → booking/web checkout is OFF; session CTA falls through to contact form.
- Features on: `lead-capture`, `newsletter`, `email-drip`.
- Feature keys exist (off/pending): `case-study-drafts`, `social-pipeline`.
- `drip/schedule`: welcome drip day 2/5/9 (templates missing in KV as noted).
- `make/lead-topic` = `lead.new`.
- Packages in KV match public prices exactly.

## Proof / portfolio state (honest)
- 3 work items, all clearly labeled: 1 self-case-study (own rebrand recipe-blog → studio) + 2 spec concepts (salsa, restaurant).
- **No paid client work exists yet.** Proof of capability is real but self/spec only — a qualification constraint, not a blocker, for the first 1–2 clients (price accordingly / offer strong deliverables).

## Social presence (unverified depth)
- Footer links: Instagram, Facebook, Pinterest (all `sofritostudio` handles; Pinterest profile-link only, board not set). TikTok analytics pixel + Events API configured; posting token empty (analytics only). Follower/engagement figures NOT verified — `UNKNOWN`.

## Open founder decisions (blocking execution)
1. Brand Foundation: price + deliverables, or drop from ladder.
2. Retainer waitlist: add capture (email → D1 lead) so waitlist stops leaking.
3. Calendly URL + webhook signing key, Stripe account, billing mode (charge-at-booking vs invoice-after) → unlock the staged booking deploy.
4. Enrichment prospects vs a pure capture-validation move: approve outreach to the 2026-09-07 social-scan prospects (DavIsa/El Inquieto, Growee, El Chilar HF, Paldy) as the real-demand source.
5. La Mesa referral-only: confirm as exclusivity policy or open it.
6. Tier 3 digital products: approve, defer, or kill.

## Cross-cutting constraints in force
- Research gate: any content/decision must be grounded in the research base (`research/sources.md`) before commit.
- Pivot confinement: no revival of the old $47-product/retail model. Legacy marketing docs (`marketing/general/kpi-scorecard.md`, `marketing/content_calendar/calendar.md`) still describe the old pile and must be reconciled or archived.
- Sign-off: no publishing, deploying, spending, or contacting anyone without owner approval (this document is advisory input to those decisions, not an execution order).