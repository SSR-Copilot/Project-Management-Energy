/**
 * The collapsible left rail, independent of which section it serves.
 *
 * Same look and behaviour as the Cost rail (`LeftNav`): 200 px expanded / 56 px collapsed with
 * no animation, a hamburger toggle, group headers that show a chevron instead of an icon, and
 * the selected item drawn as a grey band with a 4 px theme-blue left edge and bold text. A
 * section supplies its items, the active key and how an item's path becomes a link.
 *
 * Groups are items with no `path` that other items name as `parentKey`. A group starts open
 * when it holds the active item, or when `defaultOpenGroups` names it.
 */
import { Button, makeStyles, mergeClasses, tokens, Tooltip } from "@fluentui/react-components";
import { ChevronDownRegular, ChevronUpRegular, NavigationRegular } from "@fluentui/react-icons";
import { useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import type { NavItem } from "@/app/navigation";
import { useNavigationGuard } from "@/app/unsavedChanges";
import { layout, palette, space } from "@/theme/tokens";
import { NAV_ICONS } from "./navIcons";

const useStyles = makeStyles({
  rail: {
    display: "flex", flexDirection: "column",
    flexShrink: 0,
    borderRightWidth: "1px",
    borderRightStyle: "solid",
    borderRightColor: tokens.colorNeutralStroke2,
    backgroundColor: tokens.colorNeutralBackground1,
    overflowY: "auto",
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
    borderLeftWidth: "4px",
    borderLeftStyle: "solid",
    borderLeftColor: "transparent",
    ":hover": { backgroundColor: palette.hoverButton },
  },
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

export interface SectionRailProps {
  items: readonly NavItem[];
  activeKey: string | undefined;
  /** Turns an item's `path` into the link it navigates to. */
  hrefFor: (item: NavItem) => string;
  /** The nav landmark's accessible name, e.g. "Project sections". */
  ariaLabel: string;
  defaultOpenGroups?: readonly string[];
}

export function SectionRail({
  items, activeKey, hrefFor, ariaLabel, defaultOpenGroups = [],
}: SectionRailProps) {
  const styles = useStyles();
  const [expanded, setExpanded] = useState(true);
  const visible = useMemo(() => items.filter((i) => i.visible), [items]);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const parent = items.find((i) => i.key === activeKey)?.parentKey;
    return new Set([...defaultOpenGroups, ...(parent ? [parent] : [])]);
  });
  const roots = visible.filter((i) => !i.parentKey);
  // M7: a screen with unsaved changes is asked first; without a guard provider this is a no-op.
  const navigate = useNavigate();
  const { guard, isBlocking } = useNavigationGuard();

  const link = (item: NavItem, indented: boolean) => (
    <NavLink
      key={item.key}
      to={hrefFor(item)}
      onClick={(e) => {
        if (!isBlocking() || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        const to = hrefFor(item);
        guard(() => navigate(to));
      }}
      aria-current={activeKey === item.key ? "page" : undefined}
      className={() => mergeClasses(
        styles.item,
        indented && styles.child,
        activeKey === item.key && styles.itemSelected,
        !item.enabled && styles.disabled,
      )}
      aria-disabled={!item.enabled}
      aria-label={item.label}
      title={item.label}
    >
      {NAV_ICONS[item.icon]}
      {expanded ? <span className={styles.label}>{item.label}</span> : null}
    </NavLink>
  );

  return (
    <nav
      className={`${styles.rail} canvas-rail`}
      aria-label={ariaLabel}
      style={{ width: expanded ? layout.railWidth : layout.railWidthCollapsed }}
    >
      <div className="canvas-rail-header">
        <Tooltip content={expanded ? "Collapse menu" : "Expand menu"} relationship="label">
          <Button
            appearance="transparent"
            icon={<NavigationRegular />}
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse menu" : "Expand menu"}
            onClick={() => setExpanded((v) => !v)}
          />
        </Tooltip>
      </div>
      <span className="canvas-rail-divider" aria-hidden="true" />

      {roots.map((item) => {
        const children = visible.filter((c) => c.parentKey === item.key);
        if (item.path || children.length === 0) return item.path ? link(item, false) : null;
        const open = openGroups.has(item.key);
        const groupButton = (
          <Button
              appearance="transparent"
              className={styles.group}
              icon={open ? <ChevronUpRegular /> : <ChevronDownRegular />}
              iconPosition="before"
              aria-expanded={open}
              aria-label={item.label}
              onClick={() => setOpenGroups((prev) => {
                const next = new Set(prev);
                if (next.has(item.key)) next.delete(item.key); else next.add(item.key);
                return next;
              })}
            >
              {expanded ? <span className={styles.label}>{item.label}</span> : null}
          </Button>
        );
        return (
          <div key={item.key}>
            {/* Parity round 2, NG-2: collapsed, the header is only a chevron, so name it on hover. */}
            {expanded ? groupButton : (
              <Tooltip content={item.label} relationship="label">{groupButton}</Tooltip>
            )}
            {open ? children.map((child) => link(child, true)) : null}
          </div>
        );
      })}
    </nav>
  );
}
