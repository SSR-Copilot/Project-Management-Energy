/**
 * VSBCloud design tokens.
 *
 * Every value below is transcribed verbatim from the canvas apps' named formula
 * `AppTheme.palette` and from `gblAppSizes` in `App.OnStart`. Do not "improve" these
 * values — visual parity with the canvas apps is a delivery criterion.
 *
 * Source: vsb_projectmanagement_88aff/Src/App.pa.yaml, App.Formulas
 *         vsb_projectcosts_ba045/Src/App.pa.yaml, App.OnStart
 */

/** AppTheme.palette — the Fluent 8 palette the canvas apps were themed with. */
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

  /** VSB brand accents — used for status, categories and chart series. */
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

export type PaletteKey = keyof typeof palette;

/**
 * gblAppStyles — the semantic colours the canvas app derived from the palette.
 * `Error` maps to akzent5 and `Success` to akzent3 in `App.OnStart`, which is NOT the
 * same as palette.Error / palette.Success. Both are kept so screens can match the
 * canvas exactly wherever they differ.
 */
export const semantic = {
  error: palette.akzent5,
  success: palette.akzent3,
  warning: "#EE940C",
  errorText: palette.Error,
  successText: palette.Success,
  successSurface: palette.SuccessLight,
} as const;

/** gblAppSizes.Font — the canvas font scale, in points. */
export const fontSize = {
  extraExtraSmall: 8,
  extraSmall: 9,
  small: 10,
  medium: 11,
  large: 12,
  extraLarge: 14,
  extraExtraLarge: 16,
} as const;

/** gblAppSizes — layout constants lifted straight out of App.OnStart. */
export const sizes = {
  leftNavigation: { expandedWidth: 200, decreasedWidth: 32 },
  rightPanel: { minWidth: 450, top: 20, left: 20, right: 20 },
  form: {
    x: 20,
    space: 20,
    label200Width: 150,
    labelBeforeHeight: 52,
    labelBeforeHeightErr: 42,
  },
  position: { x: 20, y: 2 },
} as const;

/** gblAppConstants */
export const constants = {
  notifyTimeoutMs: 500,
  form: { new: "New", edit: "Edit", display: "Display" },
} as const;

/**
 * Responsive breakpoints. The canvas apps were fixed-width; these are new and exist so
 * the rebuild works on a phone, a tablet and a 4K desktop from one layout.
 */
export const breakpoints = {
  xs: 0,
  sm: 480,
  md: 768,
  lg: 1024,
  xl: 1366,
  xxl: 1920,
} as const;

export const media = {
  belowMd: `@media (max-width: ${breakpoints.md - 1}px)`,
  belowLg: `@media (max-width: ${breakpoints.lg - 1}px)`,
  belowXl: `@media (max-width: ${breakpoints.xl - 1}px)`,
  atLeastMd: `@media (min-width: ${breakpoints.md}px)`,
  atLeastLg: `@media (min-width: ${breakpoints.lg}px)`,
  atLeastXl: `@media (min-width: ${breakpoints.xl}px)`,
  touch: "@media (hover: none) and (pointer: coarse)",
  reducedMotion: "@media (prefers-reduced-motion: reduce)",
} as const;

/** Spacing scale — 4px base, matching the canvas app's 20px form rhythm at step 5. */
export const space = {
  none: "0",
  xxs: "2px",
  xs: "4px",
  s: "8px",
  m: "12px",
  l: "16px",
  xl: "20px",
  xxl: "28px",
  xxxl: "40px",
} as const;

export const radius = {
  none: "0",
  sm: "2px",
  md: "4px",
  lg: "6px",
  pill: "999px",
} as const;

export const elevation = {
  card: "0 1px 2px rgba(0,0,0,.08), 0 0 1px rgba(0,0,0,.10)",
  panel: "0 8px 16px rgba(0,0,0,.12), 0 0 2px rgba(0,0,0,.10)",
  dialog: "0 16px 32px rgba(0,0,0,.20), 0 0 4px rgba(0,0,0,.12)",
} as const;

/**
 * Cluster/approval state colours, derived from cmp_Project_States.
 *
 * SOURCE DEFECT: this map routed `Draft` to `Grayscale10` (#6C6C6C) and carried no
 * `Approving` key at all — only `In Review`. `cmp_Header.ApprovalStatesColor` in the canvas
 * app is
 *   Table({State:"Draft",Color:"#41aab4"},{State:"Approving",Color:"#f5911e"},
 *         {State:"Approved",Color:"#82a51e"},{State:"Rejected",Color:"#d20532"})
 * i.e. Draft is `akzent2` and Approving is `akzent4`. The old routing left `akzent2`
 * unreachable from anywhere in the app. Both are corrected here; `In Review` is retained
 * alongside `Approving` because live data uses both labels for the same colour.
 * Pinned by `src/theme/tokens.test.ts`.
 */
export const stateColor: Record<string, string> = {
  Draft: palette.akzent2,
  "In Progress": palette.akzent1,
  Approving: palette.akzent4,
  "In Review": palette.akzent4,
  Approved: palette.akzent3,
  Rejected: palette.akzent5,
  Cancelled: palette.Grayscale10,
  Canceled: palette.Grayscale10,
  Abandoned: palette.Grayscale10,
  Inactive: palette.Grayscale10,
  "Not Started": palette.Grayscale20,
};

/**
 * `Approval States` (`vsb_approvalstates`) -> colour, for the project grid's left accent bar
 * and its Approval icon column.
 *
 * Keys are the `CHOICE.approvalState` option-set values, written as numeric literals on
 * purpose: `tokens.ts` is a zero-import leaf module and must not depend on the data layer.
 * `src/theme/tokens.test.ts` imports `CHOICE` and asserts every member has a key here, so the
 * coupling is enforced by a test rather than by an import.
 */
export const approvalStateColor: Record<number, string> = {
  952850000: palette.akzent2, // notStarted -> "Draft"
  952850001: palette.akzent4, // inProgress -> "Approving"
  952850002: palette.akzent3, // approved
  952850003: palette.akzent5, // rejected
  952850004: palette.akzent4, // cancelled -> "Canceled"
};

/**
 * Environment accent, from `con_cmp_Header.Fill`'s
 * `Switch(gblEnvironmentName, "Hotfix", …, "Nightly", …, "Budgeting", …, "QA", …)`.
 *
 * The canvas fills the whole header with a low-alpha wash. Rendering that faithfully would
 * mean inventing alpha values that are not in `AppTheme.palette`, which rule 6 forbids, so
 * `AppHeader` paints these as a 3px top stripe instead. The hues are the transcribed ones.
 */
export const envAccent: Record<string, string> = {
  Hotfix: palette.akzent6,
  Nightly: palette.Grayscale10,
  Budgeting: palette.akzent3,
  QA: palette.akzent4,
  Dev: palette.akzent5,
};

/** LeftNavigationMenu ItemIconColor — the two literals the canvas app uses. */
export const navIconColor = {
  /** prerequisite data missing */
  incomplete: "#8FBCE4",
  /** prerequisite data present */
  complete: "#006EB9",
} as const;
