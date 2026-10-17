/**
 * C7 — the controlled tab strip at the top of a settings page.
 *
 *   CAPEX Accounts (`Screen.tsx:39, 361-370`): `size="medium"`, a 50 px flex band, tabs centred.
 *   Check List Settings (`Screen.tsx:56, 341-350`): `size="small"`, a 52 px block band
 *   (`layout="block"`; tab 32 + 20, top-aligned as today).
 *
 * URL syncing stays with the screen (Check List Settings' `useSearchParams`).
 */
import { Tab, TabList, makeStyles, mergeClasses } from "@fluentui/react-components";

const useStyles = makeStyles({
  band: { overflowX: "auto" },
  center: { display: "flex", alignItems: "center" },
  h50: { minHeight: "50px" },
  h52: { minHeight: "52px" },
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
}

export function SettingsTabStrip({
  tabs, selected, onSelect, ariaLabel, size = "medium", bandHeight = 50, layout = "center", testId,
}: SettingsTabStripProps) {
  const styles = useStyles();
  return (
    <div
      className={mergeClasses(styles.band, bandHeight === 52 ? styles.h52 : styles.h50, layout === "center" && styles.center)}
      data-testid={testId}
    >
      <TabList
        size={size}
        selectedValue={selected}
        onTabSelect={(_, d) => onSelect(String(d.value))}
        aria-label={ariaLabel}
      >
        {tabs.map((t) => <Tab key={t.id} value={t.id}>{t.label}</Tab>)}
      </TabList>
    </div>
  );
}
