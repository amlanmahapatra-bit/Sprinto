import { z } from "zod";

/** Normalise a domain: strip protocol/www/path, lowercase, trim. */
export function normalizeDomain(input: string): string {
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/^www\./, "");
  d = d.split("/")[0].split("?")[0].split("#")[0];
  d = d.replace(/:\d+$/, "");
  return d.trim();
}

const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

export const domainSchema = z
  .string()
  .transform(normalizeDomain)
  .refine((d) => DOMAIN_RE.test(d), { message: "not a valid domain (expected like example.com)" });

export interface DomainParse {
  valid: string[];
  errors: { input: string; error: string }[];
  duplicatesRemoved: number;
}

/** Parse pasted lines or CSV `domain` column into normalised, deduped, validated domains. */
export function parseDomains(lines: string[]): DomainParse {
  const valid: string[] = [];
  const errors: { input: string; error: string }[] = [];
  const seen = new Set<string>();
  let duplicatesRemoved = 0;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.toLowerCase() === "domain") continue;
    const first = line.split(",")[0];
    const parsed = domainSchema.safeParse(first);
    if (!parsed.success) {
      errors.push({ input: first, error: parsed.error.issues[0]?.message ?? "invalid" });
      continue;
    }
    if (seen.has(parsed.data)) {
      duplicatesRemoved += 1;
      continue;
    }
    seen.add(parsed.data);
    valid.push(parsed.data);
  }
  return { valid, errors, duplicatesRemoved };
}
