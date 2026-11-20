// @vitest-environment jsdom
/**
 * Edit panel typography as rendered. UT-ADMILE-019 checks the `TYPOGRAPHY`
 * constants; this checks that the panel's headings, row labels and technology headers actually
 * get them (canvas: headings ExtraLarge Bold, labels and technology headers ExtraLarge Semibold).
 */
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FluentProvider, tokens } from "@fluentui/react-components";
import { vsbTheme } from "@/theme/fluent";
import { useBrandButtonStyles } from "@/theme/buttonStyles";
import { palette } from "@/theme/tokens";
import { EditMilestonesPanel } from "./EditMilestonesPanel";
import {
  CLOSE_ICON_COLOR, HEADING, INPUT_MAX_LENGTH, INVALID_BORDER, MESSAGE_COLOR, MSG, TYPOGRAPHY,
} from "./constants";
import { cellKey, evaluatePanel, groupAssumptions, type Draft } from "./rules";
import { FIXTURE_ASSUMPTIONS, GERMANY } from "./fixtures";

function renderPanel(
  draft: Draft = {},
  extra: { error?: string; duplicates?: string; probe?: ReactNode; canEdit?: boolean } = {},
) {
  const groups = groupAssumptions(FIXTURE_ASSUMPTIONS).get(GERMANY) ?? [];
  render(
    <FluentProvider theme={vsbTheme}>
      {extra.probe}
      <EditMilestonesPanel
        open
        countryName="Germany"
        state={evaluatePanel(groups, draft)}
        canEdit={extra.canEdit ?? true}
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

/** Reads the shared brand-outline class string so a test can look for it on a button. */
function BrandProbe({ onClass }: { onClass: (c: string) => void }) {
  onClass(useBrandButtonStyles().brandOutline);
  return null;
}

const style = (text: string, index = 0) =>
  getComputedStyle(screen.getAllByText(text, { exact: true })[index]!);

describe("EditMilestonesPanel — typography", () => {
  it("UT-ADMILE-026: the panel headings and labels use the same ExtraLarge size (14px) as the matrix technology label", () => {
    expect(TYPOGRAPHY.panelHeading.fontSize).toBe(TYPOGRAPHY.technology.fontSize);
    expect(TYPOGRAPHY.panelLabel.fontSize).toBe(TYPOGRAPHY.technology.fontSize);
    expect(TYPOGRAPHY.panelLabel.fontSize).toBe("14px");
  });

  it("UT-ADMILE-027: section headings render ExtraLarge Bold (AMS:1140-1143, 1927-1930)", () => {
    renderPanel();
    for (const heading of [HEADING.durations, HEADING.successRates]) {
      const s = style(heading);
      expect(s.fontSize).toBe("14px");
      expect(s.fontWeight).toBe(tokens.fontWeightBold);
    }
  });

  it("UT-ADMILE-028: row labels and technology headers render ExtraLarge Semibold (AMS:1191-1194, 1899-1902, 2357-2360)", () => {
    renderPanel();
    // "Cluster 1" is a row label in both matrices; "Wind" / "PV" head both matrices' columns.
    for (const [text, index] of [["Cluster 1", 0], ["Cluster 1", 1], ["Final Investment Decision", 0], ["Wind", 0], ["PV", 1]] as const) {
      const s = style(text, index);
      expect(s.fontSize).toBe("14px");
      expect(s.fontWeight).toBe(tokens.fontWeightSemibold);
    }
  });

  it("UT-ADMILE-029: section validation messages render canvas Small (10px) in gblAppColors.Error = akzent5 (AMS:1908-1914, 2366-2372)", () => {
    expect(TYPOGRAPHY.panelMessage).toEqual({ fontSize: "10px" });
    expect(MESSAGE_COLOR).toBe(palette.akzent5);
    expect(MESSAGE_COLOR).toBe("#d20532");
    renderPanel({
      [cellKey("de-wind-m", "cluster2")]: "12.5",
      [cellKey("de-pv-s", "cluster1")]: "2",
    });
    for (const message of [MSG.durationInvalid, MSG.rateInvalid]) {
      const s = style(message);
      expect(s.fontSize).toBe("10px");
      // jsdom normalises colours (lower case or rgb()), so accept either spelling.
      expect([palette.akzent5.toLowerCase(), "rgb(210, 5, 50)"]).toContain(s.color.toLowerCase());
    }
  });
});

describe("EditMilestonesPanel — canvas input parity", () => {
  const input = (name: string) => screen.getByRole("textbox", { name, hidden: true });
  /** Fluent's `Input` puts `style` on its root span, the parent of the `<input>` that carries the role. */
  const frame = (el: HTMLElement) => el.parentElement!;
  /** The red the canvas `BorderColor: RGBA(189, 49, 51, 1)` draws, in either jsdom spelling. */
  const reds = [INVALID_BORDER.toLowerCase(), "rgb(189, 49, 51)"];

  it("UT-ADMILE-935: a blank or failing STORED value is red (#BD3133) on open, with no message and Save disabled (AMS:1358-1371, 2068-2085)", () => {
    expect(INVALID_BORDER).toBe("#BD3133");
    renderPanel();
    // Germany PV has no FID: shown "", fails `^\d+$`.
    const pvFid = input("PV Final Investment Decision duration in months");
    expect(pvFid).toHaveValue("");
    expect(pvFid).toHaveAttribute("aria-invalid", "true");
    expect(reds).toContain(frame(pvFid).style.borderColor.toLowerCase());
    expect(frame(pvFid).style.borderWidth).toBe("1px");
    expect(pvFid).not.toHaveAttribute("aria-describedby");
    // A stored valid value is not red; a blank blank-as-zero duration (placeholder "0") is not red either.
    const windFid = input("Wind Final Investment Decision duration in months");
    expect(windFid).toHaveAttribute("aria-invalid", "false");
    expect(frame(windFid).style.border).toBe("");
    const pvSalesStart = input("PV Sales Start duration in months");
    expect(pvSalesStart).toHaveAttribute("placeholder", "0");
    expect(pvSalesStart).toHaveAttribute("aria-invalid", "false");
    // Nothing typed: no section message, Save disabled.
    expect(screen.queryByText(MSG.durationInvalid)).not.toBeInTheDocument();
    expect(screen.queryByText(MSG.rateInvalid)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save", hidden: true })).toBeDisabled();
  });

  it("UT-ADMILE-935b: a typed failing value is red in the same colour and now carries the message", () => {
    renderPanel({ [cellKey("de-wind-m", "cluster1")]: "12.5" });
    const wind = input("Wind Cluster 1 duration in months");
    expect(wind).toHaveAttribute("aria-invalid", "true");
    expect(reds).toContain(frame(wind).style.borderColor.toLowerCase());
    expect(wind).toHaveAttribute("aria-describedby");
    expect(screen.getByText(MSG.durationInvalid)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save", hidden: true })).toBeDisabled();
  });

  it("UT-ADMILE-936: every input takes the canvas MaxLength 256 (gblAppConstants.DefaultDefMaxLength, AMS:1375, 2085)", () => {
    expect(INPUT_MAX_LENGTH).toBe(256);
    renderPanel();
    const inputs = screen.getAllByRole("textbox", { hidden: true });
    expect(inputs.length).toBeGreaterThan(0);
    for (const i of inputs) expect(i).toHaveAttribute("maxlength", "256");
  });

  it("UT-ADMILE-937: the panel ✕ is tinted themeTertiary through FormPanel closeIconColor (ItemIconColor, AMS:1073)", () => {
    expect(CLOSE_ICON_COLOR).toBe(palette.themeTertiary);
    renderPanel();
    const drawer = screen.getByRole("dialog", { name: "Edit Milestones for Germany", hidden: true });
    expect(drawer).toHaveClass("canvas-panel-close-tinted");
    expect(drawer.style.getPropertyValue("--canvas-panel-close-color")).toBe(palette.themeTertiary);
    expect(screen.getByTestId("pcf_com_Admin_ProjectGates_Approvals_Form_CommandBar_2-closeKey")).toBeInTheDocument();
  });
});

describe("EditMilestonesPanel — shared panel chrome", () => {
  it("UT-ADMILE-081 (V1): Cancel is the canvas brand outline (AMS:2641-2653); Save stays primary with aria-label Save", () => {
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

  it("UT-ADMILE-082 (MS-3): the drawer is named by its title", () => {
    renderPanel();
    const drawer = screen.getByRole("dialog", { name: "Edit Milestones for Germany", hidden: true });
    expect(drawer).toHaveAttribute("aria-label", "Edit Milestones for Germany");
  });

  it("UT-ADMILE-083 (MS-2): the save error is an alert, first; the duplicates warning follows it", () => {
    renderPanel({}, { error: "Error: could not save.", duplicates: "Duplicate assumption rows exist for Wind." });
    const alert = screen.getByRole("alert", { hidden: true });
    expect(alert).toHaveTextContent("Error: could not save.");
    const warning = screen.getByText("Duplicate assumption rows exist for Wind.");
    expect(alert.compareDocumentPosition(warning) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("EditMilestonesPanel — admin gate", () => {
  const inputs = () => screen.getAllByRole("textbox", { hidden: true });

  it("UT-ADMILE-932 an admin can edit: the inputs are enabled and a change enables Save", () => {
    renderPanel({ [cellKey("de-wind-m", "cluster1")]: "13" });
    expect(inputs().length).toBeGreaterThan(0);
    for (const input of inputs()) expect(input).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save", hidden: true })).toBeEnabled();
  });

  it("UT-ADMILE-933 a non-admin cannot edit: every input and Save are disabled even with a valid change", () => {
    renderPanel({ [cellKey("de-wind-m", "cluster1")]: "13" }, { canEdit: false });
    for (const input of inputs()) expect(input).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save", hidden: true })).toBeDisabled();
  });
});
