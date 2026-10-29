import { describe, expect, it } from "vitest";
import type { CostLine } from "../costing/model";
import {
  PAID_CONFIRM_BOX_HEIGHT, PAID_CONFIRM_DESCRIPTION, PAID_CONFIRM_TEXT_HEIGHT,
  PAID_CONFIRM_TITLE,
  RECALCULATE_ALLOCATED_COST, SAVING_COST, SAVING_COSTS,
  allocatedCostLabel, capexWriteStatusLabel, clusterCheckboxState, confirmButtonWidth,
  defaultSelectedYear,
  distributionLocked, enabledClusters, gridActionAllowed, isoToMonthYear, monthYearLabel,
  monthYearToIso,
  onStartSelectedYear, previousYearFloor, recalculateEnabled, recalculateVisible, recalculatedPayments,
  savingCostLabel, standardContractLoadingLabel,
} from "./panelRules";
import { COMMENTS_SAVING } from "./comments";
// The shared D57 guard (rule 17); its own cases are in `src/domain/writeGuard.test.ts`.
import { writeCommandsDisabled } from "@/domain/writeGuard";

/** A minimal individual/absolute contract; each test overrides only what it is about. */
const line = (patch: Partial<CostLine> = {}): CostLine => ({
  id: "l1", accountId: "sub-1", description: "New Contract", payer: "SPV",
  depreciation: false, vat: false, standard: false,
  distribution: "individual", equalMode: "cluster", distributionScheme: "absolute",
  startDate: "", endDate: "", frequency: 1, clusters: [], payments: [], comments: [],
  ...patch,
});

describe("clusterCheckboxState", () => {
  it("enables every cluster for a greenfield project", () => {
    for (const n of [1, 2, 3, 4, 5]) {
      expect(clusterCheckboxState(n, 0, true)).toEqual({ checked: true, enabled: true });
    }
  });

  it("treats a missing start cluster as greenfield", () => {
    expect(clusterCheckboxState(1, undefined, true)).toEqual({ checked: true, enabled: true });
  });

  it("disables clusters the project has already passed", () => {
    expect(clusterCheckboxState(1, 3, true)).toEqual({ checked: false, enabled: false });
    expect(clusterCheckboxState(2, 3, true)).toEqual({ checked: false, enabled: false });
    expect(clusterCheckboxState(3, 3, true)).toEqual({ checked: true, enabled: true });
    expect(clusterCheckboxState(5, 3, true)).toEqual({ checked: true, enabled: true });
  });

  it("reads back UNTICKED for a gated cluster even when the stored JSON says otherwise", () => {
    expect(clusterCheckboxState(1, 4, true).checked).toBe(false);
  });

  it("leaves an unticked, enabled cluster unticked", () => {
    expect(clusterCheckboxState(4, 2, false)).toEqual({ checked: false, enabled: true });
  });
});

describe("enabledClusters", () => {
  it("drops clusters below the project's start cluster", () => {
    expect(enabledClusters([1, 2, 3, 4, 5], 3)).toEqual([3, 4, 5]);
  });
  it("keeps everything for a greenfield project", () => {
    expect(enabledClusters([1, 2], 0)).toEqual([1, 2]);
    expect(enabledClusters([1, 2], undefined)).toEqual([1, 2]);
  });
});

describe("allocatedCostLabel", () => {
  it("renders the currency code for an absolute scheme", () => {
    expect(allocatedCostLabel(0, "absolute", "EUR")).toBe("Allocated Cost: 0 EUR");
    expect(allocatedCostLabel(1234.6, "absolute", "PLN")).toBe("Allocated Cost: 1235 PLN");
  });

  it("renders a percentage, to one decimal, for a % scheme", () => {
    expect(allocatedCostLabel(33.333, "percent", "EUR")).toBe("Allocated Cost: 33.3 %");
    expect(allocatedCostLabel(100, "percent", "EUR")).toBe("Allocated Cost: 100 %");
  });

  it("never hard-codes EUR", () => {
    expect(allocatedCostLabel(10, "absolute", "SEK")).toContain("SEK");
  });
});

