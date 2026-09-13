# Business Analysis & Decision Frameworks

Use these templates when you need to propose or record a material decision, experiment, or research finding.

---

## Decision Memo Template

Write this format every time you propose a decision. Post it in the issue, PR, or directly as a comment in `ops/decision-log.md`.

```markdown
## Decision Memo: <short title>

**Status:** Proposed | Approved | Rejected | Deferred | Executed

**Decision:** <one sentence: what are we deciding?>

**Reason (evidence):**
- `VERIFIED` — we have 42 active users (D1 query 2026-09-13)
- `INFERENCE` — if we launch feature X, adoption should grow 10%
- `ASSUMPTION` — 10% adoption rate (no data; industry benchmark is 8–15%)
- `UNKNOWN` — TikTok ad cost. Need: SMB creator spending data.

**Alternatives considered:**
| Option | Why not chosen |
|--------|--------|
| Don't do it | Too risky if demand exists |
| Launch to 10% of users first | Delays feedback; slow learning |

**Cost / Impact:**
- Dev time: 2–3 days
- Revenue impact: +$500/mo if successful
- Risk: Diverts focus from current roadmap

**Risks (labeled):**
- `ASSUMPTION (40%)` — adoption rate may be 2%, not 10%
- `UNKNOWN` — integration with payment system may uncover bugs

**Owner approval:** 
- Proposed: Founder
- Approved: (date) or Pending
- Not required

**Result / Follow-ups:**
- (After execution: what happened? Did metrics match the assumption?)
```

Append approved memos to `ops/decision-log.md`. Keep one final approver: the founder.

---

## Options Analysis Template

When you're facing a choice, present it this way:

```markdown
## Options: [Problem]

**Context:** Why are we deciding this now?

| Option | Description | Cost/Effort | Time-to-value | Risk | Recommended? |
|--------|-------------|-------------|-------------------|------|------------|
| A: Launch immediately | Ship with current feature set | 1 day | 1 week | High: may have bugs | No |
| B: Delay 2 weeks for QA | Full test cycle + user feedback | 5 days | 3 weeks | Low: fewer regressions | **YES** |
| C: Ship to 10% first | Canary launch, monitor metrics | 3 days | 2 weeks | Medium: ramp-up risk | Maybe |

**Recommendation:** Option B. Evidence: last launch had 3 production bugs that cost 4 hours to fix. QA cost (2 days) < repair cost (4 hours + reputation). Confidence: HIGH.
```

---

## Experiment Definition Template

Use this when proposing an A/B test or measurement:

```markdown
## Experiment: [What are we testing?]

**Hypothesis:** [Specific and falsifiable]
- Example: "Changing CTA color from blue to red will increase click rate by ≥15%"

**Primary metric:** [One number that decides pass/stop]
- Example: "Click-through rate on the CTA button"

**Guardrail metrics:** [Things that must NOT break]
- Example: "Bounce rate must not exceed 5%"

**Thresholds:**
- Pass: CTR ≥ 20% (vs. current 12%)
- Stop: CTR < 12% or bounce rate > 5%

**Duration:** 2 weeks (or until 500 clicks)

**Sample size:** 1000 users per variant

**Known biases/confounds:**
- Holiday traffic may skew results
- TikTok referring traffic is younger (may not convert same as blog readers)

**Owner approval:** Founder
```

---

## Research Report Template

When you pull together evidence for a decision:

```markdown
## Research: [Topic]

**Date:** 2026-09-13  
**Confidence:** Medium (some primary sources, one assumption)

### Findings

1. **Market Size:** $50M/year (US only) — `VERIFIED (90%)`
   - Source: Statista, published 2026-08-01
   - Query: "food-service-software market size"

2. **Customer pain point:** 70% of SMBs report inventory tracking as top burden — `VERIFIED (85%)`
   - Source: SMB survey, 2026-06-15 (our D1 customer feedback)
   - Caveat: Our sample is 12 customers; may not generalize

3. **Competitor average pricing:** $200–400/mo — `INFERENCE (80%)`
   - Verified pricing from 5 competitors
   - Assumption: smaller competitors charge less; we assumed $300 midpoint

### Conclusion

There is a real problem and customers will pay. We are priced competitively.

### Next steps

- Confirm with 3 more SMBs (different segments)
- Test messaging with prospecting email
```

---

## Weekly Review Template

Founder updates this every week (or every other week):

```markdown
# Weekly Review — 2026-09-13

## Progress on Current Focus
(From `ops/now.md`)

- [ ] Objective 1: Result (did we get it done? blockers?)
- [ ] Objective 2: Result

## New Decisions Logged
- Decision Memo: Launch Feature X (Approved, 2026-09-12)
- Decision Memo: Hire contractor for video (Deferred)

## Key Metrics
(From `scorecard.md`)
| Metric | This week | Last week | Trend |
|--------|-----------|-----------|-------|
| Revenue | $X | $Y | ↑ |
| Customers | N | M | ↓ |

## Surprises & Learnings
- More churn than expected: need to investigate retention.
- Customer feedback on feature X was 3× more positive than assumed.

## Update to Financial Model?
- Yes / No (if yes, link PR or note changes)

## Blockers for Next Week
- (Update `ops/now.md` with new blockers)
```

---

## Truth Claim Labels (Used in All Templates)

When writing any analysis, use these labels consistently:

| Label | Meaning | Example |
|-------|---------|----------|
| `VERIFIED` | Backed by first-hand data pull (own DB, live API, official source) | D1 query returning 42 customers |
| `INFERENCE` | Reasoned from verified facts, no direct observation | "If 42 customers convert at 10%, that's 4.2 sales" |
| `ASSUMPTION` | Taken as true without evidence; flagged as risk | "Assuming 10% conversion rate" |
| `UNKNOWN` | No evidence available; state what would be needed | "Unknown: cost of TikTok ads. Need: benchmark from SMB creators." |

Optional: Add confidence level.
- `VERIFIED (98%)` — high confidence
- `ASSUMPTION (40%)` — low confidence, big risk

---

## Evidence Hierarchy (Best to Worst)

When gathering facts for a decision:

1. **Reproduced D1 queries + KV reads** — I ran it this session
2. **Fresh official docs + live API calls** — Current + authoritative
3. **Cached/secondhand accounts** — Old data, but was accurate once
4. **Inference from verified facts** — Logical reasoning on solid ground
5. **Assumption** — No evidence; flagged as risk

---

## Quick Checklist: Before Proposing a Decision

- [ ] **Evidence gathered?** D1 query, research, or competitor analysis
- [ ] **Truth claims labeled?** Each fact is VERIFIED, INFERENCE, ASSUMPTION, or UNKNOWN
- [ ] **One decision, clearly stated?** Not "should we do X, Y, and Z"
- [ ] **Alternatives considered?** At least 2 options
- [ ] **Risks named with confidence?** Not "it could fail" but "`ASSUMPTION (60%)` adoption may be 2% not 10%"
- [ ] **Cost/impact quantified?** Days, dollars, user impact
- [ ] **Approval path clear?** Who decides? What do they need?
- [ ] **Success metric defined?** How will we know if this worked?