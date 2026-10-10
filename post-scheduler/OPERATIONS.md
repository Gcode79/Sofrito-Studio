# Publication scheduler

Publication is disabled until the KV and D1 bindings in `wrangler.toml` are configured and `migrations/0001_publications.sql` is applied. Set `SCHEDULER_KEY` and the required provider token as Worker secrets. Provisioning and deployment require founder approval.

Only a trusted operator may approve a calendar entry. Existing entries remain drafts unless they have `approved: true`, `status: "pending"`, a unique immutable string `id`, and a valid due `scheduledUtc` or `date`. Prefer an explicit UTC timestamp. Date-only entries are due at midnight UTC. Schedule profiles are recommendations and no longer silently rewrite dates.

The hourly cron publishes at most one due approved post. `POST /run` with `Authorization: Bearer <SCHEDULER_KEY>` runs the same operation. GET requests never publish. Only Twitter and Facebook have implemented adapters; other platforms are skipped until real publishing integrations exist. The separate 02:00 cron computes analytics; publication resumes on the next hourly tick.

D1 `publications` is the authoritative delivery ledger. KV calendar entries are not rewritten, avoiding concurrent whole-calendar updates. A unique claim is written before contacting the provider. `sent` records contain the provider ID. Any claim left `publishing` requires checking the provider manually, including after a timeout or failed persistence. Never automatically clear or recycle a claim: the provider may already have published. After confirming the outcome, an authorized operator can reconcile the ledger; any genuinely new publication needs its own approved entry and ID.

Local regression tests run from `pivot-site` with `npm run test:runtime`; they use synthetic providers and in-memory SQLite.