/**
 * Generic lane, gates layer (D80): the enabled state of the screen's commands in every `manifest.gates` state of
 * `PARITY_SCREEN`, in both apps.
 *
 * Per app, one serial describe on the layer's lane (default canvas-B / code-B); one test per state: reset to rest, the
 * state's steps, settle, then `manifest.readGates` (else `readers.ts` defaultReadGates: every visible
 * `controls.commands` entry, caption -> enabled), recorded as `gates/<state>`. Read-only: no command is pressed by the
 * reader.
 */
import { defaultReadGates } from "../readers";
import { laneFor } from "../screens";
import { settle } from "../waits";
import { collectManifest, KINDS, kindSkip, laneCase, laneDescribe } from "./common";

const manifest = await collectManifest();

for (const kind of KINDS) {
  if (!manifest.gates.length) continue;
  const lane = laneFor(manifest, "gates", kind);
  laneDescribe(manifest, "gates", kind, () => {
    for (const state of manifest.gates) {
      const c = laneCase(kind, `gates: ${state.name} @${lane}`, kindSkip(kind));
      c.declare(...c.args, c.body(async ({ app, record }) => {
        await app.reset();
        await state.steps(app);
        await settle(app);
        record("gates", state.name, manifest.readGates ? await manifest.readGates(app) : await defaultReadGates(app, manifest));
      }));
    }
  });
}
