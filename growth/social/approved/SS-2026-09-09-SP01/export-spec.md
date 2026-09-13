# PNG Export Specification — SP-01 / SP-02 / SP-03 Carousel Delivery
Status: DRAFT — AWAITING FOUNDER APPROVAL (PASS evaluation confirmed; no FAIL/revise criteria specified by founder)
Posting route: Meta Business Suite (manual scheduling; no autonomous scheduling/access per `.opencode/models.json` `approval_gate` override and `AGENTS.md` approval rules)
Credit reality: OpenRouter balance $0.71 (402 block on AI customization). No AI customization attempted. All backgrounds: licensed Pexels stock (Pexels License — commercial/free-use, no mandatory attribution). Source URLs tracked in `asset-register.md`; original source URLs preserved in `original-source.md`.

---

## Required PNG exports (23 files total)

### Carousel frames (1080 x 1350 px, 4:5 portrait, sRGB PNG, 150 dpi equivalent, no text-generation in image layer — typography overlay deterministic only)

SP-01 (Menu Clarity — 7 slides):
- approved/SP-01/sp01-slide-01.png (hook: "Your menu is doing too much.")
- approved/SP-01/sp01-slide-02.png (problem: "Confused customers leave faster.")
- approved/SP-01/sp01-slide-03.png (reframe: "Clarity is a business decision.")
- approved/SP-01/sp01-slide-04.png (principle: "Make the next step obvious.")
- approved/SP-01/sp01-slide-05.png (example: before/after comparison)
- approved/SP-01/sp01-slide-06.png (action: checklist)
- approved/SP-01/sp01-slide-07.png (CTA: session booking → sofritostudio.com/session)

SP-02 (Website Clarity — 6 slides):
- approved/SP-02/sp02-slide-01.png (hook: "Your website should answer this.")
- approved/SP-02/sp02-slide-02.png (problem: "Confused visitors leave faster.")
- approved/SP-02/sp02-slide-03.png (reframe: "It's one clear decision.")
- approved/SP-02/sp02-slide-04.png (principle: "Make the next step obvious.")
- approved/SP-02/sp02-slide-05.png (example: before/after)
- approved/SP-02/sp02-slide-06.png (action + CTA)

SP-03 (Branding / Launch — 7 slides):
- approved/SP-03/sp03-slide-01.png (hook: "Before you open, fix this.")
- approved/SP-03/sp03-slide-02.png (problem: unclear positioning)
- approved/SP-03/sp03-slide-03.png (reframe: clear identity)
- approved/SP-03/sp03-slide-04.png (principle: make decision obvious)
- approved/SP-03/sp03-slide-05.png (example: branding before/after)
- approved/SP-03/sp03-slide-06.png (action: checklist)
- approved/SP-03/sp03-slide-07.png (CTA: book session)

### Facebook static repurposes (1080 x 1080 px, 1:1 square, sRGB PNG, separately composed — NOT a blind center crop of carousel cover)

- approved/SP-01/fb-static-1080x1080.png (repurpose from slide 01 hook or slide 07 CTA — design-tool composition required; same typography tokens with adjusted safe margins for square format)
- approved/SP-02/fb-static-1080x1080.png (same approach)
- approved/SP-03/fb-static-1080x1080.png (same approach)

---

## Export method

