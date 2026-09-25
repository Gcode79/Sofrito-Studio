# Ops — Now (current operating state, refreshed each working session)

> Snapshot 2026-09-13. This file is the single 5-minute catch-up for anyone (founder or agent) resuming work. When something changes, update it — do not let it go stale.

## Right now (2026-09-13)
- **LOGO PLACEMENT RESOLVED (D30, founder 2026-09-13):** Trans-logo.jpg is now the live logo on header, footer, package cards via logo-master.jpeg replacement; assets/logo.svg points to the live Trans-logo content.
- **TWO-OFFER CONVERSION LIVE (D26, founder-approved "Yes, deploy now"):** site now sells exactly two offers — **Sofrito Session ($400, 90 min, written action-plan)** and **Brand & Web Sprint ($997)**. Session $400 up front books the spot and is credited toward a Sprint booked within 30 days; Sprint balance $597 settles before launch; files release just after the balance clears. Worker **Version `09df907b-74b6-4e78-905d-d920e98b2838`** (15 files). Invoice engine: `SESSION_CENTS=40000`, milestones `session`→`final`, split = `{session: min(price,40000), final: price-session}` → 40000/59700.
- **Calennly payment gate & related actions (founder 2026-09-12):** founder must enable payment (Stripe/Square) on Calennly event (set to $400), connect Zapier per sprint-intake.md, and configure Stripe secrets/webhook for automated $597 invoice.
- **Sprint intake SOP WRITTEN (D24), figures ALIGNED to D26 model (D26):** `ops/sops/sprint-intake.md` — Zapier intake (welcome email + 4-question Google Form + Drive folder `«Client» — Brand & Web Sprint` + Sheets tracker row), **$597 invoice runbook** (before 48h sprint), optional $50/mo Site Care upsell, blocker table with founder-manual checklist. Session-$400-credited-within-30-days copy baked in.
- **Transcript blueprint verified:** the founding blueprint for the Sprint (product plan + setup requirements) is fully mapped — page copy LIVE, gateway/invoice/intake documented; the only true blockers are founder-manual (Calendly payment gate, Zapier connections, Stripe secrets).
- **Audit complete (D6).** 15-row D1 lead pool = QA/deploy artifacts, zero verified real leads, zero revenue. Prior "11 real leads" premise retracted across all docs.
- **DEPLOY BATCH LIVE (founder-approved, D17, 2026-09-10):** GA4 (D9) + `page_view` (D11) + F7 money-views. LIVE version `a7cb86fb-97f9-4062-bd8f-3b0e1c3d6b00`; homepage 200, /api/health ok; migration `0005` applied + ledgered. Revenue views return dollars (0.0 — revenue table empty, latent until real revenue).
- **Sitemap S1 fixed + committed (`4b3c3cd`, D18):** `work/spec-concept-03.html` added; generator aligned to `pivot-site/public`. **NOW LIVE** — live `sitemap.xml` returns 26 URLs including spec-concept-03 and `sprint.html` (D26 gap closed; follow-up deploy approved + executed 2026-09-12).
- **D26 deploy LIVE:** Site URL 200, `/services` two-offer, `/faq` $400/credit/$597/file-release answers, `/sprint` CTA count verified. **Sitemap sprint.html fix DEPLOYED (Version `ee2325fa-4bf8-4d5e-b7c0-da812440523d`) + LIVE** — live `sitemap.xml` = 26 URLs incl. `sprint.html`.
- **Abuelas 3D reel RETIRED (D19):** annotated legacy in `remotion-abuelas-ipad`; new food-business-branding reel continues in `video-ads/` (awaiting founder option pick).
- **Pinterest switch to TXT record (D22):** `pinterest-site-verification=2b1a51f24ce4babf33e28a270bb9be2a` added at @ root (pending propagation + Pinterest retry).
- **EXCLUDED from D17 batch (need owner decision):** D4 Calendly webhook code (staged, requires D3 inputs) + 75-to-90-min copy edits + sessionBtn hidden-line removal — FLAGGED to founder.
- ## Known defects / loose ends (active)
  1. **Placeholder emails:** 14/16 email templates missing from KV → confirmations/drip/follow-ups send a bare subject line. Fix ready (seed KV).
  2. **Retainer waitlist leaks:** inert CTAs, no capture. Fix ready (POST `/api/leads`, source=`waitlist`).
  3. **Session checkout gap:** session.html promises checkout, routes to contact form. Stopgap copy +/or staged booking deploy (D4).
  4. **Legacy docs out of date:** `marketing/general/kpi-scorecard.md` + `marketing/content_calendar/calendar.md` describe the retired product model — reconcile or archive.
  5. **Sprint $400 gate not live:** Calendly event `is_paid: false`, and configured at $300 vs the site's D26 $400 — founder must enable payment (Stripe/Square) in Calendly UI **at $400** (SOP Step 0).
  6. **Zapier intake + $597 invoice not automated:** runbook written (D24/sprint-intake.md) but Zap + invoice require founder accounts/secrets.
  7. **Brand Foundation undecided:** no price/deliverables; empty ladder slot.
