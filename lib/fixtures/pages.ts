// Fixture page markdown, embedded so "Load fixtures" works in both CLI and serverless.
// Mirrors tests/fixtures/pages/*. The source_url is parsed from the leading HTML comment.

export interface FixturePage {
  kind: string;
  url: string;
  content_md: string;
}

export const FIXTURE_PAGES: Record<string, FixturePage[]> = {
  "ledgerly.example": [
    {
      kind: "home",
      url: "https://ledgerly.example/",
      content_md:
        "# Ledgerly: close the books in days, not weeks\n\nLedgerly is the finance automation platform for mid-market companies. Reconcile bank feeds, automate accruals and close faster.\n\nStart your 14-day free trial. Plans: Growth, Scale and Enterprise (SSO, audit logs, dedicated CSM).\n\nTrusted by finance teams at Northwind Logistics, Contoso Retail and Fabrikam Health.\n\nLedgerly runs on AWS in the US and India regions.",
    },
    {
      kind: "careers",
      url: "https://ledgerly.example/careers",
      content_md:
        "# Careers at Ledgerly\n\n## Open roles\n- Senior Backend Engineer (Go, AWS)\n- Security & Compliance Engineer: own our SOC 2 Type II and ISO 27001 programmes, work with auditors and answer customer security questionnaires.\n- Account Executive, Enterprise (US)",
    },
    {
      kind: "security",
      url: "https://ledgerly.example/security",
      content_md:
        "# Security at Ledgerly\n\nYour financial data is encrypted in transit and at rest. We are currently working toward SOC 2 Type II and expect our audit report in Q1 2027.\n\nNeed our security questionnaire? Contact security@ledgerly.example.",
    },
    {
      kind: "about",
      url: "https://ledgerly.example/about",
      content_md:
        "# About Ledgerly\n\nWe're a team of 120 people across Bengaluru and New York.\n\nIn August 2026 we raised a $22M Series B led by Example Ventures to expand into the US mid-market.",
    },
  ],
  "trustvault.example": [
    {
      kind: "home",
      url: "https://trustvault.example/",
      content_md:
        "# TrustVault: payroll and HR records for 80 enterprise customers\n\nThe HR system of record for companies with 500+ employees. 150 people building it, on Google Cloud.\n\nSeries B, backed by Example Capital (November 2025).",
    },
    {
      kind: "trust",
      url: "https://trust.trustvault.example/",
      content_md:
        "# TrustVault Trust Center\n\nTrustVault maintains SOC 2 Type II and ISO 27001 certifications.\n\nRequest access to our reports below.\n\nPowered by Vanta",
    },
  ],
  "orbitfleet.example": [
    {
      kind: "home",
      url: "https://orbitfleet.example/",
      content_md:
        "# OrbitFleet: fleet visibility for regional logistics\n\nTrack every truck, every route, in one dashboard. Book a demo.\n\nTrusted by 40+ logistics companies.",
    },
    {
      kind: "careers",
      url: "https://orbitfleet.example/careers",
      content_md: "# Join OrbitFleet\n\n- Frontend Engineer (React)\n- Customer Success Manager",
    },
  ],
  "pixelpantry.example": [
    {
      kind: "home",
      url: "https://pixelpantry.example/",
      content_md:
        "# PixelPantry: artisanal snack boxes delivered monthly\n\nShop our D2C snack subscription. Add to cart and check out in minutes. Free shipping over $40.",
    },
  ],
  "megacorp.example": [
    {
      kind: "home",
      url: "https://megacorp.example/",
      content_md:
        "# MegaCorp Cloud Platform\n\nEnterprise software for the Fortune 500. 12,000 employees worldwide. NYSE: MEGA. SOC 2 Type II and ISO 27001 certified. Runs on Azure.",
    },
  ],
};

/** News pages returned by the mock research agent, keyed by domain+iteration. */
export const FIXTURE_NEWS: Record<string, Record<number, FixturePage>> = {
  "orbitfleet.example": {
    1: {
      kind: "news",
      url: "https://news.example/orbitfleet-series-a",
      content_md:
        "# OrbitFleet raises $9M Series A to expand into the US\n\nJune 12, 2026. OrbitFleet (orbitfleet.example), the fleet-visibility SaaS, has raised a $9M Series A. The team of 45 recently signed its first enterprise customer and plans to open a US office.",
    },
  },
};
