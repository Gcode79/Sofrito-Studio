# Kilo Deploy Prompt — Sofrito Partners Affiliate Program

Paste this to Kilo in a **Sofrito-only** session when at the PC.

---

Deploy the Sofrito Partners affiliate program. Commit `c6baec54ca386a7fb6cfd14835fa81007c5c7069` is already on main
(Sofrito-Studio repo). This is code deploy + one D1 migration. One project, one session.

## Step 0 — Repo identity check (do this first, report it)

1. Confirm the repo remote is Sofrito-Studio (not mise-portal).
2. `git rev-parse HEAD` — expect `c6baec54ca386a7fb6cfd14835fa81007c5c7069`.
3. `git status` — expect a clean tree. If anything is dirty, STOP and report
   what is dirty before touching anything.

## Step 1 — Apply migration 0017 FIRST (before the worker deploy)

The worker code writes `leads.ref_code` on every lead insert. If the column
doesn't exist when the new worker goes live, lead inserts fail and we lose
sales. Migration before deploy, no exceptions.

```bash
npx wrangler d1 execute sofrito-db --remote --file pivot-site/migrations/0017_affiliate_program.sql
```

Then verify:

```bash
npx wrangler d1 execute sofrito-db --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'affiliate%';"
npx wrangler d1 execute sofrito-db --remote --command "PRAGMA table_info(leads);" | grep ref_code
```

Expect: `affiliates`, `affiliate_clicks`, `affiliate_attributions` tables exist,
and `leads` has a `ref_code` column. If any of that is missing, STOP — do not
deploy the worker.

## Step 2 — Deploy the worker

```bash
npx wrangler deploy
```

## Step 3 — Verify live (report each result)

1. `curl -s https://sofritostudio.com/partners | head -5` — expect the
   partners page HTML (200, served at the pretty URL, no redirect chain).
2. `curl -s https://sofritostudio.com/partners.html | head -5` — expect the
   same page (direct .html still serves).
3. `curl -s -X POST https://sofritostudio.com/api/partners/click -H 'Content-Type: application/json' -d '{"code":"NOPE","landing_page":"/"}'`
   — expect `{"ok":true,"tracked":false}` (unknown code, no crash).
4. `curl -s "https://sofritostudio.com/?ref=TEST-1234" -o /dev/null -w "%{http_code}\n"` — expect 200.
5. In a browser: visit `https://sofritostudio.com/?ref=TEST-1234`, confirm the
   `sofrito_ref` cookie is set with a 30-day expiry, then submit the lead form
   and confirm the network payload includes `ref_code: "TEST-1234"`.
6. `GET https://sofritostudio.com/api/partners/payouts` WITHOUT an
   Authorization header — expect 401. (Admin route must not leak.)

## Step 4 — Calendly dashboard (manual, in the Calendly web UI)

The worker already reads a "referral code" answer from the Calendly webhook
(`answerFor('referral', 'referral code', 'codigo')` in `src/lib/booking.js`),
but the question doesn't exist yet. In Calendly:

1. Open the Sofrito Strategy Session event type → Booking page → Questions.
2. Add an optional short-text question labeled exactly: **"Referral code (if someone sent you)"**.
3. Save. Test-book once with a code and confirm it lands in the booking's
   `answers` JSON (check the worker log or the `calendly_bookings` row).

Until this is done, Calendly bookings won't capture codes — the `?ref=` cookie
+ lead-form path still works.

## What this ships

- `/partners` — offer page ($100 flat per first payment), signup form,
  swipe copy, FAQ. Signup returns a `CODE` + `sofritostudio.com/?ref=CODE`.
- `POST /api/partners/signup` — Turnstile + 10/min IP limit, like /api/lead.
- `POST /api/partners/click` — click beacon (stats only).
- `GET/PATCH /api/partners/payouts` — admin ledger; PATCH `?mark_paid=<id>`
  after a manual payout goes out.
- Attribution: `?ref=` → 30-day `sofrito_ref` cookie → `ref_code` on the lead
  (lead form, founding application, contact form, Calendly Q&A). On first
  Stripe payment the webhook creates ONE $100 attribution (UNIQUE on lead_id —
  redeliveries can't double-pay).
- Share button in the site footer (native share sheet / clipboard fallback).

## Standing rules for this deploy

- Migration 0017 before worker deploy. Always.
- Never generate, print, log, or store secrets. `ADMIN_KEY` stays where it is.
- Report the verification results; don't just say "deployed."
