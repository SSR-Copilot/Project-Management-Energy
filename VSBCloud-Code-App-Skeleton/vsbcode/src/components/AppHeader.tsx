/**
 * AppHeader — replaces `cmp_Header` (PM: 34 controls / 726 loc, Cost: 28 / 482). It reaches
 * 21 of the 23 screens; `cmp_User_Badge` is its own component (`UserBadge`) because the two
 * screens that render no header still need it.
 *
 * Reproduced behaviour:
 *  - brand block: the `vsb` logo tile, the "Cloud" wordmark, and the long-form
 *    "Version {gblAppVersion} ({gblEnvironmentName})" beneath it, suppressed in Prod
 *  - project identity strip: ID · name · technology · capacity · cluster state
 *  - Help menu: "Report a problem" opens the error panel; "Info Center" launches
 *    gblInfoCenterLaunchUrl
 *  - the report-error warning icon appears when gblReportError is not blank
 *  - cross-app link (PM ⇄ Costs) built from the environment/app ids
 *  - the environment accent, as a top stripe rather than the canvas's full-bar alpha wash
 *
 * DELIBERATE DEVIATION: the reference screen puts the six project commands inside this row.
 * `App.tsx` renders the header, not the screen, so handing screen-owned `Command[]` (live
 * callbacks and JSX icons) up to the shell would need a Zustand slice — and a selector
 * returning a fresh array is precisely the React #185 trap this repo already documents — or a
 * context. Instead each screen renders `CommandBar` as its first in-page element; `CommandBar`
 * is `position: sticky; top: 0`, so it reads as a header-adjacent command row.
 *
 * New: hamburger below md, theme switch, skip link target, and the whole thing wraps
 * instead of overflowing.
 */
import { type CSSProperties } from "react";
import {
  makeStyles, tokens, Button, MenuButton, Menu, MenuTrigger, MenuPopover, MenuList, MenuItem,
  Tooltip,
} from "@fluentui/react-components";
import {
  NavigationRegular, QuestionCircleRegular, WarningFilled, OpenRegular,
  WeatherMoonRegular, WeatherSunnyRegular, BugRegular, ArrowLeftRegular, InfoRegular,
} from "@fluentui/react-icons";
import { useNavigate } from "react-router-dom";
import { useAppStore, useProjectHeader } from "@/store/appStore";
import { palette, semantic, space, media, envAccent } from "@/theme/tokens";
import {
  versionLabel, canSeeAdminSection, editableCountriesLabel,
  projectStatusLabel, projectStatusVisible,
} from "@/domain/session";
import { VsbLogo } from "./VsbLogo";
import { StateChip } from "./StateChip";
import { UserBadge } from "./UserBadge";
import { useBreakpoint } from "./useBreakpoint";
import { formatWithSeparators } from "@/domain/numeric";

const useStyles = makeStyles({
  bar: {
    display: "flex", alignItems: "center", gap: space.m,
    // `minHeight`, not a fixed `height`: the brand block is now two lines (wordmark plus the
    // long-form version label) and the row must be able to grow rather than clip.
    padding: `0 ${space.l}`, minHeight: "64px",
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    // The environment accent is painted as a top stripe. The canvas washes the whole bar in
    // a low-alpha tint, but reproducing that would mean inventing alpha values that are not
    // in `AppTheme.palette`, which the theme rules forbid — so the transcribed hue is used
    // as a stripe instead. `borderTopColor` is set inline from `envAccent`.
    borderTopWidth: "3px",
    borderTopStyle: "solid",
    borderTopColor: "transparent",
    [media.belowMd]: { padding: `0 ${space.s}`, gap: space.s, minHeight: "56px" },
  },
  brand: { display: "flex", alignItems: "center", gap: space.s, flex: "none", textDecoration: "none" },
  brandStack: { display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0 },
  brandName: {
    // "Cloud", not "VSBCloud": the logo tile already carries the "vsb" wordmark, so the old
    // string rendered as "vsbVSBCloud". Five characters, so it no longer hides below lg.
    fontSize: "20px", fontWeight: 600, letterSpacing: "-.01em", lineHeight: "1.1",
    color: tokens.colorBrandForeground1, whiteSpace: "nowrap",
  },
  version: {
    fontSize: "10px", letterSpacing: ".02em", lineHeight: "1.2",
    color: tokens.colorNeutralForeground3, whiteSpace: "nowrap",
    [media.belowMd]: { display: "none" },
  },
  appName: {
    fontSize: "11px", textTransform: "uppercase", letterSpacing: ".08em",
    color: tokens.colorNeutralForeground3, fontWeight: 600, whiteSpace: "nowrap",
    [media.belowLg]: { display: "none" },
  },
  divider: {
    width: "1px", alignSelf: "stretch", marginBlock: "12px",
    backgroundColor: tokens.colorNeutralStroke2, flex: "none",
    [media.belowMd]: { display: "none" },
  },
  project: {
    display: "flex", alignItems: "center", gap: space.m, minWidth: 0, flex: 1,
    [media.belowMd]: { gap: space.s },
  },
  /** Name over status, the canvas's two stacked containers. */
  identity: { display: "flex", flexDirection: "column", minWidth: 0, gap: "2px" },
  projName: {
    fontSize: "18px", fontWeight: 600, letterSpacing: ".04em",
    color: tokens.colorNeutralForeground1,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0,
    [media.belowMd]: { fontSize: "15px", letterSpacing: "0" },
  },
  projStatus: {
    display: "flex", alignItems: "center", gap: "4px",
    fontSize: "11px", fontWeight: 400,
    color: tokens.colorNeutralForeground3, whiteSpace: "nowrap",
  },
  meta: {
    display: "flex", gap: space.m, alignItems: "center", fontSize: "12px",
    color: tokens.colorNeutralForeground3, whiteSpace: "nowrap",
    [media.belowXl]: { display: "none" },
  },
  right: { display: "flex", alignItems: "center", gap: space.xs, flex: "none", marginLeft: "auto" },
  noProject: { color: tokens.colorNeutralForeground3, fontSize: "13px" },
});

