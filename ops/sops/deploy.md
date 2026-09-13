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

## CI deploy

`wrangler.toml` header comment: "Deploy: npx wrangler deploy (CI does this on main push)". The CI deploy runs on the pinned `wrangler.toml` config; the `--config` script protects against the parent-config ambiguity.

## Pre-deploy verification checklist

- Confirm working directory = `pivot-site`.
- Confirm `npm run deploy` is the run command (not bare `wrangler deploy`).
- Confirm assets directory in `wrangler.toml` = `public/` (not `deploy/`).
- Confirm `custom_domain = true` is present for `sofritostudio.com`.
- Confirm rollback plan is ready (only if an approved rollback is in progress).
- Deploys change production behavior → requires owner approval (repo `AGENTS.md` sign-off rule).
