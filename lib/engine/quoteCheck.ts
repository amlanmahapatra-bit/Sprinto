/** E1: a value is kept only if its quote appears in the page markdown (case- & whitespace-insensitive). */
export function normalizeForQuote(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’“”]/g, (m) => (m === "‘" || m === "’" ? "'" : '"'))
    .replace(/\s+/g, " ")
    .trim();
}

export function quoteFound(quote: string | null | undefined, pageMarkdown: string): boolean {
  if (!quote || !quote.trim()) return false;
  return normalizeForQuote(pageMarkdown).includes(normalizeForQuote(quote));
}
