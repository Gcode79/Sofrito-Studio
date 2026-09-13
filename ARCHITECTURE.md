# Sofrito Studio Architecture

This document describes the technical architecture of the Sofrito Studio platform, a brand studio for food businesses built on Cloudflare Workers.

## Overview

Sofrito Studio is a static-first, Cloudflare edge platform that provides brand foundations for food businesses. The system combines a static frontend hosted on Cloudflare Workers with a D1 database, KV storage, and various third-party integrations.

## Technology Stack

| Layer       | Tool                                        | Description |
|-------------|---------------------------------------------|-------------|
| Hosting     | Cloudflare Worker + [assets] serving public/ | The application runs as a Cloudflare Worker, serving static assets from the public/ binding and handling API routes. |
| Database    | D1 (DB)                                   | SQLite-compatible database for storing leads, automation data, and business logic. |
| Config      | KV (CONFIG)                              | Key-value store for configuration, email templates, and runtime configuration. |
| Async       | Queues EMAIL_QUEUE + WEBHOOK_QUEUE     | Cloudflare Queues for asynchronous processing of email sends and webhook handling. |
| Email       | Resend (Worker  Queue  consumer)         | Email sending via Resend, triggered by queue consumers. |
| Automation  | Make.com (webhook-triggered scenarios)     | Workflow automation for lead nurturing, CRM updates, and reporting. |
| Payments    | Stripe (services + projects; Gumroad dormant) | Payment processing for services and projects. |
| Newsletter  | Buttondown                                 | Newsletter distribution and subscriber management. |
| AI          | OpenRouter (content, copy)                 | AI-powered content generation and copywriting via OpenRouter. |
| CI/CD       | GitHub Actions deploy.yml, main = prod   | Automated deployment on push to main branch. |

## One-time Cloudflare Setup

The following manual steps are required to set up the Cloudflare resources:

1. **Create Resources**
   `ash
   npx wrangler login
   npx wrangler d1 create sofrito-db          # paste database_id into wrangler.toml
   npx wrangler kv namespace create sofrito-config   # paste id into wrangler.toml
   npx wrangler queues create sofrito-emails
   npx wrangler queues create sofrito-webhooks
   `

2. **Apply Schema and Seed Config**
   `ash
   npx wrangler d1 migrations apply sofrito-db --remote
   bash scripts/seed-kv.sh
   `

3. **Set Secrets**
   `ash
   npx wrangler secret put RESEND_API_KEY
   npx wrangler secret put WEBHOOK_URL             # Make.com scenario endpoint
   npx wrangler secret put ADMIN_KEY
   npx wrangler secret put TIKTOK_EVENTS_TOKEN
   npx wrangler secret put STRIPE_API_KEY          # required for invoice sending
   npx wrangler secret put STRIPE_WEBHOOK_SECRET   # required for webhook verification
   npx wrangler secret put CALENDLY_WEBHOOK_SIGNING_KEY
   npx wrangler secret put BUTTONDOWN_API_KEY
   `

4. **Deploy**
   `ash
   npx wrangler deploy                     # deploys to workers.dev subdomain first
   # Update wrangler.toml with production domain and point DNS (CNAME) when ready
   `

## Local Development

`ash
npx wrangler dev --local
`

## Project Layout

`
public/            Static HTML (Tailwind CSS via CDN) hosted by Worker [assets]
src/worker.js      Edge logic: handles /api/* routes and queue consumers
src/emails/        Resend HTML templates (seeded to KV during setup)
schema.sql         Canonical D1 schema (idempotent)
migrations/        Numbered D1 migration scripts
scripts/           KV seeding script and content generators
automations/make/  Make.com blueprint JSONs and documentation
content/queue/     AI-generated social media posts awaiting review and deploy
`

## System Behavior

- **Lead Handling**: Form submissions go to /api/contact → stored in D1 → trigger queues → Resend confirmation email + owner alert → Make.com scenarios for Slack/CRM/Sheets integration and drip campaign initiation.
- **Email Drip**: Automated follow-ups on days 2, 5, and 9 via Make.com scenarios.
- **Payment Processing**: Stripe payment events (invoice.paid, checkout.session.completed, charge.refunded) are logged idempotently to the evenue table and trigger a revenue reporting scenario (S6).
- **Reporting**: Weekly digest (S8) and monthly revenue report (S9) are emailed to the business owner.
- **Content Pipeline**: Every Sunday at 6am, a content generation pipeline (S10) drafts the next week's social media posts.
- **Case Studies**: When a project is marked complete, an automated workflow (S11) drafts a case study.

For detailed automation scenarios, see utomations/make/README.md.

## Deployment

The platform is deployed via Wrangler. See the project's README.md for quick start instructions and ops/now.md for the current live worker version and deployment notes.

