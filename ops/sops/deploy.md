# Sofrito Studio — Deploy SOP

## Canonical deploy command

```
cd C:\Users\josho\SofritoStudio\pivot-site
npm run deploy
```

This runs: `wrangler deploy --config wrangler.toml` (wrangler 4.129.0).
The `--config wrangler.toml` is required — do not omit.

## Two-config gotcha (why `--config` is required)

- Root `C:\Users\josho\SofritoStudio\wrangler.jsonc` defines `ofrito-tudio`, assets directory `deploy/`, and routes to `sofritostudio.com` WITHOUT custom_domain binding.
- `pivot-site/wrangler.toml` defines `sofrito-studio`, assets directory `public/`, routes `sofritostudio.com` as `custom_domain = true`, and binds D1 `sofrito-db` (id `07a14d9b-fb0d-4413-a0b4-bd7d4389071a`) + migrations_dir `migrations/`.
- Config discovery walks up from CWD. Running bare `wrangler deploy` from `pivot-site` picks the parent (wrong) `wrangler.jsonc`. Always use the pinned script (`npm run deploy`).

## Assets / route coupling constraint

- `run_worker_first = true` and `html_handling = "none"` must change together. `CHANGING ONE REQUIRES THE OTHER.` (wrangler.toml header note.)
- Changing assets binding (directory) or the `custom_domain` route requires the same paired update.

## Rollback

To roll back to the legacy retail site (`../cloudflare`):
1. Comment out `[[routes]]` (`pattern = "sofritostudio.com"`, `custom_domain = true`) and `run_worker_first` / `html_handling` pairing in `pivot-site/wrangler.toml`.
2. Redeploy the old worker from `SofritoStudio\cloudflare`.
(Note: `wrangler.toml` header comments document this; rollback has NOT been executed — use only with owner approval.)

## CI deploy — none exists

**Deploys are manual-only. There is no CI auto-deploy.**

Verified 2026-09-25:

- No workflow in `.github/workflows` has a `push` trigger, and none invokes
  wrangler. The six present (`content`, `email-automation`, `opencode`,
  `pinterest-poster`, `social-poster`, `uptime`) are schedule/dispatch only.
- Zero Cloudflare Builds runs on any worker in the account
  (`sofrito-studio`, `mise-portal`, `ofrito-tudio` all report `total_count: 0`).
- No Cloudflare Pages project exists.

**A push to `main` does NOT move production.** Production changes only when a
human runs the pinned `npm run deploy`.

This section previously claimed CI deployed on main push, citing the
`wrangler.toml` header comment — that comment was stale and has been corrected.
An earlier version of this SOP carried the hedge *"Assumed correct as of
2026-09-20; verify if odd behaviour."* It is now verified, not assumed.

Ordering consequence: because nothing auto-deploys, a migration can be applied
to remote D1 **before** the worker code that depends on it is deployed, without
risk of a push deploying code ahead of its migration.

## Pre-deploy verification checklist

- Confirm working directory = `pivot-site`.
- Confirm `npm run deploy` is the run command (not bare `wrangler deploy`).
- Confirm assets directory in `wrangler.toml` = `public/` (not `deploy/`).
- Confirm `custom_domain = true` is present for `sofritostudio.com`.
- Confirm rollback plan is ready (only if an approved rollback is in progress).
- Deploys change production behavior → requires owner approval (repo `AGENTS.md` sign-off rule).
