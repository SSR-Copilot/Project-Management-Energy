// @vitest-environment jsdom
/**
 * Chrome tests for the shared confirmation popup.
 *
 * Reference: `Existing Solution/UI Screenshots/Cost App - Edit Panel - Popup Design - When
 * DevcoSpv or Link to cluster is changed.png`, measured — the card is 450 px wide at x 735-1184,
 * its header is exactly 42 px of `#006EB9` (themePrimary), the description block is
 * `rgb(225, 236, 244)` and the two buttons sit bottom-right with Confirm to the LEFT of Cancel.
 *
 * Source: `Src/Components/cmp_PopUp_Confirmation.pa.yaml` and `…_New.pa.yaml`.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FluentProvider } from "@fluentui/react-components";
import { vsbTheme } from "@/theme/fluent";
import { ConfirmDialog } from "./ConfirmDialog";

const mount = (props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) => render(
  <FluentProvider theme={vsbTheme}>
    <ConfirmDialog
      open title="Confirm Changes" description="Are you sure?"
      onConfirm={vi.fn()} onCancel={vi.fn()} {...props}
    />
  </FluentProvider>,
);

/** Every button inside the surface, in DOM order. */
const buttons = () => [...document.querySelectorAll<HTMLButtonElement>(".fui-DialogSurface button")];

describe("ConfirmDialog", () => {
  it("renders nothing while closed", () => {
    mount({ open: false });
    expect(screen.queryByText("Confirm Changes")).not.toBeInTheDocument();
  });

  /** `lbl_PopUpConfirmation_BodyHeader_3` + `ico_…` — title left, `Icon.Cancel` right. */
  it("puts the title in the blue header with a ✕ that cancels", () => {
    const onCancel = vi.fn();
    mount({ onCancel });
    expect(screen.getByRole("heading", { name: "Confirm Changes" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  /**
   * `Confirm.X = Cancel.X - Self.Width - 20` — Confirm is the LEFT of the two
   * (`cmp_PopUp_Confirmation_New.pa.yaml:265`, `:293`). Fluent's own `DialogActions` put the
   * primary action last, which is the wrong way round for this app.
   */
  it("orders the actions Confirm then Cancel, after the ✕", () => {
    mount({ confirmText: "Confirm All", cancelText: "Cancel" });
    expect(buttons().map((b) => b.textContent)).toEqual(["", "Confirm All", "Cancel"]);
  });

  /** `WidthConfirmButton` — 96 by default, widened by the caller for "Confirm All". */
  it("takes its confirm width from the caller", () => {
    mount({ confirmWidth: 120, confirmText: "Confirm All" });
    expect(screen.getByRole("button", { name: "Confirm All" })).toHaveStyle({ width: "120px" });
  });

  it("reports both answers", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    mount({ onConfirm, onCancel });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("locks both buttons while a write is in flight", () => {
    mount({ busy: true });
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  /**
   * The canvas builds the relink description with `Char(10)` and a `•` per line
   * (`CapexScreenCode.txt:19873-19884`); without `pre-line` every bullet runs into the last.
   */
  it("keeps the canvas' Char(10) bullets on separate lines", () => {
    const description = "Are you sure you want to proceed with the following changes?"
      + '\n• Switch the "Cost Paid By" to DevCo. This will impact liquidity planning and BoP.'
      + "\n• Costs have been entered for Cluster 4 and linked to Cluster 5.";
    mount({ description, variant: "info" });
    const block = screen.getByText(/Are you sure you want to proceed/);
    expect(block).toHaveStyle({ whiteSpace: "pre-line" });
    expect(block.textContent).toBe(description);
  });

  /**
   * `con_PopUpConfirmation_BodyDescription_Inside_2` + `Icon1` (`Icon.Information`) are what
   * `cmp_PopUp_Confirmation_New` adds; the older `cmp_PopUp_Confirmation` shows the description
   * bare. The ⓘ is `aria-hidden`, so it is found as the description's own sibling.
   */
  it("wraps the description in the ⓘ block for the info variant only", () => {
    const { unmount } = mount({ variant: "info" });
    expect(screen.getByText("Are you sure?").parentElement?.querySelector("svg[aria-hidden]"))
      .not.toBeNull();
    unmount();

    mount({ variant: "plain" });
    expect(screen.getByText("Are you sure?").parentElement?.querySelector("svg[aria-hidden]"))
      .toBeNull();
  });
});
