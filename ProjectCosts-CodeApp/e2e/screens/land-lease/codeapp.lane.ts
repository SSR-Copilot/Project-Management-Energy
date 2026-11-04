/**
 * Land Lease screen lane: E2E-LANDLEASE-004 as the old spec asserted it (code app only, read-only).
 *
 * The generic platform lane RECORDS test ids that look built from a display value (`readers.ts` isDisplayValueTestId, a
 * broader rule) and never fails on them. The old suite FAILED on them, with its own narrower rule: an id of the form
 * `<word>card-` / `<word>row-` whose suffix has a space or a letter outside hex (CONVENTIONS rule 16: `<base>-<row id>`,
 * never a name). This lane keeps that assertion with one accepted exception: the Land Lease cards stay
 * `leasecard-<card name>` (CA-29, left as they are by the user's decision, 3 Nov 2026), so only a NEW id of this kind
 * fails. The full list is still recorded as a fact. Tagged `@smoke` like the rest of 001–006, on the code app's
 * platform lane (`laneFor(manifest, "platform", "code")`).
 */
import { expect } from "../../harness/session";
import { kindSkip, laneCase, laneDescribe } from "../../harness/lanes/common";
import { laneFor } from "../../harness/screens";
import { manifest } from "./manifest";

/** The accepted CA-29 family: the Land Lease sub-account card headers (`01-BUGS-FOUND.md` CA-29). */
const ACCEPTED_CA29 = /^leasecard-/;

/** The code app's platform lane (default code-A), where 001–006 run: 004 belongs with them. */
const LANE = laneFor(manifest, "platform", "code");

/** The old spec's rule, verbatim: a repeated control is `<base>-<row id>`; a suffix with spaces or non-hex letters is a display value. */
function fromNamesOld(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id) => /^[a-z]+(card|row)-/i.test(id) && /\s|[g-z]/i.test(id.split("-").slice(1).join("-"))))];
}

laneDescribe(manifest, "E2E-LANDLEASE-004", "code", () => {
  const c = laneCase("code", `platform: E2E-LANDLEASE-004 no control id is built from a display value @smoke @${LANE}`, kindSkip("code"));
  c.declare(...c.args, c.body(async ({ app, record }) => {
    await app.reset();
    const ids = await app.frame.locator("[data-testid]").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid") ?? ""));
    const found = fromNamesOld(ids);
    record("platform", "display-value-test-ids-old-rule", found);
    // CA-29, accepted (user, 3 Nov 2026, D79 §5): the sub-account cards stay `leasecard-<card name>`, because tests and the
    // parity suite key on them (CONVENTIONS rule 16: never change an existing value). Only a NEW id of this kind fails.
    const unaccepted = found.filter((id) => !ACCEPTED_CA29.test(id));
    expect(unaccepted, "test ids that carry a display value (beyond the accepted CA-29 card ids)").toEqual([]);
  }));
});
