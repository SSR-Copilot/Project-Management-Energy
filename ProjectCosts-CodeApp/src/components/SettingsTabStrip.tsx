/**
 * The controlled tab strip at the top of a settings page.
 *
 *   CAPEX Accounts (`Screen.tsx:39, 361-370`): `size="medium"`, a 50 px flex band, tabs centred.
 *   Check List Settings (`Screen.tsx:56, 341-350`): `size="small"`, a 52 px block band
 *   (`layout="block"`; tab 32 + 20, top-aligned as today).
 *
 * Tabs that do not fit fold into a "…" menu at the end of the strip, as the canvas modern
 * `TabList` does (`tab_Admin_Project_Checklist_Association`: 14+ country / technology tabs never
 * scroll; the rest sit behind "…"). 27 Oct 2026: this replaced a horizontal scrollbar. The
 * selected tab is the last one to fold, so it stays visible. Choosing a tab from the menu selects
 * it exactly like clicking it. Folding needs a measured width: where the strip has none (jsdom, a
 * hidden container) the tabs stay in a plain, scrollable list, so nothing is ever folded unseen.
 *
 * URL syncing stays with the screen (Check List Settings' `useSearchParams`).
 */
import {
  Menu, MenuButton, MenuItem, MenuList, MenuPopover, MenuTrigger, Overflow, OverflowItem, Tab, TabList,
  makeStyles, mergeClasses, useIsOverflowItemVisible, useOverflowMenu,
} from "@fluentui/react-components";
import { MoreHorizontalRegular } from "@fluentui/react-icons";
import { useCallback, useState } from "react";

const useStyles = makeStyles({
  /** `minWidth: 0`: the strip may be narrower than its tabs; the overflow menu takes the rest. */
  band: { minWidth: 0 },
  /** The unmeasured fallback: the earlier horizontal scroll. */
  scroll: { overflowX: "auto" },
  center: { display: "flex", alignItems: "center" },
  h50: { minHeight: "50px" },
  h52: { minHeight: "52px" },
  /** The strip fills the band so the overflow manager has a width to measure against. */
  list: { flexGrow: 1, minWidth: 0 },
});

export interface SettingsTab { id: string; label: string }

export interface SettingsTabStripProps {
  tabs: readonly SettingsTab[];
  /** The selected tab id; `undefined` selects none. */
  selected: string | undefined;
  onSelect(id: string): void;
  /** The TabList's aria-label. */
  ariaLabel: string;
  size?: "small" | "medium";
  bandHeight?: 50 | 52;
  /** `center` (default, CAPEX): flex band, tabs vertically centred. `block` (Check List Settings): as today. */
  layout?: "center" | "block";
  testId?: string;
  /** Stem of each tab's `data-testid` (`${stem}-${tab.id}`); default `settings-tab` (rule 16). */
  tabTestIdPrefix?: string;
}

export function SettingsTabStrip({
  tabs, selected, onSelect, ariaLabel, size = "medium", bandHeight = 50, layout = "center", testId,
  tabTestIdPrefix = "settings-tab",
}: SettingsTabStripProps) {
  const styles = useStyles();
  // Set once the band has a width. A ref callback, not an effect: it reads the DOM and sets a flag.
  const [measurable, setMeasurable] = useState(false);
  const bandRef = useCallback((el: HTMLDivElement | null) => {
    if (el && el.offsetWidth > 0) setMeasurable(true);
  }, []);
  const tab = (t: SettingsTab) => (
    <Tab value={t.id} aria-label={t.label} data-testid={`${tabTestIdPrefix}-${t.id}`}>{t.label}</Tab>
  );
  const listProps = {
    size, selectedValue: selected, "aria-label": ariaLabel,
    onTabSelect: (_: unknown, d: { value: unknown }) => onSelect(String(d.value)),
  };
  return (
    <div
      ref={bandRef}
      className={mergeClasses(
        styles.band, bandHeight === 52 ? styles.h52 : styles.h50, layout === "center" && styles.center,
        !measurable && styles.scroll,
      )}
      data-testid={testId}
    >
      {measurable ? (
        <Overflow minimumVisible={1}>
          <TabList className={styles.list} {...listProps}>
            {tabs.map((t) => (
              <OverflowItem key={t.id} id={t.id} priority={t.id === selected ? 2 : 1}>{tab(t)}</OverflowItem>
            ))}
            <TabOverflowMenu tabs={tabs} onSelect={onSelect} testId={`${tabTestIdPrefix}-overflow`} />
          </TabList>
        </Overflow>
      ) : (
        <TabList {...listProps}>{tabs.map(tab)}</TabList>
      )}
    </div>
  );
}

/** The "…" button, shown only while at least one tab is folded; lists the folded tabs. */
function TabOverflowMenu({
  tabs, onSelect, testId,
}: { tabs: readonly SettingsTab[]; onSelect(id: string): void; testId: string }) {
  const { ref, isOverflowing } = useOverflowMenu<HTMLButtonElement>();
  if (!isOverflowing) return null;
  return (
    <Menu>
      <MenuTrigger disableButtonEnhancement>
        <MenuButton
          ref={ref} appearance="transparent" icon={<MoreHorizontalRegular />} role="tab"
          aria-label="More tabs" data-testid={testId}
        />
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          {tabs.map((t) => <OverflowMenuItem key={t.id} tab={t} onSelect={onSelect} />)}
        </MenuList>
      </MenuPopover>
    </Menu>
  );
}

function OverflowMenuItem({ tab, onSelect }: { tab: SettingsTab; onSelect(id: string): void }) {
  const visible = useIsOverflowItemVisible(tab.id);
  if (visible) return null;
  return (
    <MenuItem aria-label={tab.label} data-testid={`${tab.id}-overflow-item`} onClick={() => onSelect(tab.id)}>
      {tab.label}
    </MenuItem>
  );
}
