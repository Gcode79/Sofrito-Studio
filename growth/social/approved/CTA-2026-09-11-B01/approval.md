# CTA-2026-09-11-B01 — Approval Record (6 Brand-Bar Video Ads)

Status: ✅ APPROVED — per founder decision 2026-09-11 (option 1); publishing ROUTE AMENDED by founder 2026-09-12: automated queue publish via post_to_meta.py + post_to_pinterest.py, 6 unique videos (business-model render = duplicate of Video 06, dropped from scope, asset retained), platforms IG + FB + Pinterest only (TikTok skipped). Queue = 12 entries (ig-101…ig-106, fb-101…fb-106) + 6 pins; first due 2026-09-12 21:00 UTC.

## Approval request (8 elements, per approval-workflow.md)
1. **Exact action:** publish the 6 unique approved CTA video ads (9:16 Reels / full-bleed pins) with the exact per-platform captions in `caption.txt`.
2. **Exact accounts/platforms:** Instagram, Facebook, Pinterest — footer platforms only (TikTok SKIPPED 2026-09-12). ALL 6 unique ads to IG + FB (Reels via post_to_meta.py) + Pinterest (video pins via post_to_pinterest.py). Account handles/IDs resolved from .env tokens.
3. **Exact target links (each CTA opens):**
   - Instagram: https://sofritostudio.com/?utm_source=instagram&utm_medium=video&utm_campaign=cta_b01
   - Facebook: https://sofritostudio.com/?utm_source=facebook&utm_medium=video&utm_campaign=cta_b01
   - Pinterest: https://sofritostudio.com/?utm_source=pinterest&utm_medium=video&utm_campaign=cta_b01
   - TikTok: https://sofritostudio.com/?utm_source=tiktok&utm_medium=video&utm_campaign=cta_b01
4. **Objective:** awareness + traffic — direct food-business owners to sofritostudio.com (footer funnel).
5. **Evidence:** original producer-owned assets; 7/7 pixel-verified (dims/fps/duration/audio, CTA bar); see `asset-register.md`. No fabricated clients, venues, people, reviews, or results in copy.
6. **Timing (amended 2026-09-12 by founder):** automated cadence 21:00 UTC for 6 consecutive days — Sat 2026-09-12 through Thu 2026-09-17. Each IG/FB Reel + matching Pinterest pin posts on the same day. Scripts run before each due time; anything not due stays queued.
7. **Assets + permission:** 7 publish-ready files below; permission APPROVED per `asset-register.md`; captions source of truth = `caption.txt` this folder.
8. **Nothing assumed — resolved 2026-09-11, amended 2026-09-12:** (a) ads = 6 unique (duplicate business-model render un-referenced); (b) platforms = IG + FB + Pinterest, TikTok skipped; (c) excluded clips moved to `Downloads\Video\CTA-drafts-DRAFT\excluded\` (kept, not published); (d) alt text = approve base descriptor as-is; (e) publishing = automated queue route (post_to_meta.py / post_to_pinterest.py), requires .env tokens + deploy. Gating items still requiring founder action: .env values and `npx wrangler deploy` approval.

## Publish-ready asset set (approved scope = 6 unique files used; 7 physical files retained)
- `Google Flow - Sep 11 - 16-34_CTA_1080x1920.mp4` — Video 01 (queued ig-101/fb-101, pin cover-01)
- `Google Flow - Sep 11 - 16-34_2_CTA_1080x1920.mp4` — Video 02 (queued ig-102/fb-102, pin cover-02)
- `Google Flow - Sep 11 - 16-34_3_CTA_1080x1920.mp4` — Video 03 (queued ig-103/fb-103, pin cover-03)
- `Google Flow - Sep 11 - 16-34_4_CTA_1080x1920.mp4` — Video 04 (queued ig-104/fb-104, pin cover-04)
- `Google Flow - Sep 11 - 16-34_5_CTA_1080x1920.mp4` — Video 05 (queued ig-105/fb-105, pin cover-05)
- `Google Flow - Sep 11 - 16-34_6_CTA_1080x1920.mp4` — Video 06 (queued ig-106/fb-106, pin cover-06)
- `SofritoStudio_ad_business_model_1080p_CTA_1080x1920.mp4` — byte-identical duplicate of Video 06; retained, NOT queued (decided 2026-09-12)

All in: `C:\Users\josho\SofritoStudio\growth\social\approved\CTA-2026-09-11-B01\publish-ready\` (1080x1920, 24fps, ~10s, H.264+AAC).

## Excluded (NOT in scope — held as DRAFT, do not publish)
- 3× `v12771gd*.mp4` clips — moved 2026-09-11 to `C:\Users\josho\Downloads\Video\CTA-drafts-DRAFT\excluded\` (kept for reference, disposition per founder acceptance of recommendation).

## Associated draft docs (this folder)
- `caption.txt` — exact per-platform caption copy + UTM links (source of truth).
- `alt-text.md` — per-video alt text.