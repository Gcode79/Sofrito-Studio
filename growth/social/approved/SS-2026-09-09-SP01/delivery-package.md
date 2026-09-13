# Delivery Package: SP-01 / SP-02 / SP-03 Carousel Rebuild
Status: DRAFT — AWAITING FOUNDER APPROVAL
Sourcing: Route A (licensed stock photography — Pexels/Unsplash — zero AI cost, fits $0.71 credit reality)
Typography: Path A (text-free visual backgrounds + deterministic HTML/CSS/SVG overlay per `carousel-tokens.yml`)
Publishing: Manual (Instagram app / Meta Business Suite) — posting route confirmed pending; no autonomous scheduling/access.

---

## Per-post approved folder structure

approved/
  SS-2026-09-09-SP01/ (7 slides: hook/problem/reframe/principle/example/action/cta)
    slide-01.png (1080x1350)
    slide-02.png (1080x1350)
    slide-03.png (1080x1350)
    slide-04.png (1080x1350)
    slide-05.png (1080x1350)
    slide-06.png (1080x1350)
    slide-07.png (1080x1350)
    fb-static-1080x1080.png (repurpose)
    caption.txt (hook + CTA `Book a Sofrito Session → sofritostudio.com/session` + hashtags)
    alt-text.md (per-slide alt text)

  SS-2026-09-09-SP02/ (6 slides — reduced narrative for website-clarity message)
    slide-01.png ... slide-06.png
    fb-static-1080x1080.png
    caption.txt
    alt-text.md

  SS-2026-09-09-SP03/ (7 slides — branding/launch message)
    slide-01.png ... slide-07.png
    fb-static-1080x1080.png
    caption.txt
    alt-text.md

---

## Schedule rows (add to content-calendar.md)

SS-2026-09-09-SP01 — Menu clarity carousel — Instagram 4:5 — Published: Pending founder approval — Account: Instagram (primary) + FB (repurpose) — UTM: ?utm_source=instagram&utm_medium=carousel&utm_campaign=sp01 — Status: DRAFT — AWAITING FOUNDER APPROVAL
SS-2026-09-09-SP02 — Website clarity carousel — Instagram 4:5 — Published: Pending founder approval — Account: Instagram + FB — UTM: ?utm_source=instagram&utm_medium=carousel&utm_campaign=sp02 — Status: DRAFT — AWAITING FOUNDER APPROVAL
SS-2026-09-09-SP03 — Branding/launch carousel — Instagram 4:5 — Published: Pending founder approval — Account: Instagram + FB — UTM: ?utm_source=instagram&utm_medium=carousel&utm_campaign=sp03 — Status: DRAFT — AWAITING FOUNDER APPROVAL

---

## UTM tracking (performance.md entry)

Campaign: sp01 (Menu clarity) — Instagram carousel — Destination: sofritostudio.com/session — Source: instagram — Medium: carousel — UTM string: ?utm_source=instagram&utm_medium=carousel&utm_campaign=sp01
Campaign: sp02 (Website clarity) — Instagram carousel — Destination: sofritostudio.com/session — Source: instagram — Medium: carousel — UTM string: ?utm_source=instagram&utm_medium=carousel&utm_campaign=sp02
Campaign: sp03 (Branding/launch) — Instagram carousel — Destination: sofritostudio.com/session — Source: instagram — Medium: carousel — UTM string: ?utm_source=instagram&utm_medium=carousel&utm_campaign=sp03
Note: Tracking remains manual (no automated analytics connection configured). Confirm with founder before linking to live site.

---

## Asset register entries (add to asset-register.md when images selected)

SS-2026-09-09-SP01:
- Type: Licensed stock photography (Pexels / Unsplash) — hierarchy item 2 per Realistic Social Visual Standard
- Source: [Pexels/Unsplash URL to be selected — restaurant/menu/editorial photo matching SP-01 brief: over-the-shoulder owner reviewing generic menu beside laptop, ceramic cup, paper textures, warm wood-and-tile counter]
- License: Commercial / free-use license confirmed
- Creator: [to be recorded from source page]
- Usage status: Approved (pending final selection and download)
- Internal label: Not conceptual AI image — licensed stock only

SS-2026-09-09-SP02:
- Type: Licensed stock photography (Pexels / Unsplash) — restaurant/studio/menu/editorial
- Source: [to be selected — over-the-shoulder owner reviewing generic restaurant website on phone beside printed menu, ceramic cup, receipt printer, warm kitchen light]
- License: Commercial / free-use license confirmed
- Usage status: Approved (pending selection)

SS-2026-09-09-SP03:
- Type: Licensed stock photography (Pexels / Unsplash) — restaurant branding/prep/studio/editorial
- Source: [to be selected — real food-business environment: brand board beside fresh ingredients, packaging design comparison, chef plating, launch checklist, real kitchen/studio light]
- License: Commercial / free-use license confirmed
- Usage status: Approved (pending selection)

