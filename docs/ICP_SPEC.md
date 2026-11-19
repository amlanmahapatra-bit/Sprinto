# ICP & Decision Spec: Sprinto Outreach Engine

This file is the single source of truth for every decision the engine makes: who qualifies, who we write to, which pains we pick, what the email may say and when it can be sent. Scoring, PoC ranking and pain ranking are **deterministic code**. The LLM extracts, explores, and writes words; it never sets a score, a verdict or a recipient.

All thresholds and weights live in a versioned `icp_config` row (`params jsonb`), not in code constants. The defaults below are `icp_version = 1`.

---

## 1. The ICP, and why (research summary)

**Sprinto** automates compliance (SOC 2, ISO 27001, GDPR, HIPAA, PCI-DSS, ISO 42001 and more) for fast-growing companies. Its own site says it's "trusted by 4,000+ companies from Series A to enterprise", lists **SaaS, BFSI and Healthcare** as its industries, and for startups leads with the pain "deals pause when buyers ask for SOC 2 or ISO proof". The case narrows this to **SaaS, typically Series A–C, either preparing for an audit or under pressure from enterprise customers to get certified**.

Our working definition (from the whiteboard, see `EVIDENCE_MAP.md`):

> A **B2B SaaS** company, **Series A–C**, **50–200 people**, selling to **larger customers** (> 50 clients, or clients with > 200 employees), in a **data-sensitive vertical**, running on **AWS/GCP/Azure** (so Sprinto's integrations work), that shows a **compliance trigger**: hiring for security/compliance, a security page that says certification is "in progress", or clear enterprise/regulated-market pressure.

Why each criterion matters:
- **SaaS (must):** Sprinto's controls are built around cloud infrastructure and SaaS tooling.
- **Series A–C:** big enough to sell to enterprises (so they get asked for SOC 2), too small to have a GRC team. Series D+ usually already has one.
- **50–200 people:** large enough for an audit to hurt, small enough that engineers do the compliance work.
- **Client size:** enterprise customers send security questionnaires; that's the trigger.
- **Industry:** fintech, health, HR and data businesses face regulator and buyer scrutiny earlier.
- **Cloud stack:** Sprinto connects to AWS, GCP and Azure to collect evidence automatically.
- **Compliance trigger:** the difference between "fits on paper" and "needs it now".

## 2. Signals (the scorer's input)

Code converts `CompanyFacts` (§4) into a flat `Signals` object. `null` means "not known yet"; `false` means "we looked and it isn't there".

| Signal | Type | Criterion |
|---|---|---|
| `is_saas` | bool | C1 |
| `funding_stage` | `pre_seed \| seed \| series_a \| series_b \| series_c \| series_d_plus \| public \| acquired \| bootstrapped` | C2 |
| `funding_date` | date | C2 (staleness) |
| `employees_min`, `employees_max` | int | C4 |
| `hiring_compliance_role` | bool | C3 |
| `security_in_progress` | bool (security/trust page says "working towards", "in progress", "upcoming audit") | C3 |
| `enterprise_pressure` | bool (enterprise plan/SSO tier, named enterprise deal, US/EU expansion, regulated buyers, security-questionnaire mentions) | C3 |
| `already_certified` | bool (claims SOC 2 Type II **or** ISO 27001) | C3 (flag) |
| `competitor_vendor` | string (`vanta`, `drata`, `secureframe`, `scrut`, `thoropass`, `delve`, `sprinto`) | flag |
| `enterprise_customers` | bool (named logos of companies with > 200 employees, or "enterprise" customers) | C5 |
| `customer_count` | int | C5 |
| `industry` | enum (§4) | C6 |
| `cloud_providers` | `aws \| gcp \| azure` [] | C7 |
| `ai_product` | bool | pain library |
| `expansion_regions` | string[] | pain library |

`employees_est` = midpoint of min and max when both exist, otherwise whichever exists.

**Criterion status:** `unknown` if every signal for that criterion is `null`; otherwise `found`. **Confidence** = (criteria that are `found`) / 7.

## 3. Scoring and verdict

### 3.1 Hard gates (any → `NO_GO`, with the code as the reason)

| Code | Fires when |
|---|---|
| `NOT_SAAS` | `is_saas == false` |
| `TOO_LATE_STAGE` | `funding_stage ∈ {series_d_plus, public, acquired}` **or** `employees_est > 1000` |
| `TOO_SMALL` | `employees_est < 15` |
| `ALREADY_SPRINTO` | `competitor_vendor == "sprinto"` |

`null` never fires a gate.

### 3.2 Points (max 100)

| Criterion | Rule | Points |
|---|---|---|
| C1 SaaS | `is_saas == true` | 10 |
| C2 Funding | `series_a`, `series_b`, `series_c` | 20 |
| | `seed` | 8 |
| C3 Compliance trigger (cap 30) | `hiring_compliance_role == true` | +12 |
| | `security_in_progress == true` | +10 |
| | `enterprise_pressure == true` | +8 |
| C4 Headcount | 50 ≤ `employees_est` ≤ 200 | 15 |
| | 30–49 or 201–400 | 7 (+ flag `BORDERLINE_SIZE`) |
| C5 Clients | `enterprise_customers == true` | +10 |
| | `customer_count ≥ 50` | +5 |
| C6 Industry | in `regulated_industries` (default: fintech, healthtech, hrtech, insurtech, legaltech, data_ai_infra, devtools, security) | 5 |
| | any other B2B industry | 3 |
| C7 Cloud | at least one of aws/gcp/azure | 5 |

### 3.3 Verdict (one per company)

Defaults: `go_threshold = 60`, `nogo_threshold = 40`, `min_confidence = 0.70`, `max_research_loops = 3`, `stop_if_no_new_evidence = true`.

1. Any hard gate → **`NO_GO`**.
2. If confidence ≥ 0.70:
   - score ≥ 60 → **`GO`**
   - score < 40 → **`NO_GO`** (`LOW_FIT`)
   - 40–59 → **`RESEARCH_MORE`** if loops remain, else **`HOLD`**
3. If confidence < 0.70:
   - **`RESEARCH_MORE`** if loops remain, else score ≥ 60 → **`GO`** + `LOW_CONFIDENCE`; 40–59 → **`HOLD`**; < 40 → **`NO_GO`** (`LOW_FIT`)
4. A research loop that adds no new evidence ends the loop (treat as "no loops remain").

Comparisons: `≥ 60` is GO, `< 40` is NO_GO, `≥ 0.70` is confident. Headcount bands are inclusive at both ends.

### 3.4 Review flags (force the company into "Needs GL", whatever the mode)

| Code | Fires when | Why it's judgment |
|---|---|---|
| `ALREADY_CERTIFIED` | `already_certified == true` | Pitch shifts to continuous compliance / switching |
| `COMPETITOR_CUSTOMER` | `competitor_vendor` is a non-Sprinto vendor | Switching pitch; tone matters |
| `BORDERLINE_SCORE` | 60 ≤ score < 65 | Within 5 points of the line |
| `BORDERLINE_SIZE` | headcount in a 7-point band | Outside the core 50–200 |
| `LOW_CONFIDENCE` | GO with confidence < 0.70 | Decision made on thin evidence |
| `CONFLICTING_EVIDENCE` | two headcount sources differ by > 50%, or two different funding stages found | Sources disagree |
| `STALE_FUNDING` | `funding_date` older than 36 months | Stage may have moved on |
| `POC_LOW_CONFIDENCE` | selected PoC Hunter confidence < 80, or verification `accept_all` / `unknown` | Email may bounce or be wrong person |
| `HOOK_WEAK` | critic score < 4 after one rewrite | Draft isn't good enough |
| `VALIDATOR_FAILED` | email validator still failing after one rewrite | Draft breaks a rule |
| `NO_POC` | no eligible contact | Company stays on `HOLD` |

## 4. Extraction (Step 2): `CompanyFacts`

Gemini returns this with structured output (JSON schema mirrors the Zod schema in `lib/schemas/companyFacts.ts`). Every leaf object with a `value` has `quote` (≤ 300 chars, copied from the page) and `source_url`.

```ts
CompanyFacts = {
  company_name: string, domain: string, one_liner: string | null,
  is_saas:          { value: boolean | null, quote, source_url },
  industry:         { value: Industry | null, quote, source_url },
  funding:          { stage: FundingStage | null, amount_usd: number | null, announced_date: string | null, quote, source_url },
  employees:        { min: number | null, max: number | null, quote, source_url },
  hiring_compliance_role: { value: boolean | null, role_titles: string[], quote, source_url },
  security_page:    { exists: boolean | null, url: string | null, certifications_claimed: Cert[], in_progress: boolean | null, trust_center_vendor: Vendor | null, quote },
  enterprise_pressure: { value: boolean | null, signals: string[], quote, source_url },
  customers:        { count_claimed: number | null, enterprise_logos: string[], quote, source_url },
  cloud:            { providers: ("aws"|"gcp"|"azure")[], method: "dns"|"job_post"|"page"|null, quote, source_url },
  ai_product:       { value: boolean | null, quote, source_url },
  expansion_regions:{ value: string[], quote, source_url },
  news: { title, url, date, summary }[]
}
Industry = fintech | healthtech | hrtech | insurtech | legaltech | edtech | data_ai_infra | devtools | security | martech | logistics | ecommerce_enablement | other_b2b | b2c
Cert = soc2_type1 | soc2_type2 | iso27001 | iso27701 | iso42001 | gdpr | hipaa | pci_dss | dpdp
Vendor = vanta | drata | secureframe | scrut | thoropass | delve | sprinto | safebase | other
```

**Extraction rules (code-enforced):**
- E1. **Quote check.** A value is kept only if its `quote` appears in the cited page's markdown (case- and whitespace-insensitive). Otherwise set to `null` and log `QUOTE_NOT_FOUND`.
- E2. **Not stated → null.** The prompt says so explicitly; the schema allows null everywhere.
- E3. **News entity check.** A news item counts only if its text contains the company's domain, or the company name **and** one of (product name, founder name, HQ city). Otherwise discard and log `ENTITY_MISMATCH`.
- E4. **Deterministic extras, no LLM:** DNS (CNAME → `cloudfront.net`/`amazonaws.com` = aws; `googleusercontent`/`appspot`/`run.app` = gcp; `azurewebsites`/`azureedge`/`cloudapp.azure` = azure); trust-centre vendor by string/host match (`trust.vanta.com`, `app.drata.com/trust`, `secureframe.com/trust`, "Powered by Vanta", etc.); careers keyword match for compliance roles (`/(compliance|grc|governance, risk|security engineer|infosec|information security|soc ?2|iso ?27001|audit)/i`).
- E5. When the LLM and a deterministic extra disagree, the deterministic value wins and `CONFLICTING_EVIDENCE` is considered.

Each kept value becomes an `evidence` row: `(company_id, criterion, signal, value, quote, source_url, source_kind, found_at, iteration)`.

## 5. Research agent loop (Step 3)

Runs only when the scorer returns `RESEARCH_MORE`.

- **Input to the agent:** current `Signals`, criterion statuses, current score, the list of `unknown` criteria and of criteria where points are 0 but could change the verdict, loops remaining.
- **Allowed tools (function calling):**
  - `google_search(query)`: Gemini with Google-Search grounding; returns grounded snippets + source URLs
  - `news_search(query)`: Google News RSS `https://news.google.com/rss/search?q=<q>&hl=en-US&gl=US&ceid=US:en`
  - `find_page(domain, kind)`: discover a specific page (careers, security, about, customers) via sitemap/links/common paths
  - `fetch_url(url)`: scrape one URL to markdown (same fetch chain as Step 1; only the company's own domain, its ATS (Greenhouse, Lever, Ashby, Workable, Keka, Darwinbox) or a news URL from a previous search)
  - `dns_lookup(domain)`
- **Per loop:** the agent may make up to 3 tool calls, then returns `{ targeted_criteria[], rationale }`. New content goes through the same extraction + quote check (§4), then the scorer re-runs.
- **Limits:** max 3 loops; stop if a loop adds no new evidence; max 8 fetched pages per loop; every call logged in `research_steps (company_id, iteration, tool, args, result_summary, new_evidence_ids[], tokens, cost)`.
- The agent can't write signals directly. Only the extractor (with the quote check) can.

## 6. PoC selection (Step 4)

**Source.** Hunter Domain Search `GET https://api.hunter.io/v2/domain-search?domain=<d>&type=personal&limit=10&api_key=…`. Confirm current params/limits in Hunter's docs. Option B: `data/manual_poc.csv` (`domain, first_name, last_name, email, position, source=apollo`) overrides Hunter for listed domains.

**Personas** (regex on `position`, case-insensitive; first match wins):

| Tier | Persona | Title pattern |
|---|---|---|
| 1 | `security` | CISO, chief information security, head of (information) security, security (lead\|manager\|director), VP security, head of (compliance\|GRC\|risk), compliance (lead\|manager\|director\|officer), DPO |
| 2 | `engineering` | CTO, chief technology, VP (of) engineering, head of engineering, director of engineering, head of (IT\|infrastructure\|devops\|platform), engineering manager |
| 3 | `founder` | co-founder, founder, CEO, chief executive, managing director |
| — | excluded | everything else (sales, marketing, HR, finance, interns…) |

**Eligibility.** `type == personal`, has `first_name`, Hunter `confidence ≥ 70`, verification status not `invalid`.

**Ranking.**
1. Lower tier wins (1 before 2 before 3).
2. **Exception:** if `employees_est < 80` and there's no eligible tier-1 contact, tier 3 (founder) ranks above tier 2.
3. Tie-break: higher `confidence`, then `seniority` (executive > senior > other), then alphabetical last name.

Store all contacts with `rank`, `persona`, `eligible`, `selection_reason` (e.g. "Tier 1 security leader; confidence 91; verification valid"). If the selected contact has confidence < 80 or verification `accept_all`/`unknown` → `POC_LOW_CONFIDENCE`. No eligible contact → `HOLD` + `NO_POC`.

`S_ENGLED` (used in §7) = no contact of persona `security` in the Hunter results at all (eligible or not).

## 7. Pain points (Step 5)

**Signals for the library:**
- `S_ENT` = `enterprise_pressure || enterprise_customers`
- `S_FIRST` = `security_in_progress || (hiring_compliance_role && !already_certified)`
- `S_ENGLED` = see §6
- `S_EXPAND` = `expansion_regions.length > 0 || industry ∈ regulated_industries`
- `S_CERT` = `already_certified`
- `S_COMP` = `competitor_vendor` is a non-Sprinto vendor
- `S_AI` = `ai_product`

**Library** (persona weights: security / engineering / founder):

| Code | Pain | Condition | sec | eng | fdr |
|---|---|---|---|---|---|
| PP1 | Enterprise deals stall on security reviews and SOC 2/ISO proof requests | `S_ENT && !S_CERT` | 2 | 2 | 3 |
| PP2 | Engineers pulled off the roadmap to collect audit evidence | `S_ENGLED` | 1 | 3 | 2 |
| PP3 | First audit with no in-house playbook or GRC team | `S_FIRST` | 3 | 2 | 2 |
| PP4 | Adding frameworks for new markets/regulators (ISO 27001 for EU/UK, HIPAA, GDPR, DPDP) | `S_EXPAND` | 2 | 1 | 2 |
| PP5 | Staying audit-ready between audits (control drift) | `S_CERT` | 3 | 2 | 1 |
| PP6 | Current compliance tool flags issues but leaves the work to the team | `S_COMP` | 2 | 1 | 2 |
| PP7 | Volume of customer security questionnaires | `S_CERT` | 3 | 1 | 1 |
| PP8 | AI governance (ISO 42001) for an AI product | `S_AI` | 2 | 2 | 2 |

A pain is a **candidate** only if its condition is true. `pain_score = persona_weight + 2`. Top 2 by score; ties broken by library order. Gemini then writes a 1–2 sentence rationale for each, citing `evidence_ids`; ids must exist and the rationale must pass the same number/fact check as the email.

## 8. Email rules (Step 6) and validator

**Content rules:**
- R1. Subject ≤ 7 words, no clickbait, no ALL CAPS, no "Re:"/"Fwd:".
- R2. Body 60–120 words (excluding signature and footer).
- R3. Greeting uses the PoC's **first name** exactly as stored.
- R4. **Hook** is the first sentence and references one evidence item (the writer returns `hook_evidence_id`). Hook priority: news ≤ 90 days old → compliance hiring signal → security/trust page statement → customer/logo or expansion signal.
- R5. One pain point (PP rank 1; PP rank 2 may appear as a half-sentence).
- R6. One Sprinto proof point, chosen only from `SPRINTO_CONTEXT.md` → "Allowed claims".
- R7. One soft CTA (a question or a 15-minute call). No calendar links in v1.
- R8. Signature: GL's name, title, Sprinto. Footer: one-line opt-out ("Not relevant? Reply 'no' and I won't follow up.").
- R9. Banned: "I hope this email finds you well", "just checking in", "touching base", "revolutionary", "game-changer", "synergy", "quick question" as subject, exclamation marks in the subject, fake familiarity ("as we discussed"), invented mutual connections, emojis.

**Validator (code, blocks the draft on failure):** V1 first name match · V2 company name present · V3 `hook_evidence_id` exists and belongs to this company · V4 every number in subject/body appears in an evidence row of this company or in Allowed claims (numbers inside framework names like "SOC 2", "ISO 27001", "ISO 42001", and the CTA duration `cta_minutes = 15`, are exempt) · V5 every capitalised proper noun that isn't the company, PoC, Sprinto or a framework name must appear in this company's evidence (prevents invented customer names) · V6 word/subject limits · V7 banned phrases · V8 exactly one `?` or call CTA · V9 opt-out present.

**Critic (Gemini, separate call):** rubric scores 1–5 on *specificity of the hook*, *relevance to the person's role*, *clarity of the ask*, *would a busy {title} reply*. Overall = min of the four. < 4 → one rewrite with the critique → still < 4 → `HOOK_WEAK`.

## 9. Review gate (G)

- Modes: `review` (every draft waits) and `auto` (unflagged + critic ≥ 4 sends immediately). `auto` is refused at startup unless `LIVE_SEND` is false (i.e. `to:` is `DEMO_RECIPIENT`).
- Queue order: Needs GL → Ready → Sent → NO_GO (collapsed).
- Actions: **Approve** · **Edit** (edit subject/body, then approve; reason category: `tone`, `wrong_fact`, `weak_hook`, `wrong_pain`, `too_long`, `other`) · **Reject** (reason category: `bad_fit`, `wrong_person`, `bad_email`, `already_customer`, `other`). Edit and Reject need text too.
- `edit_ratio` = Levenshtein(draft, approved) / max(len) on `subject + "\n" + body`. Stored on the review.
- Bulk approve is allowed for unflagged drafts only.

## 10. Send (Step 7)

- Gmail API `users.messages.send` with OAuth2 refresh token, scope `https://www.googleapis.com/auth/gmail.send`. Fallback (log it in DECISIONS): Nodemailer + Gmail App Password over SMTP.
- `to:` = `DEMO_RECIPIENT`. Code asserts this before every send. The real PoC address is stored in `sends.intended_address` and put in header `X-Intended-Recipient`, plus a footer line "Demo send. Intended for {Full Name}, {Title}, {domain}".
- `multipart/alternative`: plain text + HTML; HTML includes `<img src="{APP_BASE_URL}/api/t/o/{send_id}.gif" width="1" height="1" alt="">`.
- Idempotency: unique (`run_id`, `company_id`) on `sends`; retries reuse the same row. Daily cap `max_sends_per_day = 20`.

## 11. Metrics (M)

Open (pixel hit, first per send = unique open; note Gmail proxies images, so opens are approximate and can fire on delivery) · edit ratio (median per run; share > 0.50) · reject rate by reason · qualification agreement (GO approved / GO reviewed) · time per company · cost per company (tokens × price from config) · evidence coverage. Shown on the Runs screen; read-only.

## 12. Golden tests (acceptance)

Fixtures in `tests/fixtures/`. All companies are fictional on `.example` domains, so tests never hit the network. The scorer, PoC ranker and pain ranker are tested against `tests/golden_expected.json`.

| Case | What it proves | Expected |
|---|---|---|
| **Ledgerly** (`ledgerly.example`) fintech SaaS, Series B, 120 people, hiring a Security & Compliance Engineer, security page "working toward SOC 2 Type II", enterprise logos, AWS | Clean GO | `GO`, score **95**, confidence 1.00, no flags. PoC **Neha Iyer, Head of Security & IT** (tier 1). Pains **PP3, PP1** |
| **TrustVault** (`trustvault.example`) HR-tech SaaS, Series B, 150 people, SOC 2 Type II + ISO 27001, trust centre "Powered by Vanta" | Flags force review | `GO`, score **78**, flags `ALREADY_CERTIFIED`, `COMPETITOR_CUSTOMER`. Tier-1 "Compliance Manager" ineligible (confidence 62) → PoC **Meera Shah, CTO**. Pains **PP5, PP4** |
| **OrbitFleet** (`orbitfleet.example`) logistics SaaS, thin website | Agent loop, then HOLD | iter 0: score 13, conf 0.57 → research; iter 1: 48, 0.86 → research; iter 2: 53, 1.00 → research; iter 3: nothing new → **`HOLD`**, score **53**, loops 3, flag `BORDERLINE_SIZE` |
| **PixelPantry** (`pixelpantry.example`) D2C snack brand with an online store | Hard gate | `NO_GO` `NOT_SAAS` |
| **MegaCorp** (`megacorp.example`) public company, 12,000 employees | Hard gate | `NO_GO` `TOO_LATE_STAGE` |

**Synthetic unit tests to add:** score exactly 60 → GO + `BORDERLINE_SCORE`; exactly 40 with confidence 1.0 and no loops left → HOLD (not NO_GO); headcount 50 and 200 → 15 pts, 49 → 7 + flag, 14 → `TOO_SMALL`, 1001 → `TOO_LATE_STAGE`; `is_saas: null` never gates; C3 cap at 30; Sprinto vendor → `ALREADY_SPRINTO`; founder outranks CTO when headcount < 80 and no tier 1; a tier-1 contact with `invalid` verification is skipped; validator rejects an email with a number not in evidence, a wrong first name, and an invented customer name; quote check drops a value whose quote isn't in the page.
