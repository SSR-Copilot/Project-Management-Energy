/**
 * Generic lane, visual layer (D80): every `manifest.visual` state of `PARITY_SCREEN`, in both apps.
 *
 * Per app, one serial describe on the layer's lane (`laneFor(manifest, "visual", kind)`, default canvas-A / code-A). Each
 * state: reset to rest, the state's steps, settle (and, with the state's `until`, until that control shows), then the visible texts are recorded as `visual/<state>` (`readers.ts`
 * readVisual, inside `manifest.textWindow`, else the shell's content window). A state whose `needsEnv` variable is not set is skipped with that reason (the report lists it as not
 * captured). In the code app each state's unlabelled controls are recorded too (`platform/unlabelled-<state>`,
 * CONVENTIONS rule 16), and a last test fails when any state had one, so a control that only shows in a panel or an open
 * card is checked as well (E2E-LANDLEASE-003 checked one open card).
 */
import { expect } from "@playwright/test";
import { locate, readVisual, unlabelledControls } from "../readers";
import { laneFor } from "../screens";
import { readFacts } from "../store";
import { settle } from "../waits";
import { collectManifest, KINDS, kindSkip, laneCase, laneDescribe } from "./common";

const manifest = await collectManifest();
const UNLABELLED = "unlabelled-";
/** How long a state's `until` control gets to show (a Canvas OnSelect can load data for a while before its panel opens). */
const UNTIL_TIMEOUT_MS = 60_000;

for (const kind of KINDS) {
  if (!manifest.visual.length) continue;
  const lane = laneFor(manifest, "visual", kind);
  laneDescribe(manifest, "visual", kind, () => {
    for (const state of manifest.visual) {
      const missingEnv = state.needsEnv && !process.env[state.needsEnv]?.trim() ? `${state.needsEnv} is not set` : null;
      const c = laneCase(kind, `visual: ${state.name} @${lane}`, kindSkip(kind) ?? missingEnv);
      c.declare(...c.args, c.body(async ({ app, record }) => {
        await app.reset();
        await state.steps(app);
        await settle(app, state.until ? { until: locate(app, state.until), timeoutMs: UNTIL_TIMEOUT_MS } : {});
        record("visual", state.name, await readVisual(app, manifest.textWindow));
        if (kind === "code") record("platform", `${UNLABELLED}${state.name}`, await unlabelledControls(app.frame));
      }));
    }
    if (kind === "code") {
      const c = laneCase(kind, `visual: every visible control has an aria-label and a data-testid in every state @${lane}`, kindSkip(kind));
      c.declare(...c.args, c.body(async ({ env }) => {
        // Read back from the recorded facts, not from memory: the re-run pass may run this test in a fresh worker.
        const found: Record<string, unknown> = {};
        for (const f of readFacts(env.runDir, "code", "platform")) {
          if (f.key.startsWith(UNLABELLED) && Array.isArray(f.data) && f.data.length) found[f.key.slice(UNLABELLED.length)] = f.data;
        }
        expect(found, "controls without aria-label (or aria-labelledby) or data-testid, per visual state (CONVENTIONS rule 16)").toEqual({});
      }));
    }
  });
}
