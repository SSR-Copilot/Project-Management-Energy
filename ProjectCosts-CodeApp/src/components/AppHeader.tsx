/**
 * Replaces `cmp_Header` (28 controls, 5 instances) and, on the overview,
 * `con_Main_Project_Overview_Header`.
 *
 * The layout is the canvas one: ONE band carrying the logo, the version, the screen's own
 * command bar, then Help and the user pill on the right. The command bar arrives through
 * `commandSlotRef` — see `CommandSlot.tsx` for why it is a portal.
 *
 * Transcribed pieces:
 *   `con_cmp_Header_Title.Text`   = "Cloud"
 *   `con_cmp_Header_Version.Text` = "Version " & gblAppVersion &
 *                                   If(gblEnvironmentName = "Dev", " (" & name & ")", "")
 *   `con_cmp_Header_Title_4.Text` = Switch(gblEnvironmentName, "Hotfix"…, "QA" → "Quality Assurance")
 *   `lbl_cmp_In_Header_UserName`  = "Hi " & User().FullName
 *   Help menu (`pcf_HeaderContainerReportError_CommandBar_1.Items`):
 *                                   "Help" → "Report Problem", "VSB Cloud InfoCenter"
 *   Warning icon tooltip           = "An error has occurred!…", shown once an error is captured
 */
import {
  Badge, Button, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger,
  Text, Tooltip, makeStyles, tokens,
} from "@fluentui/react-components";
import {
  BugRegular, InfoRegular, LockClosedRegular, PersonFilled, ProhibitedRegular, WarningFilled,
  ChevronDownRegular,
} from "@fluentui/react-icons";
import type { Ref } from "react";
import { layout, media, palette, space } from "@/theme/tokens";
import { VsbLogo } from "./VsbLogo";
import {
  projectStatusColour, projectStatusIcon, projectStatusLabel, projectStatusVisible,
} from "./headerRules";

const useStyles = makeStyles({
  header: {
    display: "flex", alignItems: "center", gap: space.l,
    minHeight: `${layout.headerHeight}px`,
    paddingLeft: space.l, paddingRight: space.l,
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: tokens.colorNeutralStroke2,
  },
  brand: { display: "flex", alignItems: "center", gap: space.s, flexShrink: 0 },
  brandText: { display: "flex", flexDirection: "column", lineHeight: 1.15 },
  /** The logo as a click target: no padding or minimum width, so the logo keeps its place. */
  logoButton: {
    minWidth: 0, paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
    height: "auto",
  },
  // `lbl_cmp_Header_AppName`: themePrimary, Semibold, 18 pt (24 px). Fluent `Text` drops plain
  // class names, so the canvas.css rule never reached it; the look lives here.
  title: { fontWeight: tokens.fontWeightSemibold, fontSize: "24px", lineHeight: "1.2", color: palette.themePrimary },
  version: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase100 },
  /** The (i) icon then the version, 4 px apart. The icon is 14 x 14 in the canvas. */
  versionLine: { display: "inline-flex", alignItems: "center", gap: space.xs },
  versionIcon: { fontSize: "14px", flexShrink: 0 },
  /**
   * Where the screen's command bar lands. Takes the slack so Help stays right-aligned.
   * `CommandBar` has no leading inset of its own (21 Oct 2026), so the slot keeps the 20 px the
   * Toolbar padding + first button padding used to give (23 px: the bar pulls its first
   * command 3 px left onto the icon glyph), so the first icon stays where it was.
   */
  // The first command's icon at x 198, right after the 204 px brand block (canvas, 28 Oct 2026).
  commandSlot: { flex: 1, minWidth: 0, display: "flex", alignItems: "center", paddingLeft: 0 },
  right: { display: "flex", alignItems: "center", gap: space.s, flexShrink: 0 },
  help: { fontWeight: tokens.fontWeightRegular, "& .fui-Button__icon": { color: tokens.colorNeutralForeground3 } },
  /*
   * `pcf_cmpHeader_User_ContextMenu_Info` is a `cat_PowerCAT.ContextMenu`, whose rows are
   * ordinary items: #3f3f3f text with a themePrimary icon, sampled off
   * `UI Screenshots/EveryScreen - Current LoggedIn User Badge.png` at (0, 110, 185) and
   * (63, 63, 63). They were rendered `disabled`, which greys the icon with the label.
   */
  badgeMenu: { "& .fui-MenuItem__icon": { color: palette.themePrimary } },
  /*
   * `con_cmp_In_Header_UserName` — a FIXED 200 x 32 at radius 90, filled `palette.themePrimary`,
   * sitting at x 20 / y 21 of the 250 x 74 `con_cmp_Header_UserImage`. Centred on the header's
   * midline: `Y: =Parent.Height/2-Self.Height/2`.
   *
   * Fixed, not content-sized: the label inside it is `Width: =con_cmp_In_Header_UserImage.X -
   * con_cmp_In_Header_UserName.X-15` = 165 with `Wrap: =false`, so a long name is clipped by the
   * pill rather than stretching it. `.canvas-user-name` in `canvas.css` is that 165.
   *
   * These properties beat Fluent's Button base, which sets its own padding, radius, min-width
   * and centred content through Griffel rules of equal specificity.
   */
  userPill: {
    backgroundColor: palette.themePrimary,
    color: palette.white,
    position: "relative",
    /*
     * The pill's margins live HERE, not in `canvas.css`'s `.canvas-user-pill`: Fluent's Button
     * merges `className` through Griffel, which drops a plain class name passed in the same
     * string, so that rule never applied. Without the right margin the 47-px avatar (which hangs
     * 28 px past the pill) ran out of the header (PO, 21 Oct 2026). 30 px clears it with the
     * canvas's 2 px to spare.
     */
    // Canvas pair (4 Nov 2026): Help sits ~25 px closer to the pill and the avatar ends ~12 px nearer
    // the right edge than the 60 / 30 had it; 18 still clears the 28 px the avatar hangs out.
    marginLeft: "35px", marginRight: "18px", flexShrink: 0,
    fontSize: "14.67px", fontWeight: tokens.fontWeightSemibold,
    boxShadow: "rgba(0, 0, 0, 0.14) 0 1px 2px, rgba(0, 0, 0, 0.12) 0 0 2px",
    [media.belowMd]: { marginLeft: "10px" },
    boxSizing: "border-box",
    width: "200px", minWidth: "200px", height: "32px",
    borderRadius: "90px",
    paddingLeft: 0, paddingRight: 0,
    justifyContent: "flex-start",
    // The avatar is an absolutely positioned child that stands 28 px proud of the right edge.
    overflow: "visible",
    ":hover": { backgroundColor: palette.themeDarkAlt, color: palette.white },
  },
});

