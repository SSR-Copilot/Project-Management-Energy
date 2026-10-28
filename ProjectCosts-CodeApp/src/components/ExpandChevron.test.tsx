// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { vsbTheme } from "@/theme/fluent";
import { ExpandChevron } from "./ExpandChevron";

const glyph = (open: boolean) => {
  const { container } = render(<FluentProvider theme={vsbTheme}><ExpandChevron open={open} /></FluentProvider>);
  return container.querySelector("svg") as SVGElement;
};

describe("ExpandChevron", () => {
  it("UT-EXPAND-010 open and closed draw different chevrons (up vs down) of the same size", () => {
    const up = glyph(true);
    const upPath = up.querySelector("path")?.getAttribute("d");
    document.body.innerHTML = "";
    const down = glyph(false);
    expect(down.querySelector("path")?.getAttribute("d")).not.toBe(upPath);
    expect(down.getAttribute("class")).toBeTruthy();
    expect(down.getAttribute("aria-hidden")).toBe("true");
  });

  it("UT-EXPAND-011 the chevron carries the shared class, and a caller's class is added to it", () => {
    const { container } = render(<FluentProvider theme={vsbTheme}><ExpandChevron open={false} className="mine" /></FluentProvider>);
    const svg = container.querySelector("svg") as SVGElement;
    expect(svg.getAttribute("class")).toContain("mine");
    expect(svg.getAttribute("class")!.split(/\s+/).length).toBeGreaterThan(2);
  });
});
