# DECISIONS — judgment calls & why

Format: date · decision · why.

## 2026-11-04
- **Project lives in the pack folder** (`sprinto-outreach-pack/`) so `docs/`, `data/` and `tests/fixtures/` ship with the repo and the CLI can read them directly.
- **Stack choices:** Next.js 15 App Router + React 19 + Tailwind 3 (stable) + hand-rolled UI primitives instead of the shadcn CLI (fewer moving parts, same look). Vitest for unit/golden, Playwright for one e2e.
- **Engine params fully in `IcpParams`** (`lib/icp/defaults.ts`), never constants — matches the "no magic numbers" rule and lets ICP versions change behaviour.
- **Confidence rounding** via `Math.round(x * 10^2)/10^2` (banker-free), matching golden `0.57`, `0.86`, `1.0`.
- **Research loop counting:** `loops_used` = number of research deltas applied; the terminal HOLD/GO decision is recorded as the final trace entry at `iteration = loops_used`. Reproduces OrbitFleet's 4-entry trace and `loops: 3`.
- **PoC `selection_reason`** string format `Tier N persona role; confidence C; verification V`; ineligible reason `confidence C < 70` so the UI can show exactly why someone was skipped.
- **Validator V5 (proper nouns):** flag capitalised tokens that are not sentence-initial, not in a common-words allowlist, not the company/PoC/Sprinto/framework names, and not present in evidence text — catches invented customer names with low false-positive rate.
- **Validator V8 / V6** exclude the opt-out footer line from the `?`-count and the body word count (R2/R7 count the message, not the footer/signature).
- **Gemini model ids** left as env (`GEMINI_MODEL_FAST/WRITER`) with a build-time web-search verification step before the live run; defaults in `.env.example` are placeholders to be confirmed.

## 2026-11-04 (build session)
- **Supabase project** `sprinto-outreach-engine` (ref `dsvbbecjquggeericcki`, ap-south-1, free $0). Migrations 0001–0006 applied; security advisors clean (revoked EXECUTE on `is_gl` / `claim_companies` from anon/authenticated).
- **Gemini model ids:** verified via web search that the pinned `gemini-3.8-flash` in the pack is not a current id (current GA Flash is the Gemini 3.x family, Aug 2026). Defaulted to the moving alias `gemini-flash-latest`; overridable via env.
- **Worker granularity:** claim + run a whole company per tick (3 concurrent) rather than one micro-stage per tick. Still crash-resumable (stage recorded; a later tick re-claims `queued`/re-runs). Simpler and matches the fixture timing; documented as a deliberate deviation from strict stage-per-tick.
- **Auth:** Supabase magic link + password sign-in (password added so the e2e and demo have a reliable, non-email path). First user becomes `gl` via an `auth.users` trigger; everyone else `viewer`.
- **Worker auth:** `/api/worker/tick` accepts `x-worker-secret`, `Authorization: Bearer <WORKER_SECRET>` (Vercel Cron), or `?secret=`. The open-run UI uses a separate gl-authed `/api/runs/:id/tick`.
- **Pain rationale** stored deterministically in mock mode; the real path can fill it via Gemini (painRationale.v1 prompt present).
- **GitHub push** was blocked by the Claude Code auto-mode safety classifier (treats pushing code as an external upload). Needs a one-time user approval / permission rule; repo is committed locally and ready.

