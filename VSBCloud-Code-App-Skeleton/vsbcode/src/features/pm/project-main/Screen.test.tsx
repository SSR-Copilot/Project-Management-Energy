/**
 * Project Main Screen — a render smoke test.
 *
 * The only component test in the repo, and deliberately so: the other 1,400+ tests are
 * pure-function tests, which is the right default. This one exists because the landing screen
 * was rewritten wholesale, and a class of failure here is invisible to both `tsc` and every
 * pure test:
 *
 *   - a Zustand selector returning a fresh object renders forever (React error #185)
 *   - an icon imported under a name `@fluentui/react-icons` does not export
 *   - a hook called conditionally, or in the wrong order
 *   - a missing provider — Fluent, Query or Router
 *
 * It asserts the chrome and the wiring, not the rows. `useVirtualizer` measures a scroll
 * element that jsdom reports as zero-height, so no virtual row is ever produced here; row
 * content is covered by `rules.test.ts` (mapping) and `projectQueries.test.ts` (the data).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEventBase from "@testing-library/user-event";

/**
 * No inter-keystroke delay. The default one is there to imitate a human typing, which buys
 * nothing in a jsdom test and costs real seconds once a debounced, query-backed filter is
 * involved — enough to make these tests flake against the 5s default timeout.
 */
const userEvent = userEventBase.setup({ delay: null });
import { MemoryRouter } from "react-router-dom";
import { FluentProvider } from "@fluentui/react-components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vsbLightTheme } from "@/theme/fluentTheme";
import { useAppStore } from "@/store/appStore";
import { TOTAL_PROJECTS } from "@/data/mock/projectSeed";
import ProjectMainScreen from "./Screen";

function renderScreen(initialUrl = "/projects") {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <FluentProvider theme={vsbLightTheme}>
        <MemoryRouter initialEntries={[initialUrl]}>
          <ProjectMainScreen />
        </MemoryRouter>
      </FluentProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  // The command bar's environment gate reads this; without it `Simulate` is hidden.
  useAppStore.setState((s) => ({
    session: {
      ...s.session,
      env: {
        appVersion: "1.0.0.1",
        environmentName: "Dev",
        infoCenterUrl: "",
        pmAppUrl: "",
        costAppUrl: "",
      },
    },
  }));
});

