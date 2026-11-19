# Sprinto Context (the only source of Sprinto claims in emails)

Versioned with `icp_config`. The email writer may use **only** the "Allowed claims" below, word for word or lightly paraphrased without changing numbers. Before the first live run, re-check each claim on sprinto.com (they're vendor marketing figures, collected 3 Nov 2026) and log the check in `DECISIONS.md`.

## What Sprinto is (for the model's understanding, not for quoting)
Sprinto is a compliance automation platform. It connects to a company's cloud, identity, HR and code tools, monitors controls continuously, collects audit evidence automatically, and guides teams through frameworks such as SOC 2, ISO 27001, GDPR, HIPAA, PCI-DSS and ISO 42001. It also offers a Trust Center and an AI security-questionnaire tool. Competitors it positions against: Vanta, Drata, Secureframe, Scrut, Delve.

## Allowed claims (id → text, source)
| id | Claim | Source page |
|---|---|---|
| SC1 | Trusted by 4,000+ companies, from Series A to enterprise | sprinto.com/home |
| SC2 | 300+ integrations across cloud, identity, HR and SaaS tools | sprinto.com/home |
| SC3 | Automates up to 80% of manual compliance work | sprinto.com/lp/solutions/startups |
| SC4 | SOC 2 and ISO 27001 audit-ready in as little as 3 weeks | sprinto.com/lp/solutions/startups |
| SC5 | Supports SOC 2, ISO 27001, GDPR, HIPAA, PCI-DSS, ISO 42001, DPDP and more | sprinto.com/home |
| SC6 | A Trust Center you can publish in minutes, and AI answers to security questionnaires in seconds | sprinto.com/home |
| SC7 | Continuous monitoring keeps you audit-ready between audits, not just at audit time | sprinto.com/home |
| SC8 | One control set mapped across frameworks, so evidence is reused instead of collected twice | sprinto.com/home |

Note: the startups page also says "40 days to get SOC 2 audit-ready". It conflicts with SC4, so it's not an allowed claim.

## Best claim per pain (writer's default; it may pick another allowed claim if it fits better)
| Pain | Default claim |
|---|---|
| PP1 Deals stall on security reviews | SC4 or SC6 |
| PP2 Engineers pulled into evidence collection | SC3 |
| PP3 First audit, no playbook | SC4 |
| PP4 More frameworks for new markets | SC8 + SC5 |
| PP5 Audit-ready between audits | SC7 |
| PP6 Current tool leaves the work to the team | SC3 |
| PP7 Questionnaire volume | SC6 |
| PP8 AI governance | SC5 (ISO 42001) |

## Sender
Signature fields come from env: `SENDER_NAME`, `SENDER_TITLE` (default "Growth Lead"), company "Sprinto".

## Examples for the writer prompt

**Good (≈95 words):**
> Subject: SOC 2 before the US push?
>
> Hi Neha, saw Ledgerly is hiring a Security & Compliance Engineer to own SOC 2 Type II and ISO 27001, right after the Series B. That's usually the moment questionnaires from US enterprise buyers start piling up on one person's desk.
>
> Teams like yours use Sprinto to get SOC 2 and ISO 27001 audit-ready in as little as 3 weeks, with evidence collected automatically from AWS instead of by hand.
>
> Would it help to see how that would map to the Q1 audit you've planned? Happy to walk through it in 15 minutes.
>
> (signature, opt-out line)

Why it's good: the hook is a verifiable fact from their careers page; one pain; one allowed claim; one ask.

**Bad:**
> Subject: Revolutionize your compliance!!!
>
> Hi there, I hope this email finds you well. Sprinto is the #1 compliance platform trusted by Stripe and Google…

Why it's bad: no name, banned phrases, invented customers, no hook, exclamation marks.
