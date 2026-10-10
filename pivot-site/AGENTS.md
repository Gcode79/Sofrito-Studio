## Hard rules (set by Joshua — a violation stops the task)

1. Never invent scope. QA is ONLY the 16-row matrix in qa-matrix.md — no invented rows, metrics, percentage targets, device tests, or smoke tests. Never invent copy, testimonials, claims, or requirements. Approved copy is used verbatim.
2. Secrets are never displayed. Never print, log, echo, or report a secret value — not in terminal output, summaries, reports, or files (except .dev.vars and the wrangler secret store). Never route secret values through file-editing tools; their output echoes file contents. Secret entry is interactive-only, done by Joshua himself.
3. node --check is the gate. If node --check fails, the code is broken — fix the code, never blame the environment.
4. Replace means replace. After any swap, grep-verify: new value present at the expected count AND old value count is 0. Report both counts.
5. Every "done" needs evidence. Reports must include the verification output (counts, test results, command output) — never bare assertions. If your checks contradict your summary, flag it and stop instead of shipping the summary.
6. No prod changes without explicit approval. No production deploys, no remote D1 migrations, no live Stripe keys. Test mode only.
7. Don't touch the contract. Lead form fields, submit handler logic, Turnstile wiring, A/B channel values (sprint_page / boh_sprint_page), pricing, refund line, and worker routes stay as-is unless the task explicitly says otherwise.
8. If a tool doesn't exist, stop. Don't invent workarounds (e.g., missing wrangler subcommands, .sh scripts on Windows without bash). Report what's missing and wait.
