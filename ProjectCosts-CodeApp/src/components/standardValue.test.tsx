// @vitest-environment jsdom
/**
 * The shared standard-assumption style (CONVENTIONS rule 20): one definition, reached by every
 * field primitive's `standard` prop, and absent while the condition is false.
 */
import { describe, expect, it } from "vitest";
import { render, renderHook, screen } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import type { ReactNode } from "react";
import { vsbTheme } from "@/theme/fluent";
import { CostField } from "./CanvasFields";
import { ReadOnlyField, TextField } from "./Fields";
import { useStandardValueClass } from "./standardValue";

/** Griffel merges classes (dropping the sequence hash), so compare the atomic classes. */
const atoms = (cls: string) => cls.split(" ").filter((c) => c && !c.startsWith("___"));
const carries = (className: string, cls: string) => atoms(cls).every((a) => className.split(" ").includes(a));

const wrapper = ({ children }: { children: ReactNode }) =>
  <FluentProvider theme={vsbTheme}>{children}</FluentProvider>;

describe("standardValue (rule 20)", () => {
  it("UT-STDVAL-001 no class while the condition is false; one class per variant while true", () => {
    const { result } = renderHook(() => useStandardValueClass(), { wrapper });
    const cls = result.current;
    expect(cls(false)).toBeUndefined();
    expect(cls(null)).toBeUndefined();
    expect(cls(undefined)).toBeUndefined();
    const full = cls(true)!;
    expect(full).toBeTruthy();
    expect(cls(true, "blue")).not.toBe(full);
    expect(cls("italic")).toBe(cls(true, "italic"));
    expect(new Set([full, cls("blue"), cls("italic")]).size).toBe(3);
  });

  it("UT-STDVAL-002 CostField puts the style on its input, never on the caption", () => {
    const { result } = renderHook(() => useStandardValueClass(), { wrapper });
    const full = result.current(true)!;
    const { rerender } = render(<CostField label="Total Costs" name="txt_x" value="1" standard />, { wrapper });
    const input = screen.getByTestId("txt_x");
    expect(input.className).toBe(full);
    expect(screen.getByText("Total Costs").className).toBe("");
    rerender(<CostField label="Total Costs" name="txt_x" value="1" standard={false} />);
    expect(screen.getByTestId("txt_x").className).toBe("");
  });

  it("UT-STDVAL-003 the Fluent primitives carry it on their root, which reaches the inner input", () => {
    const { result } = renderHook(() => useStandardValueClass(), { wrapper });
    const full = result.current(true)!;
    render(<>
      <TextField label="Margin" value="1" onChange={() => {}} testId="tf" standard />
      <ReadOnlyField label="Free Equity" value="10" testId="ro" standard="blue" />
      <TextField label="Plain" value="1" onChange={() => {}} testId="plain" />
    </>, { wrapper });
    // `testId` is on the inner <input>; the class is on the Fluent root span around it.
    expect(carries(screen.getByTestId("tf").parentElement!.className, full)).toBe(true);
    expect(carries(screen.getByTestId("ro").parentElement!.className, result.current("blue")!)).toBe(true);
    expect(carries(screen.getByTestId("plain").parentElement!.className, full)).toBe(false);
  });
});
