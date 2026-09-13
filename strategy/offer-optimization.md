# Strategy — Offer Optimization (current state + options, 2026-09-09)

> Purely analytical input for owner decisions. Nothing here changes prices, launches, or copies without sign-off. The research gate applies: validate each option against the research base before implementing.

## Where the ladder is strong
1. **Clear progression with honest pricing** — Session → Sofrito → Plato → (referral) La Mesa maps to escalating scope. Budget options on the contact form ($2,500–$7,500+) align with package prices, so the form itself pre-qualifies.
2. **Price points are market-credible** for a US food-brand studio: $400 intro session, $2.5k–$7.5k projects, $1.5k–$4k retainers. No evidence they are out of band. Do not move these without research.
3. **Single decision-maker signal** is already captured (owner-operator) and contributes to lead score — good sales hygiene baked into the form.
4. **Free Digital Guide** ("brand-in-three-weeks") is the lead magnet feeding `/api/newsletter`.

## Where the ladder leaks (verified gaps)
| # | Gap | Evidence | Impact |
|---|---|---|---|
| G1 | Retainer waitlist = inert `<span>` CTAs | services.html, no href/JS | Retainer MRR cannot be sold from the site; every waitlist intent lost |
| G2 | Session promises checkout but has none | session.html ("Secure checkout · instant confirmation · money-back") CTA → /contact.html | The highest-margin, lowest-commitment offer can't be booked directly; promise/mismatch risk |
| G3 | Brand Foundation undecided | no price/deliverables anywhere | A natural $1k-ish entry/upsell slot is empty; mid-market gap between Session and Sofrito |
| G4 | La Mesa "most booked" (business-model.md) vs "BY REFERRAL ONLY" (site) | inconsistent docs | Strategy ambiguity: is volume or scarcity the intent? |
| G5 | D1 lead pool = 15/15 QA/deploy artifacts; zero verified real leads; no real-traffic evidence | D1 re-audit 2026-09-09 | The pipeline has never processed a real inquiry — demand is unproven |
| G6 | Welcome/confirmation/follow-up emails are bare subject-lines | KV missing 14/16 templates | ROI of every lead & subscriber is silently deflated by presentation |
| G7 | Legacy marketing docs still describe old $47 product model | kpi-scorecard.md, calendar.md | Confuses growth planning; violates clean pivot narrative |
| G8 | Tier 3 (course/templates) proposed but unpriced/unbuilt | business-model.md | Option exists, no owner decision on it |

## Optimization options (for owner decision; each is reversible or gated)
### O1 — Capture the waitlist (highest ROI, ships fast)
Add a real form action on services.html waitlist CTAs → `/api/leads` (existing endpoint, PATCH-supported) with package_interest = retainer name, source = `waitlist`. No new infra. This converts G1 into a sellable queue. **Needs sign-off** (site change).

### O2 — Close the session checkout gap
Either (A) deploy the staged Calendly + webhook + Stripe-invoice bundle (already coded, migration applied, emails seeded) once Calendly URL + signing key + Stripe + billing decision are provided; or (B) soften session.html copy to match the contact-form reality ("Book via contact — we'll send a booking link") so promise ≠ broken promise. A is the real fix; B is the stopgap that should ship regardless.

### O3 — Decide Brand Foundation (G3)
Suggested framing for the decision (not a presumption of price): a fixed-scope, ~3-week deliverable between Session and Sofrito. Options for owner: price it ($1,000–$1,500 band is a defensible zone to research, label UNKNOWN until researched), fold it into Sofrito, or drop it. If kept, add to services.html + KV packages/ + contact form package_interest list.

### O4 — Seed the 14 missing KV email templates
Pure ops fix; no site/pricing change. Should happen before the next lead campaign so every email that goes out is brand-grade.

### O5 — Reconcile the offer story (G4)
Pick one: La Mesa as scarcity (referral-only, matches "most booked" narrative as *requested* exclusivity) or as volume (open + featured). If scarcity, the real lever is a **referral incentive** for Sofrito/Plato clients, not a web listing. Decision belongs to owner.

### O6 — Resolve Tier 3 (G8)
Approve → define price/scope + a delivery slot that doesn't cannibalize project month capacity; defer; or kill (archives the legacy docs referencing it). No content should mention Tier 3 until decided.

## Sequencing recommendation (for the 30-day plan)
1. **Verify real capture + qualify enrichment prospects** (D1 pool was QA-only; the 2026-09-07 social scan found the only real prospects) — highest, fastest evidence of demand.
2. **Seed KV email templates + fix waitlist capture + stopgap session copy** — singly expeditable site fixes, each reversible, each removes a visible leak.
3. **Deploy staged booking checkout** once the four owner inputs land (see decision-log).

## What NOT to do
- Do not reprice any live offer without fresh pricing research.
- Do not launch Tier 3 analog products on Gumroad again without an owner decision (pivot confinement).
- Do not present spec work as client work anywhere.