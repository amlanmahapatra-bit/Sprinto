# Build prompt: paste this into Claude Code

> Unzip this pack, open Claude Code in the `sprinto-outreach-pack` folder, and paste everything below the line.
>
> Folder contents: `CLAUDE.md` (context and boundaries) · `docs/NINE_CHECKS.md` · `docs/COMPONENT_MAP.md` + `docs/component_map.png` (architecture) · `docs/ICP_SPEC.md` (exact decision logic) · `docs/EVIDENCE_MAP.md` (whiteboard) · `docs/SPRINTO_CONTEXT.md` (allowed claims) · `docs/TOOLS.md` (APIs, env) · `data/` (domain lists, manual PoC template) · `tests/fixtures/` + `tests/golden_expected.json` (offline fixtures and expected outputs).

---

You are building the **Sprinto Outreach Engine** end to end: design, code, database, tests, CI and deployment. Work autonomously. Before writing any code, read in this order: `CLAUDE.md`, `docs/NINE_CHECKS.md`, `docs/COMPONENT_MAP.md` and look at `docs/component_map.png` (build exactly steps 0–7, G and M), `docs/ICP_SPEC.md` (exact business logic), `docs/EVIDENCE_MAP.md`, `docs/SPRINTO_CONTEXT.md`, `docs/TOOLS.md`. Fixtures for 5 fictional companies are in `tests/fixtures/`; the expected results are in `tests/golden_expected.json`.

## What to build

A web app plus a CLI. The Growth Lead (GL) gives it a list of domains; it qualifies each company, finds the right person, picks their two likeliest pains, drafts a personalised email, routes it through a review gate, and sends it via Gmail **to our own inbox**. Same engine behind the UI and the CLI.

### Screens
1. **New run** (map step 0)
   - Paste domains (one per line) or upload a CSV (`domain` column). Normalise (strip protocol/`www`/path, lowercase), dedupe, validate with Zod, show row-level errors in plain English.
   - **Discover** button: Google News RSS queries (e.g. `"Series A" SaaS raises`, `"Series B" SaaS funding`, `SOC 2 startup hiring`, India + US editions) plus one Gemini Google-Search-grounded query → candidate companies → resolve each to a domain (from the article or a grounded search) → show 10–20 with headline, date and source link. Exclude domains contacted in the last 90 days. GL ticks the ones to run.
   - Mode toggle `review` / `auto` (auto disabled unless `LIVE_SEND=false`). **Load fixtures** button runs the 5 offline fixture companies with `MOCK_EXTERNAL=1`.
   - **Run** creates a `runs` row and enqueues one `companies` row per domain.
