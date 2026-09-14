# Sofrito Studio — Brand Guidelines

**Version:** 1.0 · **Owner:** Sofrito Studio (founder) · **Last updated:** 2026-09-14

These guidelines are the rulebook for how Sofrito Studio looks, sounds, and behaves across every channel. They work hand-in-hand with the assets in this brand kit: the **kit** is the toolbox of files you grab, the **guidelines** are the rules for using them. If you need an asset, look in the kit folder; if you need to know *how* to use it, read this document.

---

## 1. Brand Foundation

| Element | Definition |
| --- | --- |
| **Who we are** | Sofrito Studio — a creative brand studio. |
| **What we make** | Logo design, brand identity, and brand-kit/packaging work for food & hospitality brands (with a fast, deliberate, "done-right" craft). |
| **Why we exist** | To give small food brands a warm, confident visual identity that makes them memorable. |
| **What we're known for** | A warm **orange** energy paired with fresh **green** — sofrito's aromatic base, the flavor foundation of countless kitchens. |
| **Audience** | Food founders, chefs, restaurant owners, and hospitality operators who need on-brand design without friction. |
| **Personality (3 words)** | Warm, confident, craft-obsessed. |

**Brand story:** *Sofrito* is the slow-cooked aromatic base that gives a dish its soul. Sofrito Studio builds brands the same way — starting with a strong foundation, layering in craft, and letting each element work together until the whole thing feels like it's always belonged.

**Tagline direction:** "Start with a strong foundation." *(Proposed — pending founder approval.)*

---

## 2. Logo System

> ⚠️ **Status:** The brand kit currently ships the logo in **JPEG raster only** (see `SVG / vector master` gap below). Do not stretch, re-color, or distort; treat `logo-master.jpeg` (2K, highest resolution) as the quality reference.

### 2.1 Current files in this kit

| File | Use it for |
| --- | --- |
| `logo-master.jpeg` (= `Sofritostudio.com_logo_ideas_2K_*.jpeg`, 2K) | **Master reference** — highest-res version of the full-color logo. |
| `Sofritostudio.com_logo.jpeg` | Standard web/screen use. |
| `Sofritostudio.com_logo.jpg` | Standard / print-fallback raster. |
| `Sofritostudio.com_Trans-logo.jpg` | Logo without a solid background (reversed/dark uses). |
| `Logo-Designs.jpg`, `Brand-Kit-Samples.jpg` | Logo **variation/exploration** sheets — reference only, not for production lockups. |
| `logo_explorations/` | *(empty — see gap: isolate variations into individual files.)* |

### 2.2 Recommended file matrix (target state)

Best practice is to provide the logo in **vector + raster, light + dark, full-color + mono**. The kit currently lacks the vector/master exports. Target:

| Variation | Vector | PNG (transparent) | Still needed? |
| --- | --- | --- | --- |
| Full-color logo | `SVG` / `AI` / `EPS` | `PNG` | ✅ Add |
| Mono / reversed (white) | `SVG` | `PNG` | ✅ Add |
| Icon-only mark | `SVG` | `PNG` | ✅ Add |
| Favicon set | — | `16 / 32 / 48/180px` | ✅ Add |

### 2.3 Usage rules

- **Clear space:** keep a minimum clear-space buffer around the logo equal to the height of the lowercase "o" in "Sofrito" on all sides.
- **Minimum size:** never reproduce the logo smaller than **30 px** tall on screen or **15 mm** in print.
- **Do not:** stretch, squash, rotate, add drop shadows/paths, re-color the logo with off-palette colors, or place it on a busy/low-contrast photo background.
- **On dark backgrounds:** prefer the reversed/transparent variant; never use the full-color lockup on a dark green or black background where it loses contrast.
- **Color versions:** the logo should be available in full-color, mono-white, mono-black, and reversed — provide all four for maximum coverage.

---

## 3. Color System

See **`DESIGN-TOKENS.md`** (in this kit) for the authoritative values. Tokens align with the live site visuals.

### 3.1 Brand Colors

| Token | Hex | Role | Usage |
| --- | --- | --- | --- |
| **Primary · Orange** | `#EA580C` | **Brand/action color.** Headings, CTAs, logo accents. | 60% harmony color — hero backgrounds, primary buttons, brand moments. |
| **Accent · Green** | `#16A34A` | **Freshness/success.** Supporting accent, "approved" states, secondary highlights. | 30% supporting color — secondary buttons, success feedback, nature/fresh cues. |
| **Background** | `#F9FAFB` | **Base/neutral.** App & site background. | 10% structural — surfaces, containers, whitespace. |

