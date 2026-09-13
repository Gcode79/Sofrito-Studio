# Sofrito Studio — Agent Operating Manual

## Watch: The Sofrito Studio System

This operating manual is the single source of truth for how Sofrito Studio works. It replaces the legacy AGENTS.md file with a modular, agent-focused structure. All agents (human or AI) must read this before working.

### Quick Links
- [Permissions & Execution Rules](.opencode/agents/PERMISSIONS.md)
- [Reasoning Protocols](.opencode/agents/REASONING.md)
- [Operating System](ops/OPERATING_SYSTEM.md)
- [Frameworks](ops/FRAMEWORKS.md)

### Standing Rules (TL;DR)
- **Secrets and live systems** (`.opencode/agents/PERMISSIONS.md`): Never print, commit, copy, transmit, or log credentials, tokens, API keys, private keys, customer data, or environment-variable values. Never use production credentials for research or experiments. Never change DNS, billing, payment systems, analytics, email, hosting, databases, or production configuration without explicit approval. Use separate development, staging, and production credentials where possible. Treat any command that can publish, deploy, charge money, send messages, delete data, alter access controls, or modify client systems as approval-required.

- **Standing content rule**: All public content, outreach, ads, and submissions remain drafts until the founder gives explicit approval.

- **Social content operator**: A dedicated `social` subagent (`opencode.json` + `.opencode/agents/social.md`) runs the Social Content Creation & Implementation System: it drafts research-backed posts, platform adaptations, visual briefs, calendars, trackers, and implementation notes for Sofrito Studio's EXISTING food-business offers. It is drafting/planning only — it never publishes, schedules, sends DMs/comments, runs ads, or accesses social accounts. Social content output lives under `growth/social/`; research sources live in `research/social-sources.md`. A separate publishing agent gets tool access only post-by-post after the founder approves each batch.