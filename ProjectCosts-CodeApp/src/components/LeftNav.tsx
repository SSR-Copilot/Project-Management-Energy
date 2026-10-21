/**
 * Replaces `cmp_Left_Navigation` — a canvas component that itself hosted
 * `cat_PowerCAT.Nav`, so this removes two layers at once.
 *
 * The canvas rail took an `Items` table and returned `SelectedKey`; screens then toggled
 * container visibility on it. Here it is a real nav landmark with real links, so the browser
 * back button, middle-click and keyboard navigation all work — none of which they did before.
 *
 * The green left-edge accent bar on the selected item (screenshot r06) is reproduced.
 */
import { Button, makeStyles, mergeClasses, tokens, Tooltip } from "@fluentui/react-components";
import {
  BookOpenFilled, DocumentEditRegular, DocumentPersonRegular, MoneyRegular, TextNumberListLtrRegular,
  TableSimpleRegular, ChevronDownRegular, ChevronUpRegular, NavigationRegular,
  FlagRegular, FlashRegular, BoxMultipleRegular, PeopleTeamRegular,
  CalendarLtrRegular, PersonArrowRightRegular, DataTrendingRegular,
  AlertBadgeRegular, PersonAccountsRegular, CalendarClockRegular,
} from "@fluentui/react-icons";
import { useMemo, useState, type ReactElement } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { activeNavKey, navItemsFor, parentOf, railSection, type NavItem } from "@/app/navigation";
import { useSession } from "@/app/SessionContext";
import { costLocation, COST_PATHS } from "@/app/deepLinks";
import { layout, palette, space } from "@/theme/tokens";

/*
 * `LeftNavigationMenu.ItemIconName` (`App.pa.yaml:87-140`), which names Fabric icons, mapped to
 * their Fluent v9 equivalents. Every rail item used to render `DocumentRegular` — a plain sheet —
 * so DEVEX/CAPEX lost its solid reading-mode glyph, the OPEX items lost the pencil that makes
 * them editable pages, and Contracts was indistinguishable from its siblings.
 */
const ICONS: Record<NavItem["icon"], ReactElement> = {
  projects: <TableSimpleRegular />,
  // ReadingModeSolid — an open book, and the only FILLED glyph in the rail.
  capex: <BookOpenFilled />,
  opex: <DocumentEditRegular />,      // PageEdit
  document: <DocumentEditRegular />,  // PageEdit
  // TextDocumentShared — a document with a person, not a plain sheet of lines.
  contract: <DocumentPersonRegular />,
  currency: <MoneyRegular />,         // AllCurrency
  // Project Management rails (`ItemIconName` in `LeftNavigationMenu` / `LeftAdminNavigationMenu`):
  flag: <FlagRegular />,                       // Flag
  generator: <FlashRegular />,                 // TriggerApproval
  production: <BoxMultipleRegular />,          // ProductVariant
  // CheckList — Fabric draws it as a NUMBERED list (PO screenshot comparison, 20 Oct 2026).
  checklist: <TextNumberListLtrRegular />,     // CheckList
  team: <PeopleTeamRegular />,                 // Teamwork
  planning: <CalendarLtrRegular />,            // PlanView
  gridOperator: <PersonArrowRightRegular />,   // FollowUser
  // Money — Fabric's banknote, not a hand holding one (PO screenshot comparison, 20 Oct 2026).
  money: <MoneyRegular />,                     // Money
  financial: <DataTrendingRegular />,          // Financial
  gates: <AlertBadgeRegular />,                // ReminderGroup
  accounts: <PersonAccountsRegular />,         // AccountManagement
  dateTime: <CalendarClockRegular />,          // DateTime
};

/*
 * `Image2.Image` in the PM app's `cmp_Left_Navigation`, verbatim: a panel with a LEFT arrow
 * while `gblLeftNavigationMenuIsExpanded`, a panel with a RIGHT arrow once collapsed.
 */
const PANEL_COLLAPSE_PATH = "M17 9H0V0H17V9ZM1 8H4V1H1V8ZM5 8H16V1H5V8ZM9.85352 2.35352L8.20703 4H12V5H8.20703L9.85352 6.64648L9.14648 7.35352L6.29297 4.5L9.14648 1.64648L9.85352 2.35352Z";
const PANEL_EXPAND_PATH = "M0 9H17V0H0V9ZM16 8H13V1H16V8ZM12 8H1V1H12V8ZM7.14648 2.35352L8.79297 4H5V5H8.79297L7.14648 6.64648L7.85352 7.35352L10.707 4.5L7.85352 1.64648L7.14648 2.35352Z";

/**
 * `icon_Left_Navigation_Expand` — ONE canvas control, rendered at the top of the Cost rail and at
 * the bottom of the PM/admin rail (never both), so the id is shared through this constant.
 */
const EXPAND_TEST_ID = "icon_Left_Navigation_Expand";

