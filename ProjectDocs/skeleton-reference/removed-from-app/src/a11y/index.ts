/**
 * Canvas accessibility identity for code-app controls — the G-A11Y contract.
 *
 * Every canvas control that sets `AccessibleLabel` renders it as `aria-label` in the player
 * DOM, and both Tosca and screen readers key on it. The 1.21.753 source sets it on 541
 * controls (`reference/canvas-accessible-labels.json`); 489 of those values are a canvas
 * control NAME, put there for Tosca.
 *
 * DECISION (14 Oct 2026): the code app renders
 *   - `aria-label`  = the human CAPTION (what the canvas shows next to the control), and
 *   - `data-testid` = the control's own canvas NAME — unique per screen, unlike the
 *                     AccessibleLabel values, which copied controls share.
 * A screen reader therefore announces "Supplier", never "cmb_Supplier_3", and Tosca gets a
 * stable, canvas-traceable property to identify by. `docs/G-A11Y.md` has the reasoning and
 * the Tosca-side change it implies (identify by `data-testid`, not `AriaLabel`).
 *
 * Usage — bind once per screen, spread onto the element that receives focus:
 *
 *   const a11y = a11yFor("Project Generators Screen");
 *   <Dropdown {...a11y("cmb_Supplier_3")} … />
 *   <NumericInput a11y={a11y("txt_…_HubHeight_2")} … />
 *
 * The control parameter is typed from the generated module, so an invented name fails
 * `tsc` (G-TYPE) before it reaches the gate. G-A11Y then checks coverage per screen.
 */
import { CANVAS_A11Y } from "./canvasA11y.generated";

export { CANVAS_A11Y };

export type CanvasA11yScreen = keyof typeof CANVAS_A11Y;
export type CanvasA11yControl<S extends CanvasA11yScreen> = keyof (typeof CANVAS_A11Y)[S] & string;

/** The two attributes a wired control renders. Spreadable onto any intrinsic or Fluent element. */
export interface A11yAttrs {
  "aria-label": string;
  "data-testid": string;
}

type Pair = readonly [testId: string, caption: string | null];

/**
 * The attributes for one canvas control. `caption` overrides the corpus caption — pass the
 * screen's own verbatim label constant when the visible text is computed (`$"Cost [{ISO}/WTG]"`)
 * or when the corpus caption is a formula (`null`).
 */
export function canvasA11y<S extends CanvasA11yScreen>(
  screen: S,
  control: CanvasA11yControl<S>,
  caption?: string,
): A11yAttrs {
  const pair = (CANVAS_A11Y[screen] as Record<string, Pair>)[control];
  const testId = pair?.[0] ?? control;
  return { "aria-label": caption ?? pair?.[1] ?? control, "data-testid": testId };
}

/** `canvasA11y` with the screen bound — the form every Screen.tsx uses. */
export const a11yFor =
  <S extends CanvasA11yScreen>(screen: S) =>
  (control: CanvasA11yControl<S>, caption?: string): A11yAttrs =>
    canvasA11y(screen, control, caption);
