# Carousel Brief: SS-2026-09-09-SP03

Audience: Independent restaurant, catering, specialty-food owners before new launch or rebrand.
Business problem: Unclear positioning, weak launch materials, outdated branding before opening or relaunch.
Core insight: Before opening, fix the decision — what this business is, what it offers, and why it’s different.
Service supported: Brand Foundation (positioning, identity kit, palette, typography) + Brand + Website (if site needed).
Goal: Awareness + Consideration (save, share, visit sofritostudio.com, inquire/book session).
CTA destination: sofritostudio.com/session (UTM: ?utm_source=instagram&utm_medium=carousel&utm_campaign=sp03)
Platform primary: Instagram 4:5 carousel (1080 x 1350).
Platform secondary: LinkedIn PDF, Pinterest evergreen pin, Story teaser.
Slide count: 7 (default narrative: hook → problem → reframe → principle → example → action → CTA).
Status: DRAFT — AWAITING FOUNDER APPROVAL.

---

## Visual direction options

### Type A — Realistic editorial photography (recommended, licensed stock)
- Source: Pexels / Unsplash restaurant branding, studio work, packaging design, kitchen prep, market scenes (verified commercial license).
- Style: Real food-business friction, sensory craft, founder/operator reality — real hands, real packaging, real menu design, real kitchen/prep light.
- Photography direction: 50mm editorial, shallow depth, warm practical light, realistic textures, no logos/signs/text in image.
- Typography: Path A overlay (HTML/CSS or SVG export) per Carousel Typography System.
- Asset tracking: `growth/social/asset-register.md` (source URL, license type, creator, usage status).

### Type B — Realistic AI imagery (requires OpenRouter credit top-up ~$5)
- Intention: Photorealistic editorial hospitality photography showing real decision-making moment — reviewing brand board, comparing packaging options, photographing plated dish, writing launch checklist.
- Constraint: No recognizable restaurant identity, no real client, no copied packaging/logo, no text/signs/logos in generated image.
- Label: "conceptual AI image" internally (per Social Visual Standard hierarchy item 3).

### Type C — Editorial proof / text-led design (for principle slide or CTA only)
- Background: Real document/material texture — brand board, ceramic plate, menu paper, packaging test — not abstract illustration.
- Typography: Full editorial display + body; image is proof material, not decorative.
- Note: Not recommended for hook/problem slides (needs realistic focal point for scroll-stopping); best for slide 4 (principle) or 7 (CTA) as supporting proof.

---

## Typography spec reference
- Token file: `carousel-tokens.yml` (Instagram 4:5 default)
- Canvas: 1080 x 1350 px, 4:5 portrait
- Grid: 12 columns, gutter 20 px, baseline 8 px
- Safe margins: top 96, right 88, bottom 120, left 88 px
- Headline: 68 px / weight 700 / line-height 0.98 / letter-spacing -0.018 em / max 4 lines
- Body: 32 px / weight 450 / line-height 1.22 / letter-spacing 0 / max 6 lines
- Micro/CTA: 24 px / weight 600 / line-height 1.15 / letter-spacing 0.01 em / max 2 lines
- Overlay method: HTML/CSS or SVG export (Path A, deterministic — not image-generated)
- Font families: Display + body (max 2 families per Carousel Typography System rules)
- Text weights: 700 (headline/display), 600 (subhead/micro/CTA), 450 (body) — max 3 weights per rules

---

## Cross-platform adaptation
- Instagram 4:5 (primary): 7 slides, full narrative, mobile feed presence.
- LinkedIn PDF: Same 4:5 portrait (or 1:1 square if reuse is preferred); professional editorial tone; cover page stronger strategic framing; no dense essays (body max 6 lines remains); same typography tokens.
- Pinterest 2:3 evergreen pin: Separate 1000 x 1500 px pin — likely slide 4 principle or 7 CTA; title should include searchable keywords ("brand identity", "launch checklist", "food business branding").
- Story teaser: Separate 9:16 (1080 x 1920) — 3 frames (problem, principle, CTA) with swipe direction; not a crop of 4:5; separate `carousel-spec.yml` for 9:16 format.

---

## Asset and permission status
- Background imagery: To be sourced (licensed stock preferred) or conceptual AI if approved.
- Copy source: `growth/social/carousels/SS-2026-09-09-SP03/copy.md` (exact source of truth for all platforms).
- All assets: DRAFT — AWAITING FOUNDER APPROVAL.