/** `lbl_Left_Navigation_Expand.Text` — the same caption in both states. */
const COLLAPSE_CAPTION = "Collapse Menu";
/** `icon_Left_Navigation_Expand.Tooltip`, verbatim — "naviagtion" is the canvas spelling. */
const collapseTooltip = (expanded: boolean) => `${expanded ? "Decrease" : "Expand"} left naviagtion panel`;
/** `gblAppSizes.LeftNavigation.DecreasedWidth` — the PM rail's container width once collapsed. */
const PM_RAIL_COLLAPSED_WIDTH = 32;

/** The rail's accessible name per section. */
const RAIL_LABEL = { cost: "Cost sections", project: "Project sections", admin: "Administration sections" } as const;

const useStyles = makeStyles({
  rail: {
    display: "flex", flexDirection: "column",
    flexShrink: 0,
    borderRightWidth: "1px",
    borderRightStyle: "solid",
    borderRightColor: tokens.colorNeutralStroke2,
    backgroundColor: tokens.colorNeutralBackground1,
    overflowY: "auto",
    // `con_Left_Navigation` is `padding: 4px 0`.
    paddingTop: "4px",
    paddingBottom: "4px",
  },
  item: {
    display: "flex", alignItems: "center", gap: space.s,
    paddingTop: space.s, paddingBottom: space.s,
    paddingLeft: space.m, paddingRight: space.s,
    color: tokens.colorNeutralForeground1,
    textDecorationLine: "none",
    fontSize: tokens.fontSizeBase200,
    // The accent bar lives on the left edge and is transparent unless selected.
    borderLeftWidth: "4px",
    borderLeftStyle: "solid",
    borderLeftColor: "transparent",
    ":hover": { backgroundColor: palette.hoverButton },
  },
  /*
   * Selected reads as a grey band with a blue edge and BOLD DARK text — not blue text on a
   * blue tint (`Cost App - Left Panel.png`, the Contracts row). The accent is the theme blue,
   * not the green used elsewhere in the shell.
   */
  itemSelected: {
    backgroundColor: palette.Grayscale30,
    borderLeftColor: palette.themePrimary,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  child: { paddingLeft: space.xxl },
  group: {
    display: "flex", alignItems: "center", gap: space.s, width: "100%",
    justifyContent: "flex-start",
    paddingLeft: space.m,
    borderLeftWidth: "4px",
    borderLeftStyle: "solid",
    borderLeftColor: "transparent",
  },
  label: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  disabled: { color: tokens.colorNeutralForegroundDisabled, pointerEvents: "none" },
});

/**
 * `adminVisible` — the canvas `ItemVisible: Or(IsApplicationAdministrator, IsControllerOwnData)`
 * on every admin row (`app/adminAccess.ts`). Only the admin rail uses it.
 */
export function LeftNav({ adminVisible = true }: { adminVisible?: boolean } = {}) {
  const styles = useStyles();
  const location = useLocation();
  const [expanded, setExpanded] = useState(true);
  const section = railSection(location.pathname);
  const items = navItemsFor(section);
  const active = activeNavKey(location.pathname, items);

  // The OPEX group starts open when the current screen is one of its children, which is
  // what the canvas rail showed on a deep link into Land Lease.
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(parentOf(active, items) ? [parentOf(active, items) as string]
      : section === "admin" ? ["GatesKey", "StandardAssumptionsKey"] : ["OpexCostsKey"]),
  );

  const visible = useMemo(
    () => items.filter((i) => i.visible && (section !== "admin" || adminVisible)),
    [items, section, adminVisible],
  );
  const roots = visible.filter((i) => !i.parentKey);
  /*
   * The Project Management and admin screens instance the PM app's `cmp_Left_Navigation`,
   * whose `con_Left_Navigation` lists `pcf_Left_Navigation_Menu` FIRST and
   * `con_Left_Navigation_Header` after it — so the items start at the top and the "Collapse
   * Menu" row sits at the bottom. The Cost app's copy of the component has the header first,
   * which is the hamburger row the cost screens keep.
   */
  const pmRail = section === "project" || section === "admin";
  const collapsedWidth = pmRail ? PM_RAIL_COLLAPSED_WIDTH : layout.railWidthCollapsed;

  return (
    <nav
      className={`${styles.rail} canvas-rail${pmRail ? " canvas-rail-pm" : ""}`}
      aria-label={RAIL_LABEL[section ?? "cost"]}
      style={{ width: expanded ? layout.railWidth : collapsedWidth }}
    >
      {pmRail ? null : <>
      {/*
        * `con_Left_Navigation_Header` with `icon_Left_Navigation_Expand` inside it, and
        * `rec_Left_Navigation_Expanded_Delimiter` as its own full-width rectangle below —
        * the canvas draws the line as a control, not as a border on the button.
        */}
      <div className="canvas-rail-header">
        <Tooltip content={expanded ? "Collapse menu" : "Expand menu"} relationship="label">
          <Button
            appearance="transparent"
            data-testid={EXPAND_TEST_ID}
            icon={<NavigationRegular />}
            aria-expanded={expanded}
            /*
             * Tosca rule 1. The `Tooltip relationship="label"` above already names this for a
             * screen reader, but it does so through `aria-labelledby` pointing at a tooltip
             * that only exists while hovered — nothing for a scanner to read at rest.
             */
            aria-label={expanded ? "Collapse menu" : "Expand menu"}
            onClick={() => setExpanded((v) => !v)}
          />
        </Tooltip>
      </div>
      <span className="canvas-rail-divider" aria-hidden="true" />
      </>}

      {roots.map((item) => {
        const children = visible.filter((c) => c.parentKey === item.key);
        const isGroup = children.length > 0 && !item.path;
        const open = openGroups.has(item.key);

        if (isGroup) {
          return (
            <div key={item.key}>
              {/*
                * The group header shows the expand CHEVRON where its siblings show an icon, and
                * shows no icon of its own — see `Cost App - Left Panel.png`, where OPEX reads
                * "⌃ OPEX" against "📄 Land Lease" below it. Rendering `ItemIconName` here as
                * well, with the chevron pushed to the right, is what made this row the odd one.
                */}
              <Button
                appearance="transparent"
                data-testid={`rail-group-${item.key}`}
                className={styles.group}
                icon={open ? <ChevronUpRegular /> : <ChevronDownRegular />}
                iconPosition="before"
                aria-expanded={open}
                // Tosca rule 1 — and the label is not rendered at all on a collapsed rail,
                // so without this the group header has no accessible name there either.
                aria-label={item.label}
                onClick={() =>
                  setOpenGroups((prev) => {
                    const next = new Set(prev);
                    if (next.has(item.key)) next.delete(item.key);
                    else next.add(item.key);
                    return next;
                  })
                }
              >
                {expanded ? <span className={styles.label}>{item.label}</span> : null}
              </Button>
              {open
                ? children.map((child) => (
                    <NavItemLink key={child.key} item={child} indented expanded={expanded} />
                  ))
                : null}
            </div>
          );
        }

        return <NavItemLink key={item.key} item={item} expanded={expanded} />;
      })}

      {pmRail ? (
        /*
         * `con_Left_Navigation_Header` (45 high): `rec_Left_Navigation_Expanded_Delimiter`, a
         * 3 px #f3f2f1 line across its top; `Image2`, the 28 x 28 panel glyph at x 5; and
         * `lbl_Left_Navigation_Expand`, "Collapse Menu" at 11 pt in #2c2c2c. Image and the
         * transparent `icon_Left_Navigation_Expand` over it share `OnSelect: =OnExpand()`, which
         * flips `gblLeftNavigationMenuIsExpanded`. One button here; it keeps the existing test id.
         * The label is clipped away once the rail is 32 wide (`Width: =Parent.Width-38`).
         */
        <div className="canvas-rail-collapse">
          <span className="canvas-rail-collapse-delimiter" aria-hidden="true" />
          <Tooltip content={collapseTooltip(expanded)} relationship="description">
            <Button
              appearance="transparent"
              data-testid={EXPAND_TEST_ID}
              aria-expanded={expanded}
              aria-label="Collapse Menu"
              onClick={() => setExpanded((v) => !v)}
              icon={
                <svg width="17" height="9" viewBox="0 0 19 9" fill="none" aria-hidden="true">
                  <path d={expanded ? PANEL_COLLAPSE_PATH : PANEL_EXPAND_PATH} fill="#595959" />
                </svg>
              }
            >
              {expanded ? <span className="canvas-rail-collapse-label">{COLLAPSE_CAPTION}</span> : null}
            </Button>
          </Tooltip>
        </div>
      ) : null}
    </nav>
  );
}

