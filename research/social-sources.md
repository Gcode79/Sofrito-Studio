# Research — Social Sources Log (System; Draft — Awaiting Founder Approval)

> Evidence log for every external claim this social system relies on. A claim without a source here is treated as UNKNOWN and cannot be used in content until verified.

## How to use
- Each entry: claim → source (URL/date/fact) → verification status (VERIFIED / INFERENCE / ASSUMPTION / UNKNOWN) → confidence.
- Add sources BEFORE a post citing an industry fact, statistic, or platform behavior. No sourced-claim, no stat.
- This log is the tie-breaker for the "research gate" in `AGENTS.md`.

## Verified internal grounding (from `ops/` + `strategy/`, 2026-09-09)

| # | Claim | Source | Status |
|---|---|---|---|
| S01 | Offer prices as in content-library | `services.html`, KV `packages/*` | VERIFIED |
| S02 | 15 D1 leads, 15/15 QA artifacts; 0 real leads; 0 revenue | D1 full pull 2026-09-09 | VERIFIED |
| S03 | Newsletter subscribers = 9 | D1 `newsletter_subscribers` | VERIFIED |
| S04 | Social: IG/FB/Pinterest linked; TikTok analytics-only (no posting token) | `strategy/current-pivot.md` (site+config 2026-09-09) | VERIFIED |
| S05 | Proof state: self-case-study + 2 spec concepts only | `strategy/current-pivot.md` | VERIFIED |
| S06 | No fabricated results/client claims permitted | `AGENTS.md` + pivot rules | VERIFIED (standing rule) |
| S07 | Calendly/Stripe not live; site checkout gaps | `current-pivot.md`, `offer-optimization.md` | VERIFIED |
| S08 | TikTok "analytics only" — no content until post token + assets exist | config 2026-09-09 | VERIFIED |

## External claims — currently none elevated to use
> No industry statistics, competitor claims, or platform data are approved for content yet. Any proposed stat must be added here first (claim → source → verified) and reviewed with the founder before it appears in a post.

## Template for new external sources
```
**Claim:** ...
**Source:** <URL / publication / date> 
**Verification status:** VERIFIED / INFERENCE / ASSUMPTION / UNKNOWN
**Confidence (0–1):** ...
**Reviewed with founder:** yes / no
```

## Rules
- The word "verified" in content traces to an entry in this file.
- Anything that can't be sourced gets rewritten or cut — never presented as fact.