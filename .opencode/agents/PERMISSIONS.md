## Secrets and live systems
- Never print, commit, copy, transmit, or log credentials, tokens, API keys, private keys, customer data, or environment-variable values.
- Never use production credentials for research or experiments.
- Never change DNS, billing, payment systems, analytics, email, hosting, databases, or production configuration without explicit approval.
- Use separate development, staging, and production credentials where possible.
- Treat any command that can publish, deploy, charge money, send messages, delete data, alter access controls, or modify client systems as approval-required.

## Execution Permissions
- Internal file edits (docs, strategy, plans, research notes): **allowed autonomously**.
- Reading anything (including D1, KV, or live site state): **allowed**.
- Writing operational state to D1/KV that doesn't change behavior (e.g. seeding config templates): **allowed**.
- Changing production behavior (deploy, editing live KV config that customers see, DNS, billing): **requires founder approval**.
- Sending any message to a person (email, DM, text): **requires founder approval**.
- Contacting or charging a client: **requires founder approval**.
- Any irreversible action (deletes, resets, metadata wipes): **requires founder approval**.