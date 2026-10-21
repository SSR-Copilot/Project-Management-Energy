/**
 * UT-LABELS — the control-label gate runs with the unit suite, so `npx vitest run` fails when a
 * new or changed UI control has no explicit `aria-label` or no `data-testid`
 * (`scripts/check-control-labels.mjs`, `ProjectDocs/migration-plans/09-tosca-automation-conventions.md`,
 * `ProjectDocs/instructions/CONVENTIONS.md` rule 16).
 *
 * Fixing a failure: add the attribute to the control (or pass the primitive's `label` / `name` /
 * `testId` prop). Only when a control genuinely cannot carry them, put
 * `// control-labels-ignore: <reason>` on the line above it.
 */
import { describe, expect, it } from "vitest";
import { scan } from "../../scripts/check-control-labels.mjs";

describe("UT-LABELS — every interactive control is identifiable", () => {
  const result = scan();

  it("UT-LABELS-001 every interactive control has an aria-label and a data-testid", () => {
    const report = result.findings.map((f) => `${f.file}:${f.line} <${f.tag}> missing ${f.missing.join(" + ")}`);
    expect(report, `\nUnlabelled controls (run \`npm run check:labels\`):\n${report.join("\n")}\n`).toEqual([]);
  });

  it("UT-LABELS-002 no literal data-testid is used twice in one file", () => {
    const report = result.duplicates.map((d) => `${d.file}: "${d.id}" on lines ${d.lines.join(", ")}`);
    expect(report, `\nDuplicate test ids:\n${report.join("\n")}\n`).toEqual([]);
  });

  it("UT-LABELS-003 every exemption states its reason", () => {
    expect(result.ignored.filter((i) => i.reason.trim().length < 10)).toEqual([]);
  });
});
