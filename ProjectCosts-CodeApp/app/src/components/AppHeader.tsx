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
  BugRegular, InfoRegular, PersonRegular, WarningFilled, ChevronDownRegular,
} from "@fluentui/react-icons";
import type { Ref } from "react";
import { layout, palette, space } from "@/theme/tokens";
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
  userPill: {
    backgroundColor: palette.themePrimary,
    color: palette.white,
    borderRadius: "16px",
    paddingLeft: space.m, paddingRight: space.m,
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

/** `pcf_HeaderContainerReportError_WarningIcon.Tooltip`, verbatim. */
export const ERROR_TOOLTIP =
  "An error has occurred!\n\n" +
  "If you encounter any issues, please report them via Help --> Report problem. " +
  "Technical details will be automatically included. " +
  "Your input helps us improve. Thank you for your cooperation.";

export interface AppHeaderProps {
  /** The project name, on the project-scoped cost screens. Absent on the overview. */
  pageTitle?: string;
  userName?: string;
  userEmail?: string;
  appVersion?: string;
  environmentName?: string;
  infoCenterUrl?: string;
  /** True once the equivalent of `App.OnError` has captured something. */
  hasError: boolean;
  onReportProblem: () => void;
  /** Receives the element the active screen portals its command bar into. */
  commandSlotRef?: Ref<HTMLDivElement>;
}

export function AppHeader({
  pageTitle, userName, userEmail, appVersion, environmentName,
  infoCenterUrl, hasError, onReportProblem, commandSlotRef,
}: AppHeaderProps) {
  const styles = useStyles();
  const badge = environmentBadge(environmentName);

  return (
    <header className={styles.header}>
      <div className={`${styles.brand} canvas-brand`}>
        <VsbLogo size={60} />
        <div className={styles.brandText}>
          <Text className={`${styles.title} canvas-brand-title`}>Cloud</Text>
          <Text className={`${styles.version} canvas-brand-version`}>{versionLabel(appVersion, environmentName)}</Text>
        </div>
        {badge ? <Badge appearance="tint" color="warning">{badge}</Badge> : null}
      </div>

      {pageTitle ? (
        <Text className={`${styles.pageTitle} canvas-project-title`} title={pageTitle}>{pageTitle}</Text>
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
            <Button appearance="transparent" icon={<ChevronDownRegular />} iconPosition="after">
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
              {userName ? `Hi ${userName}` : "User"}
              <span className="canvas-user-avatar"><PersonRegular /></span>
            </Button>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              {userEmail ? <MenuItem disabled>{userEmail}</MenuItem> : null}
              <MenuItem disabled>
                {`version ${appVersion ?? ""} (${environmentName ?? ""})`}
              </MenuItem>
            </MenuList>
          </MenuPopover>
        </Menu>
      </div>
    </header>
  );
}