- ## Blockers (waiting on owner)
  - **Sprint manual steps (highest priority to close the offer):** (1) set Calendly payment gate to **$400** (currently `is_paid:false`, config $300), (2) connect Calendly+Gmail+Drive in Zapier and create the intake Zap, (3) Stripe secrets + dashboard webhook for the automated $597 invoice (D10).
  - Approval to pursue real-demand: qualify the social-scan enrichment prospects (DavIsa/El Inquieto, Growee, El Chilar HF, Paldy) — the only real people on record — and/or choose a capture-validation move (D1 pool had zero real leads).
  - Calendly event URL + webhook signing key (D3 inputs for D4 staged booking code).
  - Stripe account + `STRIPE_API_KEY`.
  - Billing mode (charge-at-booking vs invoice-after) — OD7.
  - Decisions: Brand Foundation (OD4), La Mesa policy (OD5), Tier 3 (OD6), Day-14 nurture email (OD8).
  - Client-site boilerplate stack: **DECIDED (D25) — static HTML/Tailwind template** matching the deployed Workers stack, forks per client in minutes (rejects transcript's Next.js boilerplate). **BUILT 2026-09-12:** `client-templates/client-site-basic.html` (Variant A, bright — 54 fork tokens, accordion menu, sticky mobile CTA, no build step) **and** `client-templates/client-site-artisan.html` (Variant B, dark artisan — Deep Red #910A0A/charcoal + Honey Gold #E0A020, 17 fork tokens, zero CDN refs); sprint-intake.md amended to reference both variants for the 1-Page Engine deliverable, picked by brand personality.
- ## In flight (no sign-off required — reversible, housekeeping)
  - **Two-offer conversion DEPLOYED (D26):** version `09df907b-74b6-4e78-905d-d920e98b2838` live (15 files). Decision logged; `now.md` + sprint-intake figures aligned.
  - **Sitemap sprint.html entry DEPLOYED (D26 follow-up, owner-approved 2026-09-12):** Version `ee2325fa-4bf8-4d5e-b7c0-da812440523d`; live `sitemap.xml` now 26 URLs (sprint.html verified). Closed.
  - **Sprint intake SOP DONE (D24), figures aligned (D26):** `ops/sops/sprint-intake.md`; decision log updated.
  - **Sitemap gap S1 FIXED + COMMITTED (`4b3c3cd`, D18):** generated set (25) == committed set (25). **LIVE** since the D26 deploy (`spec-concept-03` verified in live `sitemap.xml`).
  - **Pinterest TXT record (D22):** DNS record added externally; pending propagation + Pinterest retry.
  - **Skill registration junction `pivot-site/.agents/skills/`:** DEFERRED (D16 follow-up) — creating a local NTFS junction is a system-level change; noted here, not performed. Decide at next session.
  - **Abuelas 3D reel RETIRED (D19):** annotated legacy-only; new reel work continues in `video-ads/` (awaiting founder option pick).
  - Staged-but-not-deployed code: only D4 Calendly webhook remains (see EXCLUDED line above).
- ## Toolchain reminders
  - D1 (remote) via MCP: database id `07a14d9b-...9071a` (wrangler token lacks D1 scope — use MCP for DB).
  - KV config namespace `087850adfcab4ecf86a6987e32cc4cb2`.
  - Live worker `40c50672-...`, account `b10d2ee39fa75abc3de1799de8903ebc`.
  - Wrangler: always `-c wrangler.toml` from `pivot-site/`; `npm run check` + `wrangler deploy --dry-run` before any deploy.
  - Local commits exist but are NOT pushed.
