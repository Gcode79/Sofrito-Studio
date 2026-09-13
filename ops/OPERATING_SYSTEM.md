# Sofrito Studio Operating System

This file is the index of how decisions, operations, and business state flow through the repo.

## Decision & Approval Flow

1. **Agent identifies a decision** (e.g., should we launch feature X?).
2. **Agent gathers evidence** (D1 queries, market research, cost estimates).
3. **Agent proposes** using a Decision Memo (see `FRAMEWORKS.md`).
4. **Founder approves, rejects, or defers** (recorded in the memo).
5. **Decision logged** in `ops/decision-log.md` with status.
6. **Weekly review** examines decisions + updates scorecard and financial model.

---

## File Organization

```
ops/
  OPERATING_SYSTEM.md    (you are here)
  FRAMEWORKS.md          (templates)
  now.md                 (current focus)
  scorecard.md           (metrics)
  financial-model.md     (cost/revenue drivers)
  decision-log.md        (approvals)
  weekly-review.md       (lessons)
  sops/                  (procedures)
strategy/
  (positioning, roadmap, plans)
sales/
  (customer qualification, pipeline)
growth/
  (campaigns, content calendar, outreach)
research/
  (evidence files, sources)
```

---

## Authoritative Files (Keep These Current)

| File | Role | Owner | Updated |
|------|------|-------|----------|
| `ops/now.md` | Current focus + blockers. Read this first when you start work. | Agent or Founder | Weekly (or when blocker changes) |
| `ops/scorecard.md` | Key business metrics we track (revenue, customer count, churn, etc.). | Founder | Weekly review |
| `ops/financial-model.md` | Cost drivers, revenue scenarios, unit economics. | Founder | Monthly or post-decision |
| `ops/decision-log.md` | Every decision memo, approved or rejected. Source of truth for what we've decided and why. | Agent (proposes), Founder (approves) | Per decision |
| `ops/weekly-review.md` | Evidence review: what changed, what surprised us, what we learned. | Founder | Every week |
| `ops/sops/` | Standing operating procedures (how to deploy, run experiments, etc.). | Founder or Agent | As practices change |
| `strategy/` | Positioning, offering, roadmap. | Founder | Quarterly or post-major-decision |
| `sales/` | Qualification rubric, pipeline state, customer feedback. | Founder | Per deal |
| `growth/` | Content calendar, campaigns, outreach logs. | Agent or Founder | Weekly |
| `research/` | Evidence files: market research, competitive analysis, sources. | Agent | Per research project |
| `business-model.md` | Core business model: who we serve, value prop, how we make money. | Founder | Annually or post-pivot |

---

## How It Fits Together

**Decisions drive the business forward.** Each decision flows through this loop:

1. **Detection:** An Agent (or Founder) identifies a choice (launch a feature? pivot pricing? hire someone?).
2. **Evidence:** Agent gathers data, runs D1 queries, researches competitors, gets feedback.
3. **Proposal:** Agent writes a Decision Memo using the template in `FRAMEWORKS.md`.
4. **Approval:** Founder reads memo and approves, rejects, or defers.
5. **Logging:** Memo is appended to `ops/decision-log.md` with status and date.
6. **Impact:** Scorecard, financial model, and `ops/now.md` are updated if the decision changes operations.
7. **Review:** Every week, Founder reviews decisions in the log and updates `ops/weekly-review.md` with learnings.

**This creates a decision trail.** You can always see what was decided, when, by whom, and why.

---

## When You Need to Make a Decision

1. Check `ops/now.md` — is this the current focus? If not, is it more urgent?
2. Search `ops/decision-log.md` — has this been decided already?
3. Read the relevant framework in `ops/FRAMEWORKS.md`.
4. Gather evidence (D1, research, competitors, etc.).
5. Write a Decision Memo (see `ops/FRAMEWORKS.md`).
6. Propose to founder (submit memo or link in PR/issue).
7. Log the approved memo in `ops/decision-log.md`.
8. Update `ops/scorecard.md`, financial model, or `ops/now.md` if needed.

---

## Weekly Review Ritual

Every week (or every two weeks), the founder:

1. Reads `ops/now.md` (did we make progress on the blocker?).
2. Reviews new Decision Memos in the log.
3. Checks key metrics in `ops/scorecard.md`.
4. Writes a few lines in `ops/weekly-review.md` (what surprised us? what did we learn?).
5. Updates `ops/financial-model.md` if revenue/costs shifted.

---

## Projects & Isolation

Each major project has its own folder with its own stack:

- **`pivot-site/`** — Cloudflare Worker + D1 + KV + Stripe/Resend. See `pivot-site/README.md` for setup.
- **`remotion-abuelas-ipad/`** — Video generation tool.
- **`video-ads/`** — Ad production experiments.
- **`legacy-site-v1/`** — Archive (read-only).

See root `README.md` for which projects are active.

---

## Tooling

**Scripts** (`scripts/`):
- Data pipelines (build recipes, generate PDFs, extract content)
- Content generators (Spanish recipes, ePub builders)
- Active, maintained utilities (not one-time fixes)
- Index: `scripts/scripts-docs.md`

**Maintenance** (`scripts/maintenance/`):
- One-off fixes and migrations
- Site maintenance and validation
- Should be archived or deleted after confirming no dependencies
- Index: `scripts/maintenance/maintenance-docs.md`

**Tools** (`tools/`):
- JavaScript utilities for build, sync, convert
- Deployment and configuration helpers

**Automations** (`pivot-site/automations/make/`):
- Make.com scenarios (drips, case study drafts, content pipeline, etc.)
- See `pivot-site/automations/make/README.md` for the scenario catalog

---

## Secrets & Credentials

- **Authoritative source:** `pivot-site/.env.example` (sanitized template).
- **Local dev:** Create `.env` locally; never commit.
- **Production:** Stored as Cloudflare Secrets or GitHub Secrets. Ask founder.
- **Rule:** Never log, print, or transmit credentials.
- **Reference:** See `.opencode/agents/PERMISSIONS.md` for full guardrails.