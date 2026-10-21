/**
 * VSB palette — TRANSCRIBED, not chosen.
 *
 * Every hex below is copied from `App.Formulas` → `AppTheme.palette` in
 * `Src/App.pa.yaml` of the Project Costs canvas app. Changing one changes visual parity,
 * so treat this file as data owned by the canvas app, not as a design decision.
 *
 * The canvas app also stringified this object into `gblAppThemeJson` and handed it to every
 * PowerCAT control's `Theme` property. There are no PowerCAT controls here, so that whole
 * mechanism is gone — the values feed Fluent v9 through `vsbTheme` in `./fluent.ts`.
 */
export const palette = {
  themePrimary: "#006eb9",
  themeLighterAlt: "#f2f8fc",
  themeLighter: "#cde4f4",
  themeLight: "#a4ceea",
  themeTertiary: "#55a2d6",
  themeSecondary: "#177ec2",
  themeDarkAlt: "#0065a8",
  themeDark: "#00558d",
  themeDarker: "#003f68",
  neutralLighterAlt: "#faf9f8",
  neutralLighter: "#f3f2f1",
  neutralLight: "#edebe9",
  neutralQuaternaryAlt: "#e1dfdd",
  neutralQuaternary: "#d0d0d0",
  neutralTertiaryAlt: "#c8c6c4",
  neutralTertiary: "#595959",
  neutralSecondary: "#373737",
  neutralPrimaryAlt: "#2f2f2f",
  neutralPrimary: "#000000",
  neutralDark: "#151515",
  black: "#0b0b0b",
  white: "#ffffff",
  akzent1: "#469bd7",
  akzent2: "#41aab4",
  akzent3: "#82a51e",
  akzent4: "#f5911e",
  akzent5: "#d20532",
  akzent6: "#af2887",
  hoverButton: "#CCE2F1",
  Grayscale00: "#0D0D0D",
  Grayscale10: "#6C6C6C",
  Grayscale20: "#E3E3E3",
  Grayscale30: "#F1F1F1",
  Grayscale40: "#FAFAFA",
  Grayscale50: "#FFFFFF",
  Error: "#B22727",
  Success: "#3C9856",
  SuccessLight: "#E9F3EC",
  Warning: "#EE940C",
  Green: "#82a51e",
  GreenDark: "#75941c",
  GreenLight: "#a0cb24",
} as const;

/**
 * Layout constants read off the canvas screens rather than invented.
 *
 * `railWidth` is `cmp_Left_Navigation.Width = 200`, though the Cost screens render it
 * narrower once collapsed — the screenshots show ~125 px. `headerHeight` and `footerHeight`
 * come from `con_Costs_Header` / `con_Costs_Footer`. The canvas app was authored at a fixed
 * 1366 × 768 (`Properties.json` → `DocumentLayoutWidth/Height`) with
 * `DocumentLayoutScaleToFit: false`, which is why nothing in it reflows; the rebuild is
 * responsive instead, so these are minimums, not absolutes.
 */
export const layout = {
  designWidth: 1366,
  designHeight: 768,
  railWidth: 200,
  railWidthCollapsed: 56,
  headerHeight: 74,
  footerHeight: 32,
  commandBarHeight: 40,
  panelWidth: 960,
  panelWidthNarrow: 450,
} as const;

/** 4-px spacing scale. The canvas app hard-coded 5/10/15/20/40; this rounds to a scale. */
export const space = {
  xxs: "2px",
  xs: "4px",
  s: "8px",
  m: "12px",
  l: "16px",
  xl: "24px",
  xxl: "40px",
} as const;

/** Breakpoints for `makeStyles` media queries. */
export const media = {
  belowSm: "@media (max-width: 599px)",
  belowMd: "@media (max-width: 899px)",
  belowLg: "@media (max-width: 1199px)",
} as const;

/**
 * The canvas app used `Font.'Open Sans'` throughout. Open Sans is not a Fluent default, and
 * a code app cannot rely on Power Apps' font CDN, so it is declared here with a real
 * fallback stack and self-hosted in `src/styles/fonts.css` if the client supplies the files.
 */
export const fontFamily =
  "'Open Sans', 'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif";
