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
  Text, Tooltip, makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import {
  ArrowLeftRegular, BugRegular, GlobeRegular, HomeAddRegular, HomeRegular, InfoRegular, LocalLanguageRegular,
  MailRegular, PersonRegular, SettingsRegular, WarningFilled, ChevronDownRegular,
} from "@fluentui/react-icons";
import type { Ref } from "react";
import { layout, palette, space } from "@/theme/tokens";
import { APPROVAL_STATE } from "@/domain/project";
import { VsbLogo } from "./VsbLogo";

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
  /** The logo as a "Back to projects" button: no Fluent padding, so the band does not shift. */
  logoButton: {
    minWidth: 0, height: "auto",
    paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
  },
  /** A page title with no approval-state bar beside it (settings screens). */
  plainTitle: {
    display: "flex", alignItems: "center", gap: space.xs, minWidth: 0, flexShrink: 1,
  },
  headingReset: { marginTop: 0, marginBottom: 0 },
  /*
   * `cmp_Header`'s `Image3` (Header:300-325): a 35 x 35 image (`Height: =35`, `Width:
   * =Self.Height`, :309/:325) whose SVG is a white square with a 1-px `#006EB9` stroke and rx 3.5
   * on a 32 grid (:315-316) and a `#006EB9` arrow (:317). Parity round 1, G-6.
   */
  backArrow: {
    boxSizing: "border-box",
    width: "35px", minWidth: "35px", height: "35px",
    paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0,
    backgroundColor: palette.white,
    borderTopWidth: "1px", borderRightWidth: "1px", borderBottomWidth: "1px", borderLeftWidth: "1px",
    borderTopStyle: "solid", borderRightStyle: "solid", borderBottomStyle: "solid", borderLeftStyle: "solid",
    borderTopColor: palette.themePrimary, borderRightColor: palette.themePrimary,
    borderBottomColor: palette.themePrimary, borderLeftColor: palette.themePrimary,
    borderTopLeftRadius: "4px", borderTopRightRadius: "4px",
    borderBottomLeftRadius: "4px", borderBottomRightRadius: "4px",
    color: palette.themePrimary,
    flexShrink: 0,
    // `HoverFill` / `PressedFill` are transparent over the SVG (:311, :324): the square never changes.
    ":hover": {
      backgroundColor: palette.white, color: palette.themePrimary,
      borderTopColor: palette.themePrimary, borderRightColor: palette.themePrimary,
      borderBottomColor: palette.themePrimary, borderLeftColor: palette.themePrimary,
    },
    ":hover:active": {
      backgroundColor: palette.white, color: palette.themePrimary,
      borderTopColor: palette.themePrimary, borderRightColor: palette.themePrimary,
      borderBottomColor: palette.themePrimary, borderLeftColor: palette.themePrimary,
    },
  },
  brandText: { display: "flex", flexDirection: "column", lineHeight: 1.15 },
  title: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase500 },
  version: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase100 },
  /** Where the screen's command bar lands. Takes the slack so Help stays right-aligned. */
  commandSlot: { flex: 1, minWidth: 0, display: "flex", alignItems: "center" },
  pageTitle: {
    fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase400,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    maxWidth: "28ch",
  },
  right: { display: "flex", alignItems: "center", gap: space.s, flexShrink: 0 },
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
 *
 * Keyed on the `vsb_approvalstates` OPTION VALUE, not the label: the canvas table keys on the
 * label text, but a label is display data (the SDK 1.5 regeneration showed generated labels can
 * change under us), so the colour follows the stored value and the label is only the tooltip.
 */
export const APPROVAL_STATE_COLOUR: Record<number, string> = {
  [APPROVAL_STATE.draft]: palette.akzent2,
  [APPROVAL_STATE.approving]: palette.akzent4,
  [APPROVAL_STATE.approved]: palette.akzent3,
  [APPROVAL_STATE.rejected]: palette.akzent5,
};

export function approvalStateColour(state: number | undefined): string {
  return (state !== undefined && APPROVAL_STATE_COLOUR[state]) || palette.white;
}

/** `pcf_HeaderContainerReportError_WarningIcon.Tooltip`, verbatim. */
export const ERROR_TOOLTIP =
  "An error has occurred!\n\n" +
  "If you encounter any issues, please report them via Help --> Report problem. " +
  "Technical details will be automatically included. " +
  "Your input helps us improve. Thank you for your cooperation.";

