/**
 * AppShell — the responsive frame both apps render inside.
 *
 * Replaces the canvas layout of a fixed 200/32px left rail (`gblAppSizes.LeftNavigation`)
 * plus `cmp_Header` plus a screen container. New behaviour, because the canvas apps had no
 * small-screen layout at all:
 *
 *   >= 1024px   rail docked, expanded or collapsed by the user
 *   768-1023px  rail auto-collapses to icons; expanding overlays the content
 *   < 768px     rail becomes a drawer behind a hamburger; header condenses
 *
 * The docked widths are the canvas constants exactly, so a desktop user sees the same
 * geometry they see today.
 */
import { useEffect, type ReactNode } from "react";
import { makeStyles, tokens, Drawer, DrawerBody, mergeClasses } from "@fluentui/react-components";
import { useAppStore } from "@/store/appStore";
import { sizes, media, space } from "@/theme/tokens";
import { useBreakpoint } from "./useBreakpoint";

const useStyles = makeStyles({
  root: {
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    gridTemplateRows: "auto 1fr",
    gridTemplateAreas: `"header header" "rail main"`,
    height: "100dvh",
    width: "100%",
    overflow: "hidden",
    backgroundColor: tokens.colorNeutralBackground3,
  },
  rootStacked: {
    gridTemplateColumns: "1fr",
    gridTemplateAreas: `"header" "main"`,
  },
  header: { gridArea: "header", zIndex: 3 },
  rail: {
    gridArea: "rail",
    width: `${sizes.leftNavigation.expandedWidth}px`,
    transitionProperty: "width",
    transitionDuration: "160ms",
    transitionTimingFunction: "cubic-bezier(.33,0,.1,1)",
    overflowX: "hidden",
    overflowY: "auto",
    backgroundColor: tokens.colorNeutralBackground1,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    zIndex: 2,
    [media.reducedMotion]: { transitionDuration: "0ms" },
  },
  railCollapsed: { width: `${sizes.leftNavigation.decreasedWidth}px` },
  main: {
    gridArea: "main",
    overflow: "auto",
    overscrollBehavior: "contain",
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    scrollbarGutter: "stable",
  },
  page: {
    flex: 1,
    minWidth: 0,
    // Without this a flex child cannot shrink below its content, so a screen that wants to
    // own its own scrolling pushes `main` into scroll instead — which is what made the
    // portfolio filter band scroll away and hid the pager below the fold.
    minHeight: 0,
    padding: space.xl,
    display: "flex",
    flexDirection: "column",
    gap: space.l,
    [media.belowLg]: { padding: space.m },
    [media.belowMd]: { padding: space.s, gap: space.m },
  },
  pageBleed: { padding: "0", gap: "0" },
  /**
   * A bleed screen manages its own scrolling: its filter band stays put and only the grid
   * body moves, so the pager is always on screen. Letting `main` scroll too would give the
   * page a second scrollbar and undo that.
   */
  mainFixed: { overflow: "hidden" },
  drawerBody: { padding: 0 },
});

export interface AppShellProps {
  header: ReactNode;
  /**
   * Omit for a full-width screen. The build spec names the two that render no chrome of
   * their own — App Loading and Project Main — and the portfolio grid needs the width.
   */
  rail?: ReactNode;
  children: ReactNode;
  /**
   * Rendered above the page content and pinned.
   *
   * NOTE: no caller passes this today. Screens render their own `CommandBar` inside
   * `children`, so it is not in fact pinned by the shell. Kept as an escape hatch, but do
   * not assume it is wired.
   */
  toolbar?: ReactNode;
  /**
   * Drop the page padding and gap so a screen can reach the viewport edges — the portfolio
   * screen's filter band and grid do. Without it `s.page` forces 20px of padding.
   */
  bleed?: boolean;
}

export function AppShell({ header, rail, children, toolbar, bleed = false }: AppShellProps) {
  const s = useStyles();
  const bp = useBreakpoint();
  const navExpanded = useAppStore((st) => st.ui.navExpanded);
  const mobileNavOpen = useAppStore((st) => st.ui.mobileNavOpen);
  const setMobileNavOpen = useAppStore((st) => st.setMobileNavOpen);
  const setNavExpanded = useAppStore((st) => st.setNavExpanded);

  // Auto-collapse the rail on tablet; restore on desktop. Skipped when there is no rail, so
  // a full-width screen does not quietly rewrite the rail state other screens will read.
  const hasRail = Boolean(rail);
  useEffect(() => {
    if (!hasRail) return;
    if (bp.belowLg && bp.atLeastMd) setNavExpanded(false);
    if (bp.atLeastXl) setNavExpanded(true);
  }, [hasRail, bp.belowLg, bp.atLeastMd, bp.atLeastXl, setNavExpanded]);

  const stacked = bp.belowMd;
  // `rootStacked` already collapses to a single "header / main" grid, which is exactly the
  // geometry a railless full-width screen needs — no new layout CSS required.
  const singleColumn = stacked || !rail;

  return (
    <div className={mergeClasses(s.root, singleColumn && s.rootStacked)}>
      <div className={s.header}>{header}</div>

      {rail &&
        (stacked ? (
          <Drawer
            type="overlay"
            open={mobileNavOpen}
            onOpenChange={(_, d) => setMobileNavOpen(d.open)}
            position="start"
            size="small"
          >
            <DrawerBody className={s.drawerBody}>{rail}</DrawerBody>
          </Drawer>
        ) : (
          <nav
            className={mergeClasses(s.rail, !navExpanded && s.railCollapsed)}
            aria-label="Sections"
          >
            {rail}
          </nav>
        ))}

      <main className={mergeClasses(s.main, bleed && s.mainFixed)} id="main-content">
        {toolbar}
        <div className={mergeClasses(s.page, bleed && s.pageBleed)}>{children}</div>
      </main>
    </div>
  );
}
