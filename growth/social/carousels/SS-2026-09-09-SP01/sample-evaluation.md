# Carousel Sample Evaluation — SP-01 / SP-02 / SP-03

Created: 2026-09-09 — DRAFT — AWAITING FOUNDER APPROVAL
Source files:
- SP-01 brief: growth/social/carousels/SS-2026-09-09-SP01/brief.md
- SP-01 copy: growth/social/carousels/SS-2026-09-09-SP01/copy.md
- SP-02 brief: growth/social/carousels/SS-2026-09-09-SP02/brief.md
- SP-02 copy: growth/social/carousels/SS-2026-09-09-SP02/copy.md
- SP-03 brief: growth/social/carousels/SS-2026-09-09-SP03/brief.md
- SP-03 copy: growth/social/carousels/SS-2026-09-09-SP03/copy.md
- Typography tokens: growth/social/design-system/carousel-tokens.yml

---

## SP-01 — Menu Clarity / "Your menu is doing too much."
Audience: Independent restaurant/café owners with cluttered menus.
Service supported: Brand Foundation / Brand + Website.
Slide count: 7 (hook → problem → reframe → principle → example → action → CTA).
Visual direction options:
- Type A (recommended): Realistic editorial restaurant/menu/studio photography from Pexels/Unsplash (zero cost, fits $0.71 credit reality). Photography direction: overhead close-up of cluttered menu beside owner in dark apron holding phone, ceramic cup, pencil notes, warm wood-and-tile counter, 50mm editorial, shallow depth.
- Type B (requires ~$5 OpenRouter top-up): Conceptual AI image — photorealistic editorial restaurant owner reviewing generic homepage beside printed menu, ceramic cup, receipt printer. Label: "conceptual AI image". Never implies real client.
- Type C (zero imagery): Text-led only — real material texture background (wood, paper, ceramic), typography carries the story. Best for principle/CTA slides, weaker for hook/problem slides.
Headline samples (already in copy.md): "Your menu is doing too much." / "Confused customers leave faster." / "Make the next step obvious."
Quality assessment (self-scored before presentation): Photorealism: 5/5 (Type A, real photography); 4/5 (Type B, conceptual AI, must pass spelling verification); 3/5 (Type C, text-led — depends on typography design). Mobile legibility: 5/5 (Path A overlay + safe margins + typography tokens). Brand fit: 5/5 (warm neutrals + editorial typography). Ethical/permission safety: 5/5 (Type A requires license tracking in asset-register.md; Type B requires internal label; Type C requires no client assets).

---

## SP-02 — Website Clarity / "Your website should answer this."
Audience: Independent restaurant/café owners with unclear website.
Service supported: Brand + Website / Brand Foundation.
Slide count: 7.
Headline samples: "Your website should answer this." / "Confused visitors leave faster." / "Make the next step obvious."
Visual direction: Over-the-shoulder restaurant owner reviewing generic restaurant homepage on smartphone beside printed menu, ceramic coffee cup, receipt printer, soft kitchen background — realistic editorial hospitality photography.
Cross-platform: Instagram 4:5 (primary), LinkedIn PDF, Story teaser (3 frames: problem/principle/CTA), Pinterest 2:3 evergreen pin (search title: "restaurant website clarity").

---

## SP-03 — Branding / Launch / "Before you open, fix this."
Audience: Independent restaurant/catering/food-business owners preparing for new launch/rebrand.
Service supported: Brand Foundation.
Slide count: 7 (hook: unclear positioning; problem: weak launch; principle: clear decision; example: before/after; action: review checklist; CTA: book session).
Headline samples: "Before you open, fix this." / "Your food deserves clearer positioning." / "Make the decision obvious."
Visual direction: Real editorial photography — founder/operator reality (reviewing brand board beside fresh ingredients, comparing packaging designs, writing checklist, photographing plated dish) — licensed stock preferred.

---

## Typography System (applied to all 3 carousels)
Token file: `carousel-tokens.yml` (added to design-system directory).
Canvas: 1080 x 1350 px, 4:5 portrait.
Grid: 12 columns, gutter 20 px, baseline 8 px.
Safe margins: top 96, right 88, bottom 120, left 88 px.
Headline: 68 px / 700 / line-height 0.98 / letter-spacing -0.018 em / max 4 lines.
Body: 32 px / 450 / line-height 1.22 / letter-spacing 0 / max 6 lines.
Micro/CTA: 24 px / 600 / line-height 1.15 / letter-spacing 0.01 em / max 2 lines.
Colors: ink `#1D261E`, paper `#F6F0E6`, cream `#FFF9F0`, red `#9E3F32`, green `#334B36`, accent `#D88B47`.
Text overlay: HTML/CSS or SVG export (Path A, deterministic — never image-generated for business-critical text like URLs, brand names, CTAs, service names, prices, dates, client names).

---

## Cross-platform adaptation note
Instagram 4:5 is the master layout. LinkedIn uses the same canvas (4:5 PDF, possibly 1:1 cover page for reuse). Pinterest requires a separate 2:3 pin. Story/Reel teaser requires separate 9:16 composition (not a cropped 4:5). The task prompt included in AGENTS.md specifies the exact 7-slide structure for Instagram; the carousel-spec.yml per post handles platform-specific adaptations.

---

## Sourcing decision required from founder
Given ~$0.71 OpenRouter credit remaining (402 error on custom AI generation attempt) and the new Social Visual Standard banning line art/vectors/generic AI illustration:

Option A (recommended, zero additional cost): Licensed stock photography (Pexels / Unsplash / similar) — tracked in `growth/social/asset-register.md` (source URL, license type, creator, usage status). Matches hierarchy item 2 (licensed realistic photography) and avoids all AI-image ethical/permission issues. Fits the new standard perfectly: real, cinematic, food-literate.

Option B (requires ~$5 top-up at openrouter.ai/settings/credits): Custom realistic AI photography for SP-01/02/03 background imagery. Would follow the IMAGE GENERATION PROMPT PROTOCOL format (Sections 1–10: intended use → scene → subject/action → details → composition → light/mood → brand treatment → text overlay → quality constraints → ethical status). Label internally "conceptual AI image"; never imply a real client/restaurant/project. Must pass spelling/quality verification (PASS only if score ≥4/5; FAIL if any character error, distorted hands, floating objects, unintended text, or wrong URL).

Option C (zero imagery cost): Text-led design only — real material texture backgrounds (wood, ceramic, paper) with full editorial typography overlay. No AI generation, no stock sourcing. Works well for slides 4 (principle) and 7 (CTA); weaker for hook/problem slides that need a realistic focal point for scroll-stopping.

Recommendation: Proceed with Option A (licensed stock) for SP-01, SP-02, SP-03; use Option C only as a fallback for a single slide if needed. Confirm if you approve this sourcing approach before I generate delivery package assets (per-post `approved/SP-NNN/` folders with 1080×1350 PNGs, 1080×1080 FB static, caption/alt .txt, UTM log, schedule row).

---

## Next step (pending founder confirmation)
- Confirm sourcing approach: licensed stock (recommended), AI top-up (~$5), or text-led only.
- Confirm posting route: Instagram app, Meta Business Suite, or manual (undecided from earlier).
- Once confirmed: generate delivery package (per-post folder, PNG exports, caption/alt .txt, schedule row, UTM tracking entry in performance.md) — all marked DRAFT — AWAITING FOUNDER APPROVAL.