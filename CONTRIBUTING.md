# Contributing to Sniffer

Thanks for helping out! This is a Windows-first Electron app, so there are a few
rules that matter more here than in a normal web project (see Security below).

## Quick start

```bash
git clone https://github.com/Bgit555/Sniffer.git
cd Sniffer
npm install        # downloads Electron via postinstall
npm run dev        # launch in development (HMR)
```

```bash
npm run typecheck  # tsc across main + renderer (must pass before PR)
npm run build      # production bundle
npm run build:win  # Windows NSIS installer (release/)
```

Self-tests (write output to `%TEMP%\sniffer-e2e-result.json`):

```bash
SNIFFER_E2E=1    npx electron .   # full offline workflow smoke test
SNIFFER_E2E_AI=1 npx electron .   # AI layer vs a local mock gateway
```

## Where things live

```
src/main/       Electron main process — the "backend"
  ipc.ts          all IPC handlers (add new handlers here)
  db/             node:sqlite adapter + Drizzle schema + migrations
  providers/      data providers: apollo, apify, linkedin, webEnrich, registry
  services/       intelligence (analysis/outreach/enrich), autopilot, jobs, prompts
  ai/             provider-agnostic AIClient + router
  crm.ts          HubSpot / Salesforce / Odoo push
  oauth.ts        OAuth "Login with …" PKCE flow
src/preload/    minimal contextBridge (window.sniffer)
src/renderer/   React UI
src/shared/     types shared between main and renderer
drizzle/        SQL migrations (applied automatically at startup)
```

## Adding a feature (the typical loop)

1. **IPC**: add a handler in `src/main/ipc.ts`.
2. **Renderer API**: add a typed method in `src/renderer/src/lib/api.ts`.
3. **UI**: call it from a page in `src/renderer/src/pages/`.
4. **Shared types**: put cross-process types in `src/shared/types.ts`.

The DB is `node:sqlite` behind a tiny Drizzle proxy (`src/main/db/adapter.ts`) —
all Drizzle queries are async; get generated ids with `lastInsertRowid()` from
`src/main/db`.

## Security (read this — it's non-negotiable)

- The renderer is **untrusted**. Never expose `require`, `process`, or full
  filesystem/network to it. Keep `contextIsolation: true`, `nodeIntegration: false`.
- **Never** commit secrets or `.env` files. API keys live in `%APPDATA%\Sniffer`
  via `safeStorage` (DPAPI), not in the repo.
- **Never** add telemetry or data collection.
- Review new npm dependencies carefully — the main process runs on every user's
  machine, so supply-chain risk is real. Keep `package-lock.json` in sync.
- External requests (Apollo/Apify/CRM/website scraping) must stay bounded:
  timeouts, size caps, and no arbitrary URL fetching.

## Pull request checklist

1. Discuss the approach in the issue first (for anything non-trivial).
2. Keep changes focused and small.
3. `npm run typecheck` passes.
4. Describe how you tested it (and run the relevant self-test if it touches the
   main process).
5. No secrets, no new telemetry, no unnecessary dependencies.

## Finding work

See [ROADMAP.md](ROADMAP.md) and the open issues with the `good first issue` label.
