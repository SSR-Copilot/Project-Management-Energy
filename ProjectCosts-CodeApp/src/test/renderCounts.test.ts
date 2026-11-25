import { afterEach, describe, expect, it } from "vitest";
import { probeRender, renderProbe } from "@/platform/renderProbe";
import { sectionRenderProbe } from "@/features/pm/generators/sections/renderProbe";
import { countRenders } from "./renderCounts";

describe("render counting seam (D162 B0)", () => {
  afterEach(() => { renderProbe.current = null; });

  it("UT-RENDERPROBE-001: counts per name and per prefix, resets and stops", () => {
    const r = countRenders();
    probeRender("Row:a"); probeRender("Row:a"); probeRender("Row:b"); probeRender("Table");
    expect(r.of("Row:a")).toBe(2);
    expect(r.ofPrefix("Row:")).toBe(3);
    expect(r.snapshot()).toEqual({ "Row:a": 2, "Row:b": 1, Table: 1 });
    r.reset();
    expect(r.of("Table")).toBe(0);
    r.stop();
    expect(renderProbe.current).toBeNull();
    probeRender("Table");
    expect(r.of("Table")).toBe(0);
  });

  it("UT-RENDERPROBE-002: the Generators probe is the same object (one seam in the app)", () => {
    expect(sectionRenderProbe).toBe(renderProbe);
  });

  it("UT-RENDERPROBE-003: off by default (production costs one property read)", () => {
    expect(renderProbe.current).toBeNull();
    expect(() => probeRender("x")).not.toThrow();
  });
});
