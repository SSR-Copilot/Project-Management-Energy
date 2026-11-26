// @vitest-environment jsdom
/**
 * CA-15 (dvopt T-20, `COMMENT_DELETES_OVERLAP`): the comments panel's deletes run together (4 at a time) before the creates and
 * edits, which stay sequential; a refused delete stops the remaining writes (CA-18) exactly as the one-after-another loop did.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { vsbTheme } from "@/theme/fluent";
import { COMMENT_TYPE, commentsSaveFailed, type CapexComment } from "./comments";

let data: CapexComment[] | undefined;
const saveMutation = { mutateAsync: vi.fn(async () => "new-id"), isPending: false };
const removeMutation = { mutateAsync: vi.fn(async (_id: string) => undefined as undefined), isPending: false };
const invalidate = vi.fn();

vi.mock("@/features/cost/costing/useCostWriteFlight", () => ({
  useCostWriteInFlight: () => false,
  useWriteFailureReport: () => (text: string, show?: (t: string) => void) => { show?.(text); },
}));
vi.mock("@/features/cost/costing/useCostBook", () => ({
  useCapexComments: () => ({ data, isLoading: false }),
  useCommentWrites: () => ({ save: saveMutation, remove: removeMutation, invalidate }),
}));
vi.mock("@/app/useCurrentUser", () => ({ useCurrentUser: () => ({ data: undefined }) }));
vi.mock("@/app/SessionContext", () => ({
  useSession: () => ({ session: { fullName: "Shakti Singh Rajput", entraObjectId: "entra-1" } }),
}));

import { CommentsPanel } from "./CommentsPanel";
const { setCapexOptFlags, resetCapexOptFlags } = await import("@/data/capexOptFlags");

const comment = (id: string): CapexComment => ({
  id, text: `Comment ${id}`, contractId: "contract-1", costId: null, parentId: null, rootId: null,
  commentType: COMMENT_TYPE.general, resolved: false, resolvedById: null,
  createdOn: `2026-09-1${id.slice(-1)}T13:30:00`, createdByName: "Shakti Singh Rajput",
});

function mountAndDeleteAll(onSaveError?: (t: string) => void) {
  render(
    <FluentProvider theme={vsbTheme}>
      <CommentsPanel open contractId="contract-1" contractDescription="Gesamt" breadcrumb="A / B" payments={[]}
        distribution="individual" onDismiss={vi.fn()} onSaveError={onSaveError} />
    </FluentProvider>,
  );
  for (let i = 0; i < 5; i += 1) fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0] as HTMLElement);
  fireEvent.click(screen.getByRole("button", { name: "Add Comment" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Comment" }), { target: { value: "Added General Comment" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
}

/** Delete requests that settle only when the test says so. */
function controlledDeletes() {
  const open: { id: string; resolve: () => void; reject: (e: Error) => void }[] = [];
  removeMutation.mutateAsync = vi.fn((id: string) => new Promise<undefined>((resolve, reject) => {
    open.push({ id, resolve: () => resolve(undefined), reject });
  }));
  return open;
}

beforeEach(() => {
  vi.clearAllMocks();
  saveMutation.mutateAsync = vi.fn(async () => "new-id");
  data = ["c1", "c2", "c3", "c4", "c5"].map(comment);
});
afterEach(() => resetCapexOptFlags());

describe("the comments panel's deletes overlap", () => {
  it("UT-CMTOVERLAP-001 five deletes: four start together, the fifth when one settles; the new comment is created only after all five", async () => {
    const open = controlledDeletes();
    mountAndDeleteAll();
    await waitFor(() => expect(removeMutation.mutateAsync).toHaveBeenCalledTimes(4));
    expect(saveMutation.mutateAsync).not.toHaveBeenCalled();
    open[0]?.resolve();
    await waitFor(() => expect(removeMutation.mutateAsync).toHaveBeenCalledTimes(5));
    expect(saveMutation.mutateAsync).not.toHaveBeenCalled();
    for (const o of open.slice(1)) o.resolve();
    await waitFor(() => expect(saveMutation.mutateAsync).toHaveBeenCalledTimes(1));
    expect(new Set(removeMutation.mutateAsync.mock.calls.map((c) => c[0]))).toEqual(new Set(["c1", "c2", "c3", "c4", "c5"]));
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it("UT-CMTOVERLAP-002 a refused delete: no further delete starts, nothing is created, the failure reaches the banner (CA-18)", async () => {
    const open = controlledDeletes();
    const onSaveError = vi.fn();
    mountAndDeleteAll(onSaveError);
    await waitFor(() => expect(removeMutation.mutateAsync).toHaveBeenCalledTimes(4));
    open[1]?.reject(new Error("HTTP 403 Forbidden"));
    for (const o of [open[0], open[2], open[3]]) o?.resolve();
    await waitFor(() => expect(onSaveError).toHaveBeenCalledWith(commentsSaveFailed("HTTP 403 Forbidden")));
    expect(removeMutation.mutateAsync).toHaveBeenCalledTimes(4);
    expect(saveMutation.mutateAsync).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it("UT-CMTOVERLAP-003 with COMMENT_DELETES_OVERLAP off the deletes go one after another, as before", async () => {
    setCapexOptFlags({ COMMENT_DELETES_OVERLAP: false });
    const open = controlledDeletes();
    mountAndDeleteAll();
    await waitFor(() => expect(removeMutation.mutateAsync).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(removeMutation.mutateAsync).toHaveBeenCalledTimes(1);
    open[0]?.resolve();
    await waitFor(() => expect(removeMutation.mutateAsync).toHaveBeenCalledTimes(2));
  });
});
