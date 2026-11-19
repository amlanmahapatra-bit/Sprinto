# Tools, APIs and Accounts

Base stack (given): **Gemini API**, **Supabase**, **GitHub**. Everything below is either required to meet the case or recommended to make it reliable. Free tiers are enough for the case. Check current limits on each provider's site before relying on them.

## Required

| Tool | Used for | Step | Cost / free tier | Setup |
|---|---|---|---|---|
| **Gemini API** (`@google/genai`) | Extraction (structured output), research agent (function calling + Google-Search grounding), pain rationale, email writer, critic | 2, 3, 5, 6 | Free tier available; Google-Search grounding on Gemini 3+ models: 5,000 free requests/month, then paid | API key from Google AI Studio → `GEMINI_API_KEY`. Model ids in env (`GEMINI_MODEL_FAST`, `GEMINI_MODEL_WRITER`). Default: the current Gemini Flash model for everything; verify the id in the docs at build time |
| **Supabase** | Postgres (all state + evidence), Auth (magic link for GL), Storage (raw page snapshots), RLS, `pg_cron` (optional) | all | Free plan | Supabase MCP/CLI creates project, migrations, types, advisors |
| **GitHub** | Repo, PRs, Actions CI (lint, typecheck, tests), scheduled weekly Discover+pipeline run, secrets | — | Free | `gh` CLI; repo `sprinto-outreach-engine` (private) |
| **Hunter.io** | Domain Search (PoC), Email Verifier | 4 | Free: 25 searches/month (per case), plus a small verification quota | API key → `HUNTER_API_KEY`. Quota tracked in `api_usage` |
| **Gmail API** | Send the email from the GL's Gmail | 7 | Free | Google Cloud project → enable Gmail API → OAuth consent screen (External, Testing, add yourself as a test user) → OAuth client (Desktop) → run `npm run gmail:auth` once to get a refresh token with scope `gmail.send` → `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_SENDER` |
| **Jina Reader** (`r.jina.ai`) | Website → clean markdown | 1, 3 | Free without a key (rate-limited); free key raises limits | Optional `JINA_API_KEY` |
| **Google News RSS** | Funding and news signals, Discover | 0, 3 | Free, no key | `https://news.google.com/rss/search?q=…` |
| **Vercel** | Host the Next.js app, cron for the worker, preview deploys | — | Hobby (free) | Vercel MCP/CLI; connect the GitHub repo |

## Recommended (add if time allows)

| Tool | Why | Notes |
|---|---|---|
| **Firecrawl** | JS-heavy sites and its `map` endpoint to find careers/security pages fast | Free credits on signup; `FIRECRAWL_API_KEY`; used only as the last fallback |
| **Node `dns` module** | Cloud-provider detection from DNS records | Built in, deterministic, no key |
| **Mozilla Readability + `linkedom`/`cheerio` + `turndown`** | Local HTML → markdown fallback when Jina fails | npm packages |
| **Zod** | One schema for Gemini structured output, DB rows and API inputs | `zod-to-json-schema` for the Gemini schema |
| **Vitest** + **Playwright** | Unit/golden tests; one e2e on the review gate | Playwright is pre-installed in the Claude Code cloud env |
| **`fast-levenshtein`** | GL edit ratio | npm |
| **`p-limit`** | Concurrency control (3 companies in parallel, 4 page fetches per company) | npm |
| **Langfuse** (optional) | LLM tracing/evals UI | Free cloud tier. Not required: every LLM call is already logged in `llm_calls` |
| **Hunter Company Enrichment** (optional) | Headcount/industry/tech when the site doesn't say | Uses Hunter credits; only inside the research loop |

## Explicitly not used
- **LinkedIn scraping**: against LinkedIn's terms. Use Hunter (positions) or Apollo manually (Option B).
- **Paid funding databases** (Crunchbase, Tracxn): not needed for v1; news + grounding covers Series A–C.
- **Sending to real prospects**: out of scope. `to:` is always `DEMO_RECIPIENT`.

## Environment variables (`.env.example`)
```
# Gemini
GEMINI_API_KEY=
GEMINI_MODEL_FAST=gemini-3.8-flash      # verify current id at build time
GEMINI_MODEL_WRITER=gemini-3.8-flash    # can be set to a Pro model for drafting
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
# Hunter
HUNTER_API_KEY=
HUNTER_MONTHLY_LIMIT=25
# Scraping
JINA_API_KEY=
FIRECRAWL_API_KEY=
# Gmail
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=
GMAIL_SENDER=
DEMO_RECIPIENT=          # your own email: every email goes here
LIVE_SEND=false          # must stay false in this build
SEND_MODE=review         # review | auto
MAX_SENDS_PER_DAY=20
SENDER_NAME=
SENDER_TITLE=Growth Lead
# App
APP_BASE_URL=            # for the tracking pixel, e.g. https://<app>.vercel.app
WORKER_SECRET=           # shared secret for /api/worker/tick (cron + GitHub Actions)
```

## Accounts the human must create (Claude Code can't)
1. Google AI Studio → Gemini API key
2. Hunter.io free account → API key
3. Google Cloud project with Gmail API + OAuth client, and one browser sign-in to mint the refresh token
4. Supabase account/org (Claude Code creates the project via MCP)
5. GitHub account (`gh auth login`)
6. Vercel account (connected to GitHub)
7. Optional: Jina, Firecrawl keys
