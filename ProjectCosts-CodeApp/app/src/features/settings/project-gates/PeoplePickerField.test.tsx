// @vitest-environment jsdom
/**
 * G-3 / B2 — the people picker is usable with the keyboard only: combobox + listbox/option
 * semantics, ArrowDown + Enter adds a person, Esc closes the suggestions, selected people are
 * never suggested, and the per-mode maximum hides the search box.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, configure, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FluentProvider } from "@fluentui/react-components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

configure({ asyncUtilTimeout: 5000 });

const repo = vi.hoisted(() => ({ searchPeople: vi.fn() }));
vi.mock("@/data/settings/project-gates", () => ({ projectGatesRepository: repo }));

import { vsbTheme } from "@/theme/fluent";
import type { PersonRef } from "@/data/settings/project-gates";
import { person } from "./fixtures";
import { PeoplePickerField } from "./PeoplePickerField";
import { pickerSuggestions } from "./rules";

const anna: PersonRef = { entraId: "30000000-0000-0000-0000-0000000000aa", name: "Anna Müller", mail: "anna@vsb.energy" };
const max: PersonRef = { entraId: "30000000-0000-0000-0000-0000000000bb", name: "Max Müller", mail: "max@vsb.energy" };

function Harness({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <FluentProvider theme={vsbTheme}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </FluentProvider>
  );
}

function Controlled({ initial = [], limit = 5, onChange }: { initial?: PersonRef[]; limit?: number; onChange?: (p: PersonRef[]) => void }) {
  const [people, setPeople] = useState<PersonRef[]>(initial);
  return (
    <PeoplePickerField
      label="Approvers" people={people} max={limit}
      onChange={(p) => { setPeople(p); onChange?.(p); }}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.searchPeople.mockResolvedValue([anna, max]);
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("PeoplePickerField (keyboard)", { timeout: 20_000 }, () => {
  it("is a named combobox; type 'mü' → ArrowDown → Enter adds the person, keyboard only", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness><Controlled onChange={onChange} /></Harness>);
    const input = screen.getByRole("combobox", { name: "Search Approvers" });
    expect(input).toHaveAttribute("aria-expanded", "false");

    await user.click(input);
    await user.keyboard("mü");
    const listbox = await screen.findByRole("listbox", { name: "Suggested Approvers" });
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(within(listbox).getAllByRole("option")).toHaveLength(2);
    expect(repo.searchPeople).toHaveBeenCalledWith("mü");

    await user.keyboard("{ArrowDown}");
    // Focus never leaves the input; the active option is announced via aria-activedescendant.
    expect(input).toHaveFocus();
    expect(input.getAttribute("aria-activedescendant")).toBeTruthy();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange.mock.calls[0]![0]).toHaveLength(1);
    expect(within(screen.getByLabelText("Selected Approvers")).getByText(onChange.mock.calls[0]![0][0].name)).toBeInTheDocument();
    expect(input).toHaveValue("");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("ArrowDown / ArrowUp move the active option; Enter adds exactly the active one", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness><Controlled onChange={onChange} /></Harness>);
    const input = screen.getByRole("combobox", { name: "Search Approvers" });
    await user.click(input);
    await user.keyboard("mü");
    await screen.findByRole("listbox", { name: "Suggested Approvers" });
    const options = screen.getAllByRole("option");
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(input.getAttribute("aria-activedescendant")).toBe(options[1]!.id);
    await user.keyboard("{ArrowUp}");
    expect(input.getAttribute("aria-activedescendant")).toBe(options[0]!.id);
    expect(input).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(onChange).toHaveBeenCalledWith([anna]));
  });

  it("Esc closes the suggestion list and stops there (does not bubble to a drawer)", async () => {
    const user = userEvent.setup();
    const outer = vi.fn();
    render(
      <Harness>
        <div onKeyDown={(e) => { if (e.key === "Escape") outer(); }}>
          <Controlled />
        </div>
      </Harness>,
    );
    const input = screen.getByRole("combobox", { name: "Search Approvers" });
    await user.click(input);
    await user.keyboard("mü");
    await screen.findByRole("listbox", { name: "Suggested Approvers" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(outer).not.toHaveBeenCalled();
    expect(input).toHaveFocus();
  });

  it("already-selected people are not suggested", async () => {
    const user = userEvent.setup();
    render(<Harness><Controlled initial={[anna]} /></Harness>);
    await user.click(screen.getByRole("combobox", { name: "Search Approvers" }));
    await user.keyboard("mü");
    const listbox = await screen.findByRole("listbox", { name: "Suggested Approvers" });
    expect(within(listbox).getAllByRole("option").map((o) => o.textContent)).toEqual([expect.stringContaining("Max Müller")]);
    expect(pickerSuggestions([anna, max], [{ ...anna, entraId: anna.entraId.toUpperCase() }])).toEqual([max]);
  });

  it("no matches is announced as a status, without an empty listbox", async () => {
    repo.searchPeople.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<Harness><Controlled /></Harness>);
    await user.click(screen.getByRole("combobox", { name: "Search Approvers" }));
    await user.keyboard("zz");
    const status = await screen.findByText("No matches");
    expect(status).toHaveAttribute("role", "status");
    const input = screen.getByRole("combobox", { name: "Search Approvers" });
    expect(input.getAttribute("aria-describedby")).toContain(status.id);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("the maximum hides the search box and shows the hint (Portfolio Manager = 1)", async () => {
    const user = userEvent.setup();
    render(<Harness><Controlled limit={1} /></Harness>);
    await user.click(screen.getByRole("combobox", { name: "Search Approvers" }));
    await user.keyboard("mü");
    await screen.findByRole("listbox", { name: "Suggested Approvers" });
    await user.keyboard("{ArrowDown}{Enter}");
    expect(await screen.findByText("Maximum of 1 person reached.")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("a selected person can be removed with the keyboard", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness><Controlled initial={[person(1)]} onChange={onChange} /></Harness>);
    within(screen.getByLabelText("Selected Approvers")).getByRole("button").focus();
    await user.keyboard("{Delete}");
    await waitFor(() => expect(onChange).toHaveBeenCalledWith([]));
  });
});
