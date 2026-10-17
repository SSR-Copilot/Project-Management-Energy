/**
 * H7 — "has the form changed since it was seeded?" for every settings panel.
 *
 * A `JSON.stringify` comparison of the (optionally normalised) values, which is what Costs
 * (`rules.ts:370-372`), Project Gates (`ApprovalsPanel.tsx:29` `formChanged`), Contracts
 * (`rules.ts:634-648`, with its normaliser), Check List Settings (`rules.ts:299-305`) and
 * CAPEX Accounts (field by field) each do.
 *
 * Key order matters to `JSON.stringify`: both values must come from the same constructor
 * (the same seed function), as they do on every screen. Pass `normalize` to compare a canonical
 * form instead (e.g. trimmed text, sorted ids).
 */
export function isDirty<T>(current: T, pristine: T, normalize?: (t: T) => unknown): boolean {
  const n = normalize ?? ((t: T) => t);
  return JSON.stringify(n(current)) !== JSON.stringify(n(pristine));
}
