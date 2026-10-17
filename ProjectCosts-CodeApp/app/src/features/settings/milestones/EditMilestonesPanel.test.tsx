// @vitest-environment jsdom
/**
 * Edit panel typography as rendered (parity R2 GAP-R2-1). UT-MS-019 checks the `TYPOGRAPHY`
 * constants; this checks that the panel's headings, row labels and technology headers actually
 * get them (canvas: headings ExtraLarge Bold, labels and technology headers ExtraLarge Semibold).
 */
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FluentProvider, tokens } from "@fluentui/react-components";
import { vsbTheme } from "@/theme/fluent";
import { useBrandButtonStyles } from "@/theme/buttonStyles";
import { EditMilestonesPanel } from "./EditMilestonesPanel";
import { HEADING, MSG, TYPOGRAPHY } from "./constants";
import { cellKey, evaluatePanel, groupAssumptions, type Draft } from "./rules";
import { FIXTURE_ASSUMPTIONS, GERMANY } from "./fixtures";

function renderPanel(draft: Draft = {}, extra: { error?: string; duplicates?: string; probe?: ReactNode } = {}) {
  const groups = groupAssumptions(FIXTURE_ASSUMPTIONS).get(GERMANY) ?? [];
  render(
    <FluentProvider theme={vsbTheme}>
      {extra.probe}
      <EditMilestonesPanel
        open
        countryName="Germany"
        state={evaluatePanel(groups, draft)}
        saving={false}
        error={extra.error}
        duplicates={extra.duplicates}
        onChange={vi.fn()}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    </FluentProvider>,
  );
}

/** Reads the shared T2 brand-outline class string so a test can look for it on a button. */
function BrandProbe({ onClass }: { onClass: (c: string) => void }) {
  onClass(useBrandButtonStyles().brandOutline);
  return null;
}

const style = (text: string, index = 0) =>
  getComputedStyle(screen.getAllByText(text, { exact: true })[index]!);

describe("EditMilestonesPanel — typography (parity R2 GAP-R2-1)", () => {
  it("UT-MS-026: the panel uses the same ExtraLarge step as the matrix technology label", () => {
    expect(TYPOGRAPHY.panelHeading.fontSize).toBe(TYPOGRAPHY.technology.fontSize);
    expect(TYPOGRAPHY.panelLabel.fontSize).toBe(TYPOGRAPHY.technology.fontSize);
  });

  it("UT-MS-027: section headings render ExtraLarge Bold (AMS:1140-1143, 1927-1930)", () => {
    renderPanel();
    for (const heading of [HEADING.durations, HEADING.successRates]) {
      const s = style(heading);
      expect(s.fontSize).toBe(tokens.fontSizeBase500);
      expect(s.fontWeight).toBe(tokens.fontWeightBold);
    }
  });

  it("UT-MS-028: row labels and technology headers render ExtraLarge Semibold (AMS:1191-1194, 1899-1902, 2357-2360)", () => {
    renderPanel();
    // "Cluster 1" is a row label in both matrices; "Wind" / "PV" head both matrices' columns.
    for (const [text, index] of [["Cluster 1", 0], ["Cluster 1", 1], ["Final Investment Decision", 0], ["Wind", 0], ["PV", 1]] as const) {
      const s = style(text, index);
      expect(s.fontSize).toBe(tokens.fontSizeBase500);
      expect(s.fontWeight).toBe(tokens.fontWeightSemibold);
    }
  });

  it("UT-MS-029: section validation messages render canvas Small 10pt (fontSizeBase300) in red (AMS:1914, 2372; GAP-R3-1)", () => {
    expect(TYPOGRAPHY.panelMessage).toEqual({ fontSize: tokens.fontSizeBase300 });
    renderPanel({
      [cellKey("de-wind-m", "cluster2")]: "12.5",
      [cellKey("de-pv-s", "cluster1")]: "2",
    });
    for (const message of [MSG.durationInvalid, MSG.rateInvalid]) {
      const s = style(message);
      expect(s.fontSize).toBe(tokens.fontSizeBase300);
      // jsdom lower-cases colour values, so compare case-insensitively.
      expect(s.color.toLowerCase()).toBe(tokens.colorPaletteRedForeground1.toLowerCase());
    }
  });
});

describe("EditMilestonesPanel — shared panel chrome (reusable components, Wave B)", () => {
  it("UT-MS-RC-01 (V1): Cancel is the canvas brand outline (AMS:2641-2653); Save stays primary with aria-label Save", () => {
    let brand = "";
    renderPanel({}, { probe: <BrandProbe onClass={(c) => { brand = c; }} /> });
    const cancel = screen.getByRole("button", { name: "Cancel", hidden: true });
    // The atomic classes (the "___" sequence hash is re-computed by `mergeClasses`).
    const atomic = brand.split(" ").filter((c) => c && !c.startsWith("___"));
    expect(atomic.length).toBeGreaterThan(0);
    for (const cls of atomic) expect(cancel).toHaveClass(cls);
    const save = screen.getByRole("button", { name: "Save", hidden: true });
    expect(save).toHaveAttribute("aria-label", "Save");
    expect(save).toBeDisabled(); // nothing typed yet
  });

  it("UT-MS-RC-02 (MS-3): the drawer is named by its title", () => {
    renderPanel();
    const drawer = screen.getByRole("dialog", { name: "Edit Milestones for Germany", hidden: true });
    expect(drawer).toHaveAttribute("aria-label", "Edit Milestones for Germany");
  });

  it("UT-MS-RC-03 (MS-2): the save error is an alert, first; the duplicates warning follows it", () => {
    renderPanel({}, { error: "Error: could not save.", duplicates: "Duplicate assumption rows exist for Wind." });
    const alert = screen.getByRole("alert", { hidden: true });
    expect(alert).toHaveTextContent("Error: could not save.");
    const warning = screen.getByText("Duplicate assumption rows exist for Wind.");
    expect(alert.compareDocumentPosition(warning) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
