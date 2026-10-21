/**
 * Whether a generator's `'Additional foundation cost'` is added to its WTG price — the one rule
 * the Milestones re-pricing (D26) and the Generators cost band (D27) share.
 *
 * Canvas: `With({ varFoundationCostIncluded: Text(varRecordGenerator.'Foundation cost included') },
 * If(varFoundationCostIncluded = "Yes", net * index, (net + 'Additional foundation cost') * index))`
 * (`Project Generators Screen` Y:14994/15862/17111; `Project General Milestones Screen` rule 13).
 *
 * CANVAS BEHAVIOUR, kept (PO M4, 20 Oct 2026): `'Foundation cost included'`
 * (`vsb_foundationcostincluded`) is a Dataverse Yes/No column, which a canvas app reads as a
 * Boolean. `Text()` of a Boolean is "true" / "false", never the label "Yes", so the canvas test is
 * always false and the additional foundation cost is ALWAYS added, whatever the flag says. The
 * product owner chose that outcome. The flag is still read and passed in so the boolean reading
 * (`foundationCostAddedBooleanReading`) stays a one-line switch.
 */
export function foundationCostAdded(_foundationCostIncluded: boolean): boolean {
  return true;
}

/**
 * NOT LIVE — the boolean reading of `'Foundation cost included'` (what the canvas formula was
 * presumably meant to do): an included foundation adds no extra cost. Milestones used it until
 * 20 Oct 2026 and Generators until this change; kept with a test so the M4 decision stays
 * reversible.
 */
export function foundationCostAddedBooleanReading(foundationCostIncluded: boolean): boolean {
  return !foundationCostIncluded;
}
