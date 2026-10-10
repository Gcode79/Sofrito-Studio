# Sofrito Studio — Pivot Site (Brand Studio)

Job: 1 · MCP: cloudflare-builds · Last updated: 2026-09-09

Brand foundations for food businesses. Static-first, Cloudflare edge, zero-cost
automation stack. Recipe blog → brand studio.

## Stack (never deviate)

| Layer       | Tool                                        |
|-------------|---------------------------------------------|
| Hosting     | Cloudflare Worker + `[assets]` serving `public/` |
| Database    | D1 (`DB`)                                   |
| Config      | KV (`CONFIG`)                              |
| Async       | Queues `EMAIL_QUEUE` + `WEBHOOK_QUEUE`     |
| Email       | Resend (Worker → Queue → consumer)         |
| Automation  | Make.com (webhook-triggered scenarios)     |
| Payments    | Stripe (services + projects; Gumroad dormant) |
| Newsletter  | Buttondown                                 |
| AI          | OpenRouter (content, copy)                 |
| CI/CD       | GitHub Actions `deploy.yml`, main = prod   |

## One-time Cloudflare setup (the only manual work)

```bash
npx wrangler login

# 1. Resources
npx wrangler d1 create sofrito-db          # paste database_id into wrangler.toml
npx wrangler kv namespace create sofrito-config   # paste id into wrangler.toml
npx wrangler queues create sofrito-emails
npx wrangler queues create sofrito-webhooks

# 2. Schema + config
npx wrangler d1 migrations apply sofrito-db --remote
bash scripts/seed-kv.sh

# 3. Secrets (also mirrored as GitHub Secrets for CI)
# Authoritative list = .env.example. Local-only vars (e.g. OPENROUTER_API_KEY for
# scripts/) go in a local .env, NOT as worker secrets.
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put WEBHOOK_URL             # Make.com scenario endpoint (was MAKE_WEBHOOK_URL)
npx wrangler secret put ADMIN_KEY
npx wrangler secret put TIKTOK_EVENTS_TOKEN
npx wrangler secret put STRIPE_API_KEY          # required for invoice sending
npx wrangler secret put STRIPE_WEBHOOK_SECRET   # required for webhook verification
npx wrangler secret put CALENDLY_WEBHOOK_SIGNING_KEY
npx wrangler secret put BUTTONDOWN_API_KEY

# 4. Deploy + go live
npx wrangler deploy                     # deploys to workers.dev subdomain first
# in wrangler.toml set pattern = "sofritostudio.com" and point DNS (CNAME)
# when the pivot is ready to cut over from the retail site.
```

## Local dev

```bash
npx wrangler dev --local
```

## Layout

```
public/            static HTML (Tailwind CDN, hosted by Worker [assets])
src/worker.js      edge logic: /api/* + queue consumers
src/emails/        Resend HTML templates (seeded to KV)
schema.sql         canonical D1 schema (idempotent)
migrations/        numbered D1 migrations
scripts/           seed-kv.sh, content generators
automations/make/  Make.com blueprint JSONs + README
content/queue/     AI-generated posts awaiting deploy
```

## Live system behavior

- Lead form → `/api/contact` → D1 → queues → Resend confirm + owner alert
  + Make.com scenario S1 (Slack/CRM/Sheets) + drip start.
- Drip: Day 2 / 5 / 9 via Make.com scenarios S2–S4.
- Any Stripe payment (invoice.paid / checkout.session.completed / charge.refunded) → `revenue` log (idempotent) → S6.
- Weekly digest (S8) + monthly revenue report (S9) emailed to owner.
- Sunday 6am content pipeline (S10) drafts next week's posts.
- Case studies auto-draft when a project is marked complete (S11).

See `automations/make/README.md` for the scenario catalog.
See `automations/make/README.md` for the scenario catalog.
## Reliability changes: local validation and rollout

Use Node 22.13+ (CI uses Node 22), then `npm ci`. Run `npm run check`,
`npm run test:queue`, `npm run test:payments`, and `npm run test:runtime`.
The runtime suite applies all D1 migrations to in-memory SQLite and exercises
signed webhook handlers, invoice retries, email recovery, and scheduler claims
with synthetic providers. `npm run check` includes undefined-variable linting.

Before deploying this revision, apply migration `0018_payment_delivery.sql` to
the intended database through the approved deployment process. It adds payment
identities, a processed-payment ledger, and a durable receipt/booking outbox.
Code intentionally fails payment processing if its required schema is missing,
allowing Stripe to retry after the migration is applied. Remote migration and
deployment require founder approval.

New payments record the Stripe PaymentIntent associated with the latest paid
purchase. Historical rows are not matched by email on refunds. Reconcile legacy
refunds against Stripe and backfill payment identities only after verifying the
specific purchase. Unmatched refunds emit a reconciliation error instead of
changing unrelated lead records.

Payment emails are persisted before acknowledging Stripe. Immediate dispatch
and the hourly outbox sweep enqueue pending work using stable delivery IDs.
Queue retries reuse the provider idempotency key; successful delivery records
suppress later redeliveries. Monitor pending outbox rows and the email dead-letter
queue. Outbox recovery covers publication to the queue; exhausted provider
retries still require dead-letter reconciliation. Provider idempotency retention
is finite, so reconcile ambiguous sends before replaying very old messages.

Invoice retries persist the remote invoice ID, inspect its state and marked
line items, and use a separate idempotency key for each Stripe write. Existing
unmarked draft invoices and uncertain legacy attempts require reconciliation
before retrying them. The social scheduler has separate provisioning and approval
requirements documented in `post-scheduler/OPERATIONS.md`.