# Sniffer — open-source AI prospecting & sales outreach automation for Windows

**Sniffer** is a local-first, Windows desktop app that automates B2B lead generation, prospect enrichment, lead scoring, and personalized outreach. Describe your ideal customer profile in plain English, and Sniffer finds high-fit prospects, scrapes real contact data, qualifies them with an evidence-based score, and writes personalized emails / LinkedIn messages / audit reports / SPIN interview scripts — all while keeping your prospecting data on your own machine.

> Keywords: lead generation, prospecting, lead enrichment, B2B sales, outbound sales, ICP, sales automation, cold email, LinkedIn outreach, CRM sync, AI agent, Apollo, Apify, HubSpot, Salesforce, Odoo, Electron.

Built with **Electron + React + TypeScript**, bundled by **electron-vite**, persisted to **SQLite** through **Drizzle ORM**.

## Why Sniffer

- **Local-first & private** — search history, lists, analyses and prompts live in a local SQLite database; API keys are encrypted with Windows DPAPI and never reach the UI.
- **AI-driven, provider-agnostic** — works with any OpenAI-compatible or Anthropic-compatible gateway (OpenAI, Anthropic, Gemini, DeepSeek, Ollama, OpenRouter, Hugging Face, …).
- **Autopilot agent** — one goal in, the full loop out: Sniffer picks the data source, auto-discovers the right Apify actor, searches → saves → enriches → qualifies.
- **Real enrichment** — web-scrapes the company's site for emails/people, plus Apollo, Apify and LinkedIn (OAuth) providers.
- **Qualification rubric** — scores digital presence, social activity, industry fit and scale potential.
- **Outreach kit** — email, LinkedIn & WhatsApp drafts, a personalized audit report, and a SPIN interview script, with local case-study RAG for consistency.

## Quick start

```bash
git clone https://github.com/Bgit555/Sniffer.git
cd Sniffer
npm install        # downloads Electron via postinstall
npm run dev        # launch in development (HMR)
```

```bash
npm run build      # production build
npm run typecheck  # tsc across main + renderer
npm run build:win  # package a Windows NSIS installer (release/)
```

First run creates `%APPDATA%\Sniffer\` (database, logs, exports, cache, backups).

## Core loop

1. **Search** — describe an ICP in plain English → structured spec → enabled data providers → normalized matches.
2. **Save** — prospects to lists and saved searches.
3. **Enrich** — web scrape → Apollo/Apify/LinkedIn → AI role estimates.
4. **Qualify** — AI analysis with fit score + qualification rubric.
5. **Prompt library** — reusable `{{variable}}` prompts run against any prospect.
6. **Outreach** — message + audit report + SPIN script (never auto-sent).
7. **CRM push** — HubSpot, Salesforce, Odoo.
8. **Export** — CSV via a local job queue.

## Integrations

- **AI gateways** — OpenAI, Anthropic, Google Gemini, DeepSeek, Ollama, OpenRouter, Hugging Face, or any custom OpenAI/Anthropic-compatible endpoint.
- **Data providers** — Apollo (search + enrich), Apify (auto actor discovery), LinkedIn (OAuth), built-in demo dataset.
- **CRMs** — HubSpot, Salesforce (OAuth "Login with…"), Odoo.
- **Enrichment** — built-in website scraper (emails, social links, AI-extracted contacts).

## Security

- `contextIsolation`, `nodeIntegration: false`, `sandbox: true`.
- Secrets stored via Electron `safeStorage` (Windows DPAPI); never written to disk in plaintext or sent to the renderer.
- No `.env`, no keys in source, and no third-party analytics.

## Contributing

Contributions are welcome. Open an issue to discuss a feature before sending a large PR.

```bash
SNIFFER_E2E=1    npx electron .   # full offline workflow smoke test
SNIFFER_E2E_AI=1 npx electron .   # AI layer vs a local mock gateway
```

Results are written to `%TEMP%\sniffer-e2e-result.json`.

## Layout

```
src/main        Electron main process (window, IPC, DB, services, AI, search, jobs, providers)
src/preload     minimal contextBridge (window.sniffer)
src/renderer    React UI
src/shared      types shared across processes
drizzle/        generated SQL migrations (applied idempotently at startup)
```

## License

MIT — see [LICENSE](LICENSE).
