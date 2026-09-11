# Sniffer

Windows-first AI prospecting intelligence desktop app. Sniffer discovers high-fit
prospects, enriches them, detects relevant signals, explains *why* they fit, and
turns research into personalized outreach — all while keeping the user's
workspace local.

Built with **Electron + React + TypeScript**, bundled by **electron-vite**,
persisted to **SQLite** through **Drizzle ORM**.

## Stack

- **Desktop shell** — Electron (main + preload + renderer), context-isolated & sandboxed
- **UI** — React 19, no runtime router (state-based navigation), plain CSS
- **Data** — `node:sqlite` (built into Electron; no native compilation) + Drizzle ORM
- **Validation** — Zod 4
- **Secrets** — Electron `safeStorage` (Windows DPAPI); API keys never reach the renderer
- **AI** — provider-agnostic `AIClient` with OpenAI-compatible and Anthropic-compatible clients, plus a router (`default` / `research` / `writing` / `extraction` model profiles)

## Getting started

```bash
npm install        # install dependencies
npm run dev        # launch in development (HMR)
npm run build      # typecheck-free production build
npm run typecheck  # tsc across main + renderer
npm run build:win  # package a Windows NSIS installer (release/)
```

First run creates `%APPDATA%\Sniffer\` (database, logs, exports, cache, backups).

## Core loop

1. **Search** — describe an ICP in plain English. The AI query parser (or an
   offline fallback) turns it into a structured spec; enabled data providers
   return normalized matches (falling back to the built-in demo dataset).
2. **Save** — save prospects to lists and saved searches.
3. **Enrich** — pull decision-makers from your providers (Apollo / Apify) or demo.
4. **Analyze** — structured AI analysis with a fit score + evidence.
5. **Prompt library** — reusable `{{variable}}` prompts run against any prospect.
6. **Outreach** — generate email / LinkedIn / WhatsApp drafts (never auto-sent).
7. **CRM push** — push a company/contacts (or a whole list) to HubSpot, Salesforce or Odoo.
8. **Export** — CSV export via the local job queue.

## Data providers & connections

Under **Settings → Data providers** you can store API keys (securely, via
Windows DPAPI) and enable providers:

- **Apollo** — company/people search and enrichment.
- **Apify** — run your own Apify actors (search + enrichment) with an Apify token and actor id.
- **Demo** — the built-in (fictional) dataset, used only when no live provider is
  configured. Once a live provider is saved+enabled, demo data is **not**
  auto-injected — if the provider returns nothing you get an empty result plus a
  clear note, unless you opt into "demo fallback" in Settings.

**Settings → CRM connections** lets you connect **HubSpot**, **Salesforce** and
**Odoo**. Use "Push to CRM" on any company page or list to sync prospects and
their contacts. CRM/provider adapters are experimental — every result or error is
surfaced in the UI.

**Settings → Connected apps ("Login with …")** provides a real OAuth browser
flow (HubSpot, Salesforce, LinkedIn) instead of pasting tokens. Each provider
needs an OAuth app you create in its developer console — paste the **Client ID
+ Secret** once, then click **Connect** and authorize in the browser. OAuth
tokens (and instance URLs) are used automatically by CRM push. Data providers
that are token-based (Apollo, Apify) still have a **Test** button that validates
the key live.

## Settings

Configure your own AI gateway under **Settings → AI gateway**: provider protocol,
gateway URL, API key, and per-purpose models. The API key is acknowledged as
stored (DPAPI) and never sent to the UI. Without a gateway the app still works
offline (demo provider + automated analysis).

## Self-tests

```bash
SNIFFER_E2E=1    npx electron .   # full offline workflow smoke test
SNIFFER_E2E_AI=1 npx electron .   # AI layer vs a local mock gateway
```

Results are written to `%TEMP%\sniffer-e2e-result.json`.

## Layout

```
src/main        Electron main process (window, IPC, DB, services, AI, search, jobs)
src/preload     minimal contextBridge (window.sniffer)
src/renderer    React UI
src/shared      types shared across processes
drizzle/        generated SQL migrations (applied idempotently at startup)
```
