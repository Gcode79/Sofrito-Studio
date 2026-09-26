# QA Matrix — Phase 1 (16 rows)

| # | Test | Expected |
|---|------|----------|
| 1 | Empty submit | Inline errors, no network call |
| 2 | Bad email / 3-digit phone | Inline errors, rejected |
| 3 | Valid submit, no Turnstile token | Blocked client-side |
| 4 | End-to-end, Stripe test card 4242… | Stripe → pay → webhook → D1 `paid` → receipt + booking emails → `/success.html` with working prefilled Calendly link |
| 5 | Declined card 4000…0002 | Stripe decline; lead stays `checkout_started`; no emails; cancel path works |
| 6 | Replay `checkout.session.completed` ×2 | Exactly one receipt + one booking email |
| 7 | Webhook bad signature | 401, no state change |
| 8 | Abandon 2h+ | One nudge email, lead `abandoned` |
| 9 | Double-submit same email < 15 min | One lead row |
| 10 | Both A/B variants | `sprint.html` → `sprint_page`, `sprint-boh.html` → `boh_sprint_page` in D1 |
| 11 | Mobile 375px | Form + Turnstile usable, no horizontal scroll |
| 12 | All 4 business types | Pitch line changes; correct value stored |
| 13 | Turnstile secret unset | POST /api/lead → 400 fail-closed, no DB write |
| 14 | Stripe metadata encoding | Checkout creation uses `metadata[lead_id]` as URL-encoded form field, not JSON |
| 15 | Nudge uses stored URL | Abandonment nudge uses `checkout_url` from D1, never a fabricated URL |
| 16 | Migration 0010 applies cleanly | All 10 migrations apply from a fresh DB with zero errors |
