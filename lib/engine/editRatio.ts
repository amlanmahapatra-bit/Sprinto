import leven from "fast-levenshtein";

/** edit_ratio = Levenshtein(draft, approved) / max(len) on `subject + "\n" + body`. */
export function editRatio(
  draft: { subject: string; body: string },
  approved: { subject: string; body: string },
): number {
  const a = `${draft.subject}\n${draft.body}`;
  const b = `${approved.subject}\n${approved.body}`;
  const max = Math.max(a.length, b.length);
  if (max === 0) return 0;
  return leven.get(a, b) / max;
}
