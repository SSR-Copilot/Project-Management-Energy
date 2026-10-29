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
  BugRegular, GlobeRegular, HomeAddRegular, HomeRegular, InfoRegular, LocalLanguageRegular,
  LockClosedRegular, MailRegular, PersonFilled, ProhibitedRegular, SettingsRegular, WarningFilled,
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
  pageTitle: {
    fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase400,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    maxWidth: "28ch",
  },
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
    marginLeft: "60px", marginRight: "30px", flexShrink: 0,
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

export interface AppHeaderProps {
  /** The project name, on the project-scoped cost screens. Absent on the overview. */
  pageTitle?: string;
  /** `Project.Approval` — colours the 4 x 70 bar left of the name, and is its tooltip. */
  approvalState?: string;
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
  userLanguage, userBusinessUnit, userCountries, userDataScope,
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
            <Text className={`${styles.pageTitle} canvas-project-title`} title={pageTitle}>{pageTitle}</Text>
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
              {/* Rule 2: these rows SHOW the user's own data, so each aria-label names the row's kind
                  (the canvas `ItemIconName`), never the value it displays. */}
              {onAppSettings ? (
                <MenuItem icon={<SettingsRegular />} onClick={onAppSettings}
                  aria-label="Application Settings" data-testid="header-user-app-settings">
                  Application Settings
                </MenuItem>
              ) : null}
              {userEmail ? <MenuItem icon={<MailRegular />} aria-label="Mail" data-testid="header-user-mail">{userEmail}</MenuItem> : null}
              {userLanguage
                ? <MenuItem icon={<LocalLanguageRegular />} aria-label="Language" data-testid="header-user-language">{userLanguage}</MenuItem>
                : null}
              {userBusinessUnit
                ? <MenuItem icon={<HomeRegular />} aria-label="Business unit" data-testid="header-user-business-unit">{userBusinessUnit}</MenuItem>
                : null}
              {userCountries
                ? <MenuItem icon={<HomeAddRegular />} aria-label="Countries" data-testid="header-user-countries">{userCountries}</MenuItem>
                : null}
              {userDataScope
                ? <MenuItem icon={<GlobeRegular />} aria-label="Data scope" data-testid="header-user-data-scope">{userDataScope}</MenuItem>
                : null}
              <MenuItem icon={<InfoRegular />} aria-label="Version" data-testid="header-user-version">
                {`version ${appVersion ?? ""} (${environmentName ?? ""})`}
              </MenuItem>
            </MenuList>
          </MenuPopover>
        </Menu>
      </div>
    </header>
  );
}
