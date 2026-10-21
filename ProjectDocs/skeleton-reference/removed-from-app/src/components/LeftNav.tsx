/**
 * LeftNav — replaces `cmp_Left_Navigation` (both apps), reaching 20 screens.
 *
 * The important behaviour carried over from the canvas `LeftNavigationMenu`:
 *  - `ItemIconColor` encodes DATA COMPLETENESS, not selection. Pale `#8FBCE4` means the
 *    prerequisite field on the selected project is blank; solid `#006EB9` means it is
 *    filled. See domain/navigation.ts for the per-item prerequisites.
 *  - two-level hierarchy in the Cost app (OPEX parent with three children)
 *  - expanded 200px / collapsed 32px, matching gblAppSizes.LeftNavigation
 *
 * New: a completion meter, keyboard navigation, tooltips when collapsed, and the admin
 * section gated behind `canSeeAdminSection`.
 */
import { useLocation, useNavigate } from "react-router-dom";
import {
  makeStyles, tokens, Tooltip, mergeClasses, ProgressBar, Button,
} from "@fluentui/react-components";
import {
  DocumentEditRegular, FlagRegular, CheckmarkCircleRegular, BoxRegular,
  TaskListSquareLtrRegular, PeopleTeamRegular, CalendarLtrRegular, PersonAddRegular,
  MoneyRegular, BuildingBankRegular, BookOpenRegular, DocumentTextRegular,
  WalletCreditCardRegular, ChevronLeftRegular, ChevronRightRegular, SettingsRegular,
  AlertRegular, ContactCardRegular, CalendarClockRegular,
} from "@fluentui/react-icons";
import type { ReactElement } from "react";
import { useAppStore } from "@/store/appStore";
import { canSeeAdminSection } from "@/domain/session";
import {
  navItemColor, completionRatio, railTree, type NavItem,
} from "@/domain/navigation";
import { sizes, space, media, radius } from "@/theme/tokens";
import { useBreakpoint } from "./useBreakpoint";

const ICONS: Record<string, ReactElement> = {
  PageEdit: <DocumentEditRegular />,
  Flag: <FlagRegular />,
  TriggerApproval: <CheckmarkCircleRegular />,
  ProductVariant: <BoxRegular />,
  CheckList: <TaskListSquareLtrRegular />,
  Teamwork: <PeopleTeamRegular />,
  PlanView: <CalendarLtrRegular />,
  FollowUser: <PersonAddRegular />,
  Money: <MoneyRegular />,
  Financial: <BuildingBankRegular />,
  ReadingModeSolid: <BookOpenRegular />,
  TextDocumentShared: <DocumentTextRegular />,
  AllCurrency: <WalletCreditCardRegular />,
  // Admin rail (canvas `LeftAdminNavigationMenu`).
  ReminderGroup: <AlertRegular />,
  AccountManagement: <ContactCardRegular />,
  DateTime: <CalendarClockRegular />,
};

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", height: "100%", minWidth: 0, paddingBlock: space.s },
  group: {
    fontSize: "10px", textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 600,
    color: tokens.colorNeutralForeground3,
    padding: `${space.m} ${space.m} ${space.xs}`,
    whiteSpace: "nowrap",
  },
  item: {
    display: "flex", alignItems: "center", gap: space.s,
    padding: `7px ${space.s}`, marginInline: "6px",
    borderRadius: radius.md,
    color: tokens.colorNeutralForeground1,
    fontSize: "13px", textDecoration: "none", cursor: "pointer",
    border: "none", background: "none", width: "calc(100% - 12px)", textAlign: "left",
    ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
    [media.touch]: { paddingBlock: "11px" },
  },
  itemChild: { paddingLeft: "30px" },
  itemActive: {
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground1,
    fontWeight: 600,
  },
  itemDisabled: { opacity: 0.45, cursor: "not-allowed", pointerEvents: "none" },
  icon: { display: "grid", placeItems: "center", width: "20px", flex: "none", fontSize: "17px" },
  label: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 },
  parentOnly: { color: tokens.colorNeutralForeground3, cursor: "default", ":hover": { backgroundColor: "transparent" } },
  meter: { padding: `${space.s} ${space.m}`, display: "flex", flexDirection: "column", gap: "5px" },
  meterLabel: {
    fontSize: "10px", textTransform: "uppercase", letterSpacing: ".08em",
    color: tokens.colorNeutralForeground3, display: "flex", justifyContent: "space-between",
  },
  spacer: { flex: 1 },
  foot: {
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    paddingTop: space.xs, marginTop: space.xs,
    display: "flex", justifyContent: "flex-start", paddingInline: "6px",
  },
  footCollapsed: { justifyContent: "center" },
  footButton: { justifyContent: "flex-start", width: "100%" },
  collapsed: { justifyContent: "center", marginInline: "2px", width: "calc(100% - 4px)", paddingInline: 0 },
});