describe("monthYearLabel", () => {
  it("is the full month name plus the year", () => {
    expect(monthYearLabel(1, 2020)).toBe("January 2020");
    expect(monthYearLabel(12, 2031)).toBe("December 2031");
  });
  it("does not crash on an out-of-range month", () => {
    expect(monthYearLabel(0, 2020)).toBe("2020");
    expect(monthYearLabel(13, 2020)).toBe("2020");
  });
});

describe("isoToMonthYear / monthYearToIso", () => {
  it("converts a stored ISO date to what the box shows", () => {
    expect(isoToMonthYear("2025-04-01")).toBe("04/2025");
    expect(isoToMonthYear("2027-07-31")).toBe("07/2027");
    expect(isoToMonthYear("2025-04")).toBe("04/2025");
  });

  it("passes an already-MM/YYYY value straight through", () => {
    expect(isoToMonthYear("12/2017")).toBe("12/2017");
  });

  it("yields an empty box for anything unusable", () => {
    expect(isoToMonthYear("")).toBe("");
    expect(isoToMonthYear(undefined)).toBe("");
    expect(isoToMonthYear("not a date")).toBe("");
    expect(isoToMonthYear("2025-13-01")).toBe("");
  });

  it("stores the first of the typed month", () => {
    expect(monthYearToIso("04/2025")).toBe("2025-04-01");
    expect(monthYearToIso(" 12/2017 ")).toBe("2017-12-01");
  });

  it("stores nothing until the typed value is a complete MM/YYYY", () => {
    expect(monthYearToIso("04/")).toBe("");
    expect(monthYearToIso("4/2025")).toBe("");
    expect(monthYearToIso("13/2025")).toBe("");
    expect(monthYearToIso("")).toBe("");
  });

  it("round-trips", () => {
    expect(monthYearToIso(isoToMonthYear("2019-06-01"))).toBe("2019-06-01");
  });
});

describe("defaultSelectedYear", () => {
  const today = new Date(2026, 0, 15);

  it("prefers the year the user already chose", () => {
    expect(defaultSelectedYear({
      selectedYear: 2022, costAllowedStartYear: 2015,
      navigationMinYear: 2015, navigationMaxYear: 2030, today,
    })).toBe(2022);
  });

  it("falls back to the cost-allowed start year, not to today", () => {
    expect(defaultSelectedYear({
      selectedYear: null, costAllowedStartYear: 2017,
      navigationMinYear: 2015, navigationMaxYear: 2030, today,
    })).toBe(2017);
  });

  it("falls back to the navigation minimum when there is no allowed start", () => {
    expect(defaultSelectedYear({
      selectedYear: null, navigationMinYear: 2015, navigationMaxYear: 2030, today,
    })).toBe(2015);
  });

  it("falls back to today's year when nothing is known", () => {
    expect(defaultSelectedYear({ selectedYear: null, today })).toBe(2026);
  });

  it("clamps into the navigation window", () => {
    expect(defaultSelectedYear({
      selectedYear: 1999, navigationMinYear: 2015, navigationMaxYear: 2030, today,
    })).toBe(2015);
    expect(defaultSelectedYear({
      selectedYear: 2099, navigationMinYear: 2015, navigationMaxYear: 2030, today,
    })).toBe(2030);
  });

  it("never inverts an impossible window", () => {
    expect(defaultSelectedYear({
      selectedYear: null, navigationMinYear: 2030, navigationMaxYear: 2015, today,
    })).toBe(2030);
  });
});

