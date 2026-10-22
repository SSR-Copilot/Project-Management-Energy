/**
 * Power Fx text helpers shared across screens.
 *
 * `powerFxTrim` moved here from `features/settings/contracts/powerFxTrim.ts` (reusable-components
 * Wave A) so the shared `TextField` counter can use it; Contracts deletes its own copy in Wave B.
 */

/**
 * Power Fx `Trim(text)`: removes every leading and trailing space AND collapses each run of
 * spaces inside the text to a single space (the Excel `TRIM` rule). Only the space character
 * (U+0020) is affected — tabs, newlines and non-breaking spaces are kept, unlike JS `trim()`.
 * Used by the comment counter (ACS:3011 `Len(Trim(txt.Value))`).
 */
export function powerFxTrim(text: string): string {
  return text.replace(/^ +| +$/g, "").replace(/ {2,}/g, " ");
}