export interface AppHeaderProps {
  /** The project name, on the project-scoped cost screens. Absent on the overview. */
  pageTitle?: string;
  /** `Project.Approval` as its display LABEL — the tooltip of the 4 x 70 bar left of the name. */
  approvalState?: string;
  /** `Project.Approval` as its OPTION VALUE — what colours that bar (`approvalStateColour`). */
  approvalStateValue?: number;
  userName?: string;
  userEmail?: string;
  /** `img_cmp_In_Header_UserImage.Image = User().Image`, already a `data:` URL. */
  userPhoto?: string;
  /** The remaining user-badge rows. Each is omitted from the menu when this app has no value. */
  userLanguage?: string;
  userBusinessUnit?: string;
  userCountries?: string;
  userDataScope?: string;
  appVersion?: string;
  environmentName?: string;
  infoCenterUrl?: string;
  /** True once the equivalent of `App.OnError` has captured something. */
  hasError: boolean;
  onReportProblem: () => void;
  /**
   * `cmp_Header`'s `appSettingsKey` item ("Application Settings", icon Settings). Passed only for
   * users the canvas shows it to: `Or(IsApplicationAdministrator, IsControllerOwnData)`.
   */
  onOpenSettings?: () => void;
  /** Receives the element the active screen portals its command bar into. */
  commandSlotRef?: Ref<HTMLDivElement>;
  /**
   * `cmp_Header.OnLogoClick` — the way out of an area with no other link home. When set, the
   * logo becomes a button and a back arrow is drawn before the title; both call it. The six
   * admin screens pass `Navigate('Project Main Screen')` (01-entry-and-access §1.4, G7).
   * Absent → the logo is a plain image, as it is on the cost and PM screens today.
   */
  onHome?: () => void;
  /**
   * Draw `pageTitle` without the approval-state bar and its tooltip. For screens whose title is
   * not a project (Application Settings), where the bar would read "No approval state".
   */
  hideApprovalState?: boolean;
}

/** Accessible name of both the logo button and the back arrow. */
export const HOME_LABEL = "Back to projects";