describe("onStartSelectedYear", () => {
  const today = new Date(2026, 9, 26);

  it("opens on this year, not on a past project start (the 2015 regression)", () => {
    expect(onStartSelectedYear({ startDate: new Date(2015, 0, 20) }, 0, today)).toBe(2026);
  });

  it("opens on a FUTURE start year for a greenfield project", () => {
    expect(onStartSelectedYear({ startDate: new Date(2028, 5, 1) }, 0, today)).toBe(2028);
  });

  it("reads the acquisition date, not the start date, beyond greenfield", () => {
    const anchors = { startDate: new Date(2030, 0, 1), acquisitionDate: new Date(2027, 3, 27) };
    expect(onStartSelectedYear(anchors, 3, today)).toBe(2027);
    expect(onStartSelectedYear(anchors, 0, today)).toBe(2030);
  });

  it("falls back to this year when the date is missing", () => {
    expect(onStartSelectedYear({}, 3, today)).toBe(2026);
    expect(onStartSelectedYear({}, undefined, today)).toBe(2026);
  });

  it("is still clamped into a finished project's window by defaultSelectedYear", () => {
    expect(defaultSelectedYear({
      selectedYear: onStartSelectedYear({ startDate: new Date(2015, 0, 1) }, 0, today),
      costAllowedStartYear: 2015, navigationMinYear: 2015, navigationMaxYear: 2019, today,
    })).toBe(2019);
  });
});

describe("previousYearFloor", () => {
  const today = new Date(2026, 0, 15);

  it("is the cost-allowed start year, which can be LATER than the dropdown's minimum", () => {
    expect(previousYearFloor({
      costAllowedStartYear: 2019, navigationMinYear: 2015, today,
    })).toBe(2019);
  });

  it("falls back to the navigation minimum", () => {
    expect(previousYearFloor({ navigationMinYear: 2015, today })).toBe(2015);
  });

  it("falls back to today's year", () => {
    expect(previousYearFloor({ today })).toBe(2026);
  });
});

describe("spinner text", () => {
  /*
   * `LOADING_COST` ("Please wait, loading cost ...") and `LOADING_DATA` ("Please wait, loading
   * data...") were pinned here too. D57 removed the two load spinners that showed them, so both
   * constants — and their two assertions — went with them.
   */
  it("matches the canvas strings", () => {
    expect(standardContractLoadingLabel("Grid Connection Fee"))
      .toBe("Please wait, loading standard contract : 'Grid Connection Fee' ...");
  });

  /**
   * The two save branches of `CapexScreenCode.txt:17413` set different strings — singular for
   * an individual distribution, plural for an equal one. The client's reference screenshot is
   * the singular one.
   */
  it("says 'the cost' for an individual distribution and 'costs' for an equal one", () => {
    expect(SAVING_COST).toBe("Please wait, saving the cost...");
    expect(SAVING_COSTS).toBe("Please wait, saving costs...");
    expect(savingCostLabel("individual")).toBe("Please wait, saving the cost...");
    expect(savingCostLabel("equal")).toBe("Please wait, saving costs...");
  });
});

/** D57 — no spinners; the write guard and the status line that replaced the overlay. */
describe("write guard and status line (D57)", () => {
  it("UT-CAPEX-NOSPIN-001 greys the write commands while a write is pending", () => {
    expect(writeCommandsDisabled({ loading: false, writePending: true })).toBe(true);
  });

  it("UT-CAPEX-NOSPIN-002 greys them while the cost book is still loading", () => {
    expect(writeCommandsDisabled({ loading: true, writePending: false })).toBe(true);
  });

  it("UT-CAPEX-NOSPIN-003 enables them once loaded with nothing pending", () => {
    expect(writeCommandsDisabled({ loading: false, writePending: false })).toBe(false);
  });

  it("UT-CAPEX-NOSPIN-004 ignores every write-starting grid action while disabled", () => {
    for (const action of [
      "Add", "Edit", "Delete", "AddStandardContract", "SetCostPaidUnpaid", "Comment",
    ]) {
      expect(gridActionAllowed(action, true)).toBe(false);
      expect(gridActionAllowed(action, false)).toBe(true);
    }
  });

  it("UT-CAPEX-NOSPIN-005 lets any other grid action through even while disabled", () => {
    expect(gridActionAllowed("ExpandCollapse", true)).toBe(true);
  });

  it("UT-CAPEX-NOSPIN-006 shows nothing when no write is pending", () => {
    expect(capexWriteStatusLabel({
      pending: false, standardName: "Grid Connection Fee", savingLabel: SAVING_COST,
    })).toBeNull();
  });

  it("UT-CAPEX-NOSPIN-007 keeps the overlay's precedence: standard, then panel save, then costs", () => {
    expect(capexWriteStatusLabel({
      pending: true, standardName: "Grid Connection Fee", savingLabel: SAVING_COST,
    })).toBe("Please wait, loading standard contract : 'Grid Connection Fee' ...");
    expect(capexWriteStatusLabel({ pending: true, standardName: null, savingLabel: SAVING_COST }))
      .toBe("Please wait, saving the cost...");
    // The Paid toggle and Delete latch no label of their own.
    expect(capexWriteStatusLabel({ pending: true, standardName: null, savingLabel: null }))
      .toBe("Please wait, saving costs...");
  });

  it("UT-CAPEX-NOSPIN-016 a comments commit alone shows the verbatim 'Saving comments...'", () => {
    expect(capexWriteStatusLabel({
      pending: false, standardName: null, savingLabel: null, commentsSaving: true,
    })).toBe(COMMENTS_SAVING);
    expect(COMMENTS_SAVING).toBe("Saving comments...");
  });

  it("UT-CAPEX-NOSPIN-017 a cost write outranks a comments commit, and neither means no line", () => {
    expect(capexWriteStatusLabel({
      pending: true, standardName: null, savingLabel: SAVING_COST, commentsSaving: true,
    })).toBe("Please wait, saving the cost...");
    expect(capexWriteStatusLabel({
      pending: false, standardName: null, savingLabel: null, commentsSaving: false,
    })).toBeNull();
  });
});

