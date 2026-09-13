# Carousel Brief: SS-2026-09-09-SP01

Audience: Independent restaurant/café owners with cluttered, unclear menus.
Business problem: Menu confusion → lower orders, cheaper choices, customer drop-off.
Core insight: Clarity is a business decision, not a design decoration.
Service supported: Brand Foundation / Brand + Website service.
Goal: Consideration (visit service page / book session).
CTA destination: sofritostudio.com/session (UTM: ?utm_source=instagram&utm_medium=carousel&utm_campaign=sp01)
Platform primary: Instagram 4:5 carousel (1080 x 1350).
Platform secondary: LinkedIn PDF (4:5 or 1:1), Story teaser (9:16), Pinterest 2:3.
Slide count: 7 (default narrative structure per Carousel Typography System).
Status: DRAFT — AWAITING FOUNDER APPROVAL.

---

## Visual direction options (choose one for production)

### Type A — Realistic editorial photography (recommended, stock-based)
- Source: Pexels / Unsplash commercial-license restaurant/prep kitchen/menu/studio imagery.
- Permission tracking: `growth/social/asset-register.md` (track creator + license URL).
- Style: Warm window light, 50mm editorial, shallow depth, real food/textures, no logos/signs.
- Asset type: Licensed stock (hierarchy item 2 per Social Visual Standard).
- Production: Zero AI-generation cost; fits $0.71 credit reality.
- Typography: Path A (text-free visual + HTML/CSS overlay using `carousel-tokens.yml`).

### Type B — Realistic AI image (requires top-up to OpenRouter ~$5)
- Prompt: photorealistic 4:5 editorial restaurant before service, owner reviewing generic menu beside laptop homepage, ceramic cup, paper textures, warm light.
- Negative prompt: no line art, no vectors, no illustration, no text/labels/signs/logos, no recognizable restaurant identity.
- Asset type: Conceptual AI image (hierarchy item 3, label "conceptual AI image" internally).
- Note: Only if founder approves AI imagery and approves OpenRouter top-up.

### Type C — Text-led only (fallback, zero imagery cost)
- Background: Real material texture (warm wood/ceramic/paper) with minimal environmental context, no AI image generation.
- Typography: Full editorial display + body hierarchy; image serves as texture, not story.
- Asset type: Text-led design (hierarchy item 4, insight must stand alone).
- Note: Strongest for slide 4 principle or slide 7 CTA; weaker for hook/problem slides.

---

## Typography spec reference
Token file: `growth/social/design-system/carousel-tokens.yml` (see AGENTS.md Carousel Typography System).
Canvas: 1080 x 1350 px, 4:5.
Grid: 12 columns, gutter 20 px, baseline 8 px.
Safe margins: top 96, right 88, bottom 120, left 88 px.
Headline: 68 px, weight 700, line-height 0.98, letter-spacing -0.018 em, max 4 lines.
Body: 32 px, weight 450, line-height 1.22, letter-spacing 0, max 6 lines.
Micro/CTA: 24 px, weight 600, line-height 1.15, letter-spacing 0.01 em, max 2 lines.
Colors: ink `#1D261E`, paper `#F6F0E6`, cream `#FFF9F0`, red `#9E3F32`, green `#334B36`, accent `#D88B47`.
Text overlay method: HTML/CSS or SVG export (Path A, not image-generated).

---

## Cross-platform adaptation notes
- Instagram feed (primary): 4:5 carousel, 7 slides, full narrative.
- LinkedIn PDF: Same 7-slide content, same 4:5 canvas, potentially square 1:1 cover if needed; body text may increase slightly (max line count remains 6; no dense essays); professional editorial tone; same typography tokens.
- Pinterest: One 2:3 evergreen pin from this carousel — likely slide 4 principle (headline + short body) or slide 7 CTA; title should be search-friendly; separate file, separate asset registration entry.
- Story/Reel teaser: Separate 9:16 composition (1080 x 1920) — not a crop of 4:5. Select slide 1 hook + slide 4 principle for teaser; add swipe/link sticker direction.

---

## Asset status and permissions
- All background imagery: To be sourced (licensed stock preferred) or conceptual AI if approved.
- Copy source file: `growth/social/carousels/SS-2026-09-09-SP01/copy.md` (exact source of truth).
- Copy version: v1 (initial draft; change only in `copy.md`, not in design files).
- Image generation cost estimate: $0 if licensed stock; ~$5 top-up if custom AI.
- All assets marked: DRAFT — AWAITING FOUNDER APPROVAL.
