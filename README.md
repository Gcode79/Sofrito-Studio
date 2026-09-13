# Sofrito Studio

Welcome to the Sofrito Studio repository.

## Structure

### 🤖 **Agent Layer**
- .opencode/agents/ - Agent operating manuals and permissions
  - README.md - This landing page
  - PERMISSIONS.md - What may run autonomously vs requires approval
  - REASONING.md - Reasoning protocols and evidence hierarchy

### ⚙️ **Operations**
- ops/ - Operating procedures and frameworks
  - OPERATING_SYSTEM.md - Decision flow, FRAMEWORKS.md - Decision flow, gates, and templates
  - 
ow.md - Current operating state
  - decision-log.md - Log of decisions
  - sops/ - Standing procedures
  - ... (other ops files)

### 🌐 **Main Application**
- pivot-site/ - The live site (Cloudflare Workers + static frontend)

### 📁 **Projects & Experiments**
- emotion-abuelas-ipad/ — Video generation tool for client projects
- ideo-ads/ — Ad production experiments and templates
- 	he-craft-kitchen/ — Experimental food-related projects
- legacy-site-v1/ — Previous iteration of the brand studio site

### 📦 **Assets & Content**
- rand-core/ — Foundational brand assets (logos, typography, color palettes)
- content-source/ — Raw materials and AI-generated drafts awaiting review
- client-templates/ — Pre-built templates for client deliverables (websites, emails, proposals)
- nalysis/ — Market research, competitive analysis, and data-driven insights
- data/ — Exports, imports, backups, and analytical datasets

### 🔧 **Infrastructure & Shared Resources**
- scripts/ — Data pipelines, deployment scripts, and maintenance tools
  - maintenance/ — One-time fix and migration scripts
- schema/ — Shared data models, database schemas, and API contracts
- config/ — Cross-project configuration templates and defaults

### 📊 **Business Functions**
- growth/ — Marketing calendars, campaigns, content strategy, and acquisition tactics
- esearch/ — Customer insights, survey results, interview transcripts, and trend analysis
- sales/ — Sales processes, qualification rubrics, outreach templates, and deal tracking
- strategy/ — Business plans, market analysis, offer optimization, and long-term vision

### 📬 **Integrations**
- uttondown/ — Email newsletter templates, automation workflows, and campaign configurations

### 📚 **Additional Resources**
- usiness-model.md — Overview of Sofrito Studio's business model
- content-guidelines.md — Guidelines for content creation and brand voice
- esearch/ and sources/ — Research materials and source documents

## Quick Start

1. Read .opencode/agents/README.md to understand the agent layer.
2. Refer to .opencode/agents/PERMISSIONS.md for what actions are allowed.
3. Consult .opencode/agents/REASONING.md for reasoning protocols.
4. Check ops/OPERATING_SYSTEM.md for decision flow and file organization.
5. See ops/FRAMEWORKS.md for decision memo and experiment templates.
6. See [pivot-site/README.md](pivot-site/README.md) to run the main brand studio application locally.

## Important Notes

- All public content, outreach, ads, and submissions remain drafts until the founder gives explicit approval (see Standing content rule).
- Never print, commit, copy, transmit, or log credentials, tokens, API keys, private keys, customer data, or environment-variable values (see Secrets and live systems).


## Deployment

The live site is deployed via Cloudflare Workers using Wrangler.

- To check the site locally: 
pm run dev (or similar) in the pivot-site/ directory.
- To preview deployment: wrangler deploy --dry-run -c wrangler.toml from pivot-site/.
- To deploy: wrangler deploy -c wrangler.toml from pivot-site/.
- Alternatively, use 
pm run deploy which runs the wrangler deploy command.

See ops/now.md for the current live worker version and deployment notes.


