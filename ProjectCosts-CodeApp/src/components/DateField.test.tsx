// @vitest-environment jsdom
/**
 * The shared modern date field and dropdown (modern controls sweep, 20 Oct 2026, D35 §6): the
 * canvas `Format` text, `name` on both identity attributes, View vs Disabled, typed dates committed
 * as local `YYYY-MM-DD`, and the standard-assumption class.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import type { ReactNode } from "react";
import { vsbTheme } from "@/theme/fluent";
import { DateField } from "./DateField";
import { ChoiceField } from "./ChoiceField";

const wrapper = ({ children }: { children: ReactNode }) =>
  <FluentProvider theme={vsbTheme}>{children}</FluentProvider>;

describe("DateField", () => {
  it("UT-DATEFIELD-001 shows each canvas Format and carries the canvas name on aria-label and data-testid", () => {
    render(<>
      <DateField label="Project Start" name="dtp_long" value="2015-01-20" format="LongDate" />
      <DateField label="Cluster 1" name="dtp_abbr" value="2016-01-19T00:00:00Z" format="LongAbbreviated" />
      <DateField label="Date of Issue" name="dte_dotted" value={new Date(2026, 2, 5)} format="dd.mm.yyyy" />
    </>, { wrapper });
    const long = screen.getByTestId("dtp_long") as HTMLInputElement;
    expect(long.value).toBe("Tuesday, January 20, 2015");
    expect(long.getAttribute("aria-label")).toBe("dtp_long");
    expect((screen.getByTestId("dtp_abbr") as HTMLInputElement).value).toBe("Tue, Jan 19, 2016");
    expect((screen.getByTestId("dte_dotted") as HTMLInputElement).value).toBe("05.03.2026");
  });

  it("UT-DATEFIELD-002 View is read-only and focusable, Disabled is disabled; no name falls back to the caption", () => {
    render(<>
      <DateField label="Lifetime end" testId="view" value="2026-10-19" format="LongAbbreviated" readOnly />
      <DateField label="Locked" testId="disabled" value="2026-10-19" format="LongAbbreviated" disabled />
    </>, { wrapper });
    const view = screen.getByTestId("view") as HTMLInputElement;
    expect(view.readOnly).toBe(true);
    expect(view.disabled).toBe(false);
    expect(view.getAttribute("aria-label")).toBe("Lifetime end");
    expect((screen.getByTestId("disabled") as HTMLInputElement).disabled).toBe(true);
  });

  it("UT-DATEFIELD-003 a typed date (IsEditable) is committed on leaving the box as a local YYYY-MM-DD", () => {
    const onChange = vi.fn();
    render(<DateField label="End" name="dtp_end" value={null} format="LongAbbreviated" onChange={onChange} />, { wrapper });
    const box = screen.getByTestId("dtp_end");
    fireEvent.change(box, { target: { value: "19.10.2026" } });
    fireEvent.blur(box);
    expect(onChange).toHaveBeenCalledWith("2026-10-19");
  });

  it("UT-DATEFIELD-004 the standard-assumption pair is a class on the box only while it holds", () => {
    const { rerender } = render(
      <DateField label="COD" name="dtp_cod" value="2030-01-01" format="LongAbbreviated" standard />, { wrapper });
    const withStd = screen.getByTestId("dtp_cod").closest(".fui-Input")!.className;
    rerender(<DateField label="COD" name="dtp_cod" value="2030-01-01" format="LongAbbreviated" standard={false} />);
    const without = screen.getByTestId("dtp_cod").closest(".fui-Input")!.className;
    expect(withStd).not.toBe(without);
    expect(withStd.length).toBeGreaterThan(without.length);
  });
});

describe("ChoiceField", () => {
  it("UT-CHOICE-001 the selected label, canvas identity, View vs Disabled", () => {
    const options = [{ value: "1", label: "Yes" }, { value: "0", label: "No" }];
    render(<>
      <ChoiceField label="Expansion" ariaLabel="drp_expansion" testId="drp_expansion" value="1" options={options} />
      <ChoiceField label="View" testId="drp_view" value="0" options={options} readOnly />
      <ChoiceField label="Off" testId="drp_off" value="0" options={options} disabled />
    </>, { wrapper });
    const box = screen.getByTestId("drp_expansion");
    expect(box.textContent).toContain("Yes");
    expect(box.getAttribute("aria-label")).toBe("drp_expansion");
    expect(screen.getByTestId("drp_view").getAttribute("aria-readonly")).toBe("true");
    expect(screen.getByTestId("drp_view").getAttribute("aria-label")).toBe("View");
    expect((screen.getByTestId("drp_off") as HTMLButtonElement).disabled).toBe(true);
  });
});