/** `con_cmp_Header_Version.Text` — the " (Dev)" suffix appears for Dev only. */
export function versionLabel(appVersion: string | undefined, environmentName: string | undefined) {
  const version = appVersion ?? "";
  return environmentName === "Dev" ? `Version ${version} (Dev)` : `Version ${version}`;
}

/** `con_cmp_Header_Title_4.Text` — the environment badge, blank for Dev and Prod. */
export function environmentBadge(environmentName: string | undefined): string | undefined {
  switch (environmentName) {
    case "Hotfix": return "Hotfix";
    case "Nightly": return "Nightly";
    case "Budgeting": return "Budgeting";
    case "QA": return "Quality Assurance";
    default: return undefined;
  }
}

/**
 * `gblTableApprovalStateColors` (`App.OnStart`), which `rec_cmp_Header_Project_State.Fill`
 * looks the project's approval state up in. A state with no row falls back to white — which
 * is what "Canceled" gets, the canvas table having no entry for it.
 */
export const APPROVAL_STATE_COLOUR: Record<string, string> = {
  Draft: palette.akzent2,
  Approving: palette.akzent4,
  Approved: palette.akzent3,
  Rejected: palette.akzent5,
};

export function approvalStateColour(state: string | undefined): string {
  return (state && APPROVAL_STATE_COLOUR[state]) || palette.white;
}

/** `pcf_HeaderContainerReportError_WarningIcon.Tooltip`, verbatim. */
export const ERROR_TOOLTIP =
  "An error has occurred!\n\n" +
  "If you encounter any issues, please report them via Help --> Report problem. " +
  "Technical details will be automatically included. " +
  "Your input helps us improve. Thank you for your cooperation.";

/** `ico_cmp_Header_ProjectStatus` — 18 x 18, icon and colour from the status. */
function ProjectStatusGlyph({ status }: { status: string | undefined }) {
  const props = {
    className: "canvas-project-status-icon",
    style: { color: projectStatusColour(status) },
    "aria-hidden": true as const,
  };
  const icon = projectStatusIcon(status);
  if (icon === "blocked") return <ProhibitedRegular {...props} />;
  if (icon === "lock") return <LockClosedRegular {...props} />;
  return <InfoRegular {...props} />;
}

