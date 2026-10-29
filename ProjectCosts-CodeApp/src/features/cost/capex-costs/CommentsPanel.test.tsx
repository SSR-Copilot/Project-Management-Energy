// @vitest-environment jsdom
/**
 * Render tests for the DEVEX/CAPEX comments panel.
 *
 * `comments.test.ts` covers the decisions; this file covers the layout transcribed from
 * `ProjectDocs/Existing Solution/UI Screenshots/Cost App - Comment Panel contract Row - *.png` and the two
 * things the client reported wrong: the Year/Month gate that stops a payment-date comment being
 * saved with no cost row (the invisible-comment defect behind the missing red dot), and the
 * "Saving comments..." indicator — a blocking overlay until D58, now a non-blocking
 * `WriteStatus` line with the write controls greyed instead.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { vsbTheme } from "@/theme/fluent";
import { COMMENT_TYPE, commentsSaveFailed, type CapexComment } from "./comments";
import type { Payment } from "../costing/model";

let data: CapexComment[] | undefined;
let isLoading = false;
const saveMutation = { mutateAsync: vi.fn(async () => "new-id"), isPending: false };
const removeMutation = { mutateAsync: vi.fn(async () => undefined), isPending: false };
const invalidate = vi.fn();

/** CA-15 — the project-wide "Cost write in flight" flag and the failure reporter. */
vi.mock("@/features/cost/costing/useCostWriteFlight", () => ({
  useCostWriteInFlight: () => false,
  useWriteFailureReport: () => (text: string, show?: (t: string) => void) => { show?.(text); },
}));
vi.mock("@/features/cost/costing/useCostBook", () => ({
  useCapexComments: () => ({ data, isLoading }),
  useCommentWrites: () => ({ save: saveMutation, remove: removeMutation, invalidate }),
}));
vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({
    session: { fullName: "Shakti Singh Rajput", entraObjectId: "entra-1" },
  }),
}));

import { CommentsPanel } from "./CommentsPanel";

const comment = (over: Partial<CapexComment> = {}): CapexComment => ({
  id: "c1", text: "Test Comment", contractId: "contract-1", costId: null,
  parentId: null, rootId: null, commentType: COMMENT_TYPE.general,
  resolved: false, resolvedById: null, createdOn: "2026-09-14T13:30:00",
  createdByName: "Shakti Singh Rajput", ...over,
});

const payment = (year: number, month: number, id: string): Payment =>
  ({ id, year, month, amount: 100, paid: false });

const PAYMENTS = [payment(2026, 1, "cost-jan"), payment(2026, 3, "cost-mar")];

function mount(over: Partial<Parameters<typeof CommentsPanel>[0]> = {}) {
  return render(
    <FluentProvider theme={vsbTheme}>
      <CommentsPanel
        open contractId="contract-1"
        contractDescription="Gesamt (CAPEX_after_FID) (59018_0_47110101)"
        breadcrumb="Wind Turbine / Panels / Turbine / PV Supply Agreement"
        payments={PAYMENTS} distribution="individual" onDismiss={vi.fn()} {...over}
      />
    </FluentProvider>,
  );
}

/** The Save button in the panel footer. */
const saveButton = () => screen.getByRole("button", { name: "Save" });

