# Sprinto Outreach Engine

Give it a list of domains. It qualifies each company against Sprinto's ICP (deterministic code), finds the decision-maker (Hunter), picks the two likeliest pains, drafts a personalised email (Gemini, every fact traced to evidence or an allowed claim), routes it through a human review gate, and sends it via Gmail — **always to our own inbox** (`DEMO_RECIPIENT`). Same engine behind the web app and the CLI.

> The LLM never decides a score, verdict, PoC or recipient. Those are deterministic functions of the active `icp_config`. No fact reaches an email without a verbatim quote + source URL or an allowed Sprinto claim.

## Stack
Next.js 15 (App Router) · Supabase (Postgres + Auth + RLS) · Gemini (`@google/genai`) · Hunter.io · Gmail API · Vitest · Playwright · Vercel · GitHub Actions.

## Architecture (map steps 0–7, G, M)
Resumable state machine in Postgres. `companies.stage`: `queued → running → … → awaiting_review → approved → sent` (or `hold` / `no_go` / `rejected` / `error`). The worker (`/api/worker/tick`) claims queued companies with `FOR UPDATE SKIP LOCKED`, runs each through the engine, and writes a full trace (pages → evidence → qualification + research_steps → contacts → pain_points → drafts → reviews → sends → email_events). Every decision traces back to a source URL.

- `lib/engine/*` — pure logic (signals, score, qualify loop, poc, pains, validator, quote/entity/editRatio). 100% test-covered; reproduces `tests/golden_expected.json` exactly.
- `lib/adapters/*` — `mock` (fixture-driven, `MOCK_EXTERNAL=1`) and `real` (Jina/Readability scraper, DNS cloud detection, Gemini extract/research/write/critic, Hunter, Gmail).
- `lib/pipeline/*` — orchestration, worker, persistence, discover.

## Run locally
```bash
npm install
cp .env.example .env.local   # fill in the values below
npm test                     # engine golden + synthetic + validator tests (offline)
npm run pipeline -- --fixtures   # full pipeline on the 5 offline fixtures
npm run dev                  # web app at http://localhost:3000
```

### Offline, zero keys
`npm run pipeline -- --fixtures` and `npm test` need **no** credentials. The fixture run prints:

```
ledgerly.example     GO    95  1.00  0  Neha Iyer (security)      PP3+PP1
trustvault.example   GO    78  1.00  0  Meera Shah (engineering)  PP5+PP4  ALREADY_CERTIFIED,COMPETITOR_CUSTOMER
orbitfleet.example   HOLD  53  1.00  3  -                         -        BORDERLINE_SIZE
pixelpantry.example  NO_GO -   -     0  -                         -        NOT_SAAS
megacorp.example     NO_GO -   -     0  -                         -        TOO_LATE_STAGE
```

## Environment variables
See `.env.example`. Supabase values for this project are already wired in `.env.local`.

| Var | What | Where to get it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | Supabase client | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | server/worker (bypasses RLS) | Supabase → Project Settings → API → `service_role` (secret) |
| `GEMINI_API_KEY` | extraction, research, writer, critic | Google AI Studio |
| `GEMINI_MODEL_FAST` / `_WRITER` | model ids (default `gemini-flash-latest`) | ai.google.dev/gemini-api/docs/models |
| `HUNTER_API_KEY` | PoC domain search | hunter.io (free: 25 searches/mo) |
| `GMAIL_CLIENT_ID` / `_SECRET` / `_REFRESH_TOKEN` | send | see below |
| `DEMO_RECIPIENT` | **every** email goes here | your own inbox |
| `SENDER_NAME` | email signature | you |
| `WORKER_SECRET` | protects `/api/worker/tick` | generated |
| `APP_BASE_URL` | tracking pixel base | your deployed URL |
| `MOCK_EXTERNAL=1` | offline mode (fixtures) | set for local offline runs |

### Gemini key
Create a key in Google AI Studio → `GEMINI_API_KEY`. Model ids move fast; `gemini-flash-latest` is a safe default. Google-Search grounding is used by the research agent.

### Hunter key
Free account → API key. Quota is tracked in `api_usage`; Hunter is only called for GO companies. `data/manual_poc.csv` (Apollo, Option B) overrides Hunter per domain.

### Gmail OAuth (one-time)
1. Google Cloud → enable **Gmail API**.
2. OAuth consent screen: External, Testing, add yourself as a test user.
3. Credentials → OAuth client → **Web application**, redirect URI `http://localhost:4875/oauth2callback`.
4. Put `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` in `.env.local`, then:
   ```bash
   npm run gmail:auth
   ```
   Approve in the browser; paste the printed `GMAIL_REFRESH_TOKEN` into `.env.local` (scope: `gmail.send`).

Fallback: Nodemailer + a Gmail App Password over SMTP (logged in `DECISIONS.md` if used).

## CLI
```bash
npm run pipeline -- --fixtures                         # offline
npm run pipeline -- --file data/domains_live.csv --mode review
```
Writes `out/run-<id>.json` and prints a summary table.

## Change the ICP
Every threshold/weight lives in a versioned `icp_config` row — never in code. In the app, **ICP settings**: edit the active params, add a **note**, create a new version (inactive), review the diff, then **Activate**. Each run records the version it used. No AI-suggested tuning.

## Rotate keys
- **Supabase**: Project Settings → API → rotate `service_role` / `anon`; update `.env.local` + Vercel env + GitHub secrets.
- **Gemini / Hunter**: revoke in the provider console, create a new key, update env everywhere.
- **Gmail**: remove the app's access in your Google account, re-run `npm run gmail:auth`.
- **WORKER_SECRET**: generate a new one (`openssl rand -hex 24`), update Vercel + GitHub.

## How to read the "Why?" panel
Open any company from a run or the review gate. Four sections, all from stored rows:
- **Why this company** — the 7 criteria with points and status, the evidence (quote + link) behind each, and the research-loop trace (each iteration's score before/after).
- **Why this person** — every Hunter contact with persona, tier, eligibility, confidence, verification, and the one-line selection reason. The selected PoC is starred.
- **Why these pains** — the top-2 pains with their scores and a role-specific rationale.
- **Why this email** — the draft with its hook evidence (quote + source URL), the Sprinto claim ids used, and the validator (V1–V9) + critic results.

## Deploy
Vercel project linked to the GitHub repo. Set the env vars above in Vercel. `vercel.json` registers the worker cron. CI (`.github/workflows/ci.yml`) runs typecheck + tests + lint on every push. `weekly-discover.yml` runs Discover → pipeline in review mode weekly (Mon 09:00 IST) and on `workflow_dispatch`.

## Tests
```bash
npm test          # engine golden, synthetic (ICP_SPEC §12), validator, quote-check, pipeline
npm run e2e       # Playwright fixture flow (needs the app + a seeded GL user)
npm run seed      # create a GL demo user + ensure icp v1 active
```