/*
 * The user menu's Fabric MDL2 font icons (`ItemIconName`), as each glyph's own outline on its
 * 2048-unit em, from `@fluentui/react-icons-mdl2` 1.3.83 — the SVG build of the font the PowerCAT
 * ContextMenu draws (`data-icon-name="Settings"` …). The exact canvas glyphs where Fluent v9 had
 * lookalikes (`SettingsRegular`, `MailRegular`, `LocalLanguageRegular`, `HomeRegular`,
 * `HomeAddRegular`, `GlobeRegular`, `InfoRegular`), 5 Nov 2026; the same convention as `LeftNav`.
 */
const MDL2_PATH = {
  settings: "M1783 988v18q0 9 1 18v18q0 9-1 18l259 161-159 383-297-68q-24 26-50 50l68 297-383 159-161-259h-18q-9 0-18 1h-18q-9 0-18-1l-161 259-383-159 68-297q-26-24-50-50l-297 68L6 1221l259-161v-18q0-9-1-18v-18q0-9 1-18L6 827l159-383 297 68q24-26 50-50l-68-297L827 6l161 259h18q9 0 18-1h18q9 0 18 1L1221 6l383 159-68 297q26 24 50 50l297-68 159 383-259 161zm-117 130q2-24 4-47t2-48q0-23-2-47t-4-47l236-147-86-208-271 63q-31-38-63-70t-71-64l63-271-208-86-148 236q-23-2-47-4t-47-2q-24 0-47 2t-48 4L782 146l-208 86 63 271q-38 31-70 63t-64 71l-271-63-86 208 236 148q-2 24-4 47t-2 48q0 23 2 47t4 47l-236 147 86 208 271-63q31 38 63 70t71 64l-63 271 208 86 148-236q23 2 47 4t47 2q24 0 47-2t48-4l147 236 208-86-63-271q38-31 70-63t64-71l271 63 86-208-236-148zm-642-470q78 0 146 29t120 81 80 119 30 147q0 78-29 146t-81 120-119 80-147 30q-78 0-146-29t-120-81-80-119-30-147q0-78 29-146t81-120 119-80 147-30zm0 640q55 0 103-20t84-57 56-84 21-103q0-55-20-103t-57-84-84-56-103-21q-55 0-103 20t-84 57-56 84-21 103q0 55 20 103t57 84 84 56 103 21z",
  mail: "M2048 384v1280H0V384h2048zM143 512l881 441 881-441H143zm1777 1024V648l-896 447-896-447v888h1792z",
  localeLanguage: "M601 1152l295 886v10H765l-86-256H345l-86 256H128v-10l295-886h178zm36 512l-125-374-125 374h250zM893 512q3 65 3 128v64q0 32-2 64H768v128H523l10 64q5 32 14 64H418q-8-32-12-64t-9-64H188q20 36 46 68t57 60h-35l-45 90q-101-91-156-214T0 640q0-88 23-170t64-153 100-129T317 88t153-65T640 0q88 0 170 23t153 64 129 100 100 130 65 153 23 170q0 32-3 64t-10 64h-124q17-65 17-128t-17-128H893zM640 120q-19 0-34 16t-28 41-22 56-15 60-11 54-6 37h231q-2-11-6-35t-10-54-16-60-22-56-28-42-33-17zM387 768q-3-64-3-128 0-63 3-128H137q-17 65-17 128t17 128h250zm11-384q6-58 18-116t34-112q-83 33-150 91T188 384h210zm369 384q3-64 3-128 0-63-3-128H513q-3 65-3 128 0 64 3 128h254zm58-613q23 54 36 112t20 117h211q-45-78-113-137t-154-92zm566 734q0-30-1-61t-8-60q69 0 137 6 6 1 12 3t7 10q0 5-3 12t-5 12q-2 6-3 16t-2 21-1 22 0 17v13h296q42 0 83-1t84-2q7 0 13 3 3 5 3 10-1 17-2 35t-1 36v58q0 36 1 72t2 73v7q0 4-3 6-8 2-13 2h-25q-20 0-41 1-19 0-34-1t-17-3q-2-8-2-24t-1-36q0-33 1-68t1-52h-802v39q0 15 1 31t0 34q0 29-1 52t-3 26q-8 2-13 2H949q-11 0-13-3t-2-13q1-40 1-79t0-79v-58q0-29-1-58 0-5 2-11 8-2 13-2 42 1 83 2t84 1h275v-11zm639 553q2 8 2 13v96q0 4-2 12-8 2-13 2-40-1-79-2t-79-1h-321v33q0 52 1 104t3 104v4q0 24-9 48t-29 38q-14 10-39 15t-55 8-56 3-44 1h-19q-13 0-18-6-3-3-7-16t-6-18q-7-26-16-48t-24-46q34 4 68 5t68 2q24 0 36-7t13-34v-190h-319q-40 0-80 1t-80 2q-8 0-12-3-2-6-2-11v-96-7q0-4 3-7 6-2 11-2l80 2q40 1 80 1h319q-2-26-2-52t-6-53q20 2 39 3t40 4h3q1 0 4 1 35-25 67-53t64-57h-308q-42 0-83 1t-84 2q-8 0-12-3-2-6-2-11v-95q0-4 2-12 8-2 12-2 42 1 83 2t84 1h373q16 0 30-4t25-5q8 0 23 12t30 28 26 32 12 25q0 10-6 15t-15 10q-14 7-27 18t-25 21q-52 43-104 83t-110 78v11h321q40 0 79-1t79-2q7 0 13 3z",
  home: "M1024 165l941 942-90 90-83-82v805h-640v-640H896v640H256v-805l-83 82-90-90 941-942zm640 1627V987l-640-640-640 640v805h384v-640h512v640h384z",
  addHome: "M768 1664v-640h512v768h-128v-640H896v640H256V987l-83 82-90-90 941-942 941 942-90 90-83-82v293h-128V859l-640-640-640 640v805h384zm1024 0h256v128h-256v256h-128v-256h-256v-128h256v-256h128v256z",
  permissions: "M2048 1573v475h-512v-256h-256v-256h-256v-207q-74 39-155 59t-165 20q-97 0-187-25t-168-71-142-110-111-143-71-168T0 704q0-97 25-187t71-168 110-142T349 96t168-71T704 0q97 0 187 25t168 71 142 110 111 143 71 168 25 187q0 51-8 101t-23 98l671 670zm-128 54l-690-690q22-57 36-114t14-119q0-119-45-224t-124-183-183-123-224-46q-119 0-224 45T297 297 174 480t-46 224q0 119 45 224t124 183 183 123 224 46q97 0 190-33t169-95h89v256h256v256h256v256h256v-293zM512 384q27 0 50 10t40 27 28 41 10 50q0 27-10 50t-27 40-41 28-50 10q-27 0-50-10t-40-27-28-41-10-50q0-27 10-50t27-40 41-28 50-10z",
  world: "M496 883q13 0 29 4t32 11 32 13 29 12l-16 2q-8 1-17 1-17 0-31-5t-26-13-24-12-22-6q-10 0-18 4t-16 9q0-4-7-4 7-7 26-11t29-5zm135 45q41 0 75 14-14 5-28 8t-29 4q-20 0-36-4 5-8 10-10t8-12zM1024 0q141 0 271 37t244 103 208 161 160 207 104 244 37 272q0 141-37 271t-103 244-161 208-207 160-244 104-272 37q-141 0-271-37t-244-103-208-161-160-207-104-244-37-272q0-141 37-271t103-244 161-208 207-160T752 37t272-37zm762 555q-14-22-28-42t-29-41q-2 9-5 13t-4 18q0 9 7 17t18 16 22 12 19 7zm-69-98q0 8-3 11h6q4 0 6 1l-9-12zm-693 1463q114 0 223-29t206-82 180-130 145-172q-13-30-25-61t-12-64q0-36 3-58t7-39 4-29-3-31-17-41-37-62q1-7 3-19t4-25 1-24-5-19q-26-3-54-11t-50-24l6-5q-13 3-26 8t-25 11-26 8-27 4l-16-2 3-7q-14 4-30 10t-31 6q-10 0-29-7t-38-17-34-22-15-23l2-3q-5-6-13-11t-15-10-13-11-5-14l11-9-23-3-8-30q2 5 9 4t11-4l-36-19 25-64q-14-52-7-80t27-46 44-36 49-49l-3-12 66-80 15-2q28 0 63-2t71-7 71-10 64-13q-32-38-67-72t-75-65q-11 4-27 11t-32 18-25 24-11 27l6 19q-18 29-40 36t-45 8-48 0-48 9l-16-34 15-58-17-25 173-54q-11-28-36-42t-55-14v-10l56-9q-93-46-193-70t-205-24q-87 0-172 17t-164 49-153 80-135 108q26 0 40 13t26 29 25 29 35 14l16-12-2-22 33-47-26-74q5-3 15-10t17-7q30 0 46 3t28 11 21 23 28 38l36-28q10 4 32 13t45 22 39 27 17 26q0 15-11 24t-29 15-37 9-38 8-29 10-12 17l58 19q-20 17-43 31t-48 26l4 17-92 36v28l-7 3 5-35-4-1q-7 0-8 3t-1 7 2 8 1 6l-13-7 2 4q0 3 3 9t8 11 8 10 4 5q0 3-4 6t-10 4-8 3 0 1q14 0 6 2t-25 10-31 23-16 44q0 17 1 33t-1 33q-14-38-42-58t-68-20l-43 4 21 14q-17-2-35-4t-37-1-34 8-30 21l-6 45q0 32 14 52t49 21q30 0 59-9t57-21q-9 22-20 42t-16 44l13 6q24-16 44-5t39 32 39 43 43 32l-34 18-80-45q1 2 2 9t-1 3l-36-61q-32-1-68-10t-73-24-69-33-59-38l-7 107q0 122 33 238t93 218 147 186 193 143q-5-21-1-42t10-42 13-42 7-43q0-32-10-67t-24-71-31-71-27-66-16-58 6-47l-15-7q6-14 16-27t21-26 17-28 7-30q0-10-4-21t-7-21l21 5q17-39 46-53t73-15q5 0 21 4t34 11 34 11 24 8q0 7 8 9t9 7l-2 8q3 1 14 7t24 15 23 16 14 11q18 0 49 12t68 30 73 43 68 50 49 50 20 44l-34 36q4 51-7 78t-34 45-53 30-65 34q0 20-10 43t-25 44-36 35-42 14l-42-32q2 2 0 7t-5 2q10 19 5 44t-17 51-27 49-27 39q54 14 108 21t109 7z",
  info: "M960 1920q-133 0-255-34t-230-96-194-150-150-195-97-229T0 960q0-133 34-255t96-230 150-194 195-150 229-97T960 0q133 0 255 34t230 96 194 150 150 195 97 229 34 256q0 133-34 255t-96 230-150 194-195 150-229 97-256 34zm0-1792q-115 0-221 30t-198 84-169 130-130 168-84 199-30 221q0 114 30 220t84 199 130 169 168 130 199 84 221 30q114 0 220-30t199-84 169-130 130-168 84-199 30-221q0-114-30-220t-84-199-130-169-168-130-199-84-221-30zm-64 640h128v640H896V768zm0-256h128v128H896V512z",
} as const;
/* A 20-px box with the glyph at 16 px, filling the `.fui-MenuItem__icon` slot in its colour. */
const Mdl2MenuIcon = ({ path }: { path: string }) => (
  <svg width="20" height="20" viewBox="-256 -256 2560 2560" fill="currentColor" aria-hidden="true">
    <path d={path} />
  </svg>
);

