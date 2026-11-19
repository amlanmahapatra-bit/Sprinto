import { normalizeForQuote } from "@/lib/engine/quoteCheck";

/**
 * E3: a news item counts only if its text contains the company's domain, or the
 * company name AND one of (product name, founder name, HQ city). Otherwise discard.
 */
export function entityMatches(
  text: string,
  opts: { domain: string; companyName: string; corroborators?: string[] },
): boolean {
  const t = normalizeForQuote(text);
  const domainCore = opts.domain.replace(/^www\./, "");
  if (t.includes(normalizeForQuote(domainCore))) return true;
  const hasName = t.includes(normalizeForQuote(opts.companyName));
  if (!hasName) return false;
  const corrobs = (opts.corroborators ?? []).filter(Boolean);
  if (corrobs.length === 0) return false;
  return corrobs.some((c) => t.includes(normalizeForQuote(c)));
}
