# Growth / Social — Content Strategy (Draft — Awaiting Founder Approval)

> Part of the Social Content Creation & Implementation System (per `AGENTS.md` + `.opencode/agents/social.md`). Everything in this file and its siblings is **Draft** — nothing here is published, scheduled, or live. Every public-facing item needs founder approval before any publishing action, post-by-post.

**Status:** DRAFT (system files created 2026-09-09)
**Owner:** Social Content Operator (drafting) → Founder (approval) → publishing agent (future, after post-by-post approval)

---

## Why this exists (fits the pivot)

Sofrito Studio is a branding studio for food businesses. Social content exists to make qualified food-business owners trust the studio, see useful expertise, and choose Sofrito Studio's **existing** services:

| Offer | Price * | Role in social |
|---|---|---|
| Sofrito Session | $400 / 90 min | **Primary CTA** — lowest-commitment entry; every educational post can end here |
| The Sofrito (brand identity) | $2,500 | Mid-level proof + "what you get" posts |
| The Plato (brand + website) | $5,000 | Teardown + before/after proof posts |
| La Mesa (full launch) | $7,500 — **by referral only** | Awareness only (no price announcements until OD5) |
| Retainers (Essentials/Growth/Fractional) | $1.5k–$4k/mo | Awareness only (no "spaces open" until OD2 makes waitlist capture real) |
| Free Digital Guide | lead magnet | CTA for top-of-funnel posts (feeds `/api/newsletter`) |

\* Prices VERIFIED from `services.html` + KV `packages/*` on 2026-09-09 (current-pivot.md). Prices shown in content ONLY where founder approves price visibility per post.

## Audit summary (evidence, 2026-09-09)

- **Live social presence (unverified depth):** footer links Instagram, Facebook, Pinterest (all `sofritostudio` handles). TikTok pixel + Events API configured but posting token empty (analytics only). Follower/engagement counts `UNKNOWN` — to be re-verified before any claim.
- **Pipeline evidence:** 15 D1 leads, 15/15 QA/deploy artifacts; 0 real leads; 0 revenue; 9 newsletter subs (verified 2026-09-09). **Social's job: produce qualified traffic that survives the fix of the leak gaps (KV email templates, waitlist capture, session checkout) — or social pauses until those close, because converting visitors who receive bare-subject emails is waste.**
- **Existing growth/content-calendar.md** is pivot-aligned and consistent with this system. `growth/social/*` supersedes it as the operational home for social; the older file stays as a planning reference until reconciled.

## Ideal buyer (defined)

| Dimension | Target segment A (primary) | Target segment B (secondary) |
|---|---|---|
| Food-business type | Independently owned restaurants, cafés, food trucks, caterers, private chefs | Specialty / packaged food brands (salsa, sauces, pantry) |
| Stage | Opened or launching within 0–18 months; has been operating 1–5 years without a clear brand/website | Building a packaged food brand, pre-launch to first retail/catering push |
| Decision-maker | Owner-operator (owner + operator, no CMO) | Founder-operator |
| Situation | "I know the food is good — I don't know why my brand and site don't pull people in." | "I look like every other brand on the shelf." |
| Primary problem | Brand reads as commodity; website doesn't convert visits into orders/inquiries/catering | No differentiated identity or reason-to-believe; weak packaging/menu presence |
| Level of awareness | Problem-aware to solution-aware | Problem-aware |
| Money reality | $400 session is an easy yes; $5k project is a considered purchase | Sessions + Brand Foundation slot (if approved) |

## Content pillars (approved, from the system)

1. Brand clarity — 2. Website & conversion — 3. Launch & growth readiness — 4. Content & customer communication — 5. Studio point of view — 6. Permissioned proof — 7. Founder/operator insight

**Weighting for month 1:** Pillars 2 (website/conversion) and 1 (brand clarity) carry most weight because they feed Sessions and Plato directly. 5 (POV) and 7 (insight) build the "worth listening to" layer. 6 (proof) only with permissioned material — currently self-case-study + spec concepts, honestly labeled.

