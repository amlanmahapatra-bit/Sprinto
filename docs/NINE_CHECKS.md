# The Nine Checks: Sprinto Cold Outreach Engine

Each check is a design question asked of the whole system before building. The answer decides who owns each step (code, AI or a person) and what guardrail sits around it. The component map and ICP spec implement these answers. If a later design change contradicts a check, update this file first.

| # | Check | Question it answers |
|---|---|---|
| 1 | Outcome | What does "done" look like, and how do we measure it? |
| 2 | Trigger | What starts a run, how often, at what volume? |
| 3 | Inputs | What data do we need, where does it come from, how reliable is it? |
| 4 | Code vs AI split | Which parts must be deterministic, which need judgment from an LLM? |
| 5 | Context | What does the AI need to know to do its part well? |
| 6 | Failure modes | What can go wrong, and what does each failure cost? |
| 7 | Human checkpoint | Where must a person decide, and why there? |
| 8 | Guardrails | How do we catch bad AI output before it does harm? |
| 9 | Metrics and feedback | How do we know it's working, week over week? |

---

## Check 1: Outcome

**Answer.** For every domain in a run, the system produces exactly one of: a sent email (GO), a parked company with a reason (HOLD), or a rejection with a reason (NO-GO). A sent email is addressed to a real, named decision-maker, opens with a hook that cites a real and verifiable fact about their company, and lands in our own inbox (the case says to hardcode `to:` as our own email).

**Done means** (from the case):
- A personalised email lands in the inbox, addressed by name, with a hook a human would answer.
- Every decision is defensible: *why this company qualified, why this person, why this email*. So every claim the system makes is stored with its source URL and quoted snippet.

**Design consequence.** Evidence is a first-class table. Nothing is asserted without an `evidence_id`. The UI has a "Why?" panel per company showing the score trace, the PoC ranking and the hook's source.

## Check 2: Trigger

**Answer.** Two ways to start a run:
1. **Paste or upload a list of domains** (the case's core requirement: "run it on a list of domains").
2. **Discover** (whiteboard: "Google News → Shortlist 10–20"): the GL clicks Discover, the system searches news for recent Series A–C SaaS funding and compliance-related signals, and proposes 10–20 domains. The GL ticks the ones to run. (Choosing the list is the only manual step; after Run, there are no decisions until the review gate.)

**Volume.** 8–15 companies a week today; design for 50/run. Hunter's free tier (25 domain searches/month) is the binding constraint, so Hunter runs **only on GO companies**, never on the full list.

**Cadence.** On demand from the UI, plus an optional weekly GitHub Actions schedule that runs the Discover → pipeline flow and leaves drafts waiting for review.

## Check 3: Inputs

| Input | Source | Reliability | Notes |
|---|---|---|---|
| Company pages: home, about, pricing, careers, security/trust, customers, blog/press | Website scrape (Jina Reader → fallback fetch+Readability; Firecrawl optional for JS-heavy sites) | High for what the company says about itself; can be stale | Respect robots.txt; max ~8 pages per company per pass |
| Funding stage and recent news | Google News RSS (free) + Gemini Google-Search grounding | Medium; headlines can be wrong or about a same-name company | Must match the company's domain or name + product; store the article URL |
| Headcount | About page, news ("team of 45"), Hunter company data (optional) | Low-medium; often missing | Range, not a number; flag conflicts |
| Cloud stack | DNS records (CNAME/A/MX/TXT), careers JDs, tech mentions | Medium | DNS is deterministic and free |
| Decision-maker | Hunter.io Domain Search (Option A); `manual_poc.csv` from Apollo (Option B fallback) | Hunter gives a confidence score and verification status | Never scrape LinkedIn (ToS) |
| Sprinto product facts | `docs/SPRINTO_CONTEXT.md` (curated, versioned) | High (we control it) | The only source of Sprinto claims in emails |

## Check 4: Code vs AI split

| Step | Owner | Why |
|---|---|---|
| 1 Scrape | **Code** | Fetching pages needs no judgment |
| 2 Extract | **AI (Gemini, structured output)** + code validation | Reading messy pages into fields needs language understanding. Every field must come with a quote that literally appears in the page (code checks this) |
| 3 Qualify: score | **Code** | The GO/NO-GO decision must be explainable and repeatable. Points and thresholds live in a versioned `icp_config` |
| 3 Qualify: research loop | **AI agent** (picks the next tool/query) inside **code limits** (max 3 loops, allowed tools only, stop when nothing new is found) | Deciding *where to look next* for a missing signal is judgment; deciding *whether the company qualifies* is not |
| 4 Find PoC | **Code** | Title-matching rules and Hunter confidence thresholds are deterministic and defensible ("why this person") |
| 5 Pain points | **Code ranks** from a fixed library; **AI writes** the person-specific rationale | Keeps the choice testable; the AI adds the words, not the decision |
| 6 Draft | **AI** (Gemini) | Writing a natural, specific email is the one place we want the LLM's craft |
| G Review gate | **Code checks + AI critic + person** | See checks 7 and 8 |
| 7 Send | **Code** (Gmail API) | Irreversible action, so no AI in the loop |

## Check 5: Context

What the AI gets, per step, and nothing more:
- **Extract:** the scraped markdown for that company, the JSON schema of facts, and the instruction "every value must quote its source text; return null if not stated".
- **Research agent:** the current facts, which criteria are `unknown` or weak, the list of allowed tools, and how many loops remain.
- **Pain-point rationale:** the selected PoC (name, title, persona), the top-2 pain codes with library definitions, and the evidence items behind them.
- **Draft:** the PoC, company facts, the top-2 pain points, the candidate hook evidence (with dates), `SPRINTO_CONTEXT.md` allowed claims, the email rules (ICP_SPEC §8) and 2 good/2 bad example emails.
- **Never:** other companies' data, the actual PoC email address (the drafter doesn't need it), or any unverified Sprinto claim.

