/**
 * Generic lane, UX layer (D80): every `manifest.ux` check of `PARITY_SCREEN` (focus order, hover texts, accessible names,
 * ...), in both apps.
 *
 * A check runs on `uxLaneFor(manifest, check, kind)`: its own `lane` for the app that lane drives (e.g. `canvas-C` for a
 * Canvas hover check), else the layer's lane (default canvas-C / code-A). So one app may run a check in a different lane
 * than the other. Per app and lane, one serial describe; each check: reset to rest, run, record its JSON value as
 * `ux/<check>` (undefined is recorded as null).
 */
import type { Lane, UxCheck } from "../contract";
import { uxLaneFor } from "../screens";
import { collectManifest, KINDS, kindSkip, laneCase, laneDescribe } from "./common";

const manifest = await collectManifest();

for (const kind of KINDS) {
  const byLane = new Map<Lane, UxCheck[]>();
  for (const check of manifest.ux) {
    const lane = uxLaneFor(manifest, check, kind);
    byLane.set(lane, [...(byLane.get(lane) ?? []), check]);
  }
  for (const [lane, checks] of byLane) {
    laneDescribe(manifest, `ux (${lane})`, kind, () => {
      for (const check of checks) {
        const c = laneCase(kind, `ux: ${check.name} @${lane}`, kindSkip(kind));
        c.declare(...c.args, c.body(async ({ app, record }) => {
          await app.reset();
          const value = await check.run(app);
          record("ux", check.name, value === undefined ? null : value);
        }));
      }
    });
  }
}
