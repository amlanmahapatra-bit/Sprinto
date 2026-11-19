# CLAUDE.md: Sprinto Outreach Engine

## Context
MESA PGP Term 2, AI Case 2 ("Cold Outreach, at Scale"). Sprinto sells compliance automation (SOC 2, ISO 27001, GDPR…) to SaaS companies. Its Growth Lead (GL) researches each prospect, finds a contact and writes a first email by hand: 15–20 minutes per company, 8–15 companies a week, quality dropping as the GL tires. We're building a repeatable system: give it a list of domains and it qualifies each company against Sprinto's ICP, finds the decision-maker, picks their two likeliest pains, writes a personalised email, and sends it via Gmail to **our own inbox** (the case requires `to:` to be hardcoded).

## Read these first, in order
1. `docs/NINE_CHECKS.md`: the design decisions and why
2. `docs/COMPONENT_MAP.md` + `docs/component_map.png`: the agreed architecture (steps 0–7, G, M). Build exactly these
3. `docs/ICP_SPEC.md`: exact scoring, gates, flags, PoC rules, pain library, email rules, golden tests
4. `docs/EVIDENCE_MAP.md`: the team's whiteboard, transcribed
5. `docs/SPRINTO_CONTEXT.md`: the only allowed Sprinto claims
6. `docs/TOOLS.md`: APIs, accounts, env vars

## Hard boundaries (never break these)
- **Never send to anyone except `DEMO_RECIPIENT`.** Assert it in code right before every send. `LIVE_SEND` stays `false`.
- **The LLM never decides a score, verdict, PoC or recipient.** Those are deterministic code driven by `icp_config`.
- **No fact without evidence.** Every extracted value needs a verbatim quote + source URL; every fact or number in an email must trace to evidence or `SPRINTO_CONTEXT.md`.
- **No LinkedIn scraping.** Respect robots.txt. Only fetch the company's own domain, known ATS hosts and news URLs returned by a search.
- **Hunter only for GO companies**, and check the monthly quota first.
- **Secrets** only in env / GitHub secrets / Vercel env. Never commit `.env`. Never log keys or full email addresses in plain logs.
- **No self-learning loop.** Metrics are displayed; the ICP changes only when the GL creates a new `icp_config` version.

## Stack
Next.js (App Router, TypeScript, Tailwind, shadcn/ui) on Vercel · Supabase (Postgres, Auth, Storage, RLS) · Gemini via `@google/genai` · Hunter.io · Gmail API (`googleapis`) · Jina Reader / Readability / Firecrawl · Zod · Vitest · Playwright · GitHub Actions.

## Conventions
- Pure logic in `lib/engine/*` (no I/O): `signals.ts`, `score.ts`, `poc.ts`, `pains.ts`, `validator.ts`, `editRatio.ts`. 100% covered by tests.
- All external calls behind adapters in `lib/adapters/*` with a mock implementation used in tests (`MOCK_EXTERNAL=1`).
- Every LLM call goes through `lib/llm/call.ts`, which logs to `llm_calls` (model, step, tokens, latency, cost, ok/error) and validates output with Zod.
- Keep `PLAN.md` and `DECISIONS.md` updated. Log every judgment call in `DECISIONS.md`.