export interface AppHeaderProps {
  /** The project name, on the project-scoped cost screens. Absent on the overview. */
  pageTitle?: string;
  /** `Project.Approval` — colours the 4 x 70 bar left of the name, and is its tooltip. */
  approvalState?: string;
  userName?: string;
  userEmail?: string;
  /** `img_cmp_In_Header_UserImage.Image = User().Image`, already a `data:` URL. */
  userPhoto?: string;
  /**
   * The remaining user-badge rows. Language and Data scope are omitted when absent; Business unit
   * (Home) and Countries (AddHome) always render, empty when absent — no `ItemVisible` in the canvas.
   */
  userLanguage?: string;
  userBusinessUnit?: string;
  userCountries?: string;
  userDataScope?: string;
  /**
   * The PM `cmp_Header` menu's `permissions` row (`ItemIconName: "Permissions"`, `ItemVisible:
   * true`): "Can edit Project" / "Can view Project" (`headerRules.projectPermissionLabel`).
   * Omitted on the Cost screens, whose own `cmp_Header` has no such row.
   */
  userPermission?: string;
  appVersion?: string;
  environmentName?: string;
  infoCenterUrl?: string;
  /** True once the equivalent of `App.OnError` has captured something. */
  hasError: boolean;
  onReportProblem: () => void;
  /**
   * The user menu's `appSettingsKey` row ("Application Settings", icon Settings), which in the
   * canvas navigates to `Admin Project Default Checklists Screen`. Omitted when not supplied.
   * Canvas `ItemVisible: Or(gblCurrentUser.IsApplicationAdministrator, IsControllerOwnData)` — the
   * caller decides visibility; until the role flags load (D14a) it is shown to everyone.
   */
  onAppSettings?: () => void;
  /**
   * `Image3.OnSelect = cmp_Header.OnLogoClick()` — the outlined back arrow every Project
   * Management and admin screen's `cmp_Header` shows before the project name; their
   * `OnLogoClick` is `Navigate('Project Main Screen')`. Rendered only when supplied: the Cost
   * app's own `cmp_Header` has no such image.
   */
  onBack?: () => void;
  /**
   * `cmp_Header.Project.Status` — the project's Cluster State name, on Project Management
   * screens only. Drives the second header line (`con_cmp_Header_ProjectStatus`).
   */
  projectStatus?: string;
  /** Receives the element the active screen portals its command bar into. */
  commandSlotRef?: Ref<HTMLDivElement>;
}

