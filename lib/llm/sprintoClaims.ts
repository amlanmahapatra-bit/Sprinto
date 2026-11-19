// The ONLY Sprinto claims an email may use (SPRINTO_CONTEXT.md). Versioned with icp_config.

export interface SprintoClaim {
  id: string;
  text: string;
  source: string;
  numbers: number[];
}

export const SPRINTO_CLAIMS: SprintoClaim[] = [
  { id: "SC1", text: "Trusted by 4,000+ companies, from Series A to enterprise", source: "sprinto.com/home", numbers: [4000] },
  { id: "SC2", text: "300+ integrations across cloud, identity, HR and SaaS tools", source: "sprinto.com/home", numbers: [300] },
  { id: "SC3", text: "Automates up to 80% of manual compliance work", source: "sprinto.com/lp/solutions/startups", numbers: [80] },
  { id: "SC4", text: "SOC 2 and ISO 27001 audit-ready in as little as 3 weeks", source: "sprinto.com/lp/solutions/startups", numbers: [3] },
  { id: "SC5", text: "Supports SOC 2, ISO 27001, GDPR, HIPAA, PCI-DSS, ISO 42001, DPDP and more", source: "sprinto.com/home", numbers: [] },
  { id: "SC6", text: "A Trust Center you can publish in minutes, and AI answers to security questionnaires in seconds", source: "sprinto.com/home", numbers: [] },
  { id: "SC7", text: "Continuous monitoring keeps you audit-ready between audits, not just at audit time", source: "sprinto.com/home", numbers: [] },
  { id: "SC8", text: "One control set mapped across frameworks, so evidence is reused instead of collected twice", source: "sprinto.com/home", numbers: [] },
];

export const DEFAULT_CLAIM_BY_PAIN: Record<string, string[]> = {
  PP1: ["SC4", "SC6"],
  PP2: ["SC3"],
  PP3: ["SC4"],
  PP4: ["SC8", "SC5"],
  PP5: ["SC7"],
  PP6: ["SC3"],
  PP7: ["SC6"],
  PP8: ["SC5"],
};

export function claimById(id: string): SprintoClaim | undefined {
  return SPRINTO_CLAIMS.find((c) => c.id === id);
}

export function allAllowedClaimNumbers(): number[] {
  return SPRINTO_CLAIMS.flatMap((c) => c.numbers);
}
