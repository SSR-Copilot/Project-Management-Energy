// @vitest-environment jsdom
/**
 * The people field over the shared `PeoplePicker` (the PCF look): a named search box in the chip box,
 * the "Suggested People" list, ArrowDown / ArrowUp + Enter adds the highlighted person, Esc closes the
 * suggestions without reaching a drawer, selected people are never suggested, no matches is silent,
 * the per-mode maximum just stops the input (no hint text), and the PCF `Tooltip` is the search box's
 * hover hint.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, configure, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FluentProvider } from "@fluentui/react-components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

configure({ asyncUtilTimeout: 5000 });

const repo = vi.hoisted(() => ({ searchPeople: vi.fn() }));
vi.mock("@/data/adminGatesApprovals", () => ({ projectGatesRepository: repo }));

import { vsbTheme } from "@/theme/fluent";
import type { PersonRef } from "@/data/adminGatesApprovals";
import { person } from "./fixtures";
import { PeoplePickerField } from "./PeoplePickerField";
import { pickerSuggestions } from "./rules";

const anna: PersonRef = { entraId: "30000000-0000-0000-0000-0000000000aa", name: "Anna Müller", mail: "anna@vsb.energy" };
const max: PersonRef = { entraId: "30000000-0000-0000-0000-0000000000bb", name: "Max Müller", mail: "max@vsb.energy" };

/** The default search-box test id without a `testId` (the caption, kebab-cased). */
const TEST_ID = "people-picker-search-approvers";
/** A selected person's ✕ in the shared picker: `<testId>-remove-<Entra id>`. */
const chipRemove = (p: PersonRef) => `${TEST_ID}-remove-${p.entraId}`;

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
      label="Approvers" people={people} max={limit} placeholder="Select Approvers"
      onChange={(p) => { setPeople(p); onChange?.(p); }}
    />
  );
}

const searchBox = () => screen.getByRole("textbox", { name: "Approvers" });