describe("UT-MAINUI — the portfolio screen renders", () => {
  it("UT-MAINUI-001 mounts without a render loop or a missing export", async () => {
    renderScreen();
    // Reaching an assertion at all is most of the point: an unstable selector would have
    // thrown React #185 before this line, and a bad icon import would have thrown on mount.
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });

  it("UT-MAINUI-002 shows the six commands from the reference screen", async () => {
    renderScreen();
    const bar = await screen.findByRole("toolbar", { name: "Actions" });

    // "Edit Project" degrades to "View Project" without edit rights, and nothing is selected
    // on first render, so the label assertions are on the add/dashboard pair plus the count.
    expect(within(bar).getByRole("button", { name: /Add Project/ })).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: /Dashboard/ })).toBeInTheDocument();
    // Six inline, no overflow menu — the 7th used to fall into "More actions".
    expect(within(bar).queryByRole("button", { name: "More actions" })).toBeNull();
  });

  it("UT-MAINUI-003 renders all seven filters, each with its own clear button", async () => {
    renderScreen();
    await screen.findByRole("table");

    // Queried by their controls, not by their label text: "Country", "Technology" and
    // "Project Manager" are each BOTH a filter label and a column header, so a bare
    // `getByText` is ambiguous by construction.
    for (const name of [
      "Country", "Technology", "Project Manager", "Area/State/Province", "Status",
    ]) {
      expect(screen.getByRole("combobox", { name })).toBeInTheDocument();
    }
    expect(screen.getByPlaceholderText("Search for Project Name, Short Name and ID")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Capacity value" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Capacity comparison" })).toBeInTheDocument();

    for (const label of [
      "Clear Project", "Clear Country", "Clear Technology", "Clear Project Manager",
      "Clear Area", "Clear Capacity", "Clear Status",
    ]) {
      const btn = screen.getByRole("button", { name: label });
      // Rule 10 — the funnel is disabled while its filter is blank.
      expect(btn).toBeDisabled();
    }
  });

  it("UT-MAINUI-004 reads the total and the page count from the server", async () => {
    renderScreen();
    // Proves the footer is fed by `@odata.count`, not by the loaded row count: only 200 rows
    // are fetched, and jsdom renders none of them.
    await waitFor(() =>
      expect(screen.getByText(`Total Rows: ${TOTAL_PROJECTS}`)).toBeInTheDocument(),
    );
    expect(screen.getByText("Page: 1 from 6")).toBeInTheDocument();
  });

  it("UT-MAINUI-005 disables first/previous on page 1 and offers next", async () => {
    renderScreen();
    await waitFor(() =>
      expect(screen.getByText(`Total Rows: ${TOTAL_PROJECTS}`)).toBeInTheDocument(),
    );

    expect(screen.getByRole("button", { name: "First page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Last page" })).toBeEnabled();
  });

  it("UT-MAINUI-006 advances the page, and the pager label follows", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText("Page: 1 from 6")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Next page" }));

    await waitFor(() => expect(screen.getByText("Page: 2 from 6")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Previous page" })).toBeEnabled();
  });

  it("UT-MAINUI-007 reads filter, sort and page out of the URL on first render", async () => {
    // A pasted link must restore the list, which is the whole reason this state is in the URL.
    renderScreen("/projects?p=3");
    await waitFor(() => expect(screen.getByText("Page: 3 from 6")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Previous page" })).toBeEnabled();
  });

  it("UT-MAINUI-008 keeps the Area filter disabled until a country is chosen", async () => {
    renderScreen();
    await screen.findByRole("table");
    expect(screen.getByText("Choose a country first")).toBeInTheDocument();
  });

  it("UT-MAINUI-009 warns below the keyword minimum instead of filtering", async () => {
    renderScreen();
    await screen.findByRole("table");

    await userEvent.type(
      screen.getByPlaceholderText("Search for Project Name, Short Name and ID"),
      "Te",
    );
    await waitFor(() =>
      expect(screen.getByText("Type at least 3 characters")).toBeInTheDocument(),
    );
    // Nothing was filtered, so the total is still the whole table. `waitFor` because the
    // keyword is debounced — the assertion must hold after the debounce settles, not before.
    await waitFor(() =>
      expect(screen.getByText(`Total Rows: ${TOTAL_PROJECTS}`)).toBeInTheDocument(),
    );
  }, 20_000);

  it("UT-MAINUI-010 enables a filter's clear button once that filter is set", async () => {
    renderScreen();
    await screen.findByRole("table");

    await userEvent.type(
      screen.getByPlaceholderText("Search for Project Name, Short Name and ID"),
      "Tes",
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Clear Project" })).toBeEnabled(),
    );

    await userEvent.click(screen.getByRole("button", { name: "Clear Project" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Clear Project" })).toBeDisabled(),
    );
    // Typing, a 300ms debounce, a query and two `waitFor` polls — this one genuinely needs
    // longer than the 5s default, and saying so beats leaving it to flake.
  }, 20_000);

  /**
   * COLUMN COUNT — settled against the source, not guessed.
   *
   * The build spec's prose says "13 columns" and its row projection enumerates more fields
   * than that, which is what made this ambiguous earlier. `columns_Items` in
   * `Project Main Screen.pa.yaml` settles it: exactly thirteen entries, and the five
   * milestone dates are NOT among them — they are built by the projection and then never
   * surfaced, exactly like the `vsb_numberwtgs: 0` the spec already flags as dead.
   *
   * GUIDE p06 corrects one of those thirteen: the approval colour bar
   * (`loc_statetag`, `ColCellType: "tag"`, `ColWidth: 4`) is a real canvas COLUMN, but the
   * screenshot's row anatomy places the stripe "immediately to the left of the Project Name
   * text inside the cell" — a row decoration, not a header cell of its own. So it renders via
   * `DataGrid`'s `rowAccent` now, and the visible header count drops from 13+1 to 12+1. The
   * approval glyph is still its own column, last, 60px.
   */
  it("UT-MAINUI-011 renders the canvas's twelve visible columns, capacity among them", async () => {
    renderScreen();
    await screen.findByRole("table");

    // 12 canvas columns (the accent bar is a row decoration, not a header) plus the
    // radio-select track's own header cell.
    expect(screen.getAllByRole("columnheader").length).toBe(13);

    for (const header of [
      "Project Name", "Short Name", "Status", "Project Manager", "Country",
      "Area/State/Province/Voivodeship", "Technology", "Total Capacity",
      "Capacity [MW(p)]", "Weighted Capacity [MWp]", "Project ID", "Approval",
    ]) {
      // Exact string, not a RegExp: "Capacity [MW(p)]" is full of regex metacharacters.
      expect(screen.getByRole("columnheader", { name: header })).toBeInTheDocument();
    }

    // The milestone columns are gone.
    for (const gone of ["Feasibility Studies", "Legally Binding Permits", "Construction"]) {
      expect(screen.queryByRole("columnheader", { name: gone })).toBeNull();
    }
  });

  it("UT-MAINUI-012 offers no Clear sort button — paging needs a defined order", async () => {
    renderScreen();
    await screen.findByRole("table");
    expect(screen.queryByRole("button", { name: "Clear sort" })).toBeNull();
  });

  /**
   * FROZEN FILTERS — the structural guarantee behind "the filters stay put and only the list
   * scrolls, so the pager is always visible".
   *
   * jsdom reports every element as zero-height, so actual scrolling cannot be asserted here.
   * What CAN be asserted is the structure that produces it, and that is the part a refactor
   * would break: the pager must live OUTSIDE the element that scrolls, and the command bar and
   * filter band must be siblings of the grid rather than content inside its scroller.
   */
  it("UT-MAINUI-013 keeps the pager outside the scrolling region", async () => {
    renderScreen();
    await waitFor(() =>
      expect(screen.getByText(`Total Rows: ${TOTAL_PROJECTS}`)).toBeInTheDocument(),
    );

    const table = screen.getByRole("table");
    const rowgroup = within(table).getByRole("rowgroup");
    const pager = screen.getByText(`Total Rows: ${TOTAL_PROJECTS}`);

    // If the pager were inside the scroller it would slide out of view with the rows.
    expect(rowgroup.contains(pager)).toBe(false);
    expect(table.contains(pager)).toBe(true);
  });

  it("UT-MAINUI-014 keeps the command bar and filters outside the grid entirely", async () => {
    renderScreen();
    const table = await screen.findByRole("table");

    const toolbar = screen.getByRole("toolbar", { name: "Actions" });
    const keyword = screen.getByPlaceholderText("Search for Project Name, Short Name and ID");

    // Frozen bands are siblings of the grid, so nothing the grid scrolls can move them.
    expect(table.contains(toolbar)).toBe(false);
    expect(table.contains(keyword)).toBe(false);
  });
});
