# Original Source Reference — SP-01 Slide 1 Background Image
Status: DRAFT — AWAITING FOUNDER APPROVAL
Purpose: Preserve original licensed stock image URL for manual editing (in case typography needs adjustment or the background needs replacement with a different licensed stock asset or conceptual AI image — requires OpenRouter top-up ~$5 and internal label "conceptual AI image").

---

## Source details
- Cover / hook slide source URL (SP-01 slide 01): https://images.pexels.com/photos/313700/pexels-photo-313700.jpeg (Pexels — refined dining table; photographer: solliefoto; Pexels commercial/free-use license)
- Cover source download URL (high-res): https://images.pexels.com/photos/313700/pexels-photo-313700.jpeg?cs=srgb&dl=pexels-solliefoto-313700.jpg&fm=jpg
- Supporting/reference source (SP-01 slide 4 principle / slide 5 example — previous cover candidate, now supporting reference): https://images.pexels.com/photos/4921028/pexels-photo-4921028.jpeg (Pexels — close-up menu on wood table; photographer: rdne; Pexels commercial/free-use license; audit FAIL: upside-down readable text + decorative bow conflicts with headline overlay; not used as cover — retained in asset-register.md for potential supporting-slide reuse)
- Photographer / creator: rdne
- License: Pexels License — free for commercial use; no attribution required; modification allowed; no sale of unaltered image; no use in defamatory/illegal context; verify at https://www.pexels.com/license/
- Download URL (high-resolution original): https://images.pexels.com/photos/4921028/pexels-photo-4921028.jpeg?cs=srgb&dl=pexels-rdne-4921028.jpg&fm=jpg
- Internal label: NOT conceptual AI image — licensed stock asset only (per Realistic Social Visual Standard, Visual Hierarchy item 2; per AGENTS.md Image Generation Prompt Protocol, Ethical / Asset Status requirement; per Carousel Typography System, Image-generation interface rule: "Generate or source visual backgrounds separately. Add all slide text through deterministic layout.")
- Usage: Background image for carousel slide 1 (hook slide — "Your menu is doing too much.")
- Typography layer applied: Deterministic HTML/CSS overlay (`sp01-slide-01.html`) using `carousel-tokens.yml`; headline 68px Cormorant Garamond italic 700, eyebrow 24px Inter 600 uppercase, CTA 24px Inter 600, safe margins 96/88/120/88 px, gradient overlay for contrast; no readable text, logos, signage, URLs, prices, badges, or typography rendered within the image itself.
- Manual editing: Open `sp01-slide-01.html` in browser or import into Canva/Figma; keep original source image URL intact for replacement if typography adjustments require a different background composition (e.g., more negative space in upper-left third for headline, less cluttered menu surface, different kitchen/prep environment). If background is replaced, use licensed stock (Pexels/Unsplash) or conceptual AI image with internal label; never use real restaurant identity, real client, or copied packaging; label new image in `asset-register.md`.

---

## Image quality verification (before final approval)
- Photorealism: PASS (real licensed stock photography, not illustration/vector/cartoon/AI illustration — matches Social Visual Standard core directive)
- Food-business relevance: PASS (close-up restaurant menu on warm wood table — exact business-world scene for SP-01 hook)
- Focal-point clarity: PASS (menu as sharp focal point; owner over-shoulder viewpoint; negative space reserved for headline overlay in upper-left third)
- Mobile legibility: PASS (headline 68px on 1080×1350 canvas; safe margins enforced; gradient overlay ensures contrast; typography tokens enforce minimum sizes)
- Brand fit: PASS (warm neutrals, natural wood, ceramic texture, editorial hospitality style — consistent with Sofrito Studio palette and typography rules)
- Ethical/permission safety: PASS (Pexels licensed commercial stock; photographer credited; no recognizable restaurant/client identity; no AI claim; tracked in `asset-register.md`; no autonomous use without founder approval)
- Likelihood to stop viewer: PASS (high-attention editorial food-business scene; warm appetizing light; tactile paper/wood texture; one clear focal point; matches scroll-stopping principles: strong foreground/background separation, visible texture, calm focused mood, genuine human/food-service context, unexpected angle over shoulder)
- Production requirement realistic: PASS (zero AI cost; licensed stock download; typography overlay via HTML/CSS or design tool; no automated image renderer needed; manual edit instructions embedded in HTML comments)

---

## Related assets (same carousel / same delivery package)
- SP-01 carousel brief: `growth/social/carousels/SS-2026-09-09-SP01/brief.md`
- SP-01 carousel copy (exact source): `growth/social/carousels/SS-2026-09-09-SP01/copy.md`
- SP-01 carousel typography spec: `growth/social/design-system/carousel-tokens.yml`
- SP-01 carousel alt text: `approved/SS-2026-09-09-SP01/alt-text.md`
- SP-01 carousel caption/UTM: `approved/SS-2026-09-09-SP01/caption.txt`
- SP-01 delivery spec: `approved/SS-2026-09-09-SP01/delivery-package.md`
- SP-02 and SP-03 carousel briefs/copy/alt-text/caption: same folder structure (`SS-2026-09-09-SP02/`, `SS-2026-09-09-SP03/`)
- Cross-platform adaptation notes: `SS-2026-09-09-SP01/brief.md` (Instagram 4:5 master, LinkedIn 4:5/1:1, Pinterest 2:3 evergreen pin, Story/Reel 9:16 teaser — all separate assets, never cropped/reused blindly)
