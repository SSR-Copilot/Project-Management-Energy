/**
 * G-A11Y — the helper and the shared components that carry canvas identities.
 *
 * The gate (`scripts/check-a11y.mjs`) proves every corpus control is referenced; these tests
 * prove a reference renders what the decision says: `aria-label` = caption, `data-testid` =
 * the canvas control name, on the element that receives focus.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import type { ReactNode } from "react";
import { vsbLightTheme } from "@/theme/fluentTheme";
import { canvasA11y, a11yFor, CANVAS_A11Y } from "@/a11y";
import { NumericInput, CommandBar, FormPanel, RecordFooter, StatTiles } from "@/components";

const wrap = (ui: ReactNode) => render(<FluentProvider theme={vsbLightTheme}>{ui}</FluentProvider>);

describe("UT-A11Y — the helper", () => {
  it("UT-A11Y-001 the test id is the canvas control's own name, the caption its human label", () => {
    expect(canvasA11y("Project Generators Screen", "cmb_Supplier_3")).toEqual({
      "aria-label": "Supplier", "data-testid": "cmb_Supplier_3",
    });
  });

  it("UT-A11Y-002 a caption argument overrides the corpus caption, never the test id", () => {
    const a11y = a11yFor("Project Generators Screen");
    expect(a11y("cmb_Supplier_1", "Turbine type")).toEqual({
      "aria-label": "Turbine type", "data-testid": "cmb_Supplier_1",
    });
  });

  it("UT-A11Y-003 no generated caption is a canvas control name", () => {
    // 489 corpus AccessibleLabels ARE control names (`cmb_Supplier_3`, `Drp_…_Tenor_YY`, `Icon5`);
    // the generator must have replaced every one with a human caption.
    const offenders: string[] = [];
    for (const [screenName, controls] of Object.entries(CANVAS_A11Y)) {
      const names = new Set(Object.keys(controls));
      for (const [control, pair] of Object.entries(controls as Record<string, readonly [string, string | null]>)) {
        const caption = pair[1];
        if (caption !== null && (names.has(caption) || /^[A-Za-z]+_[A-Za-z0-9_[\]/]+$/.test(caption))) {
          offenders.push(`${screenName}::${control} → ${caption}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("UT-A11Y — shared components forward the identity", () => {
  it("UT-A11Y-004 NumericInput puts both attributes on the input", () => {
    wrap(
      <NumericInput
        label="Number of generators" value="3" places={0} onChange={() => undefined}
        a11y={canvasA11y("Project Generators Screen", "txt_GeneratorData_RightPanel_Form_Fields_NumberOfGenerator", "Number of generators")}
      />,
    );
    const input = screen.getByTestId("txt_GeneratorData_RightPanel_Form_Fields_NumberOfGenerator");
    expect(input.tagName).toBe("INPUT");
    expect(input).toHaveAttribute("aria-label", "Number of generators");
  });

  it("UT-A11Y-005 CommandBar renders a command's identity on its toolbar button", () => {
    wrap(
      <CommandBar
        commands={[{
          key: "apply", label: "Apply", onClick: () => undefined,
          a11y: canvasA11y("Admin Cost Screen", "btn_Admin_Cost_Landlease_ApplyToLandlease", "Apply"),
        }]}
      />,
    );
    expect(screen.getByRole("button", { name: "Apply" }))
      .toHaveAttribute("data-testid", "btn_Admin_Cost_Landlease_ApplyToLandlease");
  });

  it("UT-A11Y-006 FormPanel, RecordFooter and StatTiles forward their identities", () => {
    wrap(
      <>
        <FormPanel
          open title="Panel" onClose={() => undefined}
          closeA11y={canvasA11y("cmp_ReportErrorRightPanel", "ico_ReportErrorRightPanel_BodyHeader_BodyHeaderCancel", "Close")}
        >
          <span>body</span>
        </FormPanel>
        <RecordFooter
          onSave={() => undefined} onCancel={() => undefined}
          saveA11y={canvasA11y("Project General Data Screen", "pcf_btn_GeneralData_DisplayProject_Body_Buttons_Save", "Save")}
          cancelA11y={canvasA11y("Project General Data Screen", "pcf_btn_GeneralData_DisplayProject_Body_Buttons_Reset", "Cancel")}
        />
        <StatTiles
          stats={[{
            label: "Gross yield", value: "1",
            a11y: canvasA11y("Project Production Screen", "txt_Production_DisplayProject_Body_Form_GrossYield", "Gross yield"),
          }]}
        />
      </>,
    );
    expect(screen.getByTestId("ico_ReportErrorRightPanel_BodyHeader_BodyHeaderCancel")).toHaveAttribute("aria-label", "Close");
    expect(screen.getByTestId("pcf_btn_GeneralData_DisplayProject_Body_Buttons_Save")).toHaveAttribute("aria-label", "Save");
    expect(screen.getByTestId("pcf_btn_GeneralData_DisplayProject_Body_Buttons_Reset")).toHaveAttribute("aria-label", "Cancel");
    expect(screen.getByTestId("txt_Production_DisplayProject_Body_Form_GrossYield")).toHaveTextContent("1");
  });
});