## Platform strategy (1–2 platforms; only VERIFIED-available handles)

| Platform | Verdict (evidence stance) | Why |
|---|---|---|
| **Instagram** | **Primary** | `sofritostudio` handle verified in live footer (2026-09-09); visual authority; ideal buyer lives here; carousels + repurpose |
| **Facebook** | **Secondary (repurposes)** | `sofritostudio` handle verified in live footer; same feed content, low cost, broad reach |
| Pinterest | Hold (board not set) | Profile-link only verified; pin-into-discovery once a board + portfolio assets exist |
| TikTok | **Not available to post** | Pixel/Events analytics-only; posting token empty (verified) — do not post |
| LinkedIn | Hold | NO verified handle on record — do not use until founder provides one |
| X / Threads | Hold | No verified handle; only if founder provides |

**Decision (founder, 2026-09-09 · Q1):** first month = **Instagram (primary) + Facebook (repurposed posts)** — the only handles verified available. LinkedIn adaptations in the drafts are deprioritized pending a real handle.

Cadence: **2–3 high-quality core posts/week** from the calendar; repurpose each idea natively; no filler. Increase volume only when assets, response capacity, and measurement are reliable.

## Approved CTAs (each post picks exactly one)

1. Book a Sofrito Session (**primary** — leads to `/session.html` → contact-path until Calendly live)
2. Save this for your next menu/site/brand review (zero-click, builds saves)
3. Share it with a food-business owner (referral)
4. Comment with the decision you're stuck on (community; requires response-rails — see response-library)
5. Visit the relevant service page (`/services.html`, Guides page)
6. Take the free Digital Guide (feeds `/api/newsletter`)
7. (Future, gated) Reply-with-keyword — ONLY once founder approves the follow-up workflow

## Measurement plan (what social is for, in order)

1. **Qualified demand:** Session bookings, discovery-call inquiries, project requests (D1 real leads, `revenue`/`bookings`)
2. **Qualified interaction:** relevant DMs/comments from food-business owners; saves/shares from the right audience
3. **Traffic:** site clicks with UTMs; profile visits
4. Vanity (likes/followers) — recorded but never treated as success evidence

Primary metric per post is chosen at draft time (see calendar/library). Causation is not claimed from correlation; monthly review separates vanity from qualified signal and drives the next calendar (per the system's Monthly Review).

## Guardrails (non-negotiable)

- Nothing publishes, schedules, comments, DMs, follows, ads, or accesses an authenticated account without founder approval.
- No fabricated clients, testimonials, results, metrics, or "owners are saying" claims.
- No client asset used without explicit documented permission.
- No unverified claims about competitors, platforms, statistics, or industry facts — sources live in `research/social-sources.md`.
- No overpromising ("will get you more sales"), no fake urgency, no generic-agency/corporate language, minimal emoji.
- No La Mesa price talk (OD5), no retainer "spaces open" (OD2), no Tier 3 mention (pending).
- Spec/self work always labeled honestly ("concept" / "our own rebrand").
- Copy is readable, direct, human; accessibility (alt text, contrast, captions) is part of every brief.

## File map (this system)

```
growth/social/
  content-strategy.md      ← you are here
  content-calendar.md      ← 12 concepts, statuses, cadence
  content-library.md       ← concept bank (evergreen; grows with reuse)
  performance.md           ← per-post measurement tracker
  asset-register.md        ← every visual asset + permission status
  approval-workflow.md     ← the gate: how a post goes Draft → Approved
  response-library.md      ← pre-approved-hook response rails (DMs/comments)
  drafts/                  ← fully drafted posts (3 to start, all Awaiting Approval)
research/social-sources.md ← evidence log for every external claim
```

**Next:** 12 post concepts (content-library) + 3 fully drafted posts (drafts/), all marked Draft / Awaiting Founder Approval. Smallest question set for the first publishing batch is at the end of the calendar file.