## Check 6: Failure modes

| Failure | Cost | Mitigation |
|---|---|---|
| Wrong company matched in news (same name) | Embarrassing hook, wrong qualification | News item must mention the domain or the product name + 1 other identifying fact; otherwise it's discarded |
| Hallucinated fact in extraction | Wrong GO/NO-GO, false hook | Quote check: every extracted value needs a quote found verbatim in the scraped page |
| Hallucinated fact or number in the email | Credibility loss, possible legal issue | Email validator: every number and named fact must trace to evidence or SPRINTO_CONTEXT |
| Site blocks scraping / JS-only site | Missing data | Fallback chain (Jina → fetch → Firecrawl); mark `unknown`, not `false` |
| Wrong person (sales, HR, a departed employee) | Ignored email | Title rules exclude non-buyers; Hunter confidence ≥ 70; flag < 80 for review |
| Already a Sprinto/competitor customer | Wasted or awkward email | Detect competitor trust centres (Vanta, Drata, Secureframe, Scrut…) → forced review |
| Sending to a real prospect by accident | Real reputational damage | `to:` is hardcoded from `DEMO_RECIPIENT`; code refuses any other address unless `LIVE_SEND=true` *and* a GL approval exists |
| Duplicate send | Spammy | Unique constraint on (company, run) in `sends`; idempotency key |
| API quota exhausted (Hunter 25/mo, Gemini rate limits) | Run stalls | Quota table checked before calls; Hunter only on GO; exponential backoff on 429 |
| Cost blow-up in research loop | Money | Max 3 loops, max 8 pages per pass, token/cost logged per company |

## Check 7: Human checkpoint

**One gate, before Send.** The GL sees the company verdict, the "why", the chosen PoC and the draft, and clicks Approve / Edit / Reject. Edits are captured (they become the "GL changes > 50%" metric).

Two modes, set in config:
- `review` (default for real prospects): every email waits for approval.
- `auto` (allowed only while `to:` is our own inbox, which is the case's setup): emails with **no review flags** and a critic score ≥ 4 send immediately; flagged ones still wait.

**Always routed to the GL, in both modes** (the "Needs GL" queue): `HOLD` companies, `ALREADY_CERTIFIED`, `COMPETITOR_CUSTOMER`, `BORDERLINE_SCORE`, `BORDERLINE_SIZE`, `LOW_CONFIDENCE`, `CONFLICTING_EVIDENCE`, `STALE_FUNDING`, `POC_LOW_CONFIDENCE`, `HOOK_WEAK`, `VALIDATOR_FAILED`.

**Not a checkpoint:** the list of domains is chosen before Run; after that, no step asks a person for input until the gate.

## Check 8: Guardrails

1. **Quote check** on extraction (verbatim substring in the source page, after whitespace normalisation).
2. **Entity check** on news (company name/domain match).
3. **Deterministic scorer** with a full trace; the LLM can't change a score.
4. **Bounded agent loop:** allowed tools only, max 3 iterations, stops when an iteration adds no new evidence, every step logged in `research_steps`.
5. **Email validator** (code): first name matches the PoC; company name present; hook cites an existing evidence id; every number appears in evidence or SPRINTO_CONTEXT; banned phrases absent; word and subject limits; one CTA; opt-out line present.
6. **AI critic** (a second Gemini call with a rubric): "Would a busy {title} reply?" scores 1–5. Below 4 → one rewrite with the critique → still below 4 → `HOOK_WEAK`, routed to the GL.
7. **Send lock:** recipient allow-list, idempotency key, daily send cap.
8. **Secrets** only in env / GitHub secrets / Supabase vault; RLS on every table.

## Check 9: Metrics and feedback

| Metric | Definition | Target |
|---|---|---|
| GL edit ratio (whiteboard #2) | Normalised Levenshtein distance between AI draft and approved version (subject + body) | Median < 0.50; any email > 0.50 counts as a failed draft |
| Open rate (whiteboard #1) | Unique opens / sent, via tracking pixel | Tracked; note Gmail's image proxy makes it approximate |
| Reply rate | Replies / sent (manual mark in v1) | Tracked |
| Qualification agreement | % of GO that the GL approves (not rejects for fit) | > 80% |
| Time per company | Run start → draft ready | < 2 min (vs 15–20 min manual) |
| Cost per company | Gemini + paid APIs | Logged; target < $0.10 |
| Evidence coverage | Criteria known / 7, after the loop | ≥ 0.7 on GO companies |

The weekly report on the Runs screen shows these. There's **no automatic self-tuning** in v1: the GL changes `icp_config` by creating a new version, the same way Raghav changes rules in Freshroots.
