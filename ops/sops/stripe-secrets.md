# Sofrito Studio — Stripe Webhook Secret Separation

## Directive (standing, permanent)

The two sites share **one Stripe account** but keep **separate webhook signing
secrets, permanently**. A signing secret is never shared or swapped between
workers — not for convenience, not for a migration, and **not at live-mode
cutover**.

## Endpoint → worker mapping

| Endpoint id | URL | Worker | Worker env var |
|---|---|---|---|
| `we_1UIQPKJEpmC55oyTloON9Z2y` | `https://sofritostudio.com/api/stripe-webhook` | `pivot-site` (Sofrito Studio) | `STRIPE_WEBHOOK_SECRET` |
| `we_1UGlLZJEpmC55oyTCbJPsc68` | `https://miseportal.com/api/webhooks/stripe` | Mise Portal | `STRIPE_WEBHOOK_SECRET` |

Each worker reads **only** the signing secret belonging to its own endpoint.

- `pivot-site` uses **only** the secret for `we_1UIQPKJEpmC55oyTloON9Z2y`.
- Mise Portal uses **only** the secret for `we_1UGlLZJEpmC55oyTCbJPsc68`.

Because the env var name is identical in both workers, the *value* is what
distinguishes them. A value copied from one site into the other is a
misconfiguration, not a shortcut — it will not be caught by a config review
that only checks the key name.

## Live-mode cutover

At live-mode cutover, **each site gets its own fresh live endpoint and its own
fresh live secret.** Existing test-mode secrets are not promoted, reused, or
copied across.

Procedure per site:

1. Create a **new** endpoint in live mode for that site's own URL.
2. Generate and store that endpoint's signing secret as that worker's
   `STRIPE_WEBHOOK_SECRET`.
3. Leave the test-mode endpoint and its secret in place until live traffic is
   verified, then remove the test endpoint.
4. Never reuse a test secret for live, and never point two workers at one
   endpoint.

## Handling rules

- Signing secrets are **never displayed**, logged, echoed, or committed — not in
  terminal output, reports, summaries, or files. See `pivot-site/AGENTS.md` rule 2.
- Secret entry is **interactive-only, done by Joshua himself**. Do not route a
  secret value through a file-editing tool; their output echoes file contents.
- Rotating one site's secret never touches the other site. Treat the two as
  independent blast radii.
- If a worker starts rejecting webhooks with signature errors, check this file
  first: the likely cause is a secret from the other site, not a rotated Stripe
  key.

## Related

- `ops/sops/deploy.md` — worker deploy procedure.
- Stripe dashboard: **Developers → Webhooks**. Endpoint ids and enabled events
  live there; this file records the mapping, not the secrets.
