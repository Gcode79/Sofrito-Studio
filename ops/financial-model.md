# Ops — Financial Model (scenario workbook, v0)

> Created 2026-09-09. **This file contains NO actual financial data** — a repository-wide search found zero cost, expense, profit, ledger, or revenue-tracked documents, and D1 `revenue`/`invoices` are both empty (0 rows). Every number below is a *parameter slot* for founder input. The model's job is to make the three profit-paths in `strategy/profit-paths.md` computable once real numbers land.

## 0. Verified ground truth (this is all we have)
| Slot | Value | Source |
|---|---|---|
| Recorded revenue | $0 | D1 `revenue` (0 rows) |
| Invoices | 0 | D1 `invoices` |
| Bookings | 0 | D1 `calendly_bookings` |
| Real leads | 0 verified (15/15 QA/deploy artifacts as of 2026-09-09 re-audit) | D1 `leads` |
| Price deck | see `strategy/profit-paths.md` | services.html + KV |

## 1. Revenue workbook (monthly, to compute by hand or a spreadsheet)
| Line | Formula | Until-datum (default) |
|---|---|---|
| MRR retainer | Σ(retainer qty × price) | 0 |
| One-time projects | Σ(projects closed this month × price) | 0 |
| Sessions | sessions_delivered × $400 | 0 |
| Tier 3 | (undecided) | 0 |
| **Gross revenue** | sum of above | **$0** |
| Payment fees (Stripe) | 2.9% + $0.30 per transaction | UNKNOWN until live |
| Zaps/Resend/SaaS/monthly fixed | manual entry | UNKNOWN |
| Contractor/overflow labor | manual entry | UNKNOWN |
| Owner hours tracked | manual entry | UNKNOWN |
| **Net (profit) estimate** | gross − costs | **UNKNOWN — cannot be computed** |

## 2. Unit economics worksheet per offer (revenue per delivery-slot; costs to fill in)
| Offer | Gross | Est. hours/slot | Est. cost/slot | Gross margin | Notes |
|---|---|---|---|---|---|
| Session $400 | $400 | 1.5 + prep/report | UNKNOWN | UNKNOWN | Intended loss-leader door; margin only matters vs project conversion |
| The Sofrito $2,500 | $2,500 | UNKNOWN | UNKNOWN | UNKNOWN | 1 revision round |
| The Plato $5,000 | $5,000 | UNKNOWN | UNKNOWN | UNKNOWN | 1 design + 1 copy revision |
| La Mesa $7,500 | $7,500 | UNKNOWN | UNKNOWN | UNKNOWN | +30-day support |
| Essentials $1,500/mo | $1,500 | 8 posts + spotlights + call | UNKNOWN | UNKNOWN | Highest $/hr leverage if templated |
| Growth $2,500/mo | $2,500 | 16 posts + reel + AI drafts | UNKNOWN | UNKNOWN | |
| Fractional $4,000/mo | $4,000 | guided decisions + supervision | UNKNOWN | UNKNOWN | |

- **Break-even: `UNKNOWN`** — cannot be stated until costs exist. The workbook will compute it from lines 2–4 of section 1.

## 3. Substitutability note (why these slots matter)
The three profit-paths all reach ~$20k/mo revenue with different mixes. The deciding factor between them is **not price_math — it's margin** (session-dense vs retainer-dense mixes have very different $/hour), and margin currently has no data. Until costs/hours are entered, treat the three paths as equally unresolved. Recompute after the first 3 real wins are recorded.

## 4. Owner inputs due (each unblocks the model)
1. Monthly fixed costs (Zapier/Make, Resend, domains, tooling).
2. Hours actually spent per deliverable per offer (or "too early — skip until 3 deliveries").
3. Whether freelancer/contractor overflow is ever used, and at what rate.
4. Fee/billing provider choice check after first Stripe transaction.
5. First real revenue entry in D1 (data hygiene: record invoices + payments as they occur).

## 5. Rules
- Never report "net" or "break-even" until real cost data exists — everything stays labeled `UNKNOWN`.
- Any pricing decision first gets fresh research (see `research/sources.md`), never a hunch.
- Update this file after the first completed project AND first completed retainer month, even if partial.