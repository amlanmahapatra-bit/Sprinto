# Evidence Map: Sprinto Cold Outreach (transcribed from the whiteboard, 3 Nov)

This is the team's whiteboard, written up so the build can use it. Where the handwriting was ambiguous, the interpretation is marked *(interp.)*.

## 1. The flow on the board

```
Define ICP --(Google News)--> Shortlist 10–20 companies --> Deep Research --> Qualify (GO / NO-GO)
                                                              |                    |
                                              free / paid / scrape                 v
                                       (scrape the website -> sniff ->      Hunter.io -> PoC email ID
                                        info gather -> loop back)                  |
                                                                                   v
                                               Send it  <--  Review Gate (person)  <--  Draft Email
```

## 2. ICP criteria and where the evidence comes from

| # | ICP criterion (board) | Threshold on board | Evidence source (board) | Board mark |
|---|---|---|---|---|
| C1 | SaaS (**must be**) | yes/no | News / Homepage | ✓ |
| C2 | Funding stage | **Series A–C** (boxed) | Google News | ✓ |
| C3 | Preparing for audit (written next to it: "Certifications") | signal present | Careers page (audit / compliance roles), Security page | ✗ |
| C4 | Employee count | **50–200** | About page | ✗ |
| C5 | Number & size of clients | **> 50 clients, clients > 200 employees** | Homepage (logos, case studies) | ✗ |
| C6 | Industry | regulated / data-heavy *(interp.: "He" = Healthcare, plus fintech etc.)* | Google News / Homepage | ✓ |
| C7 | Cloud stack | **AWS / GCP / Azure** | Google News / Homepage / Careers page | ✗ |

**Left-margin tally** *(interp.)*: "7 → 3 (free) · 4 → Scrape · 2 → Remain". Of the 7 criteria, 3 can be answered from free search/news (SaaS, funding, industry: the ✓ rows), 4 need scraping the company's own pages (audit prep, headcount, clients, cloud: the ✗ rows), and about 2 typically remain unresolved after one pass (in practice: audit-prep intent and client size). Those 2 are why Step 3 has an **agent loop** and why the review gate exists.

## 3. Deep research loop (board, middle)

Three channels: **free** (Google News RSS, Gemini Google-Search grounding), **paid** (optional: Firecrawl, Hunter company enrichment), **scrape** (the company's website). The circular arrows "scrape the website → sniff → info gather → back" mean: fetch pages, look for the missing signals, gather what was found, and go round again only for what is still missing.

## 4. Outreach (board, right of middle)

- **Hunter.io** finds the PoC's email ID (Option A in the case).
- **Draft email** → **Review gate** (a person icon above it) → **Send it**.

## 5. Success metrics (board, far right)

1. **Email tracking: open rate**
2. **GL changes the email > 50%** → treat as a failed draft. The edit ratio between the AI draft and what the Growth Lead (GL) actually approves is the main quality metric. Target: median edit ratio < 0.5.

## 6. Where each board item lands in the build

| Board item | Component map step | Spec section |
|---|---|---|
| Define ICP | Config (`icp_config` v1) | ICP_SPEC §1–3 |
| Google News → Shortlist 10–20 | Step 0 (trigger) | BUILD_PROMPT "Discover" |
| Scrape / sniff / info gather | Steps 1–2 | ICP_SPEC §4 |
| Deep research loop, free/paid/scrape | Step 3 agent loop | ICP_SPEC §5 |
| Qualify GO / NO-GO | Step 3 scorer | ICP_SPEC §3 |
| Hunter.io → PoC | Step 4 | ICP_SPEC §6 |
| Draft email | Steps 5–6 | ICP_SPEC §7–8 |
| Review gate | Gate G | ICP_SPEC §9 |
| Send it | Step 7 | ICP_SPEC §10 |
| Open rate, GL edit > 50% | Measure M | ICP_SPEC §11 |