export function AppHeader({
  pageTitle, approvalState, userName, userEmail, userPhoto,
  userLanguage, userBusinessUnit, userCountries, userDataScope, userPermission,
  appVersion, environmentName, infoCenterUrl, hasError, onReportProblem, onAppSettings, commandSlotRef,
  onBack, projectStatus,
}: AppHeaderProps) {
  const styles = useStyles();
  const badge = environmentBadge(environmentName);

  return (
    <header className={`${styles.header}${onBack ? " canvas-pm-header" : ""}`}>
      <div className={`${styles.brand} canvas-brand`}>
        {/*
          `img_cmp_Header_Button` — a transparent button over the logo whose `OnSelect` runs the
          same `cmp_Header.OnLogoClick` as the back arrow, so on PM screens the logo also returns
          to the project list (through the router, so the unsaved-changes guard still applies).
        */}
        {onBack ? (
          <Button
            appearance="transparent"
            className={styles.logoButton}
            onClick={onBack}
            title="VSB Cloud"
            aria-label="VSB Cloud"
            data-testid="img_cmp_Header_Button"
          >
            <VsbLogo size={60} />
          </Button>
        ) : (
          <VsbLogo size={60} />
        )}
        <div className={styles.brandText}>
          <Text className={`${styles.title} canvas-brand-title`}>Cloud</Text>
          {/*
            `ico_cmp_Header_Info.Visible` is a literal `false` in the canvas (its Dev check is
            commented out, cmp_Header:269-275), so no (i) icon renders beside the version
            (canvas screenshot, 28 Oct 2026). `environmentInfoColor` keeps its colour switch.
          */}
          <span className={styles.versionLine}>
            <Text className={`${styles.version} canvas-brand-version`}>{versionLabel(appVersion, environmentName)}</Text>
          </span>
        </div>
        {badge ? <Badge appearance="tint" color="warning">{badge}</Badge> : null}
      </div>

      {/*
        * `con_cmp_Header_SuitBar` — a 4 x 70 `rec_cmp_Header_Project_State` and the name 6px
        * apart. The bar is a sibling of the title, not a border on it, because its colour and
        * tooltip both come from the project's approval state.
        */}
      {onBack ? (
        /*
         * `Image3` — a 35 x 35 image of a 31 x 31 white square, radius 3.5, stroked #006EB9, with
         * a #006EB9 left arrow; `OnSelect: =cmp_Header.OnLogoClick()`. The SVG is the canvas one,
         * verbatim. The canvas sets no AccessibleLabel or Tooltip, so the name is its action.
         */
        <button
          type="button"
          className="canvas-header-back"
          aria-label="Back"
          data-testid="Image3"
          onClick={onBack}
        >
          <svg width="35" height="35" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <rect x="0.5" y="0.5" width="31" height="31" rx="3.5" fill="white" />
            <rect x="0.5" y="0.5" width="31" height="31" rx="3.5" stroke="#006EB9" />
            <path d="M15.1572 12.1777C14.9794 11.9667 14.6633 11.9395 14.4521 12.1172L10.4521 15.4844L9.99805 15.8672L10.4521 16.249L14.4521 19.6162C14.6634 19.794 14.9794 19.7669 15.1572 19.5557C15.3349 19.3444 15.3079 19.0284 15.0967 18.8506L12.1455 16.3672H22.1406C22.4167 16.3672 22.6405 16.1432 22.6406 15.8672C22.6406 15.591 22.4168 15.3672 22.1406 15.3672H12.1455L15.0967 12.8828C15.3078 12.705 15.335 12.3889 15.1572 12.1777Z" fill="#006EB9" />
          </svg>
        </button>
      ) : null}

      {pageTitle ? (
        <div className="canvas-project-suite">
          <Tooltip content={approvalState ?? "No approval state"} relationship="label">
            <span
              className="canvas-project-state"
              style={{ backgroundColor: approvalStateColour(approvalState) }}
            />
          </Tooltip>
          {onBack ? (
            /*
             * Project Management: `con_cmp_Header_HeaderText` (Semibold) with
             * `con_cmp_Header_ProjectStatus` directly under it — an 18 px status icon and the
             * status text, `Size: =gblAppSizes.Font.Small` (10 pt) at `FontWeight.Lighter`.
             */
            <span className="canvas-project-heading">
              {/* A plain span: Fluent's `Text` here drops the non-Griffel class, so a stylesheet
                  rule on `.canvas-project-title` never reached it (20 Oct 2026). */}
              <span className="canvas-project-title canvas-pm-project-title" title={pageTitle}>{pageTitle}</span>
              {projectStatusVisible(projectStatus, environmentName) ? (
                <span className="canvas-project-status" data-testid="con_cmp_Header_ProjectStatus">
                  <ProjectStatusGlyph status={projectStatus} />
                  <span className="canvas-project-status-text">{projectStatusLabel(projectStatus)}</span>
                </span>
              ) : null}
            </span>
          ) : (
            /*
             * Cost: the same `con_cmp_Header_HeaderText` as the PM header above (20 px, Semibold),
             * as the same kind of element: a plain span carrying only `.canvas-project-title`. It was a
             * Fluent `Text` with a Griffel `pageTitle` (16 px, 28ch cap) that beat the stylesheet's
             * 20 px, so the Cost name rendered smaller and in Fluent's grey (CA-21).
             */
            <span className="canvas-project-title" title={pageTitle}>{pageTitle}</span>
          )}
        </div>
      ) : null}

      <div className={styles.commandSlot} ref={commandSlotRef} />

      <div className={styles.right}>
        {hasError ? (
          <Tooltip content={ERROR_TOOLTIP} relationship="description" withArrow>
            <Button
              appearance="transparent"
              aria-label="An error has occurred"
              data-testid="header-error"
              icon={<WarningFilled color={palette.Error} />}
              onClick={onReportProblem}
            />
          </Tooltip>
        ) : null}

        <Menu>
          <MenuTrigger disableButtonEnhancement>
            {/* Tosca rule 1 — `pcf_HeaderContainerReportError_CommandBar_1.Items[help]`. */}
            <Button
              appearance="transparent"
              icon={<ChevronDownRegular />}
              iconPosition="after"
              aria-label="Help"
              data-testid="header-help"
              // The canvas command-bar caption is regular weight with a grey chevron.
              className={styles.help}
            >
              Help
            </Button>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              <MenuItem icon={<BugRegular />} onClick={onReportProblem}
                aria-label="Report Problem" data-testid="header-help-report-problem">
                Report Problem
              </MenuItem>
              <MenuItem
                icon={<InfoRegular />}
                aria-label="VSB Cloud InfoCenter"
                data-testid="header-help-infocenter"
                disabled={!infoCenterUrl}
                onClick={() => {
                  // The canvas used Launch(url, Blank(), LaunchTarget.Replace), which
                  // navigates the app away and discards unsaved panel state. A new tab is a
                  // deliberate divergence — ProjectDocs/app-docs/02-OPEN-DECISIONS.md D8.
                  if (infoCenterUrl) window.open(infoCenterUrl, "_blank", "noopener");
                }}
              >
                VSB Cloud InfoCenter
              </MenuItem>
            </MenuList>
          </MenuPopover>
        </Menu>

        <Menu>
          <MenuTrigger disableButtonEnhancement>
            <Button className={`${styles.userPill} canvas-user-pill`} aria-label="User" data-testid="header-user">
              {/*
                * `lbl_cmp_In_Header_UserName`: `Text: ="Hi " & User().FullName`, Semibold,
                * `Size: =gblAppSizes.Font.Medium` (11 pt = 14.67 px), `Color: =palette.white`,
                * `X: =15` with `PaddingLeft: =2`, `Width: =165`, `Wrap: =false`. Its own element
                * because `Wrap: false` needs `overflow: hidden`, and the pill itself must stay
                * `overflow: visible` for the avatar to escape it.
                */}
              {/* Dataverse prefixes synced accounts' full name with "# "; the canvas reads
                  User().FullName, which has none, so it is dropped here (28 Oct 2026). */}
              <span className="canvas-user-name">{userName ? `Hi ${userName.replace(/^#\s*/, "")}` : "User"}</span>
              {/*
                * `con_cmp_In_Header_UserImage` is a 50 x 50 box at x 200 / y 12, but what is
                * VISIBLE is `shp_cmp_In_Image_UserBorder` inside it: a 47 x 47 circle at (1, 1),
                * `BorderThickness: =2` in `palette.black`, and `Fill: =palette.white` — a white
                * disc, not a grey one. `img_cmp_In_Header_UserImage` is `User().Image` at 46 x 46
                * on top of it, `RadiusTopLeft: =90` all round. The silhouette is our fallback for
                * a user whose photo Graph would not give us; the canvas simply showed nothing.
                */}
              <span className="canvas-user-avatar">
                {userPhoto ? <img src={userPhoto} alt="" /> : <PersonFilled />}
              </span>
            </Button>
          </MenuTrigger>
          {/*
            * `EveryScreen - Current LoggedIn User Badge.png`: a list of FACTS about the signed-in
            * user, each with its own icon — mail, language, business unit, countries, data scope,
            * version. Two unlabelled grey lines was not that list. Rows with an `ItemVisible` are
            * omitted when it is false; Home and AddHome have none, so they show even when empty, as
            * the canvas draws them (PM menu screenshot, 5 Nov 2026).
            */}
          {/*
            * `Items` on that ContextMenu, in order, with its own `ItemIconName`s:
            *   Settings       "Application Settings" (PM app only), on the two admin roles
            *   Mail           `{gblCurrentUser.Mail}`, `ItemVisible: Not(IsBlank(...))`
            *   LocaleLanguage `{Language}, [{Lang}]`
            *   Home           `{gblCurrentUser.CompanyName}`
            *   AddHome        the editable counties, concatenated
            *   Permissions    "Can edit Project" / "Can view Project" (PM app only)
            *   World          "Project Data All Countries", on `IsProjectDataAllCountries` (Cost app only)
            *   Info           `version {gblAppVersion} ({gblEnvironmentName})`
            * The first item is `$"Hi {User().FullName}"` with no icon - that is the pill's
            * own label, not a row. Business unit and countries were both a Building glyph
            * here; the canvas names two different houses.
            *
            * SOURCE DEFECT (PM app): `App.OnStart` first sets `gblCurrentUser` to
            * `varCurrentUserProfile` (Mail and CompanyName from `Users`), then REPLACES it with the
            * role record (`App.pa.yaml:992-1042`), which carries neither. So the PM canvas never
            * shows its Mail row and draws Home as an empty row; the Cost app builds the record with
            * both and shows them. Both rows take their real values here, in both headers.
            */}
          <MenuPopover>
            <MenuList className={styles.badgeMenu}>
              {/* Rule 2: these rows SHOW the user's own data, so each aria-label names the row's kind
                  (the canvas `ItemIconName`), never the value it displays. */}
              {onAppSettings ? (
                <MenuItem icon={<Mdl2MenuIcon path={MDL2_PATH.settings} />} onClick={onAppSettings}
                  aria-label="Application Settings" data-testid="header-user-app-settings">
                  Application Settings
                </MenuItem>
              ) : null}
              {userEmail ? <MenuItem icon={<Mdl2MenuIcon path={MDL2_PATH.mail} />} aria-label="Mail" data-testid="header-user-mail">{userEmail}</MenuItem> : null}
              {userLanguage
                ? <MenuItem icon={<Mdl2MenuIcon path={MDL2_PATH.localeLanguage} />} aria-label="Language" data-testid="header-user-language">{userLanguage}</MenuItem>
                : null}
              {/* Home and AddHome have no `ItemVisible` in either app: always a row, empty when unknown. */}
              <MenuItem icon={<Mdl2MenuIcon path={MDL2_PATH.home} />} aria-label="Business unit" data-testid="header-user-business-unit">{userBusinessUnit ?? ""}</MenuItem>
              <MenuItem icon={<Mdl2MenuIcon path={MDL2_PATH.addHome} />} aria-label="Countries" data-testid="header-user-countries">{userCountries ?? ""}</MenuItem>
              {userPermission
                ? <MenuItem icon={<Mdl2MenuIcon path={MDL2_PATH.permissions} />} aria-label="Permissions" data-testid="header-user-permissions">{userPermission}</MenuItem>
                : null}
              {userDataScope
                ? <MenuItem icon={<Mdl2MenuIcon path={MDL2_PATH.world} />} aria-label="Data scope" data-testid="header-user-data-scope">{userDataScope}</MenuItem>
                : null}
              <MenuItem icon={<Mdl2MenuIcon path={MDL2_PATH.info} />} aria-label="Version" data-testid="header-user-version">
                {`version ${appVersion ?? ""} (${environmentName ?? ""})`}
              </MenuItem>
            </MenuList>
          </MenuPopover>
        </Menu>
      </div>
    </header>
  );
}
