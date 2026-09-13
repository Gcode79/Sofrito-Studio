## Operating files (keep current)
`ops/now.md` · `ops/scorecard.md` · `ops/financial-model.md` · `ops/decision-log.md` · `ops/weekly-review.md` · `ops/sops/` · `strategy/` · `sales/` · `growth/` · `research/` · `business-model.md`

## Persistent Business Memory

- `ops/now.md` — current focus + blocker.
- `ops/scorecard.md` — the key metrics we track.
- `ops/financial-model.md` — cost/revenue drivers and scenarios.
- `ops/decision-log.md` — every decision memo, approved or not.
- `ops/weekly-review.md` — weekly evidence review.
- `ops/sops/` — standing procedures (deploy, run experiments, etc.).
- `strategy/` — positioning, offering, and plans.
- `sales/` — qualification rubric, pipeline state.
- `growth/` — content calendar, campaigns, outreach.
- `research/` — evidence files with a `sources` feed.
- `business-model.md` — core business model.

## Decision Memo Format

Write a decision memo in this exact format whenever you propose or log a material decision.

```markdown
## Decision Memo: <name>
**Status:** Proposed | Approved | Rejected | Deferred | Executed
**Decision:** <one sentence>
**Reason (evidence):**
- <label> fact 1
- <label> fact 2
- <label> inference

**Alternatives considered:** | Option | Why not chosen |
**Cost/Impact:** ...
**Risks (labeled):** ...
**Owner approval:** Pending | Given (date) | Not required
**Result / follow-ups:**
```

Append memos to `ops/decision-log.md`. Keep one approver, the founder. A rejected memo stays in the log with its reason; decisions get re-verified at the weekly review.