describe("set-as-Paid confirmation copy", () => {
  /** `cmp_PopUp_Confirmation_For_SetasPaidUnpaidCostConfirmation.Title` (`:19879`). */
  it("keeps the canvas title verbatim", () => {
    expect(PAID_CONFIRM_TITLE).toBe("Cluster-linked Costs");
  });

  /**
   * `…Description` (`:19869`), verbatim — including the typographic ‘ ’ around Paid. Pinned
   * character-for-character so a tidy-up cannot re-paraphrase it back to "cluster-linked".
   */
  it("keeps the canvas description verbatim, typographic quotes included", () => {
    expect(PAID_CONFIRM_DESCRIPTION).toBe(
      "Setting the milestone-linked cost to ‘Paid’ will remove the milestone link"
      + " for all costs in the contract. Do you want to proceed?",
    );
    expect(PAID_CONFIRM_DESCRIPTION).toContain("‘Paid’");
    expect(PAID_CONFIRM_DESCRIPTION).not.toContain("'Paid'");
  });

  /**
   * SOURCE DEFECT: the canvas title says "Cluster-linked" and its body says "milestone-linked"
   * for the same concept. Both halves are reproduced as written; reconciling them is a product
   * decision (02-OPEN-DECISIONS D38/D39), so this pins the inconsistency itself.
   */
  it("reproduces the canvas's own title/body inconsistency rather than reconciling it", () => {
    expect(PAID_CONFIRM_TITLE).toContain("Cluster-linked");
    expect(PAID_CONFIRM_DESCRIPTION).toContain("milestone-linked");
    expect(PAID_CONFIRM_DESCRIPTION).toContain("milestone link");
    expect(PAID_CONFIRM_DESCRIPTION).not.toContain("cluster");
    expect(PAID_CONFIRM_DESCRIPTION).not.toContain("Cluster");
  });

  /**
   * `BoxHeight: =200` (`:19868`) and `TextHeight: =75` (`:19878`) — LITERALS on this instance,
   * where the relink dialog computes both from its message count in `rules.ts`. Pinned here so
   * the two dialogs' dimensions cannot be "unified" by someone who sees only one of them: 75 is
   * not the 60 the relink dialog uses at a single message.
   */
  it("carries the canvas card and band heights for this instance", () => {
    expect(PAID_CONFIRM_BOX_HEIGHT).toBe(200);
    expect(PAID_CONFIRM_TEXT_HEIGHT).toBe(75);
  });
});

