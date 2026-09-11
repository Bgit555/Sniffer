# Sniffer — Contributor Roadmap

Priority order, difficulty estimates, and acceptance criteria for the current
backlog. Each item has a matching GitHub issue. Pick `good first issue` items if
you're new to the codebase.

| ID | Area | Difficulty |
|----|------|-----------|
| [R-01](#r-01--improve-the-list-screen--behaviors) | List screen & behaviors | easy–medium |
| [R-02](#r-02--enrichment-schemes) | Enrichment schemes | medium |
| [R-03](#r-03--data-behaviors--view) | Data behaviors & view | medium |
| [R-04](#r-04--gmail--whatsapp-integration) | Gmail & WhatsApp integration | medium–hard |
| [R-05](#r-05--linkedin-auth-issues) | LinkedIn auth | medium |

---

## R-01 — Improve the list screen & behaviors

**Files:** `src/renderer/src/pages/Lists.tsx`, `src/renderer/src/pages/ListDetail.tsx`, `src/main/data/listRepo.ts`.

- Inline rename (no `window.confirm`), better empty states, and a search/filter box per list.
- Bulk select (checkboxes) with **Add to another list / Remove / Export / Enrich** actions.
- Sort & filter members (by name, industry, score, added date, has email).
- Show a real count of contacts/emails per member and a member "email available" badge.
- Fix `ListDetail` currently deriving the title incorrectly (it doesn't show the list name).

**Acceptance:** list pages work end-to-end with no `window.confirm`, keyboard-focusable, and `npm run typecheck` passes.

---

## R-02 — Enrichment schemes

**Files:** `src/main/services/intelligenceService.ts`, `src/main/providers/*`, `src/renderer/src/pages/Company.tsx`.

- Per-company "enrich all" with live progress (reuse the job system in `src/main/services/jobs.ts`).
- Track enrichment state per contact (`emailStatus`: never / scraped / verified / unknown) and surface it in the UI.
- Deduplicate contacts (by email and by first+last+title) so re-enriching doesn't add duplicates.
- Configurable provider preference (Apollo → Apify → web scrape → AI) and per-provider rate limits/retries.
- Cache enrichment results and skip re-scraping recently-enriched companies.

**Acceptance:** enriching the same company twice doesn't duplicate contacts, failures surface clearly, and bulk enrich shows progress.

---

## R-03 — Data behaviors & view

**Files:** `src/main/data/companyRepo.ts`, `src/renderer/src/pages/Company.tsx`, `src/renderer/src/pages/Results.tsx`.

- Show **source + freshness** metadata on every company/person (which provider, retrieved date, confidence).
- Add CSV/XLSX **import** with a column-mapping UI (guide §36).
- Better company detail: tabs for Overview / Contacts / Signals / Analysis (guide §33).
- Dedupe companies across searches by domain (already partially done — extend to handle `www.` and trailing slash).
- Offline local search over saved companies (filter by industry/country/employees/signals).

**Acceptance:** source/freshness is visible, dedupe is robust, and the detail page is organized into tabs.

---

## R-04 — Gmail & WhatsApp integration

**Files:** `src/main/oauth.ts`, new `src/main/integrations/gmail.ts` and `src/main/integrations/whatsapp.ts`, `src/main/ipc.ts`, `src/renderer/src/pages/Outreach.tsx`.

**Gmail**
- Add a Google/Gmail OAuth app to `src/main/oauth.ts` (scopes `gmail.send`).
- Add a "Send" (draft) action that composes a draft via the Gmail API (`users.drafts.create`) — **do not auto-send** without explicit user confirmation.

**WhatsApp**
- WhatsApp Business Cloud API: connect a phone-number id + access token, send template messages via `POST /v1/messages`.
- A `wa.me` quick-link fallback that opens the chat with a pre-filled message (no API needed).

**Acceptance:** a generated message can be sent/drafted via a connected Gmail account and sent via WhatsApp (or opened as a `wa.me` link), with errors surfaced in the UI.

---

## R-05 — LinkedIn auth issues

**Files:** `src/main/oauth.ts`, `src/main/providers/linkedin.ts`.

- Fix the LinkedIn OAuth scopes (replace deprecated `r_liteprofile`/`r_emailaddress` with the OpenID `openid profile email` scopes where supported).
- Add **token refresh** for LinkedIn (currently only the access token is stored).
- Surface LinkedIn's partner-gating clearly: distinguish "auth OK but member search blocked" from "token invalid".
- Handle the redirect/instance URL and expired tokens gracefully.

**Acceptance:** LinkedIn connect works, refresh handles expiry, and enrichment reports the *actual* LinkedIn error instead of silently returning nothing.
