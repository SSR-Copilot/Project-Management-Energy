/**
 * Generic lane, validation layer (D80): every input of every `manifest.validation` group of `PARITY_SCREEN`, typed into
 * BOTH apps (nothing is trimmed, plan "Goal").
 *
 * Per app, one serial describe on the layer's lane (default canvas-B / code-B); one test per group. A group: reset to
 * rest, its baseline ONCE (e.g. open the Edit panel with the right toggles), then for each input in order: click the
 * field (`group.field` on the Canvas, `group.codeField ?? group.field` in the code app), fill, Tab, wait, read
 * (`manifest.readValidation`, else `readers.ts` defaultReadValidation: the visible verbatim `messages` and Save enabled).
 *
 * The wait after each input is `validationWaitFor(manifest, kind)` (`manifest.validationWait`):
 *   outcome the Canvas default: re-read the outcome until three reads agree (`stableOutcome`); a late message still counts
 *           (coverage map risk R4) without whole-page polling
 *   stable  `lib/appFrame.ts` waitForStable, { pollMs: 400, timeoutMs: 10 000 }: the old suite's wait (about 15 s per
 *           Canvas input in the first live run); kept for a screen that needs it
 *   settle  `waits.ts` settle: the code app default (its idle hook knows when the app is done)
 *
 * The group's outcomes are recorded as `validation/<group>` after EVERY input, so a group that fails part-way still
 * keeps what it read. Read-only: Save is never pressed; the next group's reset closes the panel.
 */
import type { AppHandle, ValidationOutcome } from "../contract";
import { waitForStable } from "../../lib/appFrame";
import { defaultReadValidation, fieldInput } from "../readers";
import { laneFor, validationWaitFor } from "../screens";
import { settle } from "../waits";
import { collectManifest, KINDS, kindSkip, laneCase, laneDescribe } from "./common";

const manifest = await collectManifest();

/** The old validation spec's wait after a typed input (`landlease.validation.parity.spec.ts` type()). */
const STABLE = { pollMs: 400, timeoutMs: 10_000 } as const;

/**
 * "outcome": after a short first wait, read the outcome (messages + Save) every `pollMs` until `same` reads in a row agree,
 * at most `timeoutMs`; the agreed read is the one recorded. It watches exactly what is recorded, so a late message still
 * counts (risk R4), without "stable"'s whole-page polling (about 15 s per Canvas input in the first live run, 3 Nov 2026).
 */
const OUTCOME = { firstMs: 300, pollMs: 250, same: 3, timeoutMs: 10_000 } as const;

async function stableOutcome(read: () => Promise<ValidationOutcome>): Promise<ValidationOutcome> {
  await new Promise((r) => setTimeout(r, OUTCOME.firstMs));
  const end = Date.now() + OUTCOME.timeoutMs;
  let last = await read();
  let streak = 1;
  while (streak < OUTCOME.same && Date.now() < end) {
    await new Promise((r) => setTimeout(r, OUTCOME.pollMs));
    const next = await read();
    streak = JSON.stringify(next) === JSON.stringify(last) ? streak + 1 : 1;
    last = next;
  }
  return last;
}

for (const kind of KINDS) {
  if (!manifest.validation.length) continue;
  const lane = laneFor(manifest, "validation", kind);
  const wait = validationWaitFor(manifest, kind);
  const afterInput = (app: AppHandle): Promise<void> =>
    (wait === "stable" ? waitForStable(app.page, app.frame, STABLE) : wait === "settle" ? settle(app) : Promise.resolve());
  laneDescribe(manifest, "validation", kind, () => {
    for (const group of manifest.validation) {
      const c = laneCase(kind, `validation: ${group.key} @${lane}`, kindSkip(kind));
      c.declare(...c.args, c.body(async ({ app, record }) => {
        const read = manifest.readValidation ?? ((a: typeof app) => defaultReadValidation(a, manifest));
        const field = { canvas: group.field, code: group.codeField ?? group.field };
        await app.reset();
        await group.baseline(app);
        await settle(app);
        const outcomes: Record<string, ValidationOutcome> = {};
        record("validation", group.key, outcomes);
        for (const input of group.inputs) {
          const box = fieldInput(app, field);
          // A canvas control sits under an invisible button, so the canvas click is forced (as `lib/cost.ts` clickText).
          await box.click({ force: kind === "canvas" });
          await box.fill(input);
          await box.press("Tab");
          await afterInput(app);
          outcomes[input] = wait === "outcome" ? await stableOutcome(() => read(app)) : await read(app);
          record("validation", group.key, outcomes);
        }
      }));
    }
  });
}