2. **Run progress** (steps 1–6): a table, one row per company, live via Supabase Realtime: stage, verdict badge, score, confidence, loops used, PoC, flags, cost so far, errors (with retry button).
3. **Company detail / "Why?" panel** (defensibility, the case's second "done" criterion):
   - **Why this company:** gates, the 7 criteria with points, status (found/unknown) and the evidence behind each (quote + link), the full research-loop trace (each iteration: tool, query/URL, what was learned, score before/after).
   - **Why this person:** all Hunter contacts with persona, tier, eligibility, confidence, verification, and the selection reason.
   - **Why these pains:** the candidate table with signals and scores, plus the AI rationale.
   - **Why this email:** the hook highlighted with its evidence source, the Sprinto claim id used, validator results (V1–V9) and critic scores.
4. **Review gate** (map step G, the main screen): queue ordered Needs GL → Ready → Sent → NO_GO/HOLD (collapsed). Card: company, verdict, flags, PoC, the 2 pains, editable subject/body, the "Why?" link. Actions **Approve** / **Edit & approve** / **Reject** with reason category + text (categories in ICP_SPEC §9). Bulk-approve only for unflagged drafts. Show the live edit ratio while editing.
5. **Sent & metrics** (map step M): per run and a weekly roll-up: sent, unique opens, open rate, median edit ratio and % > 0.50 (whiteboard: "GL changes the email > 50%"), rejects by reason, qualification agreement, avg time and cost per company, evidence coverage. Mark-as-replied toggle per send.
6. **ICP settings:** active `icp_config` (every parameter in ICP_SPEC §3, §6, §7, §8 limits) with version history, create a new version with a required note, diff vs the previous one, activate explicitly. Each run records the version it used. No AI-suggested tuning.
7. **Auth:** Supabase magic link. Roles `gl` (everything) and `viewer` (read-only). Seed the first user as `gl`.

### CLI (same engine)
`npm run pipeline -- --file data/domains_live.csv --mode review` and `npm run pipeline -- --fixtures` (offline). Prints a summary table and writes `out/run-<id>.json`.

## Architecture

**Pipeline as a resumable state machine in Postgres.** `companies.stage` moves through `queued → scraped → extracted → qualifying → qualified → poc_found → pains_ranked → drafted → awaiting_review → approved → sent` (or ends at `no_go` / `hold` / `rejected` / `error`). One function per stage in `lib/pipeline/stages/*`, each idempotent and writing its outputs before advancing the stage.

**Worker.** `POST /api/worker/tick` (protected by `WORKER_SECRET`) claims up to N companies with `FOR UPDATE SKIP LOCKED`, runs one stage each, and returns. Called by: the UI while a run is open (poll every few seconds), a Vercel cron every minute, and the CLI in a local loop. This keeps each invocation short (well under Vercel function limits) and makes every company resumable after a crash. Concurrency: 3 companies, 4 page fetches per company (`p-limit`). Retries with exponential backoff on 429/5xx; after 3 failures the company goes to `error` with the message.

**Adapters** (`lib/adapters/`), each with a real and a mock implementation (`MOCK_EXTERNAL=1` uses fixtures):
- `scraper`: Jina Reader `https://r.jina.ai/<url>` → fallback `fetch` + Readability + Turndown → fallback Firecrawl (if key). Page discovery: sitemap.xml, homepage links, common paths (`/about`, `/company`, `/pricing`, `/careers`, `/jobs`, `/security`, `/trust`, `/customers`, `/case-studies`, `/press`, `/blog`), `trust.<domain>`, and known ATS hosts (Greenhouse, Lever, Ashby, Workable, Keka, Darwinbox). Respect robots.txt. Max 8 pages per pass, 10 s timeout, 200 KB markdown cap per page.
- `dns`: Node `dns/promises` for CNAME/A/MX/TXT → cloud providers per ICP_SPEC §4 E4.
- `news`: Google News RSS parse (`fast-xml-parser`).
- `gemini`: `@google/genai`. **Look up the current model ids and the current SDK call style (generateContent vs Interactions API) with web search before coding**, and set them in env. Use structured output with a JSON schema generated from Zod for extraction, rationale, writer and critic; function calling + `google_search` grounding for the research agent. Set a low thinking level for extraction and a higher one for the writer.
- `hunter`: Domain Search + Email Verifier (confirm params and quota in Hunter's docs). Quota check against `api_usage` before each call; mock reads `tests/fixtures/hunter/*.json`. `data/manual_poc.csv` (Option B) overrides Hunter per domain.
- `gmail`: `googleapis` Gmail v1 `users.messages.send` with OAuth2 refresh token. Build the RFC 2822 MIME (multipart/alternative, text + HTML with tracking pixel), base64url-encode. Include `npm run gmail:auth`, a one-time local script that opens the OAuth consent URL and prints the refresh token. Fallback if OAuth setup blocks: Nodemailer + Gmail App Password (log it in DECISIONS).

**Engine** (`lib/engine/`, pure functions, no I/O): `signals.ts` (CompanyFacts → Signals), `score.ts` (gates, points, confidence, verdict, flags), `poc.ts` (persona, eligibility, ranking), `pains.ts` (signals, candidates, top 2), `validator.ts` (V1–V9), `editRatio.ts`, `quoteCheck.ts`, `entityCheck.ts`. All parameters come from an `IcpConfig` object, never constants.

**LLM prompts** live in `lib/llm/prompts/*.ts` as versioned templates (`extract.v1`, `research.v1`, `painRationale.v1`, `write.v1`, `critic.v1`), each with a Zod output schema. Rules the prompts must carry:
- Extract: "Return null if the page doesn't state it. Every value needs a quote copied exactly from the page." Then code runs the quote check.
- Research agent: give it the unknown/weak criteria and allowed tools; it returns tool calls, never signals.
- Writer: ICP_SPEC §8 rules, the 2 examples in SPRINTO_CONTEXT, allowed claims by id, candidate hook evidence (id, text, date, URL). Output `{subject, body, hook_evidence_id, claim_ids[], pain_code}`.
- Critic: the rubric in ICP_SPEC §8; output 4 sub-scores + one-paragraph critique.

## Data model (Supabase; adjust names if you must and log it)
- `icp_config (version int pk, params jsonb, sprinto_context_version text, note text, created_by uuid, is_active bool, created_at)`: seed v1 from ICP_SPEC defaults; exactly one active
- `profiles (user_id pk → auth.users, role text check in ('gl','viewer'))`
- `runs (id, icp_version, mode, source 'paste'|'csv'|'discover'|'fixtures', created_by, started_at, finished_at, stats jsonb)`
- `companies (id, run_id, domain, name, stage, verdict, score, confidence, loops_used, gates text[], flags text[], hold_reason, error, cost_usd, started_at, updated_at, unique(run_id, domain))`
- `pages (id, company_id, url, kind, fetched_via, http_status, content_md, content_hash, iteration, fetched_at)`; large content in Storage if > 200 KB
- `evidence (id, company_id, criterion, signal, value jsonb, quote, source_url, source_kind, iteration, created_at)`
- `company_facts (company_id pk, facts jsonb, signals jsonb, model, prompt_version, updated_at)`
- `qualifications (id, company_id, iteration, score, confidence, criterion_points jsonb, gates text[], flags text[], decision, trace jsonb)`: one row per scoring pass
- `research_steps (id, company_id, iteration, tool, args jsonb, result_summary, new_evidence_ids uuid[], tokens_in, tokens_out, cost_usd, created_at)`
- `contacts (id, company_id, first_name, last_name, email, position, seniority, department, persona, tier, hunter_confidence, verification_status, eligible, rank, selection_reason, source 'hunter'|'manual', is_selected)`
- `pain_points (id, company_id, contact_id, code, rank, score, rationale, evidence_ids uuid[])`
- `drafts (id, company_id, contact_id, version, subject, body, hook_evidence_id, claim_ids text[], pain_code, validator jsonb, critic jsonb, status, prompt_version, created_at)`
- `reviews (id, draft_id, action, final_subject, final_body, edit_ratio, reason_category, reason_text, reviewer, created_at)`
- `sends (id, run_id, company_id, draft_id, to_address, intended_address, gmail_message_id, gmail_thread_id, status, error, sent_at, replied bool default false, unique(run_id, company_id))`
- `email_events (id, send_id, type 'open'|'click', user_agent, ip_hash, created_at)`
- `llm_calls (id, company_id, step, model, prompt_version, tokens_in, tokens_out, latency_ms, cost_usd, ok, error, created_at)`
- `api_usage (provider, period 'YYYY-MM', count, primary key(provider, period))`

Enable RLS on every table: `gl` full access, `viewer` select only; the worker uses the service role server-side only. The tracking-pixel route writes via the service role and never exposes data. Run Supabase advisors after migrations and fix every security warning.

## API routes
`POST /api/runs` · `POST /api/discover` · `POST /api/worker/tick` · `GET /api/runs/:id` · `POST /api/drafts/:id/review` · `POST /api/sends/:companyId` (server-side; asserts `to === DEMO_RECIPIENT`) · `GET /api/t/o/:sendId.gif` (logs open, returns a 1×1 GIF with no-cache headers) · `POST /api/icp-config` · `POST /api/icp-config/:version/activate`.

## How to work

1. **Plan, then go.** Write `PLAN.md` with milestones and a checklist, then start immediately. Don't wait for approval.
2. **Set up GitHub first.** `git init`, create a private repo `sprinto-outreach-engine` with `gh`, push, and add a CI workflow (`.github/workflows/ci.yml`: install, lint, typecheck, `npm test`) that must stay green. Use a branch + PR per milestone; merge when CI is green.
3. **Engine first, test-driven.** Build `lib/engine/*` and make `tests/golden_expected.json` pass exactly (verdicts, scores, confidence to 2 decimals, loops, gates, flags, criterion points, PoC, contact ranking, pain codes and scores) using `tests/fixtures/qualification_cases.json` and the Hunter fixtures, with a mock research agent that replays `research_deltas`. Add every synthetic test in ICP_SPEC §12, plus quote-check tests against `tests/fixtures/pages/*`. This milestone isn't done until `npm test` is green.
4. Then: Supabase schema + migrations + seed → adapters (mock first, then real) → pipeline stages + worker → CLI → UI screens → Gmail send + pixel → metrics → ICP settings → auth/RLS → GitHub Actions scheduled run → deploy.
5. **Scheduled run (GitHub Actions).** `.github/workflows/weekly-discover.yml`: `workflow_dispatch` + weekly cron (Monday 09:00 IST) runs Discover → pipeline in `review` mode, so drafts wait for the GL. Secrets from GitHub secrets.
6. **Use your tools. Don't ask me to do things you can do:**
   - **Supabase MCP / CLI**: create the project if none exists, `apply_migration`, `execute_sql`, `generate_typescript_types`, `get_advisors`.
   - **GitHub (`gh`)**: repo, branches, PRs, Actions secrets (`gh secret set`), workflow runs and logs.
   - **Vercel MCP / CLI**: project linked to the GitHub repo, env vars, preview + production deploys, cron config in `vercel.json`. Check build and runtime logs after each deploy.
   - **Web search / fetch**: current Gemini model ids and SDK usage, Hunter API params and free-tier limits, Gmail API send + OAuth steps, Jina/Firecrawl usage. Re-verify every claim in `SPRINTO_CONTEXT.md` on sprinto.com and log it.
   - **Playwright**: one e2e on fixtures: Load fixtures → run → expect 2 GO (Ledgerly, TrustVault), 1 HOLD (OrbitFleet), 2 NO_GO → TrustVault in Needs GL with 2 flags → edit and approve Ledgerly → mock send recorded with `to = DEMO_RECIPIENT` → metrics show edit ratio. Screenshot each main screen and look at them to catch layout bugs.
   - **Subagents**: parallel UI screens once the API is fixed, and one independent review of `lib/engine` against ICP_SPEC.
7. **Live smoke test (needs my keys).** Once keys are in: run 3 real domains from `data/domains_live.csv` (or Discover) in `review` mode, check the evidence and the "Why?" panel make sense, approve one, and confirm the email lands in `DEMO_RECIPIENT`'s inbox addressed to the PoC by first name, with the pixel and the demo footer. Record results in `DECISIONS.md`.
8. **Verify before claiming done.** Lint, typecheck, unit + golden + e2e tests green, CI green on `main`, deployed URL loads, fixture flow works on production, and one live email received.
9. Keep `DECISIONS.md` and `PLAN.md` updated as you go.

## When to come to me (and only then)

Stop and ask **only** for:
- **Credentials or account access** you can't get through MCP/CLI: `GEMINI_API_KEY`, `HUNTER_API_KEY`, the Gmail OAuth client + the one-time browser consent for the refresh token, `DEMO_RECIPIENT`, `SENDER_NAME`, Supabase org, GitHub/Vercel login. **Ask once, listing everything together.**
- **Anything that costs money** (paid plans, extra Hunter credits, domains).
- **Changing the meaning of a rule** in ICP_SPEC, adding or removing a step from the component map, or anything that would send email to an address other than `DEMO_RECIPIENT`.
- **A blocker you've tried to solve 3 different ways.** Tell me what you tried.

For everything else (naming, UI layout, library choice, folder structure, prompt wording, error copy, minor ambiguities), make the sensible call, log it in `DECISIONS.md` and keep going. While waiting on a credential, keep building everything that doesn't need it (mock adapters, fixtures, local Supabase) so no time is lost.

## Out of scope (do not build)
- Sending to real prospects, follow-up sequences, reply parsing, CRM sync
- Any self-learning loop (auto-tuning the ICP or prompts from metrics)
- LinkedIn scraping or paid data providers

## Definition of done
- [ ] Golden test passes exactly; all synthetic tests in ICP_SPEC §12 pass; quote-check and validator tests pass
- [ ] Fixture run shows **GO: Ledgerly (95, PoC Neha Iyer, pains PP3+PP1), TrustVault (78, PoC Meera Shah, pains PP5+PP4, flags ALREADY_CERTIFIED + COMPETITOR_CUSTOMER) · HOLD: OrbitFleet (53 after 3 loops) · NO_GO: PixelPantry (NOT_SAAS), MegaCorp (TOO_LATE_STAGE)**
- [ ] Every number/fact in every draft traces to evidence or an allowed claim (validator test); invented customer names are blocked
- [ ] Review actions persist with reasons; edit ratio stored; flagged drafts can't be bulk-approved
- [ ] Code refuses to send to any address other than `DEMO_RECIPIENT` (unit test); sends are idempotent
- [ ] One live email received in `DEMO_RECIPIENT`'s inbox, addressed to a real person by first name, with a hook you can trace to a source URL in the "Why?" panel
- [ ] Open tracking records an event when the email is opened
- [ ] New ICP version only takes effect after activation; each run shows the version it used
- [ ] RLS on, Supabase advisors clean, viewer role can't edit
- [ ] GitHub CI green on `main`; weekly workflow runs successfully via `workflow_dispatch`
- [ ] Deployed on Vercel; production URL works with fixtures
- [ ] `README.md`: run locally, set up each API key (Gemini, Hunter, Gmail OAuth), run the CLI, change the ICP, rotate keys, how to read the "Why?" panel
- [ ] Final message to me: URL, repo link, test results, screenshots, the live email (subject + body + why), cost per company, open questions for the GL (from `DECISIONS.md`), and what v2 should be (suggestion: follow-up sequence + reply detection, gated by the same review queue)
