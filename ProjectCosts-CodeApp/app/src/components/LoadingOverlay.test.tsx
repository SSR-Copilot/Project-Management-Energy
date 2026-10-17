// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { vsbTheme } from "@/theme/fluent";
import { LoadingOverlay } from "./LoadingOverlay";

const mount = (node: React.ReactNode) => render(<FluentProvider theme={vsbTheme}><div data-testid="host">{node}</div></FluentProvider>);

describe("LoadingOverlay (M8)", () => {
  it("renders in place by default (unchanged for existing callers)", () => {
    mount(<LoadingOverlay label="Saving..." />);
    expect(screen.getByTestId("host")).toContainElement(screen.getByRole("dialog"));
    expect(screen.getByText("Saving...")).toBeInTheDocument();
  });

  it("portal: renders into document.body, outside the caller's tree", () => {
    mount(<LoadingOverlay label="Saving..." portal />);
    const overlay = screen.getByRole("dialog");
    expect(screen.getByTestId("host")).not.toContainElement(overlay);
    expect(document.body).toContainElement(overlay);
    expect(overlay).toHaveAttribute("aria-busy", "true");
  });

  it("E7: a multi-line label keeps its line breaks (pre-line)", () => {
    mount(<LoadingOverlay label={"Please wait,\nsaving approvals..."} />);
    const label = screen.getByText(/Please wait,/);
    expect(label.textContent).toBe("Please wait,\nsaving approvals...");
    expect(label).toHaveStyle({ whiteSpace: "pre-line" });
  });

  it("inline mode ignores portal", () => {
    mount(<LoadingOverlay mode="inline" label="Loading..." portal />);
    expect(screen.getByTestId("host")).toContainElement(screen.getByRole("status"));
  });
});
