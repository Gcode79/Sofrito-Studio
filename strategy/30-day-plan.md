# Strategy — 30-Day Plan (three high-leverage actions only)

> Starting 2026-09-09. Constrained by directive: three actions, no publishing/spending/contacting without sign-off. Each action is listed with outcome, effort, dependencies, and the approval it needs. Success in month 1 is measured by tested pipeline + first real conversations — not revenue, which is `UNKNOWN` this early.

## Action 1 — Prove real demand reaches the funnel (the "lead pool" was QA-only)
- **What:** Re-audit result (2026-09-09): all 15 D1 rows are QA/deploy artifacts — **zero real leads exist**. Action 1 thus becomes: (a) after the leak fixes in Action 2, verify end-to-end that *real* traffic produces correctly-scored D1 leads for a defined window; and in parallel (b) qualify the social-scan enrichment prospects (DavIsa/El Inquieto, Growee, El Chilar HF, Paldy) — the only real people identified. Draft personalized first reach-outs, get sign-off, send within 24h of approval.
- **Outcome:** an evidenced answer to "does the market reach the funnel?" — real leads (or a documented traffic problem via analytics), plus 1–2 enrichment prospects moved into D1 as qualified leads.
- **Effort:** capture verification is automated (D1 query); outreach and any enrichment is owner-time. **Dependency:** owner approval to (a) mark QA rows `discarded` for hygiene and (b) reach out to enrichment prospects.
- **Gate check:** no contacts without a clear reason the prospect is a fit (qualification-rubric); never email a QA record.

## Action 2 — Fix the visible product leaks (3 reversible site/ops fixes)
- **What:** (a) Seed the 14 missing `src/emails/*.html` templates into KV so confirmation/drip/follow-up emails stop being bare subject-lines (pure ops, no product change); (b) add real capture to the three retainer-waitlist CTAs (POST `/api/leads`, package_interest = retainer, source = `waitlist`) so retained demand is no longer lost; (c) stopgap copy on session.html so the "secure checkout" promise matches reality until the real checkout lands.
- **Outcome:** every lead/subscriber interaction becomes brand-grade; retainer intent starts landing in D1; no misleading promise on the site.
- **Effort:** ~2–3 focused sessions. **Dependency:** owner approval for the site edits (a is exempt — data-only).
- **Gate check:** no price changes; AGENTS.md design tokens respected; deploy only after `wrangler deploy --dry-run` passes and owner green-lights.

## Action 3 — Force the booking-checkout decision to yes or no
- **What:** The staged Calendly→webhook→D1 booking + Stripe invoice-billing bundle is fully coded (worker.js routes, migration `0004` applied, booking/cancel email templates seeded). It is gated on four owner inputs: Calendly event URL + webhook signing key, Stripe account + key, and billing mode (charge-at-booking vs invoice-after-call). This action collects those four inputs, then ships the deploy bundle — **or**, if the owner declines, ships stopgap (O2-B) instead and records the deferral in the decision log.
- **Outcome:** sessions become purchasable self-serve (or an honest stopgap). This is what makes Action 1's "$400 door" real.
- **Effort:** ~1–2 hours once inputs exist (deploy is scripted/validated; `npm run check` + dry-run already pass).
- **Dependency:** the four inputs + owner go signal. **Gate check:** this is the single largest deploy → explicit sign-off required before `wrangler deploy`.

## Why not other things (kept out on purpose)
- No new content calendar starts until the pipeline + leaks are fixed (content compounds on a converted pipeline; research gate needs sources loaded).
- No Tier 3 / course / Gumroad activity (undecided; pivot confinement).
- No paid ads / TikTok spend (`UNKNOWN` budget, no research) — organic + existing funnel only.
- No La Mesa / pricing changes (needs research, not velocity).

## Week-by-week
| Wk | Focus |
|---|---|
| W1 | Action 1 triage pass + draft replies; Action 2a seed templates; gather Action 3 inputs |
| W2 | Action 1 replies out (post sign-off); Action 2b waitlist capture + 2c stopgap copy; Action 3 input deadline |
| W3 | Action 3 deploy or defer decision lands; first session bookings/pipeline health visible in D1 scorecard |
| W4 | Review: leads contacted %, session bookings, retainer intents captured, email open quality; recalibrate 30-day targets in `ops/scorecard.md` |

## Success criteria (by day 30)
- ≥5 real leads captured from live traffic post-fix (or a documented, evidenced reason it's a traffic problem, e.g. analytics ≈ 0 sessions).
- 1–2 enrichment prospects (social scan) qualified into real conversations.
- ≥3 Sofrito Session bookings (self-serve or invoice-after) OR ≥1 qualified project conversation.
- Waitlist capture live on-site; ≥3 retainer intents recorded.
- All 16 email templates live in KV; no placeholder emails in a 7-day sample.
- One of these recorded: (a) booking checkout deployed, or (b) explicit deferral logged with stopgap shipped.