beforeEach(() => {
  vi.clearAllMocks();
  repo.searchPeople.mockResolvedValue([anna, max]);
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("PeoplePickerField (shared PeoplePicker look, keyboard)", { timeout: 20_000 }, () => {
  // The search box is named by the field caption (CONVENTIONS rule 16) and carries the PCF `HintText`.
  it("UT-ADGATE-701 a named search box in the chip box; type 'mü' → ArrowDown → Enter adds the highlighted person, keyboard only", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness><Controlled onChange={onChange} /></Harness>);
    const input = searchBox();
    expect(input).toHaveAttribute("placeholder", "Select Approvers");
    expect(input).toHaveAttribute("data-testid", TEST_ID);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await user.click(input);
    await user.keyboard("mü");
    const listbox = await screen.findByRole("listbox", { name: "Approvers" });
    expect(screen.getByText("Suggested People")).toBeInTheDocument();
    const options = within(listbox).getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(repo.searchPeople).toHaveBeenCalledWith("mü");

    // The first suggestion opens highlighted, as the PCF; ArrowDown moves to the second. Focus stays in the box.
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowDown}");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveFocus();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange).toHaveBeenCalledWith([max]);
    expect(screen.getByTestId(chipRemove(max))).toBeInTheDocument();
    expect(screen.getByText("Max Müller")).toBeInTheDocument();
    expect(input).toHaveValue("");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("UT-ADGATE-702 ArrowDown / ArrowUp move the highlighted suggestion; Enter adds exactly that one", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness><Controlled onChange={onChange} /></Harness>);
    const input = searchBox();
    await user.click(input);
    await user.keyboard("mü");
    await screen.findByRole("listbox", { name: "Approvers" });
    const options = screen.getAllByRole("option");
    await user.keyboard("{ArrowDown}");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(options[0]).toHaveAttribute("aria-selected", "false");
    await user.keyboard("{ArrowUp}");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(onChange).toHaveBeenCalledWith([anna]));
    expect(screen.queryByTestId(chipRemove(max))).not.toBeInTheDocument();
  });

  it("UT-ADGATE-703 Esc closes the suggestions and stops there (does not reach a drawer); the typed text stays", async () => {
    const user = userEvent.setup();
    const outer = vi.fn();
    render(
      <Harness>
        {/* A stand-in for Fluent's `DialogSurface`, which closes on an Escape that is not default-prevented. */}
        <div onKeyDown={(e) => { if (e.key === "Escape" && !e.isDefaultPrevented()) outer(); }}>
          <Controlled />
        </div>
      </Harness>,
    );
    const input = searchBox();
    await user.click(input);
    await user.keyboard("mü");
    await screen.findByRole("listbox", { name: "Approvers" });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    expect(outer).not.toHaveBeenCalled();
    expect(input).toHaveFocus();
    expect(input).toHaveValue("mü");
  });

  it("UT-ADGATE-704 already-selected people are not suggested", async () => {
    const user = userEvent.setup();
    render(<Harness><Controlled initial={[anna]} /></Harness>);
    expect(screen.getByTestId(chipRemove(anna))).toBeInTheDocument();
    await user.click(searchBox());
    await user.keyboard("mü");
    const listbox = await screen.findByRole("listbox", { name: "Approvers" });
    expect(within(listbox).getAllByRole("option").map((o) => o.textContent)).toEqual([expect.stringContaining("Max Müller")]);
    expect(pickerSuggestions([anna, max], [{ ...anna, entraId: anna.entraId.toUpperCase() }])).toEqual([max]);
  });

  it("UT-ADGATE-705 no matches is silent, as the PCF (no list, no status text); a failed search is announced", async () => {
    repo.searchPeople.mockResolvedValue([]);
    const user = userEvent.setup();
    const { unmount } = render(<Harness><Controlled /></Harness>);
    await user.click(searchBox());
    await user.keyboard("zz");
    await waitFor(() => expect(repo.searchPeople).toHaveBeenCalledWith("zz"));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.queryByText("No matches")).not.toBeInTheDocument();
    expect(screen.queryByText("Searching…")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    unmount();

    // NEW: the only status text kept — a failed search must not be silent.
    repo.searchPeople.mockRejectedValue(new Error("Entra unavailable"));
    render(<Harness><Controlled /></Harness>);
    await user.click(searchBox());
    await user.keyboard("mü");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("People search failed. Try again.");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("UT-ADGATE-706 at the maximum the search box just stops taking input — no hint text (Portfolio Manager = 1)", async () => {
    const user = userEvent.setup();
    render(<Harness><Controlled limit={1} /></Harness>);
    const input = searchBox();
    expect(input).toBeEnabled();
    await user.click(input);
    await user.keyboard("mü");
    await screen.findByRole("listbox", { name: "Approvers" });
    await user.keyboard("{ArrowDown}{Enter}");
    expect(await screen.findByTestId(chipRemove(max))).toBeInTheDocument();
    expect(searchBox()).toBeDisabled();
    expect(searchBox()).not.toHaveAttribute("placeholder");
    expect(screen.queryByText(/Maximum of/)).not.toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    // Removing the person frees the box again.
    await user.click(screen.getByTestId(chipRemove(max)));
    await waitFor(() => expect(searchBox()).toBeEnabled());
  });

  it("UT-ADGATE-707 a selected person can be removed with the keyboard (the chip's ✕)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const selected = person(1);
    render(<Harness><Controlled initial={[selected]} onChange={onChange} /></Harness>);
    const remove = screen.getByTestId(chipRemove(selected));
    expect(remove).toHaveAccessibleName("Remove");
    remove.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(onChange).toHaveBeenCalledWith([]));
    expect(screen.queryByTestId(chipRemove(selected))).not.toBeInTheDocument();
  });

  it("UT-ADGATE-708 the PCF `Tooltip` is the search box's hover hint and the canvas name its test id; no tooltip, no title", () => {
    const { unmount } = render(
      <Harness>
        <PeoplePickerField
          label="Approvers" people={[]} max={5} onChange={() => {}}
          placeholder="Select Approvers" tooltip="Select Approvers"
          testId="pcf_Admin_ProjectGates_Approvals_Form_Fields_Approvals"
        />
      </Harness>,
    );
    const input = searchBox();
    expect(input).toHaveAttribute("title", "Select Approvers");
    expect(input).toHaveAttribute("placeholder", "Select Approvers");
    expect(input).toHaveAttribute("data-testid", "pcf_Admin_ProjectGates_Approvals_Form_Fields_Approvals");
    unmount();

    render(<Harness><Controlled /></Harness>);
    expect(searchBox()).not.toHaveAttribute("title");
  });
});