export interface LeftNavProps {
  items: NavItem[];
  adminItems?: NavItem[];
  /** Rail heading, e.g. "Project" or "Costs". */
  groupLabel: string;
  /** Show the data-completeness meter (PM only). */
  showCompletion?: boolean;
  /** Disable everything but the first item when no project is selected. */
  requiresProject?: boolean;
}

export function LeftNav({
  items, adminItems, groupLabel, showCompletion, requiresProject,
}: LeftNavProps) {
  const s = useStyles();
  const bp = useBreakpoint();
  const nav = useNavigate();
  const loc = useLocation();
  const project = useAppStore((st) => st.project.selected);
  const user = useAppStore((st) => st.session.user);
  const expanded = useAppStore((st) => st.ui.navExpanded);
  const toggle = useAppStore((st) => st.toggleNav);
  const setSelectedNavKey = useAppStore((st) => st.setSelectedNavKey);
  const setMobileNavOpen = useAppStore((st) => st.setMobileNavOpen);

  // On phones the rail lives in a drawer and is always fully expanded.
  const isCollapsed = !bp.belowMd && !expanded;
  const showAdmin = adminItems?.length && user && canSeeAdminSection(user);
  const ratio = completionRatio(project);

  const go = (item: NavItem) => {
    if (!item.route) return;
    setSelectedNavKey(item.key);
    nav(item.route);
    if (bp.belowMd) setMobileNavOpen(false);
  };

  const renderItem = (item: NavItem, depth: number, gated: boolean) => {
    const active = loc.pathname.startsWith(item.route) && item.route !== "";
    const isParentOnly = item.route === "";
    const disabled = !item.enabled || (gated && !project && item.key !== "GeneralDataCommonKey");
    const color = navItemColor(item, project);

    const body = (
      <button
        key={item.key}
        type="button"
        className={mergeClasses(
          s.item,
          depth > 0 && !isCollapsed && s.itemChild,
          active && s.itemActive,
          disabled && s.itemDisabled,
          isParentOnly && s.parentOnly,
          isCollapsed && s.collapsed,
        )}
        aria-current={active ? "page" : undefined}
        aria-disabled={disabled || undefined}
        disabled={disabled || isParentOnly}
        onClick={() => !isParentOnly && go(item)}
      >
        <span className={s.icon} style={{ color: item.prerequisite ? color : undefined }}>
          {ICONS[item.icon] ?? <DocumentEditRegular />}
        </span>
        {!isCollapsed && <span className={s.label}>{item.label}</span>}
      </button>
    );

    return isCollapsed ? (
      <Tooltip key={item.key} content={item.label} relationship="label" positioning="after" withArrow>
        {body}
      </Tooltip>
    ) : (
      body
    );
  };

  return (
    <div className={s.root}>
      {!isCollapsed && groupLabel && <div className={s.group}>{groupLabel}</div>}
      {railTree(items).map(({ item, depth }) =>
        renderItem(item, depth, Boolean(requiresProject)),
      )}

      {showCompletion && !isCollapsed && (
        <div className={s.meter}>
          <div className={s.meterLabel}>
            <span>Data complete</span>
            <span>{Math.round(ratio * 100)}%</span>
          </div>
          <ProgressBar value={ratio} thickness="medium" />
        </div>
      )}

      {showAdmin && (
        <>
          {!isCollapsed && <div className={s.group}>Administration</div>}
          {adminItems!.map((i) => renderItem(i, 0, false))}
        </>
      )}

      <div className={s.spacer} />

      {!bp.belowMd && (
        <div className={mergeClasses(s.foot, isCollapsed && s.footCollapsed)}>
          {/* The canvas rail labels this control "Collapse Menu" when it is expanded and
              shows the glyph alone when it is not. */}
          <Tooltip content={expanded ? "Collapse Menu" : "Expand Menu"} relationship="label" withArrow>
            <Button
              appearance="subtle" size="small"
              className={s.footButton}
              icon={expanded ? <ChevronLeftRegular /> : <ChevronRightRegular />}
              aria-label={expanded ? "Collapse Menu" : "Expand Menu"}
              aria-expanded={expanded}
              onClick={toggle}
            >
              {isCollapsed ? undefined : "Collapse Menu"}
            </Button>
          </Tooltip>
        </div>
      )}
    </div>
  );
}

export const navRailWidths = sizes.leftNavigation;
export const AdminIcon = SettingsRegular;
