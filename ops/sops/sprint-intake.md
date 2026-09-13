# Sofrito Studio — Sprint Intake SOP ($997 Brand & Web Sprint)

> Purpose: the operational runbook that makes the live `/sprint` offer fulfillable — payment gate, Zapier intake, Drive folder, and the final $597 invoice. Written 2026-09-12; supersedes nothing. Logged as D23 follow-up. Figures updated 2026-09-12 to the founder-approved two-offer model (Session $400 up front, credited within 30 days; Sprint balance $597; total $997) — see D26.
> Standing rule (repo AGENTS.md): any step that charges a client, sends a message, deploys, or creates live automation requires founder sign-off. This SOP is the runbook; it does not self-approve.

## Pipeline at a glance

```
Calendly booking (paid $400)            Booking locked behind payment gate
   └─ Zapier trigger: "Invitee Created" (event = Sofrito Strategy Session)
        ├─ Action 1: Welcome email (Gmail) → Google Form link
        ├─ Action 2: Google Drive folder "«Client» — Brand & Web Sprint"
        └─ Action 3 (optional): row in intake tracker (Sheets) → D1/digest mirror
Session (60 min, taste-test + scope map) ────────────────────────────────┐
   └─ $597 invoice sent (Stripe) right after session, before sprint start │
        └─ 48-hour sprint → domain connect → hand-off keys  ←────────────┘
```

## Client site build (D25 — static template, no build step)

- The 1-Page Engine deliverable is built from one of two static templates (decision D25: static HTML + token-based utilities, no Node/Next.js runtime, no CDN/build step, deploys to Cloudflare). Pick by the client's brand personality:
  - **`client-templates/client-site-basic.html`** — Variant A, bright/energetic: for vibrant pop-ups, food trucks, casual fast-casual concepts (Sofrito-orange defaults).
  - **`client-templates/client-site-artisan.html`** — Variant B, dark/moody artisan: Deep Red `#910A0A` + charcoal with Honey Gold `#E0A020` accents — for craft beverage makers, bakeries, intimate/evening dining.
  Fork one copy per client, replace the `{{ }}` tokens, swap the logo (Variant B: also drop a real `<img>` into the Story-section placeholder), and set `{{order_url}}` / `{{order_phone}}` (A) or `{{order_link}}` (B) to the client's real ordering channel before go-live.
- This keeps the "zero monthly hosting fees" offer truthful and fulfillment in hours, not days. Follow `ops/sops/deploy.md` (pinned `--config wrangler.toml` for Workers routes; dry-run + check first). Never deploy without founder sign-off (repo AGENTS.md gate).

## Step 0 — Payment gate (OWNER, manual — currently NOT live)

- The Calendly event "Sofrito Strategy Session" exists (API-created, 60 min, color `#d93b26`, custom question "Please share anything that will help prepare for our meeting.").
- **`is_paid` is currently `false`** — the $400 is NOT collected at booking. The Calendly API cannot set payment; the founder must enable it in the Calendly UI:
1. Calendly dashboard → event "Sofrito Strategy Session" → Booking page settings.
   2. Connect Stripe or Square under Payments.
   3. Enable payment collection: amount **$400 USD**, non-refundable. (Founder-approved two-offer model, D26: the $400 Session fee books the spot and credits toward a Sprint booked within 30 days; the $597 balance settles before launch; total $997.)
- Until this is done, the offer has no tire-kicker gate. This is the single highest-priority manual step. `VERIFIED` (Calendly API `is_paid: false`, event URI `6ebf2993-92cc-4d51-bafa-ac055bb6019f`).

## Step 1 — Zapier intake (OWNER, manual; blocked until accounts connected)

The Zap below is the runbook. Create it in the Zapier dashboard (or via the connected Zapier MCP once relevant actions are enabled + accounts authenticated). Trigger source = Calendly booking.

- **Trigger:** Calendly → "Invitee Created" (filter: event type = Sofrito Strategy Session).
- **Action 1 — Welcome email (Gmail):** short, direct, no-jargon (brand voice). Body:
  - Thank them + restate the offer ($997, $400 credited toward a Sprint booked within 30 days).
  - Confirm the 60-minute session and invite them to come with menu + social links.
  - Link to the intake Google Form (below).
- **Action 2 — Google Drive folder:** create `«Client Name» — Brand & Web Sprint` under the client workspace root.
- **Action 3 (optional, recommended) — Google Sheets row:** append client name, email, booking time to the intake tracker; this feeds the D1/lead mirror and weekly digest discipline (`ops/now.md`, `data hygiene` standing rule).

### Intake Google Form questions (ready to paste)

Form prefilled from Calendly where possible (name, email). Keep to 4 questions — sprinters ignore long forms.

1. **Current menu** — Link, PDF, or photo of your current menu.
2. **Today's order path** — Where do customers order/find you right now (Linktree, IG, website, delivery apps)? Paste links.
3. **Three brands you love** — Name 3 food brands whose look/vibe you admire (and why, in one line each).
4. **Anything else we should taste first?** — Short free-response.

## Step 2 — Final $597 invoice (OWNER, manual until Stripe secrets deployed)

- **Timing:** immediately after the Strategy Session concludes, before the 48-hour sprint starts (per offer: "$400 Sofrito Session … pay the remaining $597 and we launch").
- **Mechanism:** Stripe invoice (payment processor per D2). **Blocked today:** `STRIPE_API_KEY` / `STRIPE_WEBHOOK_SECRET` are NOT deployed to the live worker (D10, verified), so no automated invoice path exists yet. Until the founder sets those secrets + the Stripe dashboard webhook, invoices must be sent manually from the Stripe dashboard (or an approved invoicing tool).
- **Data discipline:** record every invoice/payment in D1 as it occurs; never fabricate numbers (standing rule).
- **Template content:** `$597 — remaining balance, Brand & Web Sprint («Client»). $400 session fee already credited. Includes: logo suite, Brand in a Box folder, 1-page website, one revision round, domain connect + hand-off.`

## Step 3 — Post-launch upsell (optional, not yet priced/approved)

- Offer the **Site Care retainer ($50/mo)** to live clients: menu/site updates (~15 min/mo) + traffic monitoring via Cloudflare Observability.
- Not yet a decided offer — log a decision memo before first client is pitched (repo sign-off rule).

## Open items / blockers at time of writing (2026-09-12)

| # | Item | Who | Status |
|---|---|---|---|
| 1 | Enable $400 payment gate on Calendly (Stripe/Square) | Founder, Calendly UI | **Manual — the only true blocker to a gated offer** |
| 2 | Connect Calendly + Gmail + Drive in Zapier; create the Zap | Founder (+ agent assist via MCP) | Not started — needs accounts |
| 3 | Stripe secrets + dashboard webhook (for automated $597 invoice) | Founder + approve worker secret deploy | Blocked (D10) |
| 4 | Invoicing mechanism choice (Stripe invoice vs tool) | Founder | Open (OD7 family) |

## Checklist before the first paid booking

- [ ] Calendly event shows a `$400` payment on the booking page (gap: it does not today).
- [ ] Zapier Zap live (email + Drive folder + tracker row).
- [ ] Intake Google Form live + linked from the welcome email.
- [ ] $597 invoice template ready (manual path at minimum).
- [ ] First client approved by founder (repo AGENTS.md contact gate).