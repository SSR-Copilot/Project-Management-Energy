import { createContext, useContext, type SyntheticEvent } from "react";
import type { CloseReason } from "./discardText";

/** What `FormPanel` offers its footer and children. */
export interface FormPanelApi {
  /**
   * Close through the panel's guard: asks first when `dirty`, does nothing while busy. The
   * optional reason (default `"cancel"`; a click event wired straight to `onClick` counts as `"cancel"`) only matters with `FormPanel closePrompt`.
   */
  requestClose: (reason?: CloseReason | SyntheticEvent) => void;
  /** True while `busy` / `busyLabel` locks the panel. */
  busy: boolean;
}

export const FormPanelContext = createContext<FormPanelApi | null>(null);

/** Inside a `FormPanel`: its close guard. Outside one: a no-op that is never busy. */
export function useFormPanel(): FormPanelApi {
  return useContext(FormPanelContext) ?? NO_PANEL;
}

const NO_PANEL: FormPanelApi = { requestClose: () => {}, busy: false };

/**
 * E8: add to a `RadioGroup` inside a panel to lay it out as a row (`canvas.css`
 * `.canvas-panel .fui-RadioGroup.canvas-radio-row`). Panel radio groups stay vertical otherwise.
 */
export const PANEL_RADIO_ROW = "canvas-radio-row";

export type FormPanelWidth =
  | "wide" | "narrow" | "cost" | "period" | "comments" | "twoColumn" | "fieldsAndSide" | "threeColumn"
  | "full" | number;

/** The CSS width of a `FormPanel` preset or px number. */
export function formPanelWidth(width: FormPanelWidth): string | number {
  if (typeof width === "number") return `min(${width}px, 100vw)`;
  switch (width) {
    case "wide": return "min(960px, 50vw)";
    case "full": return "min(960px, 100vw)";
    case "cost": return 750;
    case "period": return 660;
    // `comments` is 600 because the canvas comments panel is `Width: =Min(600, Parent.Width)`
    // (`CapexScreenCode.txt:8041`); its Type/Year/Month row is a fixed 250+100+100 and does not
    // fit the 450 of `narrow`.
    case "comments": return 600;
    // `twoColumn` (860) is the PM Revenues contract panel as the product owner's live-canvas
    // screenshot shows it (two independently scrolling columns, 20 Oct 2026).
    case "twoColumn": return 860;
    // `fieldsAndSide` (680) is the canvas 640-wide Production panel with one side column (fields 280 +
    // 360) plus the 2 x 20 body padding.
    case "fieldsAndSide": return 680;
    // `threeColumn` (1040) is the canvas 1000-wide Production panel (fields 280 + Seasonality 360 +
    // Negative Prices 360) plus the 2 x 20 body padding; `maxWidth` keeps it on screen when zoomed.
    case "threeColumn": return 1040;
    default: return 450;
  }
}
