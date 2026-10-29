// @vitest-environment jsdom
/**
 * The non-animated write status line that replaces the Cost screens' blocking spinner (D57).
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { WriteStatus } from "./WriteStatus";

describe("WriteStatus", () => {
  it("UT-WSTATUS-001 renders the label as a polite live region with its test id", () => {
    render(<WriteStatus label="Saving OPEX cost..." testId="opex-write-status" />);
    const el = screen.getByTestId("opex-write-status");
    expect(el).toHaveTextContent("Saving OPEX cost...");
    expect(el).toHaveAttribute("role", "status");
    expect(el).toHaveAttribute("aria-live", "polite");
  });

  it("UT-WSTATUS-002 without a label the live region is still mounted, with no text", () => {
    render(<WriteStatus label={null} testId="x-write-status" />);
    const x = screen.getByTestId("x-write-status");
    expect(x).toHaveAttribute("role", "status");
    expect(x).toBeEmptyDOMElement();
    render(<WriteStatus label="" testId="y-write-status" />);
    expect(screen.getByTestId("y-write-status")).toBeEmptyDOMElement();
  });

  it("UT-WSTATUS-004 the same element stays mounted while only its text changes", () => {
    const view = render(<WriteStatus label={null} testId="z-write-status" />);
    const before = screen.getByTestId("z-write-status");
    view.rerender(<WriteStatus label="Saving OPEX cost..." testId="z-write-status" />);
    expect(screen.getByTestId("z-write-status")).toBe(before);
    expect(before).toHaveTextContent("Saving OPEX cost...");
    view.rerender(<WriteStatus label={null} testId="z-write-status" />);
    expect(screen.getByTestId("z-write-status")).toBe(before);
    expect(before.textContent).toBe("");
  });

  it("UT-WSTATUS-003 has no spinner, scrim or modal dialog", () => {
    const { container } = render(<WriteStatus label="Deleting contract..." testId="c-write-status" />);
    expect(container.querySelector(".fui-Spinner")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(container.querySelector("[aria-modal]")).toBeNull();
  });
});
