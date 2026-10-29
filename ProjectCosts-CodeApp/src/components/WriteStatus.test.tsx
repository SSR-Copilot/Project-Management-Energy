// @vitest-environment jsdom
/**
 * The Cost screens' "a write is running" indicator: a blocking spinner for as long as the write
 * lasts (D57 made it a text line; D59 restored the spinner after it left the screen looking idle).
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { vsbTheme } from "@/theme/fluent";
import { WriteStatus } from "./WriteStatus";

const withTheme = (ui: React.ReactElement) => <FluentProvider theme={vsbTheme}>{ui}</FluentProvider>;

describe("WriteStatus", () => {
  it("UT-WSTATUS-001 a label shows the blocking spinner with the verbatim text and its test id", () => {
    render(withTheme(<WriteStatus label="Saving OPEX cost..." testId="opex-write-status" />));
    const el = screen.getByTestId("opex-write-status");
    expect(el).toHaveTextContent("Saving OPEX cost...");
    expect(el).toHaveAttribute("role", "dialog");
    expect(el).toHaveAttribute("aria-modal", "true");
    expect(el).toHaveAttribute("aria-busy", "true");
    expect(el.querySelector(".fui-Spinner")).not.toBeNull();
  });

  it("UT-WSTATUS-002 without a label there is no overlay, only an empty live region", () => {
    render(withTheme(<WriteStatus label={null} testId="x-write-status" />));
    const x = screen.getByTestId("x-write-status");
    expect(x).toHaveAttribute("role", "status");
    expect(x).toBeEmptyDOMElement();
    expect(screen.queryByRole("dialog")).toBeNull();
    render(withTheme(<WriteStatus label="" testId="y-write-status" />));
    expect(screen.getByTestId("y-write-status")).toBeEmptyDOMElement();
  });

  it("UT-WSTATUS-004 the overlay appears with the label and is gone again when the write ends", () => {
    const view = render(withTheme(<WriteStatus label={null} testId="z-write-status" />));
    expect(screen.queryByRole("dialog")).toBeNull();
    view.rerender(withTheme(<WriteStatus label="Saving OPEX cost..." testId="z-write-status" />));
    expect(screen.getByRole("dialog")).toHaveTextContent("Saving OPEX cost...");
    expect(screen.getByTestId("z-write-status")).toHaveAttribute("role", "dialog");
    view.rerender(withTheme(<WriteStatus label={null} testId="z-write-status" />));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Saving OPEX cost...")).toBeNull();
    // The test id is still there, as the idle live region.
    expect(screen.getByTestId("z-write-status")).toHaveAttribute("role", "status");
  });

  it("UT-WSTATUS-003 the spinner covers the whole screen (a fixed scrim) so nothing behind it can be clicked", () => {
    render(withTheme(<WriteStatus label="Deleting contract..." testId="c-write-status" />));
    const scrim = screen.getByTestId("c-write-status");
    expect(scrim.querySelector(".fui-Spinner")).not.toBeNull();
    expect(scrim.querySelector('[aria-label="Waiting"]')).not.toBeNull();
    expect(window.getComputedStyle(scrim).position).toBe("fixed");
  });
});
