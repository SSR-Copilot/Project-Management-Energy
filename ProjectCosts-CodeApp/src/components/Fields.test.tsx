// @vitest-environment jsdom
/**
 * The modern field skin (20 Oct 2026, D25): canvas `DisplayMode.View` vs `Disabled`, the `{Len}/N`
 * counter on the caption row, and the people-picker chips inside the box.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import type { ReactNode } from "react";
import { vsbTheme } from "@/theme/fluent";
import { ReadOnlyField, TextField } from "./Fields";
import { PeoplePicker } from "./PeoplePicker";

const wrapper = ({ children }: { children: ReactNode }) =>
  <FluentProvider theme={vsbTheme}>{children}</FluentProvider>;

describe("modern field skin", () => {
  it("UT-FIELDS-001 View mode is read-only but focusable; Disabled is disabled", () => {
    render(<>
      <TextField label="Name" value="A" onChange={() => {}} readOnly testId="view" />
      <TextField label="Type" value="B" onChange={() => {}} disabled testId="disabled" />
      <ReadOnlyField label="Project ID" value="DE-1" testId="ro" />
    </>, { wrapper });
    const view = screen.getByTestId("view") as HTMLInputElement;
    expect(view.readOnly).toBe(true);
    expect(view.disabled).toBe(false);
    expect((screen.getByTestId("disabled") as HTMLInputElement).disabled).toBe(true);
    const ro = screen.getByTestId("ro") as HTMLInputElement;
    expect(ro.readOnly).toBe(true);
    expect(ro.disabled).toBe(false);
  });

  it("UT-FIELDS-002 the counter sits beside the caption, before the box", () => {
    render(<TextField label="Project Name" value="abc" onChange={() => {}} maxLength={55} testId="pn" />, { wrapper });
    const counter = screen.getByText("3/55");
    const input = screen.getByTestId("pn");
    expect(counter.parentElement!.contains(input)).toBe(true);
  });

  it("UT-FIELDS-003 the people picker shows each person as a chip inside the box", () => {
    render(
      <PeoplePicker
        label="Project Manager" placeholder="Select" testId="pp"
        value={[{ id: "p1", displayName: "Anna Schmidt", mail: "anna@x.com" }]}
        onChange={() => {}} onPick={(p) => [p]} maxPeople={1} term="" onTermChange={() => {}} suggestions={[]}
      />,
      { wrapper },
    );
    const remove = screen.getByTestId("pp-remove-p1");
    // The Input root is a span; the nearest div is the outlined box holding chips + search.
    const box = screen.getByTestId("pp").closest("div")!;
    expect(box.contains(remove)).toBe(true);
    expect(screen.getByText("Anna Schmidt").closest("[title]")).toHaveAttribute("title", "Anna Schmidt (anna@x.com)");
    // At MaxPeople the search box is disabled.
    expect(screen.getByTestId("pp")).toBeDisabled();
  });
});
