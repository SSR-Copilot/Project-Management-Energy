import { createContext, useContext, type SyntheticEvent } from "react";
import type { CloseReason } from "@/app/navigationGuardContext";

/** What `FormPanel` offers its footer and children. */
export interface FormPanelApi {
  /**
   * Close through the panel's guard: asks first when `dirty`, does nothing while busy. The
   * optional reason (default `"cancel"`; a click event wired straight to `onClick` counts as `"cancel"`) only matters with `FormPanel closePrompt` (E1c).
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

export type FormPanelWidth = "wide" | "full" | "narrow" | "cost" | "period" | "comments" | number;

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
    default: return 450;
  }
}
