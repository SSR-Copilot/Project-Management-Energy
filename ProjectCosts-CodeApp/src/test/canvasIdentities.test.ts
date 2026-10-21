/**
 * UT-CANVASID — every canvas-named `data-testid` is a real control on that feature's own canvas
 * screen, of a compatible type, and every `aria-label` equals the canvas control's literal
 * `AccessibleLabel` where it sets one (`scripts/check-canvas-identities.mjs`,
 * `ProjectDocs/instructions/CONVENTIONS.md` rule 16, `ProjectDocs/migration-plans/09-tosca-automation-conventions.md`).
 *
 * Source of truth: `ProjectDocs/_extracted/msapp/<app>/Src/*.pa.yaml` (solution 1.21.709).
 * A control that exists only in a newer solution is exempted with
 * `// canvas-identity-ignore: <reason>`. Skipped when the canvas source is not on disk.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validate } from "../../scripts/check-canvas-identities.mjs";

const canvasOnDisk = fs.existsSync(path.resolve(__dirname, "../../../ProjectDocs/_extracted/msapp/projectcosts/Src"));

describe.skipIf(!canvasOnDisk)("UT-CANVASID — UI identities match the canvas source", () => {
  const { findings } = validate();
  const lines = (codes: string[]) =>
    findings.filter((f) => codes.includes(f.code)).map((f) => `${f.code} ${f.at} <${f.tag}> ${f.msg}`);

  it("UT-CANVASID-001 every canvas-named data-testid exists on the feature's own screen", () => {
    const report = lines(["C1", "C2"]);
    expect(report, `\nUnknown or foreign canvas names (run \`npm run check:canvas\`):\n${report.join("\n")}\n`).toEqual([]);
  });

  it("UT-CANVASID-002 the control type matches the canvas control", () => {
    const report = lines(["C3"]);
    expect(report, `\nType mismatches:\n${report.join("\n")}\n`).toEqual([]);
  });

  it("UT-CANVASID-003 aria-label equals the canvas AccessibleLabel wherever the canvas sets one", () => {
    const report = lines(["C4", "C5"]);
    expect(report, `\nAccessibleLabel mismatches:\n${report.join("\n")}\n`).toEqual([]);
  });
});
