// @vitest-environment jsdom
/** InlineEmpty and VisuallyHidden. */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { vsbTheme } from "@/theme/fluent";
import { visuallyHidden } from "@/theme/visuallyHidden";
import { InlineEmpty } from "./InlineEmpty";
import { VisuallyHidden } from "./VisuallyHidden";

const wrap = (node: React.ReactNode) => render(<FluentProvider theme={vsbTheme}>{node}</FluentProvider>);

describe("InlineEmpty", () => {
  it("UT-INLEMPTY-001 Renders its text with role=status", () => {
    wrap(<InlineEmpty>No subaccounts.</InlineEmpty>);
    expect(screen.getByRole("status")).toHaveTextContent("No subaccounts.");
  });

  it("UT-INLEMPTY-002 Tone, padding and size change the classes", () => {
    wrap(<>
      <InlineEmpty testId="a">x</InlineEmpty>
      <InlineEmpty testId="b" tone="canvasGrey">x</InlineEmpty>
      <InlineEmpty testId="c" padding={8}>x</InlineEmpty>
      <InlineEmpty testId="d" padding={12} size={13}>x</InlineEmpty>
    </>);
    const cls = ["a", "b", "c", "d"].map((id) => screen.getByTestId(id).className);
    expect(new Set(cls).size).toBe(4);
    expect(screen.getByTestId("d")).toHaveStyle({ fontSize: "13px", paddingTop: "12px" });
  });
});

describe("VisuallyHidden", () => {
  it("UT-INLEMPTY-003 Is off-screen but stays in the accessibility tree", () => {
    wrap(<VisuallyHidden role="status" aria-live="polite" id="live">Moved to position 2</VisuallyHidden>);
    const el = screen.getByRole("status");
    expect(el).toHaveTextContent("Moved to position 2");
    expect(el).toHaveAttribute("id", "live");
    expect(el).toHaveAttribute("aria-live", "polite");
    expect(el).toHaveStyle({ position: "absolute", width: "1px", height: "1px", overflow: "hidden" });
  });

  it("UT-INLEMPTY-004 Renders a div when asked; the inline style object matches", () => {
    wrap(<VisuallyHidden as="div" testId="v">t</VisuallyHidden>);
    expect(screen.getByTestId("v").tagName).toBe("DIV");
    expect(visuallyHidden).toMatchObject({ position: "absolute", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" });
  });
});