> **Full technical profile note:** Best practice is to also list **RGB, CMYK, and Pantone** equivalents for each brand color (for print/off-screen precision). Currently the kit documents **Hex only** — see [Color Gap](#color-gap) in §7.

### 3.2 Color usage rules

- **60/30/10 distribution:** roughly 60% harmony (orange/brand), 30% supporting (green), 10% accent/neutral. Don't let accent colors overpower the primary.
- **Use each color for its role** — orange for primary actions/CTAs, green for success/secondary, the light neutral for backgrounds.
- **Don't** set brand text in low-contrast pairs (e.g., orange text on background, green text on orange) — ensure legibility (see Accessibility Rule).
- **Accessibility:** always verify contrast against WCAG AA for body text. Use the light neutral as the safe canvas; pair strong text colors with near-white surfaces.

---

## 4. Typography

See **`DESIGN-TOKENS.md`** for the typographic intent. Current intent: **serif headings + sans body** (classic Sofrito pairing).

### 4.1 Type pairs

| Level | Typeface class | Example role |
| --- | --- | --- |
| **Headings** | Serif family (e.g., serif display) | H1–H3, hero statements, titles — adds editorial character. |
| **Body / UI** | Sans-serif family | Paragraphs, buttons, navigation, captions — clean and readable. |
| **Monospace** *(optional)* | Monospace | Code, technical annotations, labels. |

### 4.2 Recommended hierarchy scale (target)

| Style | Size | Weight | Role |
| --- | --- | --- | --- |
| H1 | 48–64 px | Bold/Black | Hero headlines |
| H2 | 32–40 px | Bold | Section titles |
| H3 | 24–28 px | Semi-bold | Subsection titles |
| Body | 16 px | Regular | Paragraphs (`line-height 1.5–1.75`) |
| Caption / Meta | 12–14 px | Regular/Medium | Footers, labels, captions |

### 4.3 Rules

- **Fallbacks / web-safe:** always define a fallback stack (system serif `Georgia, 'Times New Roman', serif` for headings; `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` for body) so type remains legible when brand fonts aren't available.
- **Don't** use more than 2–3 type families. Keep one serif for headings and one sans for body.
- **Weights:** stick to the approved weights (Regular, Medium, SemiBold, Bold). Avoid ultra-light/ultra-condensed for body copy.

> **Note:** Font licensing / actual font files are not yet bundled in the kit. Best practice is to attach licensed font files or links — see [Typography Gap](#typography-gap) in §7.

---

## 5. Imagery & Graphic Style

- **Mood:** warm, editorial, craft-forward — likes to feel hand-made and honest, not sterile.
- **Imagery direction:** food-forward, warm kitchen/studio tones; generous use of the orange harmony color; natural light.
- **Consistency:** prefer the warm neutral base (`#F9FAFB`) behind imagery; keep photos warm-toned to match the palette.
- **Avoid:** cold/clinical stock shots, harsh neon, mismatched color grading.

---

## 6. Brand Voice & Tone

| Context | Tone |
| --- | --- |
| **Marketing / social** | Warm, confident, a little playful; speaks like a proud kitchen that knows its craft. |
| **Sales / proposals** | Direct, substantive, outcome-focused; shows competence without jargon. |
| **Support / FAQ** | Helpful, patient, plain-spoken. |
| **Internal / documentation** | Clear, calm, structured — captains make it easy to follow. |

**Always:** say what you mean simply, lead with warmth, back claims with care. **Never:** corporate buzzwords, hype without substance, or a cold/robotic voice.

---

## 7. Known Gaps & Next Steps (Best-Practice Alignment)

These are the items the kit is missing versus industry-standard brand kits. Address them in priority order:

### Vector / master logo files
- Export `logo-master.jpeg` to **SVG + AI/EPS** vector masters and transparent **PNG** variants (full-color, mono-white, mono-black, reversed, icon-only).
- Add web **favicons** (16 / 32 / 48 / 180px PNG + ICO).

### Color profile completeness *(Color Gap)*
- Add **RGB, CMYK, and Pantone** equivalents to `DESIGN-TOKENS.md` (Hex is currently the only documented form). Keep the existing hex values unchanged — this is additive.

### Typography package *(Typography Gap)*
- Add licensed font files and a `typography/` folder with font-family names, weights, and web-fallback stacks.

### Logo variation isolation
- Split `Logo-Designs.jpg` / `Brand-Kit-Samples.jpg` into **individual, named logo files** under `logo_explorations/` (one file per concept) so each variation is reusable on its own.

### Structure & index
- Published `README.md` (done) + this guidelines doc. Keep this folder as the single source of truth and mirror it in the repo.

---

## 8. Change Log

| Date | Change | Owner |
| --- | --- | --- |
| 2026-09-14 | v1.0 — Moved legacy packages to quarantine; verified DESIGN-TOKENS.md stays intact & aligned; rebuilt favicon set; created README + this guidelines doc. | Sofrito Studio (founder) |

---

*Sofrito Studio. Start with a strong foundation.*