describe("confirmButtonWidth", () => {
  /** `WidthConfirmButton` (`:19971-19980`) shares its predicate with `TextConfirmButton`. */
  it("widens to 120 only for the Confirm All label", () => {
    expect(confirmButtonWidth("Confirm All")).toBe(120);
    expect(confirmButtonWidth("Confirm")).toBe(96);
    expect(confirmButtonWidth("Delete")).toBe(96);
  });
});

describe("distributionLocked", () => {
  /** `=If(Not(locSelectedCostRow.IsContract), DisplayMode.Edit, DisplayMode.View)`. */
  it("locks the two radio groups once the panel is on an existing contract", () => {
    expect(distributionLocked(true)).toBe(true);
    expect(distributionLocked(false)).toBe(false);
  });
});

describe("Recalculate Allocated Cost", () => {
  it("carries the canvas label", () => {
    expect(RECALCULATE_ALLOCATED_COST).toBe("Recalculate Allocated Cost");
  });

  /** `Visible: =DistributionType = 'Individual Distribution'` (`:17992`). */
  it("is present only for an individual distribution", () => {
    expect(recalculateVisible(line({ distribution: "individual" }))).toBe(true);
    expect(recalculateVisible(line({ distribution: "equal" }))).toBe(false);
    expect(recalculateVisible(null)).toBe(false);
  });

  /** `DisplayMode` (`:17541-17555`) — `Or(total entered, individual && absolute)` && save gate. */
  describe("recalculateEnabled", () => {
    it("needs no total at all for an absolute individual distribution", () => {
      expect(recalculateEnabled({
        line: line({ distributionScheme: "absolute" }), costValue: "", saveEnabled: true,
      })).toBe(true);
    });

    it("needs a total for a percent individual distribution", () => {
      const pct = line({ distributionScheme: "percent" });
      expect(recalculateEnabled({ line: pct, costValue: "", saveEnabled: true })).toBe(false);
      expect(recalculateEnabled({ line: pct, costValue: "1000", saveEnabled: true })).toBe(true);
    });

    it("stays disabled while the save gate is closed", () => {
      expect(recalculateEnabled({
        line: line(), costValue: "1000", saveEnabled: false,
      })).toBe(false);
    });

    it("is closed with no line open", () => {
      expect(recalculateEnabled({ line: null, costValue: "1000", saveEnabled: true })).toBe(false);
    });
  });

  /** `colNewEditPanelCostProcessed` (`:17558-17990`) — sanitise, and round the Save values. */
  describe("recalculatedPayments", () => {
    it("drops a month whose box is not a number", () => {
      const result = recalculatedPayments([
        { year: 2020, month: 1, amount: 100, paid: false },
        { year: 2020, month: 2, amount: Number.NaN, paid: false },
      ], "absolute");
      expect(result).toEqual([{ year: 2020, month: 1, amount: 100, paid: false }]);
    });

    it("rounds an absolute month to whole currency units", () => {
      expect(recalculatedPayments(
        [{ year: 2020, month: 1, amount: 1250.6, paid: false }], "absolute",
      )).toEqual([{ year: 2020, month: 1, amount: 1251, paid: false }]);
    });

    it("leaves a percent month exactly as typed", () => {
      // The canvas stores `JanUI: JanUIv` raw and rounds only the `JanSv` mirror, which
      // `resolvedPayments` recomputes on every render.
      expect(recalculatedPayments(
        [{ year: 2020, month: 1, amount: 33.33, paid: false }], "percent",
      )).toEqual([{ year: 2020, month: 1, amount: 33.33, paid: false }]);
    });

    it("keeps the row ids, so the save still updates rather than re-creates", () => {
      expect(recalculatedPayments(
        [{ id: "cost-1", year: 2020, month: 1, amount: 5, paid: true }], "absolute",
      )).toEqual([{ id: "cost-1", year: 2020, month: 1, amount: 5, paid: true }]);
    });

    it("does not mutate what it was given", () => {
      const payments = [{ year: 2020, month: 1, amount: 1.4, paid: false }];
      recalculatedPayments(payments, "absolute");
      expect(payments).toEqual([{ year: 2020, month: 1, amount: 1.4, paid: false }]);
    });
  });
});
