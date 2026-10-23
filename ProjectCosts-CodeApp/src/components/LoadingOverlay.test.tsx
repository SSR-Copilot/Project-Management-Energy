// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { vsbTheme } from "@/theme/fluent";
import { LoadingOverlay } from "./LoadingOverlay";

const mount = (node: React.ReactNode) => render(<FluentProvider theme={vsbTheme}><div data-testid="host">{node}</div></FluentProvider>);

describe("LoadingOverlay", () => {
  it("UT-LOADOVL-001 Renders in place by default (unchanged for existing callers)", () => {
    mount(<LoadingOverlay label="Saving..." />);
    expect(screen.getByTestId("host")).toContainElement(screen.getByRole("dialog"));
    expect(screen.getByText("Saving...")).toBeInTheDocument();
  });

  it("UT-LOADOVL-002 Portal: renders into document.body, outside the caller's tree", () => {
    mount(<LoadingOverlay label="Saving..." portal />);
    const overlay = screen.getByRole("dialog");
    expect(screen.getByTestId("host")).not.toContainElement(overlay);
    expect(document.body).toContainElement(overlay);
    expect(overlay).toHaveAttribute("aria-busy", "true");
  });

  it("UT-LOADOVL-003 E7: a multi-line label keeps its line breaks (pre-line)", () => {
    mount(<LoadingOverlay label={"Please wait,\nsaving approvals..."} />);
    const label = screen.getByText(/Please wait,/);
    expect(label.textContent).toBe("Please wait,\nsaving approvals...");
    expect(label).toHaveStyle({ whiteSpace: "pre-line" });
  });

  it("UT-LOADOVL-004 Inline mode ignores portal", () => {
    mount(<LoadingOverlay mode="inline" label="Loading..." portal />);
    expect(screen.getByTestId("host")).toContainElement(screen.getByRole("status"));
  });

  /*
   * `spi_PopUpLoading_Spinner.Height: =If(cmp_PopUp_Loading.InformationText = "", 120, 90)`
   * (`cmp_PopUp_Loading.pa.yaml:48-53`). Both branches pinned.
   */
  it("UT-LOADOVL-005 No label: the spinner box is the canvas's 120 px", () => {
    mount(<LoadingOverlay />);
    const box = screen.getByLabelText("Waiting").parentElement;
    expect(box).toHaveStyle({ height: "120px", marginTop: "50px" });
  });

  it("UT-LOADOVL-006 With a label: the spinner box is 90 px, leaving room for the description", () => {
    mount(<LoadingOverlay label="Please wait, saving costs..." />);
    const box = screen.getByLabelText("Waiting").parentElement;
    expect(box).toHaveStyle({ height: "90px", marginTop: "50px" });
  });

  it("UT-LOADOVL-007 An empty label is the canvas's InformationText = \"\" branch", () => {
    mount(<LoadingOverlay label="" />);
    expect(screen.getByLabelText("Waiting").parentElement).toHaveStyle({ height: "120px" });
  });
});
