/**
 * CountryRail — NEW component. The narrow middle rail that scopes the admin master-data
 * screens by country, and on three of them by country × technology.
 *
 * Taken from the Project Management step-by-step guide, which shows the rail in **two
 * distinct shapes** on different screens. That is not a rendering accident, so it is a prop
 * rather than two components:
 *
 *  - `variant="tree"` — a flag per country and a `+` / `−` expander revealing the technology
 *    children (Wind, PV). Used by Project Gates, Costs and Contracts. The breadcrumb on those
 *    screens reads `… | Germany | Wind`, i.e. the selection is the *leaf*.
 *  - `variant="flat"` — country names only, no flags, no expander, because the screen's axis
 *    is the whole country. Used by Standard Assumptions → Milestones, whose right panel is
 *    titled "Edit Milestones for Germany" and whose table carries Wind and PV as rows.
 *
 * The canvas app built this from `col_cmpCountryPickerItems` — an `AddColumns(Countries, …)`
 * collection with a hard-coded flag-image and display-order mapping duplicated verbatim on
 * three screens. Expansion there was persisted by patching the collection; here it is local
 * state owned by the caller, which is why `expandedKeys` is a prop.
 *
 * Flags render as regional-indicator characters rather than the canvas's PNG assets
 * (`germany-flag-png-large` and siblings), which are not part of the code app bundle.
 */
import { makeStyles, mergeClasses, tokens, Button } from "@fluentui/react-components";
import { AddRegular, SubtractRegular } from "@fluentui/react-icons";
import { space, radius, palette } from "@/theme/tokens";

export interface CountryRailChild {
  key: string;
  label: string;
}

export interface CountryRailNode {
  key: string;
  label: string;
  /** Regional-indicator pair. Defaults to the map below, keyed on `label`. */
  flag?: string;
  children?: CountryRailChild[];
}

export interface CountryRailProps {
  items: CountryRailNode[];
  /** The selected leaf key in `tree` mode, or the selected country key in `flat` mode. */
  selectedKey: string | null;
  onSelect: (key: string, parentKey?: string) => void;
  expandedKeys?: string[];
  onExpandedChange?: (keys: string[]) => void;
  variant?: "tree" | "flat";
  ariaLabel?: string;
}

/**
 * The nine countries the admin screens scope by, in the canvas app's own display order
 * (`Switch(Name, "Germany", 1, "France", 2, …)`).
 *
 * Note the country picker on Costs and Contracts filters Spain, Greece and Romania out
 * (`Filter(col_cmpCountryPickerItems, !(Name in ["Spain","Greece","Romania"]))`) while
 * Milestones shows all nine — the guide's screenshots agree. Filtering is the caller's job.
 */
export const COUNTRY_FLAGS: Record<string, string> = {
  Germany: "\u{1F1E9}\u{1F1EA}",
  France: "\u{1F1EB}\u{1F1F7}",
  Poland: "\u{1F1F5}\u{1F1F1}",
  Italy: "\u{1F1EE}\u{1F1F9}",
  Finland: "\u{1F1EB}\u{1F1EE}",
  Croatia: "\u{1F1ED}\u{1F1F7}",
  Spain: "\u{1F1EA}\u{1F1F8}",
  Greece: "\u{1F1EC}\u{1F1F7}",
  Romania: "\u{1F1F7}\u{1F1F4}",
};

const useStyles = makeStyles({
  root: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    height: "100%",
    overflowY: "auto",
    paddingBlock: space.s,
    borderRightWidth: "1px",
    borderRightStyle: "solid",
    borderRightColor: tokens.colorNeutralStroke2,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: space.s,
    width: "100%",
    minWidth: 0,
    textAlign: "left",
    paddingBlock: "6px",
    paddingInline: space.s,
    borderRadius: radius.md,
    borderTopWidth: "0",
    borderRightWidth: "0",
    borderBottomWidth: "0",
    borderLeftWidth: "0",
    borderTopStyle: "none",
    borderRightStyle: "none",
    borderBottomStyle: "none",
    borderLeftStyle: "none",
    backgroundColor: "transparent",
    cursor: "pointer",
    fontSize: "13px",
    color: tokens.colorNeutralForeground1,
    ":hover": { backgroundColor: palette.hoverButton },
  },
  child: { paddingLeft: "34px", fontSize: "12.5px" },
  active: {
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground1,
    fontWeight: 600,
  },
  flag: { fontSize: "15px", lineHeight: 1, flex: "none" },
  label: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: 1 },
  toggle: { flex: "none", minWidth: "20px", width: "20px", height: "20px" },
});

export function CountryRail({
  items,
  selectedKey,
  onSelect,
  expandedKeys = [],
  onExpandedChange,
  variant = "tree",
  ariaLabel = "Country",
}: CountryRailProps) {
  const s = useStyles();

  const toggle = (key: string) => {
    if (!onExpandedChange) return;
    onExpandedChange(
      expandedKeys.includes(key) ? expandedKeys.filter((k) => k !== key) : [...expandedKeys, key],
    );
  };

  return (
    <nav className={s.root} aria-label={ariaLabel}>
      {items.map((node) => {
        const expanded = expandedKeys.includes(node.key);
        const children = variant === "tree" ? (node.children ?? []) : [];
        const countrySelected = variant === "flat" && selectedKey === node.key;

        return (
          <div key={node.key}>
            <div className={mergeClasses(s.row, countrySelected && s.active)}>
              {variant === "tree" && (
                <span className={s.flag} aria-hidden="true">
                  {node.flag ?? COUNTRY_FLAGS[node.label] ?? ""}
                </span>
              )}

              <button
                type="button"
                className={s.label}
                style={{
                  border: 0,
                  background: "transparent",
                  padding: 0,
                  font: "inherit",
                  color: "inherit",
                  textAlign: "left",
                  cursor: "pointer",
                }}
                aria-current={countrySelected ? "true" : undefined}
                onClick={() => {
                  if (variant === "flat") onSelect(node.key);
                  else if (children.length) toggle(node.key);
                  else onSelect(node.key);
                }}
              >
                {node.label}
              </button>

              {children.length > 0 && (
                <Button
                  className={s.toggle}
                  size="small"
                  appearance="subtle"
                  icon={expanded ? <SubtractRegular /> : <AddRegular />}
                  aria-label={`${expanded ? "Collapse" : "Expand"} ${node.label}`}
                  aria-expanded={expanded}
                  onClick={() => toggle(node.key)}
                />
              )}
            </div>

            {expanded &&
              children.map((child) => (
                <button
                  key={child.key}
                  type="button"
                  className={mergeClasses(s.row, s.child, selectedKey === child.key && s.active)}
                  aria-current={selectedKey === child.key ? "true" : undefined}
                  onClick={() => onSelect(child.key, node.key)}
                >
                  <span className={s.label}>{child.label}</span>
                </button>
              ))}
          </div>
        );
      })}
    </nav>
  );
}
