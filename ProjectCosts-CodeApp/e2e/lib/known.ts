/**
 * Accepted differences between the Canvas run and the code app run (E2E-PARITY-PROMPT.md section 5.5).
 *
 * A spec keeps one `KNOWN` map: key -> reason (a D-number, a DIVERGENCE / SOURCE DEFECT marker or a CA-number).
 * `checkKnown` splits what a run found into
 *   unexpected : a difference with no entry           -> the test fails; report it, never fix it silently
 *   stale      : an entry that no longer occurs        -> the test fails too, so the list cannot go stale
 *   accepted   : a difference that matches its entry  -> reported, not failed
 * The pattern started in milestones.compare.codeapp.spec.ts; this is the shared form for new specs.
 */
export type Known = Readonly<Record<string, string>>;

export interface KnownResult {
  unexpected: Record<string, string>;
  stale: string[];
  accepted: Record<string, { found: string; reason: string }>;
}

export function checkKnown(found: Record<string, string>, known: Known): KnownResult {
  const unexpected: Record<string, string> = {};
  const accepted: KnownResult["accepted"] = {};
  for (const [key, found1] of Object.entries(found)) {
    const reason = known[key];
    if (reason === undefined) unexpected[key] = found1;
    else accepted[key] = { found: found1, reason };
  }
  const stale = Object.keys(known).filter((k) => !(k in found));
  return { unexpected, stale, accepted };
}

/** Records a difference only when the two values differ (deep, by JSON). */
export function noteDiff(found: Record<string, string>, key: string, canvas: unknown, code: unknown): void {
  if (JSON.stringify(canvas) !== JSON.stringify(code)) {
    found[key] = `canvas ${JSON.stringify(canvas)} / code ${JSON.stringify(code)}`;
  }
}