/** Environment → icon colour, exactly as the canvas `ico_cmp_Header_Info` switch does. */
export function envColor(env: string): string | undefined {
  switch (env) {
    case "Dev": return semantic.error;
    case "Nightly": return semantic.warning;
    case "QA": return semantic.success;
    case "Hotfix": return semantic.error;
    default: return undefined; // Transparent in the canvas app
  }
}

export interface AppHeaderProps {
  appName: string;
  /**
   * Hide the mobile navigation button. Pass `false` on a full-width screen — there is no
   * rail there, so the hamburger would open an empty drawer.
   */
  showNavButton?: boolean;
  /**
   * Show the back arrow, which returns to the portfolio list. Every screen the canvas reaches
   * from Project Main has one; the landing screen itself does not.
   */
  showBack?: boolean;
  /**
   * Occupies the project-name slot instead of the selected project.
   *
   * This is how the canvas admin screens work: having no project, they hand `cmp_Header` a
   * pseudo-record — `{ Name: "Checklist settings", Technology: Blank(), Status: Blank(), … }`
   * — so the title renders in the project slot and the status line stays empty.
   */
  pageTitle?: string;
}

export function AppHeader({
  appName, showNavButton = true, showBack = false, pageTitle,
}: AppHeaderProps) {
  const s = useStyles();
  const bp = useBreakpoint();
  const nav = useNavigate();
  const header = useProjectHeader();
  const env = useAppStore((st) => st.session.env);
  const user = useAppStore((st) => st.session.user);
  const lastError = useAppStore((st) => st.ui.lastError);
  const openReport = useAppStore((st) => st.openReportPanel);
  const setMobileNav = useAppStore((st) => st.setMobileNavOpen);
  const theme = useAppStore((st) => st.ui.theme);
  const setTheme = useAppStore((st) => st.setTheme);

  const envName = env?.environmentName ?? "";
  const version = versionLabel(env?.appVersion, envName);
  const stripe = envAccent[envName];

  // The canvas badge menu shows "{Language}, [{Lang}]" — e.g. "en-US, [en]".
  const languageLabel = user?.language ? `${user.language}, [${user.lang}]` : null;

  // A page title stands in for the project; the status line is blank in that case, exactly as
  // the admin screens' pseudo-record produces.
  const title = pageTitle ?? header?.name ?? "";
  const status = pageTitle ? "" : projectStatusLabel(header?.status);
  const showStatus = Boolean(status) && projectStatusVisible(envName);

  return (
    <header
      className={s.bar}
      style={stripe ? ({ borderTopColor: stripe } as CSSProperties) : undefined}
    >
      {bp.belowMd && showNavButton && (
        <Button
          appearance="subtle" icon={<NavigationRegular />} aria-label="Open navigation"
          onClick={() => setMobileNav(true)}
        />
      )}

      <a className={s.brand} href="#/" onClick={(e) => { e.preventDefault(); nav("/"); }}>
        <VsbLogo variant="mark" height={34} />
        <span className={s.brandStack}>
          <span className={s.brandName}>Cloud</span>
          {/* The canvas renders this long form beneath the wordmark and suppresses it in
              Prod; the terse `v… · Env` badge it used to be is gone from the right side. */}
          {version && <span className={s.version}>{version}</span>}
        </span>
        <span className={s.appName}>{appName}</span>
      </a>

      {showBack && (
        <Tooltip content="Back to the project list" relationship="label" withArrow>
          <Button
            appearance="outline"
            icon={<ArrowLeftRegular />}
            aria-label="Back to the project list"
            onClick={() => nav("/projects")}
          />
        </Tooltip>
      )}

      <span className={s.divider} />

      <div className={s.project}>
        {title ? (
          <>
            <span className={s.identity}>
              {/* Name on top, status beneath — the canvas stacks
                  `con_cmp_Header_HeaderText` and `con_cmp_Header_ProjectStatus`. */}
              <span className={s.projName} title={title}>{title}</span>
              {showStatus && (
                <span className={s.projStatus}>
                  <InfoRegular fontSize={12} aria-hidden="true" />
                  {status}
                </span>
              )}
            </span>
            {!pageTitle && header?.status && <StateChip state={header.status} />}
            {!pageTitle && (
              <span className={s.meta}>
                {header?.technology && <span>{header.technology}</span>}
                {header?.capacity != null && header.capacity > 0 && (
                  <span>{formatWithSeparators(header.capacity, "en-GB", 1)} MW</span>
                )}
              </span>
            )}
          </>
        ) : (
          <span className={s.noProject}>No project selected</span>
        )}
      </div>

      <div className={s.right}>
        {lastError && (
          <Tooltip content="An error was recorded. Send it to the team." relationship="label" withArrow>
            <Button
              appearance="subtle"
              icon={<WarningFilled style={{ color: palette.Warning }} />}
              aria-label="An error was recorded"
              onClick={() => openReport()}
            />
          </Tooltip>
        )}

        <Button
          appearance="subtle"
          icon={theme === "dark" ? <WeatherSunnyRegular /> : <WeatherMoonRegular />}
          aria-label={theme === "dark" ? "Use light theme" : "Use dark theme"}
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        />

        <Menu>
          <MenuTrigger disableButtonEnhancement>
            {/* Reads "Help ⌄" as the screenshot shows, collapsing to the icon on a phone.
                `MenuButton`, not `Button`: the chevron is the `menuIcon` slot, which only
                `MenuButton` has, and it is the part the screenshot shows. */}
            <MenuButton
              appearance="subtle"
              icon={<QuestionCircleRegular />}
              aria-label="Help"
            >
              {bp.belowMd ? undefined : "Help"}
            </MenuButton>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              <MenuItem icon={<BugRegular />} onClick={() => openReport()}>
                Report a problem
              </MenuItem>
              <MenuItem
                icon={<OpenRegular />}
                onClick={() => env?.infoCenterUrl && window.open(env.infoCenterUrl, "_blank", "noopener")}
              >
                Info Center
              </MenuItem>
              <MenuItem
                icon={<OpenRegular />}
                onClick={() => {
                  const url = appName === "Project Costs" ? env?.pmAppUrl : env?.costAppUrl;
                  if (url) window.open(url, "_blank", "noopener");
                }}
              >
                Open {appName === "Project Costs" ? "Project Management" : "Project Costs"}
              </MenuItem>
            </MenuList>
          </MenuPopover>
        </Menu>

        {/* The bare avatar is gone: the canvas shows "Hi {User().FullName}" in a filled
            brand pill with the avatar overlapping it. Extracted to `UserBadge` because
            `cmp_User_Badge` exists precisely so the two header-less screens can reuse it. */}
        <UserBadge
          displayName={user?.displayName}
          mail={user?.mail}
          languageLabel={languageLabel}
          companyName={user?.companyName}
          editableCountries={editableCountriesLabel(user?.editableCountries)}
          // Lower-case "version" here: the badge row and the brand block use different
          // casing in the canvas, and both are transcribed rather than harmonised.
          versionLabel={version ? version.replace(/^Version /, "version ") : null}
          compact={bp.belowMd}
          onNavigateAppSettings={
            user && canSeeAdminSection(user)
              ? () => nav("/admin/default-checklists")
              : undefined
          }
        />
      </div>
    </header>
  );
}
