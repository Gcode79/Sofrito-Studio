# Ops — Scorecard (weekly operating metrics)

> Baseline snapshots verified live on 2026-09-09 (D1/KV). Recompute weekly on the same day. Keep historic values in the table so trend is visible. Every target is a *plan* value to revisit after the 30-day plan's W4 review — not yet a commitment.

## Metric tree
### Top of funnel
| Metric | Baseline | Target (30d) | Why it matters |
|---|---|---|---|
| Leads/week (real) | 0 verified — the 15-row D1 pool re-audited 2026-09-09 is 100% QA/deploy artifacts; steady-state UNKNOWN | ≥5/wk real | Pipeline breadth |
| Newsletter subs | 9 total | ≥15 new | Guide funnel health |
| Website visits/week | UNKNOWN (analytics available in dashboard/events) | record first | Content ↔ site math |

### Qualification (leads moving through)
| Metric | Baseline | Target (30d) | Why it matters |
|---|---|---|---|
| Real leads captured & triaged | 0 (pool = QA artifacts) | ≥5 captured; all triaged same-day | Sales motion exists |
| Qualified leads | 0 | ≥3 | Real deal conversations |
| Avg lead score | UNKNOWN (recompute from D1) | ≥55 avg | Ingest quality monitor |

### Conversion
| Metric | Baseline | Target (30d) | Why it matters |
|---|---|---|---|
| Session bookings | 0 | ≥3 | Door to everything else |
| Project deals closed | 0 | ≥1 qualified conversation | First case study win |
| Retainer intents captured | 0 | ≥3 | MRR line starts |

### Money (all zero until first wins; record as they occur)
| Metric | Baseline | Target (30d) |
|---|---|---|
| Revenue recorded (D1 `revenue`) | $0 | first-entry flutter: record any session/project invoice |
| Invoices | 0 | ≥1 |
| Bookings (calendly_bookings) | 0 | ≥3 |

### Operations hygiene (the silent leaks)
| Metric | Baseline | Target |
|---|---|---|
| Email templates in KV | 2 / 16 | 16 / 16 |
| Emails flagged placeholder-body in 7-day sample | high | 0 |
| Leads triaged daily | 0 | all same-day |
| CRM statuses beyond `new` | 0 | all active leads in `contacted/qualified/won` |

## How to read this
- **Green signals:** leads/week ≥5, triage ≥8, first session bookings, email template count = 16, first invoice recorded.
- **Red signals:** another week with zero real captured leads after the leak fixes → traffic problem, not pipeline problem; placeholder emails still in sample; new real leads left untriaged for 24h+.

## Weekly ritual (owner, ~30 min)
1. Pull D1 counts (or dashboard): leads, subs, emails, revenue.
2. Update this table's "current" column; compare to baseline & target.
3. Log any decision prompted by a red signal in `ops/decision-log.md`.
4. Never smooth numbers — record the raw query results.