## 2026-11-05 (keys + deploy session)
- **RLS bug fixed (migration 0007).** 0004 revoked `EXECUTE` on `public.is_gl()` from `authenticated` to keep it off the REST RPC surface — but RLS policy expressions run as the querying role, so that broke every policy calling it (GL users resolved as `viewer`; gl-only writes 403'd). Fix: move the helper to a `private` schema PostgREST does not expose, grant `EXECUTE` to `authenticated`, and repoint all policies at `private.is_gl()`. Advisors stay clean and RLS works.
- **Worker drains per tick.** `tick()` now claims+processes companies in batches until the run has none queued (or a ~45s budget under the 60s route limit), instead of processing one batch of 3 and relying on the caller to tick again. One UI poll or cron hit finishes a run; still crash-resumable. Fixes runs stalling at 3/5.
- **UI poll hardened.** `RunProgress.load()` no longer throws on a transient fetch failure, so a single bad poll can't kill the polling loop.
- **LLM via OpenRouter.** User supplied an OpenRouter key (not a Google key), so the LLM layer gained an OpenAI-compatible OpenRouter path (`callJSON`/`callText`), selected by `LLM_PROVIDER` / auto when `OPENROUTER_API_KEY` is set. Gemini ids get a `google/` prefix; structured output uses JSON mode with the schema carried in the prompt and validated by the same zod schema. Trade-off: no Google Search grounding via OpenRouter, so research uses scraped evidence only. Validated with `google/gemini-2.5-flash`.
- **Next.js 15.1.6 → 15.5.29.** Vercel blocks deploys on the vulnerable version (CVE-2025-29927 middleware auth bypass, relevant since auth is in middleware). Re-verified: typecheck, 28 unit tests, lint, e2e all green after the bump.
- **Vercel cron daily, not every-minute.** Hobby plan only allows daily crons; changed `vercel.json` to `0 3 * * *`. The UI drains each run per tick and weekly discovery runs via GitHub Actions, so the Vercel cron is only a background safety net.
- **Deploy via Vercel CLI, not MCP.** The Vercel MCP connection lacks access to the `sakshi-c-mesa` team (403); the CLI is authed as `sakshichugh-build` with team access, so the project was created and deployed via CLI. Prod: https://sprinto-outreach-engine-five.vercel.app (public, fixture run verified 5/5).
- **e2e determinism.** `beforeAll` deletes all runs (cascades) for a clean review queue; locators scoped to `div.bg-panel` cards; approval waits for the send button instead of racing a page reload.
- **Git identity.** Repo-local `user.name`/`user.email` set to Sakshi Chugh <sakshi_chugh@pg27.mesaschool.co> (host auto-detect was failing).

## 2026-11-19 (email delivery)
- **SMTP (App Password) path added alongside OAuth.** The user's Google Workspace (`pg27.mesaschool.co`) blocks both App Passwords and third-party OAuth, so neither Gmail route works from that account without an admin. Added `sendViaSmtp` (nodemailer, `smtp.gmail.com:465`) and a `deliverEmail` dispatcher that uses SMTP when `GMAIL_APP_PASSWORD` is set, else the Gmail API. Same `assertDemoRecipient` boundary on both. Real delivery still needs a usable account (a personal Gmail app password, or a provider like Resend).
- **Live email proven via a test mailbox (Ethereal).** With no usable sending account, the full pipeline→email was demonstrated by sending the most recent engine-drafted email (TrustVault, "Audit-ready between audits") to a throwaway Ethereal mailbox with the tracking pixel, addressed to `DEMO_RECIPIENT`. Confirmed the rendered email end-to-end. This is a preview, not delivery to a real inbox.

## Pending verification (before live run)
- Re-check every SPRINTO_CONTEXT claim on sprinto.com and log here.
- Confirm current Gemini model ids + SDK call style, Hunter params/limits, Gmail send scope.

## 2026-11-19 (Resend)
- **Resend added as the preferred send transport.** `sendViaResend` (HTTP API) joins the Gmail OAuth and SMTP paths; `deliverEmail` prefers Resend when `RESEND_API_KEY` is set. The adapter `sendEmail` now takes a structured `OutboundEmail` (to/from/subject/text/html/intendedRecipient) so each provider formats it its own way. Same `assertDemoRecipient` boundary on every path.
- **Send decoupled from MOCK_EXTERNAL.** When a real provider is configured, the send route delivers for real via `deliverEmail` even while the pipeline runs in fixture/mock mode (`hasRealMailer()`), so the demo can stay deterministic but still land a real email. `RESEND_FROM` blank falls back to onboarding@resend.dev (delivers only to the account owner, i.e. DEMO_RECIPIENT).
