// @vitest-environment jsdom
/**
 * Chrome tests for the shared confirmation popup.
 *
 * Reference: `ProjectDocs/Existing Solution/UI Screenshots/Cost App - Edit Panel - Popup Design - When
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

/** `con_PopUpConfirmation_Body_2` — the white box. */
const surface = () => document.querySelector<HTMLElement>(".fui-DialogSurface")!;

/**
 * `con_PopUpConfirmation_BodyDescription(_2)` — the band the description sits in. The plain
 * variant puts the text straight in it; the ⓘ one wraps it in
 * `con_PopUpConfirmation_BodyDescription_Inside_2` first.
 */
const band = (variant: "plain" | "info") => {
  const text = screen.getByText("Are you sure?");
  return (variant === "info" ? text.parentElement!.parentElement : text.parentElement)!;
};

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

  /**
   * `BoxHeight` / `TextHeight` are per-instance custom properties
   * (`cmp_PopUp_Confirmation_New:14-19`, `:62-67`). A caller that passes neither must render
   * exactly as before they existed: the fixed 260 / 320 class heights, and a band that still
   * grows. Neither may emit an inline declaration.
   */
  it("leaves the box and the band untouched when neither height is passed", () => {
    const { unmount } = mount();
    const plainClasses = surface().className;
    expect(surface().style.height).toBe("");
    expect(band("plain").style.height).toBe("");
    expect(band("plain")).toHaveStyle({ flexGrow: 1 });
    unmount();

    // The ⓘ variant still differs by class alone (`surfaceInfo`, 320 px), not inline.
    mount({ variant: "info" });
    expect(surface().style.height).toBe("");
    expect(surface().className).not.toBe(plainClasses);
  });

  /**
   * `con_PopUpConfirmation_Body_2.Height = cmp_PopUp_Confirmation_New.BoxHeight`
   * (`cmp_PopUp_Confirmation_New.pa.yaml:104`) — the Capex paid dialog passes `BoxHeight: =200`.
   */
  it("takes the box height from BoxHeight when the instance passes one", () => {
    mount({ variant: "info", boxHeight: 200 });
    expect(surface().style.height).toBe("200px");
  });

  /**
   * `con_PopUpConfirmation_BodyDescription_2.Height = …TextHeight` (`…_New:167`, and the label's
   * own `Height`, `:205`) — a FIXED band, so it stops growing. Capex's paid dialog passes 75.
   */
  it("fixes the description band to TextHeight when the instance passes one", () => {
    mount({ variant: "info", textHeight: 75 });
    expect(band("info").style.height).toBe("75px");
    expect(band("info").style.flexGrow).toBe("0");
  });

  /**
   * `cmp_PopUp_Confirmation` pads the LABEL, not the container: `PaddingLeft/Right: =20`,
   * `PaddingBottom: =0` (`cmp_PopUp_Confirmation.pa.yaml:176-179`), the container only
   * `PaddingTop: =16` (`:155`). This app inset it 10 px on both variants, which is `_New`'s
   * value, not this one's.
   */
  it("insets the plain description 20 px, with no bottom padding", () => {
    mount();
    expect(band("plain")).toHaveStyle({
      paddingLeft: "20px", paddingRight: "20px",
      paddingTop: "16px", paddingBottom: "0px",
    });
  });

  /** `con_PopUpConfirmation_BodyDescription_2` — 16/10/16/10 (`…_New:172-175`), unchanged. */
  it("keeps the ⓘ band on its own 16/10 padding", () => {
    mount({ variant: "info" });
    expect(band("info")).toHaveStyle({
      paddingLeft: "10px", paddingRight: "10px",
      paddingTop: "16px", paddingBottom: "16px",
    });
  });

  /**
   * `con_PopUpConfirmation_BodyDescription_Inside_2` (`…_New:182-193`) sets `PaddingLeft: =10`
   * and `PaddingRight: =5` and nothing else — no `Radius*` (so it is square) and no
   * `PaddingTop`/`PaddingBottom`.
   */
  it("renders the ⓘ block square, with no vertical padding of its own", () => {
    mount({ variant: "info" });
    const block = screen.getByText("Are you sure?").parentElement!;
    expect(block).toHaveStyle({
      borderRadius: "0px",
      paddingTop: "0px", paddingBottom: "0px",
      paddingLeft: "10px", paddingRight: "5px",
    });
  });
});