export function AppHeader({
  pageTitle, approvalState, approvalStateValue, userName, userEmail, userPhoto,
  userLanguage, userBusinessUnit, userCountries, userDataScope,
  appVersion, environmentName, infoCenterUrl, hasError, onReportProblem, onOpenSettings,
  commandSlotRef, onHome, hideApprovalState,
}: AppHeaderProps) {
  const styles = useStyles();
  const badge = environmentBadge(environmentName);

  return (
    <header className={styles.header}>
      <div className={`${styles.brand} canvas-brand`}>
        {onHome ? (
          <Tooltip content={HOME_LABEL} relationship="label">
            <Button appearance="transparent" className={styles.logoButton} onClick={onHome}>
              <VsbLogo size={60} />
            </Button>
          </Tooltip>
        ) : (
          <VsbLogo size={60} />
        )}
        <div className={styles.brandText}>
          <Text className={`${styles.title} canvas-brand-title`}>Cloud</Text>
          <Text className={`${styles.version} canvas-brand-version`}>{versionLabel(appVersion, environmentName)}</Text>
        </div>
        {badge ? <Badge appearance="tint" color="warning">{badge}</Badge> : null}
      </div>

      {/*
        * `con_cmp_Header_SuitBar` — a 4 x 70 `rec_cmp_Header_Project_State` and the name 6px
        * apart. The bar is a sibling of the title, not a border on it, because its colour and
        * tooltip both come from the project's approval state.
        */}
      {/*
        * `cmp_Header`'s blue back arrow (`Image3`, Header:300-322) at the start of the title bar,
        * raising the same `OnLogoClick` as the logo. Drawn as the canvas's bordered white square.
        */}
      {onHome ? (
        <Tooltip content={HOME_LABEL} relationship="label">
          <Button
            appearance="outline"
            className={mergeClasses("canvas-back-arrow", styles.backArrow)}
            icon={<ArrowLeftRegular color={palette.themePrimary} />}
            onClick={onHome}
          />
        </Tooltip>
      ) : null}

      {pageTitle && hideApprovalState ? (
        <div className={styles.plainTitle}>
          <Text
            as="h1"
            className={`${styles.pageTitle} ${styles.headingReset} canvas-project-title`}
            title={pageTitle}
          >
            {pageTitle}
          </Text>
        </div>
      ) : pageTitle ? (
        <div className="canvas-project-suite">
          <Tooltip content={approvalState ?? "No approval state"} relationship="label">
            <span
              className="canvas-project-state"
              style={{ backgroundColor: approvalStateColour(approvalStateValue) }}
            />
          </Tooltip>
          <Text className={`${styles.pageTitle} canvas-project-title`} title={pageTitle}>{pageTitle}</Text>
        </div>
      ) : null}

      <div className={styles.commandSlot} ref={commandSlotRef} />

      <div className={styles.right}>
        {hasError ? (
          <Tooltip content={ERROR_TOOLTIP} relationship="description" withArrow>
            <Button
              appearance="transparent"
              aria-label="An error has occurred"
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
            >
              Help
            </Button>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              <MenuItem icon={<BugRegular />} onClick={onReportProblem}>
                Report Problem
              </MenuItem>
              <MenuItem
                icon={<InfoRegular />}
                disabled={!infoCenterUrl}
                onClick={() => {
                  // The canvas used Launch(url, Blank(), LaunchTarget.Replace), which
                  // navigates the app away and discards unsaved panel state. A new tab is a
                  // deliberate divergence — docs/02-OPEN-DECISIONS.md D8.
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
            <Button className={`${styles.userPill} canvas-user-pill`} aria-label="User">
              {/*
                * `lbl_cmp_In_Header_UserName`: `Text: ="Hi " & User().FullName`, Semibold,
                * `Size: =gblAppSizes.Font.Medium` (11 pt = 14.67 px), `Color: =palette.white`,
                * `X: =15` with `PaddingLeft: =2`, `Width: =165`, `Wrap: =false`. Its own element
                * because `Wrap: false` needs `overflow: hidden`, and the pill itself must stay
                * `overflow: visible` for the avatar to escape it.
                */}
              <span className="canvas-user-name">{userName ? `Hi ${userName}` : "User"}</span>
              {/*
                * `con_cmp_In_Header_UserImage` is a 50 x 50 box at x 200 / y 12, but what is
                * VISIBLE is `shp_cmp_In_Image_UserBorder` inside it: a 47 x 47 circle at (1, 1),
                * `BorderThickness: =2` in `palette.black`, and `Fill: =palette.white` — a white
                * disc, not a grey one. `img_cmp_In_Header_UserImage` is `User().Image` at 46 x 46
                * on top of it, `RadiusTopLeft: =90` all round. The silhouette is our fallback for
                * a user whose photo Graph would not give us; the canvas simply showed nothing.
                */}
              <span className="canvas-user-avatar">
                {userPhoto ? <img src={userPhoto} alt="" /> : <PersonRegular />}
              </span>
            </Button>
          </MenuTrigger>
          {/*
            * `EveryScreen - Current LoggedIn User Badge.png`: a list of FACTS about the signed-in
            * user, each with its own icon — mail, language, business unit, countries, data scope,
            * version. Two unlabelled grey lines was not that list. Rows whose data this app does
            * not hold are omitted rather than shown blank.
            */}
          {/*
            * `Items` on that ContextMenu, in order, with its own `ItemIconName`s:
            *   Mail           `{gblCurrentUser.Mail}`, `ItemVisible: Not(IsBlank(...))`
            *   LocaleLanguage `{Language}, [{Lang}]`
            *   Home           `{gblCurrentUser.CompanyName}`
            *   AddHome        the editable counties, concatenated
            *   World          "Project Data All Countries", on `IsProjectDataAllCountries`
            *   Info           `version {gblAppVersion} ({gblEnvironmentName})`
            * The first item is `$"Hi {User().FullName}"` with no icon - that is the pill's
            * own label, not a row. Business unit and countries were both a Building glyph
            * here; the canvas names two different houses.
            */}
          <MenuPopover>
            <MenuList className={styles.badgeMenu}>
              {/* The row right after the greeting (`cmp_Header.pa.yaml:860-868`). */}
              {onOpenSettings
                ? <MenuItem icon={<SettingsRegular />} onClick={onOpenSettings}>Application Settings</MenuItem>
                : null}
              {userEmail ? <MenuItem icon={<MailRegular />}>{userEmail}</MenuItem> : null}
              {userLanguage
                ? <MenuItem icon={<LocalLanguageRegular />}>{userLanguage}</MenuItem>
                : null}
              {userBusinessUnit
                ? <MenuItem icon={<HomeRegular />}>{userBusinessUnit}</MenuItem>
                : null}
              {userCountries
                ? <MenuItem icon={<HomeAddRegular />}>{userCountries}</MenuItem>
                : null}
              {userDataScope
                ? <MenuItem icon={<GlobeRegular />}>{userDataScope}</MenuItem>
                : null}
              <MenuItem icon={<InfoRegular />}>
                {`version ${appVersion ?? ""} (${environmentName ?? ""})`}
              </MenuItem>
            </MenuList>
          </MenuPopover>
        </Menu>
      </div>
    </header>
  );
}