function NavItemLink({
  item, indented = false, expanded,
}: { item: NavItem; indented?: boolean; expanded: boolean }) {
  const styles = useStyles();
  const { projectId } = useSession();
  const { pathname } = useLocation();
  if (!item.path) return null;
  const costPath = COST_PATHS.find((path) => path === item.path);
  const items = navItemsFor(railSection(pathname));
  // Project Management routes carry `?projectId=` exactly as the cost routes do.
  const to = costPath && projectId ? costLocation(costPath, projectId)
    : item.path.startsWith("/project/") && projectId
      ? { pathname: item.path, search: `?${new URLSearchParams({ projectId })}` }
      : item.path;
  return (
    <NavLink
      to={to}
      // The canvas `ItemKey` (configuration, stable across captions).
      data-testid={`rail-${item.key}`}
      aria-current={activeNavKey(pathname, items) === item.key ? "page" : undefined}
      className={() =>
        mergeClasses(
          styles.item,
          indented && styles.child,
          activeNavKey(pathname, items) === item.key && styles.itemSelected,
          !item.enabled && styles.disabled,
        )
      }
      aria-disabled={!item.enabled}
      // Tosca rule 1. `title` is a tooltip, not a name a scanner reads, and the label span is
      // not rendered on a collapsed rail — so the icon-only state had no name at all.
      aria-label={item.label}
      title={item.label}
    >
      {ICONS[item.icon]}
      {expanded ? <span className={styles.label}>{item.label}</span> : null}
    </NavLink>
  );
}