Preferred (as per user's instruction): HTML -> PNG conversion of the approved HTML slides (`sp01-slide-[01-07].html`, `sp02-slide-[01-06].html`, `sp03-slide-[01-07].html`).

Requirements for conversion:
- Preserve exact 1080 x 1350 px canvas (4:5 portrait) for carousel frames
- Preserve exact 1080 x 1080 px canvas (1:1 square) for Facebook static versions
- Preserve typography exactly as specified in HTML (headline 68px / eyebrow 24px / body 32px / CTA 24px / micro 24px; font families: Cormorant Garamond + Inter; font weights: 700/600/450; colors: ink `#1D261E`, paper `#F6F0E6`, cream `#FFF9F0`, accent `#D88B47`, red `#9E3F32`, green `#334B36`; safe margins: top 96 / right 88 / bottom 120 / left 88; gradient overlay for contrast)
- Preserve background licensed stock images exactly (Pexels URLs: 4921028, 313700, 3874097, 9988778, 6321924, 16935898, 18759181 — tracked in `asset-register.md`; no replacement with unverified sources)
- Preserve all text-free image layer rules: no readable text, logos, signage, URLs, prices, badges, or typography in the background image layer; typography only appears in the deterministic overlay layer (HTML/CSS layer, not rendered into image pixels by generator)
- Preserve slide numbers (`01 / 07`, `02 / 06`, etc.) and brand marks (`Sofrito Studio`) in exact positions
- Preserve accessibility alt-text relationships (alt text describes visual content; does not unnecessarily repeat decorative copy)

Alternative (only if HTML -> PNG conversion fails visually or requires manual refinement):
Import HTML content into Canva or Figma, apply typography layer using the exact typography token specifications (`carousel-tokens.yml`), compose Facebook static as a separately composed 1:1 square (not a blind crop of 4:5 carousel cover), and export PNG in sRGB format. Confirm typography matches `carousel-tokens.yml` exactly after import; do not manually retype copy from memory; read from `copy.md` source file.

---

## QA before status change from DRAFT to READY TO SCHEDULE

Complete `approval.md` QA checklist for SP-01, SP-02, and SP-03 before any scheduling:

- [ ] All carousel PNG files present at 1080 x 1350 px
- [ ] All Facebook static PNG files present at 1080 x 1080 px
- [ ] All PNG files use sRGB color profile
- [ ] Typography exactly matches `carousel-tokens.yml` (headline/subhead/body/micro/display levels, font families, weights, sizes, line-height, letter-spacing, colors, safe margins, gradient overlay, no more than 3 weights / 2 families)
- [ ] Headline text matches `growth/social/carousels/SS-YYYY-MM-DD-XX/copy.md` exactly (character-for-character verification)
- [ ] Body text matches `copy.md` exactly
- [ ] CTA text (`Book a Sofrito Session → sofritostudio.com/session`) correct with exact URL and UTM parameters (`?utm_source=instagram&utm_medium=carousel&utm_campaign=sp01/02/03`)
- [ ] No spelling errors (verified by comparing rendered image to exact_copy source file via OCR or visual inspection, not memory)
- [ ] No unintended text, logos, signage, URLs, prices, badges, watermarks, or readable writing appears in the image layer (text-free visual layer confirmed; typography only in overlay)
- [ ] No image-generated business-critical text (URLs, brand/service names, CTAs, dates, statistics, testimonials, fine print, hashtags, dense carousel copy) — all business-critical copy is deterministic overlay only
- [ ] Slide sequence correct and filenames follow naming convention (`SS-[YYYY-MM-DD]-[post-id]-slide-[nn].png` and `SS-[YYYY-MM-DD]-[post-id]-fb-static.png`)
- [ ] Background licensed stock images load correctly (Pexels URLs verified in `asset-register.md` — no broken links)
- [ ] No protected logos, trademarks, brand identifiers, recognizable restaurant/client identity, or third-party branding visible in licensed stock backgrounds
- [ ] Internal label applied correctly: licensed stock assets only (`NOT conceptual AI image` — per Social Visual Standard hierarchy item 2; no AI image customization due to $0.71 credit block / 402 errors)
- [ ] Contrast adequate at mobile size (gradient overlay + cream headline on dark background; no low-contrast text on busy food/menu detail)
- [ ] Text inside safe margins (no overlap with hands, food focal points, menu details, platform interface zones)
- [ ] Text hierarchy consistent across all slides (display/headline > subhead > body > micro; no dense paragraphs; no poster full of text; no text too small to read without zooming; headline 3-9 words; body 15-40 words; checklist 2-8 words/max 3 short points; CTA 2-8 words/max 2 lines)
- [ ] Mobile-size legibility verified (headline readable at phone-size preview; body readable; safe margins adequate; no awkward line breaks)
- [ ] Accessibility alt text present per frame (`alt-text.md`) — describes essential visual content; not unnecessarily decorative; does not rely on color alone for distinction; adequate text contrast maintained
- [ ] Cross-platform variants noted (Instagram 4:5 master; LinkedIn PDF separate; Pinterest 2:3 evergreen pin separate; Story/Reel teaser 9:16 separate — none cropped/reused blindly; same exact-copy source `copy.md` with override files for each platform)
- [ ] Caption file (`caption.txt`) present: hook + exact CTA (`Book a Sofrito Session → sofritostudio.com/session`) + hashtags (`#FoodBusiness #RestaurantBranding #MenuDesign #SofritoStudio #BrandFoundation`) + alt text reference + UTM reference
- [ ] All assets labeled: DRAFT — AWAITING FOUNDER APPROVAL (until PNG export + schedule + approval completed)
- [ ] Publishing route confirmed: Meta Business Suite (manual scheduling; no autonomous scheduling/access per `.opencode/models.json` `approval_gate` override; no Instagram app / Meta Business Suite / TikTok / Pinterest / LinkedIn / X / YouTube / Reddit autonomous access)
- [ ] No autonomous scheduling/uploading/account access confirmed (per approval rules: no scheduling until separate explicit approval per campaign, date/time, account; all scheduling remains manual through Meta Business Suite only after approval gate passes)
- [ ] Approval.md completed (SP-01, SP-02, SP-03): includes Post ID, Platform, Asset filenames, Caption file, Alt text file, Destination URL, UTM URL, Scheduled date/time (pending), Time zone (pending), Licensed asset review result, Third-party logo/trademark check, Typography/spelling QA, Publishing/autonomy confirmation, Final status (DRAFT — AWAITING FOUNDER APPROVAL), Notes (carousel tokens, copy source, brief reference, visual direction, quality evaluation, scheduling/autonomy reminders)

---

## Manual PNG export procedure (non-autonomous — requires design tool confirmation or approval)

Step 1: Select design-tool method (must be confirmed; not autonomous):
- Canva import: Import HTML slide content and recreate using exact typography specs (font family, weights, sizes, colors, safe margins, gradient overlay). Verify typography matches `carousel-tokens.yml` exactly after import. Do not manually retype copy; read from `growth/social/carousels/SS-YYYY-MM-DD-XX/copy.md`.
- Figma import: Same procedure — recreate with typography tokens applied.
- HTML→PNG conversion: Use a browser screenshot or HTML-to-PNG conversion tool that preserves the exact 1080x1350 canvas, font rendering, gradient overlay, image load, and typography layer. Confirm no text rendering errors, no missing fonts, no broken image links, and no unintended spacing differences.

Step 2: Export all 23 PNG files (20 carousel frames + 3 FB static):
- SP-01: 7 carousel PNGs + 1 FB static
- SP-02: 6 carousel PNGs + 1 FB static
- SP-03: 7 carousel PNGs + 1 FB static
- Filename convention: `SS-YYYY-MM-DD-[post-id]-slide-[nn].png` (carousel), `SS-YYYY-MM-DD-[post-id]-fb-static.png` (static)
- Format: PNG, sRGB, 150 dpi equivalent (dimension-based export)

Step 3: Verify exported PNG files against HTML source:
- Confirm exact dimensions (1080×1350 for carousel, 1080×1080 for static)
- Confirm typography matches HTML (headline 68px, eyebrow 24px, body 32px, CTA 24px; font families; colors; safe margins)
- Confirm no missing fonts or broken links in exported image
- Confirm text readability at mobile size (headline readable, body scannable, safe margins intact)
- Confirm no extra text, logos, signage, URLs, prices, badges, or unintended typography added during export
- Confirm gradient overlay preserved (contrast adequate on mobile preview)
- Confirm licensed stock background loads correctly in PNG (Pexels URLs verified; no broken links)
- Confirm no image-generated business-critical text appears in PNG (only deterministic overlay text from `copy.md`; no model-generated words)

Step 4: Confirm all exported files labeled with approval status (after export verification):
- All carousel and static PNG files: DRAFT — AWAITING FOUNDER APPROVAL (until final per-post approval confirmed)
- Approval.md updated with: Final asset filenames, Caption file, Alt text file, Destination URL, UTM URL, Scheduled date/time (pending), Time zone (pending), Licensed asset review, Logo/trademark check, Typography/spelling QA confirmation, Publishing/autonomy confirmation, Final approval status (DRAFT until confirmed; READY TO SCHEDULE only after separate explicit approval per campaign, date/time, account, platform, exported files, caption, alt text, UTM, and posting route — all confirmed by founder explicitly)

---

## Manual editing / replacement procedure (if needed)

If any PNG requires manual refinement (e.g., typography spacing needs fine-tuning, background composition needs shift, or slide element needs repositioning):

1. Read exact overlay specification from `carousel-tokens.yml` and `copy.md`.
2. Read original licensed stock image from `asset-register.md` (Pexels source URL + photographer + license confirmation).
3. Make manual adjustments in Canva, Figma, or design tool using the exact typography token values, not approximate measurements.
4. Verify every visible text string matches `exact_copy` from `copy.md` character-for-character (do not retype from memory).
5. Confirm no protected logos, trademarks, or brand identifiers appear in the background or overlay.
6. Confirm the revised PNG matches the file naming convention, dimensions, format, and approval status.
7. Record any change in `approval.md` notes with reason, version, date, and approval status.
8. Confirm revised asset remains DRAFT — AWAITING FOUNDER APPROVAL until final approval.

---

## Publishing/scheduling reminder (binding)

No autonomous scheduling, uploading, account access, or external action permitted.

Posting route: Meta Business Suite (manual scheduling only; no autonomous scheduling by agent).
Scheduling requires separate explicit approval per campaign covering:
- Campaign/post ID
- Final exported PNG file list (carousel + static)
- Final caption file (`caption.txt`)
- Final alt text file (`alt-text.md`)
- Final destination URL (`sofritostudio.com/session`)
- Final UTM parameters (`utm_source=instagram&utm_medium=carousel&utm_campaign=sp01/02/03`)
- Platform (Instagram carousel + FB static; optional LinkedIn PDF, Pinterest pin, Story teaser)
- Date and time
- Time zone
- Account/platform access method (Meta Business Suite)
- Owner approval: Explicit founder approval given (date and name)

Only after that explicit approval should scheduling occur — and only through manual Meta Business Suite entry, not through autonomous agent action. No agent may schedule, publish, upload, modify, delete, access, or trigger any external system without that confirmation.

All assets remain: DRAFT — AWAITING FOUNDER APPROVAL until final approval given.