Note: If licensed stock is unavailable for a specific scene, conceptual AI image may be used as fallback (hierarchy item 3) — must be clearly labeled internally, must not imply a real client/project/result, must pass spelling/quality verification (PASS only if score ≥4/5; FAIL if any character error, distorted hands, floating objects, unintended text, or wrong URL/price/name/date). Given $0.71 credit block (402 errors), AI image customization is blocked; licensed stock is the practical production path.

---

## Typography overlay confirmation (per Carousel Typography System)

All 3 carousels use Path A (text-free visual + deterministic overlay):
- Copy source: `growth/social/carousels/SS-2026-09-09-SP01/copy.md` (and SP-02, SP-03 equivalents)
- Typography tokens: `growth/social/design-system/carousel-tokens.yml` (1080x1350, 4:5, 12-col grid, headline 68px/700, body 32px/450, micro/CTA 24px/600, max 4/6/2 lines, safe margins 96/88/120/88)
- Text added by: HTML/CSS or SVG overlay (deterministic layer in design tool — Canva/Figma or direct HTML export)
- No image-generated text for: URLs (`sofritostudio.com/session`), brand/service names (`Sofrito Studio` / `Brand Foundation` / `Brand + Website`), CTAs (`Book a Sofrito Session`), UTM strings, dates, prices, client names, statistics, testimonials, fine print, hashtags, multi-slide copy.
- Only image-generated text permitted (Path B, only if explicitly approved): one short visual hook of 1–5 common words, not business-critical, exact spelling verified by OCR at mobile size. Current production: Path A for all business-critical copy; Path B not approved for any SP-01/02/03 slides.

---

## Cross-platform notes (pending adaptation)

Instagram 4:5 carousel (primary): slides 1-7 per `brief.md` and `copy.md`.
LinkedIn PDF: same 4:5 canvas, same `copy.md` source, potentially 1:1 square cover page; same typography tokens; more professional editorial tone; same safe margins; body text may use max 6 lines (not expanded beyond token limit); no dense essays.
Pinterest 2:3 (1000x1500): separate evergreen pin for each carousel — search-friendly title; standalone meaning (viewable without other slides); not a crop/reuse of 4:5; separate asset registration entry.
Story/Reel teaser (9:16, 1080x1920): separate 3-5 frame vertical composition (not crop of 4:5); hook (problem) + principle insight + CTA with swipe/link sticker; separate `carousel-spec.yml` for 9:16 format; typography adjusted to 9:16 safe margins (top interface zone ~250px, bottom ~320px).

---

## Delivery confirmation

Folders created:
- `approved/SS-2026-09-09-SP01/` (pending PNG frames + static + caption + alt)
- `approved/SS-2026-09-09-SP02/` (pending PNG frames + static + caption + alt)
- `approved/SS-2026-09-09-SP03/` (pending PNG frames + static + caption + alt)

Content sources (approved):
- SP-01 content: `growth/social/drafts/SP-01-commodity-signs.md`
- SP-02 content: `growth/social/drafts/SP-02-three-screens.md`
- SP-03 content: `growth/social/drafts/SP-03-menu-sales-page.md`

Design rules (binding):
- `AGENTS.md`: Realistic Social Visual Standard (no line art/vectors/generic AI/abstract blobs/quote cards/stock office scenes)
- `AGENTS.md`: IMAGE GENERATION PROMPT PROTOCOL (Sections 1-10 prompt format + exclusions)
- `AGENTS.md`: ON-IMAGE TEXT & SPELLING PROTOCOL (Path A default; Path B only for 1-5 common words, explicitly approved; spelling verification protocol; URL policy; carousel policy; text hierarchy; accessibility rules)
- `AGENTS.md`: MULTI-SLIDE CAROUSEL TYPOGRAPHY SYSTEM (deterministic typography layer; exact-copy source `copy.md`; typography tokens `carousel-tokens.yml`; slide architecture; layout rules; image-generation interface; copy-length controls; pre-export validation; required output; practical rule: split/simplify instead of shrinking type)
- `.opencode/models.json`: Free-tier routing (`inkling:free` for all agent/task overrides; credit-aware fallback enabled at $1.00; licensed stock path when credits < $1.00; never autonomous publishing/account access; always DRAFT — AWAITING FOUNDER APPROVAL)

Next actions (pending founder confirmation):
1. Confirm sourcing approach: licensed stock (recommended, $0 cost, fits $0.71 credit reality) — proceed with delivery package generation.
2. Confirm posting route: Instagram app / Meta Business Suite / undecided (still unanswered from earlier session).
3. Once confirmed (1) + optionally (2): generate delivery assets — download licensed stock backgrounds (tracked in `asset-register.md`), apply deterministic typography overlay in design tool (Canva/Figma or HTML/CSS export using `carousel-tokens.yml`), export PNG 1080x1350 + 1080x1080 FB static, write caption .txt, write alt-text.md, log UTM in performance.md, add schedule row.
4. All assets remain labeled: DRAFT — AWAITING FOUNDER APPROVAL — until explicit per-post approval given.