describe("CommentsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // UT-CMT-058 swaps in a promise that never settles; restore the default so later tests do
    // not inherit it.
    saveMutation.mutateAsync = vi.fn(async () => "new-id");
    removeMutation.mutateAsync = vi.fn(async () => undefined);
    isLoading = false;
    data = [comment()];
  });

  it("UT-CMT-051 shows the header, breadcrumb and the Sort by / pin / resolved filters", () => {
    mount();
    // `Label1.Text`, CapexScreenCode.txt:8073-8081 — `Left("Comments : " & Name, 45) & "..."`,
    // so the 45 includes the prefix and the name gets 34 characters.
    expect(screen.getByText("Comments : Gesamt (CAPEX_after_FID) (59018_0_..."))
      .toBeTruthy();
    // `Label5.Text`, :8147-8155 — the same shape at 50. The screenshot's
    // "Wind Turbine / Panels / Turbine / PV Supply Agreem..." is exactly 50 + the ellipsis.
    expect(screen.getByText("Wind Turbine / Panels / Turbine / PV Supply Agreem..."))
      .toBeTruthy();
    expect(screen.getByText("Sort by")).toBeTruthy();
    expect(screen.getByText("Date added [Oldest]")).toBeTruthy();
    // Pin general comments to top defaults ON, Show resolved comments defaults OFF.
    expect(screen.getByRole("checkbox", { name: "Pin general comments to top" }))
      .toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Show resolved comments" }))
      .not.toBeChecked();
  });

  it("UT-CMT-052 renders a saved thread as Comment #01 [name - dd.MM.yyyy] with four actions", () => {
    mount();
    expect(screen.getByText("Comment #01 [Shakti Singh Rajput - 14.09.2026]")).toBeTruthy();
    for (const name of ["Reply", "Mark as Resolved", "Edit", "Delete"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
    // Read-only Type / Comment pairs, not editors.
    expect(screen.getByText("Type")).toBeTruthy();
    expect(screen.getByText("General Comment")).toBeTruthy();
    expect(screen.getByText("Test Comment")).toBeTruthy();
  });

  it("UT-CMT-053 Save is disabled until something changes", () => {
    mount();
    expect(saveButton()).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Add Comment" }));
    // A new draft is blank, so Save stays refused (canSaveComments).
    expect(saveButton()).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Comment" }), {
      target: { value: "Added General Comment" },
    });
    expect(saveButton()).toBeEnabled();
  });

  it("UT-CMT-054 a draft card shows Comment #NN, a Type dropdown and the n / 250 counter", () => {
    data = [];
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Add Comment" }));
    expect(screen.getByText("Comment #01")).toBeTruthy();
    expect(screen.getByText("Type")).toBeTruthy();
    expect(screen.getByText("0 / 250")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Comment" }), {
      target: { value: "abc" },
    });
    expect(screen.getByText("3 / 250")).toBeTruthy();
    // General is the default, so no payment date is asked for yet.
    expect(screen.queryByText("Year")).toBeNull();
    expect(screen.queryByText("Month")).toBeNull();
  });

  it("UT-CMT-055 a reply card reads 'Reply to comment' and offers no Type", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    expect(screen.getByText("Reply to comment")).toBeTruthy();
    // The only Type on screen is the saved thread's read-only one.
    expect(screen.getAllByText("Type")).toHaveLength(1);
  });

  it("UT-CMT-056 an existing payment-date comment with no cost blocks Save until a month is picked", () => {
    // The live row e2ec8083-12b0-f111-aaac-7ced8d975a55: type "Comments to payment date",
    // `vsb_capexcost` NULL. It renders no red dot anywhere, so the panel must not let it be
    // saved back in that state.
    data = [comment({ commentType: COMMENT_TYPE.paymentDate, costId: null, text: "New Test" })];
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Comment" }), {
      target: { value: "New Test edited" },
    });
    expect(screen.getByText("Required")).toBeTruthy();
    expect(saveButton()).toBeDisabled();
  });

  it("UT-CMT-057 the Type dropdown cannot offer payment date when the contract has no costs", () => {
    data = [];
    mount({ payments: [] });
    fireEvent.click(screen.getByRole("button", { name: "Add Comment" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Type" }));
    expect(screen.getByRole("option", { name: "Comments to payment date" }))
      .toHaveAttribute("aria-disabled", "true");
  });

  it("UT-CMT-058 the saving status covers the whole commit, not one mutation at a time", async () => {
    data = [comment({ id: "old-1", text: "To delete" })];
    let release = () => {};
    // Two sequential writes (a delete, then a save), so the status must survive the gap between.
    let releaseDelete = () => {};
    removeMutation.mutateAsync = vi.fn(
      () => new Promise<undefined>((resolve) => { releaseDelete = () => resolve(undefined); }),
    );
    saveMutation.mutateAsync = vi.fn(
      () => new Promise<string>((resolve) => { release = () => resolve("new-id"); }),
    );
    const onSavingChange = vi.fn();
    mount({ onSavingChange });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Comment" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Comment" }), {
      target: { value: "Added General Comment" },
    });
    expect(screen.queryByText("Saving comments...")).toBeNull();

    fireEvent.click(saveButton());
    // The status is driven by one panel-level flag, so it is up while the save is in flight
    // even though `mutation.isPending` is mocked false throughout.
    const label = await screen.findByText("Saving comments...");
    const overlay = screen.getByTestId("capex-comments-write-status");
    // D60: the blocking spinner (modal scrim, spinner, the verbatim text) is up for the commit.
    expect(overlay).toHaveAttribute("role", "dialog");
    expect(overlay).toHaveAttribute("aria-modal", "true");
    expect(overlay.contains(label)).toBe(true);
    expect(overlay.querySelector(".fui-Spinner")).not.toBeNull();
    // It lives OUTSIDE the drawer, which has already closed (decision 7a).
    expect(label.closest(".canvas-panel")).toBeNull();
    expect(label.closest(".canvas-panel-body")).toBeNull();
    expect(onSavingChange).toHaveBeenLastCalledWith(true);

    // Between the delete and the save the status stays up.
    releaseDelete();
    await waitFor(() => expect(saveMutation.mutateAsync).toHaveBeenCalled());
    expect(screen.getByText("Saving comments...")).toBeTruthy();

    // Still blocking in the gap.
    expect(screen.getByTestId("capex-comments-write-status").querySelector(".fui-Spinner")).not.toBeNull();

    release();
    await waitFor(() => expect(screen.queryByText("Saving comments...")).toBeNull());
    expect(screen.getByTestId("capex-comments-write-status")).toHaveAttribute("role", "status");
    expect(document.querySelector(".fui-Spinner")).toBeNull();
    expect(onSavingChange).toHaveBeenLastCalledWith(false);
  });

  it("UT-CMT-BUSY-001 the blocking spinner stays up until the commit REJECTS, then goes", async () => {
    let fail = (_e: Error) => {};
    saveMutation.mutateAsync = vi.fn(
      () => new Promise<string>((_resolve, reject) => { fail = reject; }),
    );
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Add Comment" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Comment" }), { target: { value: "Added" } });
    fireEvent.click(saveButton());
    await screen.findByText("Saving comments...");
    fireEvent.click(screen.getByRole("button", { name: "Add Comment" })); // an extra interaction
    const overlay = screen.getByTestId("capex-comments-write-status");
    expect(overlay).toHaveAttribute("role", "dialog");
    expect(overlay.querySelector(".fui-Spinner")).not.toBeNull();
    fail(new Error("boom"));
    await waitFor(() => expect(screen.queryByText("Saving comments...")).toBeNull());
    expect(document.querySelector(".fui-Spinner")).toBeNull();
  });

  it("UT-CMT-BUSY-002 while the comments load, an inline spinner with the verbatim text shows", () => {
    isLoading = true;
    data = undefined;
    mount();
    const loading = screen.getByTestId("capex-comments-loading");
    expect(loading).toHaveAttribute("role", "status");
    expect(loading).toHaveAttribute("aria-busy", "true");
    expect(loading.querySelector(".fui-Spinner")).not.toBeNull();
    expect(loading).toHaveTextContent("Loading comments...");
    isLoading = false;
    data = [comment()];
  });

  it("UT-CMT-NOSPIN-004 while loading, shows no stale thread, an inline spinner and Add greyed", () => {
    // Contract A opens with its thread on screen and seeded into the panel's working copy…
    data = [comment({ id: "a-1", text: "Thread of contract A", contractId: "contract-1" })];
    const view = mount();
    expect(screen.getByText("Thread of contract A")).toBeTruthy();
    // …then the same panel is re-rendered for contract B while B's comments are still loading.
    // The working copy still holds A's thread until B's rows seed it; it must not show.
    isLoading = true;
    data = undefined;
    view.rerender(
      <FluentProvider theme={vsbTheme}>
        <CommentsPanel
          open contractId="contract-2"
          contractDescription="Gesamt (CAPEX_after_FID) (59018_0_47110101)"
          breadcrumb="Wind Turbine / Panels / Turbine / PV Supply Agreement"
          payments={PAYMENTS} distribution="individual" onDismiss={vi.fn()}
        />
      </FluentProvider>,
    );
    expect(screen.queryByText("Thread of contract A")).toBeNull();
    expect(screen.queryByTestId("btn_Read_Comment_Edit-a-1")).toBeNull();
    expect(screen.getByTestId("capex-comments-list")).toHaveAttribute("aria-busy", "true");
    // D60: the only child is the inline loading spinner.
    expect(screen.getByTestId("capex-comments-list").childElementCount).toBe(1);
    expect(screen.getByTestId("capex-comments-loading")).toHaveTextContent("Loading comments...");
    expect(document.querySelector(".fui-Spinner")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Add Comment" })).toBeDisabled();
  });

  it("UT-CMT-NOSPIN-005 while a commit runs, a still-open panel offers no write control", async () => {
    let release = () => {};
    saveMutation.mutateAsync = vi.fn(
      () => new Promise<string>((resolve) => { release = () => resolve("new-id"); }),
    );
    // `onDismiss` is a mock here, so the panel stays open through the save — the state the
    // screen's own guard (`gridActionAllowed`) refuses to reach by reopening it. This pins the
    // panel's half of the guard: the saved thread's actions and Add Comment are all greyed.
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Add Comment" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Comment" }), {
      target: { value: "Added" },
    });
    fireEvent.click(saveButton());
    await screen.findByText("Saving comments...");

    expect(screen.getByRole("button", { name: "Add Comment" })).toBeDisabled();
    for (const id of [
      "btn_Read_Comment_Reply-c1", "btn_Read_Comment_Check-c1",
      "btn_Read_Comment_Edit-c1", "btn_Read_Comment_Delete-c1",
    ]) {
      expect(screen.getByTestId(id)).toBeDisabled();
    }
    expect(saveButton()).toBeDisabled();
    release();
    await waitFor(() => expect(screen.queryByText("Saving comments...")).toBeNull());
    expect(screen.getByRole("button", { name: "Add Comment" })).toBeEnabled();
  });

  it("UT-CMT-073 a saved payment-date comment reads 'Comments to payment date : January , 2026'", () => {
    // `lbl_Read_Type_Value.Text`, CapexScreenCode.txt:9466-9474 — the type label concatenated
    // with `$" : {Text(RelatedCost.Month)} , {RelatedCost.Year}"`. The read card showed the bare
    // label before this, so the month the comment is actually pinned to was invisible in read
    // mode — you had to open the editor to see it.
    data = [comment({ commentType: COMMENT_TYPE.paymentDate, costId: "cost-jan" })];
    mount();
    expect(screen.getByText("Comments to payment date : January , 2026")).toBeTruthy();
  });

  it("UT-CMT-074 choosing the payment-date type opens an EMPTY Year and Month, and blocks Save", () => {
    // `drp_Draft_Edit_Type_Value.OnChange` patches `{SelectedMonth: Blank(), SelectedYear:
    // Blank()}` (:8995-9009); only `drp_Draft_Edit_Month_Value.OnChange` resolves a CAPEX Cost
    // row (:9229-9252). Auto-selecting the contract's first cost instead silently bound the
    // comment to a month nobody picked.
    data = [];
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Add Comment" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Comment" }), {
      target: { value: "New Test" },
    });
    expect(saveButton()).toBeEnabled();

    fireEvent.click(screen.getByRole("combobox", { name: "Type" }));
    fireEvent.click(screen.getByRole("option", { name: "Comments to payment date" }));

    expect(screen.getByRole("combobox", { name: "Year" }).textContent).toBe("");
    expect(screen.getByRole("combobox", { name: "Month" })).toBeDisabled();
    expect(screen.getByText("Required")).toBeTruthy();
    expect(saveButton()).toBeDisabled();

    // The Year list is the contract's own years, newest first (:9097-9105); picking one opens
    // the Month list but leaves the cost unbound until a month is chosen (:9113).
    fireEvent.click(screen.getByRole("combobox", { name: "Year" }));
    fireEvent.click(screen.getByRole("option", { name: "2026" }));
    expect(saveButton()).toBeDisabled();
    fireEvent.click(screen.getByRole("combobox", { name: "Month" }));
    fireEvent.click(screen.getByRole("option", { name: "March" }));
    expect(saveButton()).toBeEnabled();
  });

  it("UT-CMT-075 an equal-distributed contract freezes Type and explains why", () => {
    // `drp_Draft_Edit_Type_Value.DisplayMode = If(Distribution = 'Equal Distribution',
    // DisplayMode.View, DisplayMode.Edit)` (:8978-8983) plus `con_Draft_Edit_Comment_Warning`
    // (:9362-9406), a 40 px RGBA(225,236,244) strip carrying the line at :9403.
    data = [];
    mount({ distribution: "equal" });
    fireEvent.click(screen.getByRole("button", { name: "Add Comment" }));
    expect(screen.getByText(
      "Payment date comments cannot be added to automatically distributed costs.",
    )).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Type" })).toBeDisabled();
  });

  it("UT-CMT-076 resolving a root closes the editor open on its reply", () => {
    // `img_Read_Comment_Check.OnSelect` patches `{Resolved: Yes, IsModified: true, Resolver: …,
    // IsEdit: false, IsNew: false}` over `Or(LocalID = ThisItem.LocalID, ParentCommentID =
    // GUID(_CurrentId))` (:9677-9690) — so it closes the REPLIES' cards too. The root's own
    // resolve icon lives in `con_Comment_Read_Only`, which is hidden while its editor is open
    // (:9417), so the reply is the only card this can be observed on.
    data = [
      comment(),
      comment({ id: "c2", parentId: "c1", rootId: "c1", text: "Replied Added to Test Comment" }),
    ];
    mount();
    // Keep the thread on screen after it resolves — the gallery filters resolved threads out
    // unless CheckboxCanvas1_1 is checked (:8291).
    fireEvent.click(screen.getByRole("checkbox", { name: "Show resolved comments" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[1] as HTMLElement);
    expect(screen.getByRole("textbox", { name: "Comment" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Mark as Resolved" }));
    expect(screen.queryByRole("textbox", { name: "Comment" })).toBeNull();
    expect(screen.getAllByText("Resolved").length).toBeGreaterThan(0);
    expect(saveButton()).toBeEnabled();
  });

  it("UT-CMT-077 a resolved thread shows the Resolved pill and Reset instead of the four icons", () => {
    // All four carry `Visible: Not(ThisItem.Resolved = Yes)` (:9587, :9640, :9693, :9753); the
    // pill (:9769-9794) and Reset (:9838) are visible on exactly the opposite condition. Show
    // resolved comments must be on for the row to be in the gallery at all (:8291).
    data = [comment({ resolved: true, resolvedById: "entra-1" })];
    mount();
    fireEvent.click(screen.getByRole("checkbox", { name: "Show resolved comments" }));
    expect(screen.getByText("Resolved")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reset" })).toBeTruthy();
    for (const name of ["Reply", "Mark as Resolved", "Edit", "Delete"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });

  it("UT-CMT-078 a saved reply carries a null sequence number and the SAVING user's name", async () => {
    // `Name: $"Comment - {SequenceNumber} - {User().FullName}"` (:10012) with `SequenceNumber`
    // blanked on every non-root (:7435-7439) — the live replies are all `Comment -  - <name>`.
    // The root is untouched here, so the reply is the only write.
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Comment" }), {
      target: { value: "Replied Added to Test Comment" },
    });
    fireEvent.click(saveButton());
    await waitFor(() => expect(saveMutation.mutateAsync).toHaveBeenCalledTimes(1));
    expect(saveMutation.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      id: undefined,
      text: "Replied Added to Test Comment",
      contractId: "contract-1",
      parentId: "c1",
      rootId: "c1",
      sequenceNumber: null,
      authorFullName: "Shakti Singh Rajput",
    }));
  });
  /* ── CA-15 / CA-18: a refused comment write is shown, never swallowed ──── */

  it("UT-CMT-FAIL-001 a refused delete stops the commit and reaches the host's error banner", async () => {
    data = [comment({ id: "old-1", text: "To delete" })];
    removeMutation.mutateAsync = vi.fn(async () => { throw new Error("HTTP 403 Forbidden"); });
    const onSaveError = vi.fn();
    const onSavingChange = vi.fn();
    mount({ onSaveError, onSavingChange });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Comment" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Comment" }), {
      target: { value: "Added General Comment" },
    });
    fireEvent.click(saveButton());
    await waitFor(() => expect(onSaveError).toHaveBeenCalledTimes(1));
    expect(onSaveError).toHaveBeenCalledWith(commentsSaveFailed("HTTP 403 Forbidden"));
    // The refusal stopped the remaining writes; the threads are re-read; the flag is released.
    expect(saveMutation.mutateAsync).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(onSavingChange).toHaveBeenLastCalledWith(false);
  });

  it("UT-CMT-FAIL-002 a refused save reaches the host's error banner too", async () => {
    saveMutation.mutateAsync = vi.fn(async () => { throw new Error("refused"); });
    const onSaveError = vi.fn();
    mount({ onSaveError });
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Comment" }), { target: { value: "A reply" } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(onSaveError).toHaveBeenCalledWith(commentsSaveFailed("refused")));
  });

  it("UT-CMT-FAIL-004 a commit calls onSaveStart before its first write, so the host can clear an old error", async () => {
    const order: string[] = [];
    saveMutation.mutateAsync = vi.fn(async () => { order.push("write"); return "saved-id"; });
    const onSaveStart = vi.fn(() => { order.push("start"); });
    mount({ onSaveStart });
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Comment" }), { target: { value: "A reply" } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(saveMutation.mutateAsync).toHaveBeenCalled());
    expect(onSaveStart).toHaveBeenCalledTimes(1);
    expect(order[0]).toBe("start");
  });

  it("UT-CMT-FAIL-003 the NEW banner text names the failure and keeps the cause", () => {
    expect(commentsSaveFailed("HTTP 403")).toBe("Error: the comments could not be saved completely. HTTP 403");
  });
});