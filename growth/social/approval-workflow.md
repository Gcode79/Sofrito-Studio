# Growth / Social — Approval Workflow (System Gate — how Draft becomes Publishable)

> The single gate between this system and the real world. No post, comment, DM, follow, story, pinned item, bio change, or paid action runs without a completed approval record.
>
> **Current status:** CTA-2026-09-11-B01 ✅ approved for publish 2026-09-11 (all 7 ads × 4 footer platforms, manual). SP-01/02/03 carousel drafts approved for content; publish still pending per-post go. All other drafts marked `Draft — Awaiting Founder Approval`.

## Flow

```
  DRAFT (system owner)  ──►  GATE CHECK (complete checklist)  ──►  APPROVAL REQUEST (founder)  ──►  APPROVED record  ──►  publishing agent (holds tool scope)
        ▲                                                                                                                  │ (post-by-post)
        └──────────────────────── revision loop ───────────────────────────────────────────────────────────────────────────┘
```

## The approval request must include (8 elements, from the system)

1. Exact action (post / comment / DM / bio / page update) and its text
2. Exact accounts/platforms it will run on
3. Exact target link(s) each CTA opens
4. Objective this serves (qualified demand / interaction / traffic)
5. Evidence: which verified facts the copy relies on (with source refs)
6. Timing (date/time zone, and fallback if not monitored)
7. Assets used + permission state (from `asset-register.md`)
8. All eight elements, nothing assumed

When the founder replies **approved** (with post ID), record it as `APPROVED` here. If they reply with changes, iterate in Draft before re-requesting. If a draft is approved but never published this cycle, it returns to Draft at month review (no silent stale approvals).

## Approval ledger

| Post/Item ID | Action | Platform | Approved? | Approved at | Published at | Notes |
|---|---|---|---|---|---|---|
| SP-01 | Carousel post | IG (+ FB repurpose) | ✅ Approved | 2026-09-09 (batch review) | — | Content approved; publish still pending per-post go (timing/account) |
| SP-02 | Carousel (+ static) | IG + FB | ✅ Approved | 2026-09-09 (batch review) | — | Content approved; publish still pending per-post go (timing/account) |
| SP-03 | Carousel post | IG (+ FB repurpose) | ✅ Approved | 2026-09-09 (batch review) | — | Content approved; publish still pending per-post go (timing/account) |
| CTA-2026-09-11-B01 | 7 ad video drafts w/ `sofritostudio.com` CTA bar | IG + FB + Pinterest + TikTok (footer bar) | ✅ Approved | 2026-09-11 (pilot + pixel), publish go 2026-09-11 (option 1: all 7 × 4) | Pending manual (founder), rec Mon 09-14 → Sun 09-20 | Content + publish approved. Scope = 7 ads ONLY (`Google Flow - Sep 11 - 16-34.mp4` + `_2`–`_6`, `SofritoStudio_ad_business_model_1080p_20260911170226.mp4`); 3 v12771 clips EXCLUDED → moved to `CTA-drafts-DRAFT\excluded\` 2026-09-11 |
| (calendar P4–P12) | … | — | ❌ Draft | — | — | Concepts only, not yet drafted |

## Rules attached to this gate

- Approval is **post-by-post** (or founder-scoped batch, then recorded individually). It is never blanket.
- Publishing access belongs to a separate future publishing agent; even when that exists, it publishes ONLY items with an `APPROVED` record here.
- Founder answers given 2026-09-11: CTA-2026-09-11-B01 publish approved (option 1, all 7 × 4 platforms). SP-01/02/03 remain content-approved, publish-timing-pending → **not yet publishable from this system** (founder per-post go + account choice still open).
- Decision: if founder replies "pause social" or leaves batch-1 questions unanswered past 14 days, the system holds in Draft and a follow-up is raised in `ops/now.md` — no implicit green light.