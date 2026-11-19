import { z } from "zod";
import { z as _z } from "zod";
const arr = <T extends _z.ZodTypeAny>(s: T) => _z.preprocess((v) => v ?? [], _z.array(s)) as unknown as _z.ZodArray<T>;
import type { Signals } from "@/lib/engine/types";

const leaf = <T extends z.ZodTypeAny>(value: T) =>
  z.object({ value, quote: z.string().nullable(), source_url: z.string().nullable() });

export const IndustryEnum = z.enum([
  "fintech", "healthtech", "hrtech", "insurtech", "legaltech", "edtech", "data_ai_infra",
  "devtools", "security", "martech", "logistics", "ecommerce_enablement", "other_b2b", "b2c",
]);
export const FundingStageEnum = z.enum([
  "pre_seed", "seed", "series_a", "series_b", "series_c", "series_d_plus", "public", "acquired", "bootstrapped",
]);
export const CertEnum = z.enum([
  "soc2_type1", "soc2_type2", "iso27001", "iso27701", "iso42001", "gdpr", "hipaa", "pci_dss", "dpdp",
]);
export const VendorEnum = z.enum([
  "vanta", "drata", "secureframe", "scrut", "thoropass", "delve", "sprinto", "safebase", "other",
]);
export const CloudEnum = z.enum(["aws", "gcp", "azure"]);

export const CompanyFactsSchema = z.object({
  company_name: z.string(),
  domain: z.string(),
  one_liner: z.string().nullable(),
  is_saas: leaf(z.boolean().nullable()),
  industry: leaf(IndustryEnum.nullable()),
  funding: z.object({
    stage: FundingStageEnum.nullable(),
    amount_usd: z.number().nullable(),
    announced_date: z.string().nullable(),
    quote: z.string().nullable(),
    source_url: z.string().nullable(),
  }),
  employees: z.object({
    min: z.number().nullable(),
    max: z.number().nullable(),
    quote: z.string().nullable(),
    source_url: z.string().nullable(),
  }),
  hiring_compliance_role: z.object({
    value: z.boolean().nullable(),
    role_titles: arr(z.string()),
    quote: z.string().nullable(),
    source_url: z.string().nullable(),
  }),
  security_page: z.object({
    exists: z.boolean().nullable(),
    url: z.string().nullable(),
    certifications_claimed: arr(CertEnum),
    in_progress: z.boolean().nullable(),
    trust_center_vendor: VendorEnum.nullable(),
    quote: z.string().nullable(),
  }),
  enterprise_pressure: z.object({
    value: z.boolean().nullable(),
    signals: arr(z.string()),
    quote: z.string().nullable(),
    source_url: z.string().nullable(),
  }),
  customers: z.object({
    count_claimed: z.number().nullable(),
    enterprise_logos: arr(z.string()),
    quote: z.string().nullable(),
    source_url: z.string().nullable(),
  }),
  cloud: z.object({
    providers: arr(CloudEnum),
    method: z.enum(["dns", "job_post", "page"]).nullable(),
    quote: z.string().nullable(),
    source_url: z.string().nullable(),
  }),
  ai_product: leaf(z.boolean().nullable()),
  expansion_regions: z.object({
    value: arr(z.string()),
    quote: z.string().nullable(),
    source_url: z.string().nullable(),
  }),
  news: arr(
    z.object({ title: z.string(), url: z.string(), date: z.string().nullable(), summary: z.string() }),
  ),
});

export type CompanyFacts = z.infer<typeof CompanyFactsSchema>;

const CERTS_IMPLY_CERTIFIED: string[] = ["soc2_type2", "iso27001"];

/** Facts → flat Signals (ICP_SPEC §2). already_certified = SOC2 Type II or ISO 27001 claimed. */
export function signalsFromFacts(f: CompanyFacts): Signals {
  const certs = f.security_page.certifications_claimed ?? [];
  const alreadyCertified = certs.some((c) => CERTS_IMPLY_CERTIFIED.includes(c));
  const vendor = f.security_page.trust_center_vendor;
  return {
    is_saas: f.is_saas.value,
    funding_stage: f.funding.stage,
    funding_date: f.funding.announced_date,
    employees_min: f.employees.min,
    employees_max: f.employees.max,
    hiring_compliance_role: f.hiring_compliance_role.value,
    security_in_progress: f.security_page.in_progress,
    enterprise_pressure: f.enterprise_pressure.value,
    already_certified: certs.length ? alreadyCertified : null,
    competitor_vendor: vendor && vendor !== "safebase" && vendor !== "other" ? vendor : null,
    enterprise_customers:
      f.customers.enterprise_logos.length > 0 ? true : null,
    customer_count: f.customers.count_claimed,
    industry: f.industry.value,
    cloud_providers: f.cloud.providers.length ? f.cloud.providers : null,
    ai_product: f.ai_product.value,
    expansion_regions: f.expansion_regions.value.length ? f.expansion_regions.value : null,
  };
}
