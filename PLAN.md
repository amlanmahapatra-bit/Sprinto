# PLAN — Sprinto Outreach Engine

Milestones (branch + PR each; CI must be green before merge).

- [x] **M0 Scaffold** — Next.js + TS + Tailwind, Vitest, configs, deps.
- [x] **M1 Engine (TDD)** — `lib/engine/*` pure logic: signals, score, qualify loop, poc, pains, validator, quote/entity/editRatio. Golden test passes exactly; synthetic + validator + quote-check tests green. **27/27 passing.**
- [x] **M2 GitHub + CI** — private repo `sakshichugh-build/sprinto-outreach-engine`, `.github/workflows/ci.yml` (install, lint, typecheck, test). First run on `main` green (1m1s).
- [x] **M3 Supabase** — schema + migrations (0001–0007) + seed (icp_config v1), RLS (fixed: `is_gl()` moved to a non-exposed `private` schema), advisors clean, GL user seeded.
- [x] **M4 Adapters (mock first)** — scraper, dns, news, gemini, hunter, gmail; `MOCK_EXTERNAL=1` uses fixtures.
- [x] **M5 Pipeline + worker** — resumable state machine; `tick()` drains a whole run in batches within a time budget; `/api/worker/tick` with `WORKER_SECRET`.
- [x] **M6 CLI** — `npm run pipeline -- --fixtures` and `--file`; writes `out/run-<id>.json`.
- [x] **M7 UI** — New run, Run progress (poll hardened), Company "Why?", Review gate, Sent & metrics, ICP settings, auth. Verified live on prod.
- [x] **M8 Real adapters + LLM** — LLM routed through **OpenRouter** (`google/gemini-2.5-flash`, validated); Hunter wired. Gmail OAuth pending client id/secret.
- [x] **M9 Deploy** — Vercel project `sprinto-outreach-engine`, prod env set, `vercel.json` daily cron. Live: https://sprinto-outreach-engine-five.vercel.app — fixture run verified 5/5 on prod.
- [x] **M10 Scheduled run** — `.github/workflows/weekly-discover.yml` (Mon 09:00 IST + dispatch); Vercel daily worker cron as a safety net.
- [ ] **M11 Live smoke test** — BLOCKED on Gmail OAuth (client id/secret). Review-mode drafting via OpenRouter is ready; only the Gmail send is missing.
- [~] **M12 Docs + final report** — README, DECISIONS, PLAN updated; screenshots captured in session.

## Status (2026-11-05)
Shipped and verified end-to-end **except the live Gmail send**. GitHub repo + CI green on every push. Supabase live with the RLS bug fixed. Engine reproduces the golden file exactly (28 unit tests). Playwright e2e green (sign in → fixture run → review → edit-approve → send-to-demo → metrics). LLM routed through OpenRouter and validated. Deployed to Vercel (Next 15.5.29, security-patched) and the deployed app processes a fixture run 5/5 with correct verdicts.

### Blocked — needs the user
- **Gmail OAuth** (M11 live send): still need `GMAIL_CLIENT_ID` + `GMAIL_CLIENT_SECRET` (Google Cloud → Credentials → OAuth client, Web app, redirect `http://localhost:4875/oauth2callback`). Then `npm run gmail:auth` mints the refresh token. The value pasted for "Gmail id" was an email address (wired to `GMAIL_SENDER`/`DEMO_RECIPIENT`), not OAuth credentials. If the Workspace blocks third-party OAuth, fall back to a Gmail App Password over SMTP.

Once Gmail is in: run 3 real domains in review mode → approve one → the email lands in `DEMO_RECIPIENT` with the tracking pixel. (Set `MOCK_EXTERNAL=0` for real runs; it is `1` on prod today for a deterministic fixtures demo.)

## Update (2026-11-19)
- Live smoke test (review mode, OpenRouter → google/gemini-3.7-flash, `provider.only` google-vertex/google-ai-studio) ran on 8 real domains: all NO_GO/LOW_FIT or gated (large/certified/too small), no GO candidate yet, so drafting + send path not exercised live.
- Fixed intermittent Zod failure (LLM returning null for arrays) in `lib/schemas/companyFacts.ts`.
- Supabase: no project credentials available in the sandbox, so migrations 0001–0007 were validated on local Postgres 16 with stub `auth` schema (apply cleanly, icp v1 seeded). Hosted project still needs the three Supabase env vars.
- 2026-11-19: Supabase dropped in favour of Neon (connection string pending; DB layer in lib/db/*, lib/auth, pipeline persist/worker still uses supabase-js and must be ported). UI fully re-themed (dark glass/gradient design system via tokens + new home page).
