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
  BookOpenFilled, DocumentEditRegular, DocumentPersonRegular, MoneyRegular,
  TableSimpleRegular, ChevronDownRegular, ChevronUpRegular, NavigationRegular,
} from "@fluentui/react-icons";
import { useMemo, useState, type ReactElement } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { NAV_ITEMS, activeNavKey, parentOf, type NavItem } from "@/app/navigation";
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
};

const useStyles = makeStyles({
  rail: {
    display: "flex", flexDirection: "column",
    flexShrink: 0,
    borderRightWidth: "1px",
    borderRightStyle: "solid",
    borderRightColor: tokens.colorNeutralStroke2,
    backgroundColor: tokens.colorNeutralBackground1,
    overflowY: "auto",
    paddingTop: space.s,
  },
  toggle: { alignSelf: "flex-start", marginLeft: space.xs, marginBottom: space.s },
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

export function LeftNav() {
  const styles = useStyles();
  const location = useLocation();
  const [expanded, setExpanded] = useState(true);
  const active = activeNavKey(location.pathname);

  // The OPEX group starts open when the current screen is one of its children, which is
  // what the canvas rail showed on a deep link into Land Lease.
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(parentOf(active) ? [parentOf(active) as string] : ["OpexCostsKey"]),
  );

  const visible = useMemo(() => NAV_ITEMS.filter((i) => i.visible), []);
  const roots = visible.filter((i) => !i.parentKey);

  return (
    <nav
      className={`${styles.rail} canvas-rail`}
      aria-label="Cost sections"
      style={{ width: expanded ? layout.railWidth : layout.railWidthCollapsed }}
    >
      <Tooltip content={expanded ? "Collapse menu" : "Expand menu"} relationship="label">
        <Button
          className={styles.toggle}
          appearance="transparent"
          icon={<NavigationRegular />}
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        />
      </Tooltip>

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
                className={styles.group}
                icon={open ? <ChevronUpRegular /> : <ChevronDownRegular />}
                iconPosition="before"
                aria-expanded={open}
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
  const to = costPath && projectId ? costLocation(costPath, projectId) : item.path;
  return (
    <NavLink
      to={to}
      aria-current={activeNavKey(pathname) === item.key ? "page" : undefined}
      className={() =>
        mergeClasses(
          styles.item,
          indented && styles.child,
          activeNavKey(pathname) === item.key && styles.itemSelected,
          !item.enabled && styles.disabled,
        )
      }
      aria-disabled={!item.enabled}
      title={item.label}
    >
      {ICONS[item.icon]}
      {expanded ? <span className={styles.label}>{item.label}</span> : null}
    </NavLink>
  );
}
