/**
 * The DevCo Cost Form (ACS:3016-3765): Level-1 CAPEX roots as a single-open accordion,
 * each with a native tri-state checkbox (replaces the canvas SVG + overlay button), and its
 * Level-3 descendants as checkbox rows `<number> <name>`. Accounts another contract of
 * the selection owns are checked, disabled and marked "Used". Level-2 accounts are not
 * rows (canvas parity).
 */
import { useId, useState } from "react";
import {
  Button, Checkbox, Spinner, Text, makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import { ChevronDownRegular, ChevronUpRegular, SubtractRegular } from "@fluentui/react-icons";
import { NoticeBar, VisuallyHidden } from "@/components";
import { palette } from "@/theme/tokens";
import {
  isStaleSelection, rootState, toggleLeaf, toggleRoot,
  type AccountClass, type TreeRoot,
} from "./rules";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", minWidth: "0" },
  label: { fontWeight: tokens.fontWeightSemibold, marginBottom: "6px" },
  required: { color: palette.Error, marginLeft: "4px" },
  list: { listStyleType: "none", margin: "0", paddingLeft: "0", paddingRight: "0" },
  rootRow: {
    display: "flex", alignItems: "center", minHeight: "32px",
    borderBottomWidth: "1px", borderBottomStyle: "solid", borderBottomColor: palette.Grayscale20,
    borderLeftWidth: "3px", borderLeftStyle: "solid", borderLeftColor: "transparent",
  },
  rootRowOpen: { borderLeftColor: palette.akzent1, borderBottomColor: "transparent" },
  rootToggle: {
    flexGrow: 1, minWidth: "0", justifyContent: "flex-start", textAlign: "left",
    fontWeight: tokens.fontWeightSemibold,
  },
  /* Root chevron: brand blue (ACS:3417-3483), a fixed 24 px so child checkboxes line up under the root ones. */
  chevron: { color: palette.themePrimary, width: "24px", minWidth: "24px", flexShrink: 0 },
  children: { listStyleType: "none", margin: "0", paddingLeft: "24px", paddingRight: "0", paddingBottom: "10px" },
  /* The child checkbox sits at the RIGHT end (ACS:3169-3199), under the root checkboxes. */
  childRow: { display: "flex", alignItems: "center", minHeight: "32px", paddingRight: "24px", minWidth: "0" },
  // Fluent's checkbox root is `max-width: fit-content`, which would stop it filling the row.
  childBox: { flexGrow: 1, minWidth: "0", width: "100%", maxWidth: "none" },
  /* ~11 px regular name, ellipsis at the real available width; the full text is in `title`. */
  childLabel: {
    flexGrow: 1, minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    fontSize: "11px", fontWeight: tokens.fontWeightRegular, paddingLeft: "0",
  },
  /* USED (ACS:3200-3212): pale orange box, 1 px orange border, orange tick. Fluent greys a disabled
     checked box with higher-specificity state selectors, hence `!important`. */
  childUsed: {
    // The canvas keeps the row name in the normal text colour (only the box turns orange).
    "& .fui-Checkbox__label": { color: "#323130 !important" },
    "& .fui-Checkbox__indicator": {
      backgroundColor: "rgba(238, 148, 12, 0.125) !important",
      borderTopColor: `${palette.Warning} !important`, borderRightColor: `${palette.Warning} !important`,
      borderBottomColor: `${palette.Warning} !important`, borderLeftColor: `${palette.Warning} !important`,
      color: `${palette.Warning} !important`,
    },
  },
  /* Root tri-state (ACS:3607-3677): PARTIAL = blue box with a white minus, LOCKED = grey box with a white tick. */
  rootMixed: {
    "& .fui-Checkbox__indicator": {
      backgroundColor: `${palette.themePrimary} !important`,
      borderTopColor: `${palette.themePrimary} !important`, borderRightColor: `${palette.themePrimary} !important`,
      borderBottomColor: `${palette.themePrimary} !important`, borderLeftColor: `${palette.themePrimary} !important`,
      color: `${palette.white} !important`,
    },
  },
  rootLocked: {
    "& .fui-Checkbox__indicator": {
      backgroundColor: `${palette.neutralTertiaryAlt} !important`,
      borderTopColor: `${palette.neutralTertiaryAlt} !important`, borderRightColor: `${palette.neutralTertiaryAlt} !important`,
      borderBottomColor: `${palette.neutralTertiaryAlt} !important`, borderLeftColor: `${palette.neutralTertiaryAlt} !important`,
      color: `${palette.white} !important`,
    },
  },
  empty: { color: tokens.colorNeutralForeground3, paddingLeft: "8px", paddingTop: "4px", paddingBottom: "8px" },
  error: { color: palette.Error, fontSize: tokens.fontSizeBase200, marginTop: "4px" },
});

export interface DevCoCostFormProps {
  roots: readonly TreeRoot[];
  selected: ReadonlySet<string>;
  classes: ReadonlyMap<string, AccountClass>;
  onChange: (next: Set<string>) => void;
  loading: boolean;
  /** When set, the tree cannot be used; the message explains why. */
  errorText?: string;
  onRetry?: () => void;
  validationMessage?: string;
  disabled?: boolean;
}

export function DevCoCostForm({
  roots, selected, classes, onChange, loading, errorText, onRetry, validationMessage, disabled,
}: DevCoCostFormProps) {
  const styles = useStyles();
  const usedDescriptionId = useId();
  const [openRoot, setOpenRoot] = useState<string | undefined>();

  return (
    <section className={styles.root} aria-label="DevCo Cost Form">
      <Text className={styles.label}>
        DevCo Cost Form<span className={styles.required} aria-hidden="true">*</span>
      </Text>
      <VisuallyHidden id={usedDescriptionId}>Used by another standard contract</VisuallyHidden>

      {errorText ? (
        <NoticeBar
          intent="error"
          {...(onRetry ? { action: { label: "Retry", ariaLabel: "Retry loading DevCo accounts", onClick: onRetry } } : {})}
        >
          {errorText}
        </NoticeBar>
      ) : loading ? (
        <Spinner size="small" label="Loading accounts…" />
      ) : (
        <ul className={styles.list}>
          {roots.map((root) => {
            const open = openRoot === root.id;
            const state = rootState(root, selected, classes);
            const childrenId = `devco-root-${root.id}`;
            const label = `${root.number} ${root.name}`;
            return (
              <li key={root.id}>
                <div className={mergeClasses(styles.rootRow, open && styles.rootRowOpen)}>
                  <Button
                    appearance="transparent" className={styles.rootToggle}
                    aria-expanded={open} aria-controls={childrenId}
                    aria-label={label} data-testid={`devco-root-toggle-${root.id}`}
                    onClick={() => setOpenRoot(open ? undefined : root.id)}
                  >
                    {label}
                  </Button>
                  <Checkbox
                    className={state.checked === "mixed" ? styles.rootMixed
                      : state.checked === true && state.disabled ? styles.rootLocked : undefined}
                    checked={state.checked}
                    disabled={disabled || state.disabled}
                    {...(state.checked === "mixed" ? { indicator: { children: <SubtractRegular /> } } : {})}
                    value={root.id} aria-label={`Select all accounts in ${label}`} data-testid={`devco-root-select-${root.id}`}
                    onChange={() => onChange(toggleRoot(root, selected, classes))}
                  />
                  <Button
                    appearance="transparent" size="small" className={styles.chevron}
                    icon={open ? <ChevronUpRegular /> : <ChevronDownRegular />}
                    aria-label={`${open ? "Collapse" : "Expand"} ${label}`} data-testid={`devco-root-chevron-${root.id}`}
                    aria-expanded={open} aria-controls={childrenId}
                    onClick={() => setOpenRoot(open ? undefined : root.id)}
                  />
                </div>
                {open ? (
                  <ul id={childrenId} className={styles.children}>
                    {root.children.length === 0 ? (
                      <li className={styles.empty}>No sub-accounts</li>
                    ) : root.children.map((leaf) => {
                      const cls = classes.get(leaf.id);
                      const used = cls?.used === true;
                      // used elsewhere but still selected here — may be unchecked, never re-checked.
                      const stale = isStaleSelection(leaf.id, selected, classes);
                      const leafLabel = `${leaf.number} ${leaf.name}`;
                      return (
                        <li key={leaf.id} className={styles.childRow}>
                          <Checkbox
                            className={mergeClasses(styles.childBox, used && styles.childUsed)}
                            labelPosition="before" value={leaf.id} aria-label={leafLabel} data-testid={`devco-account-${leaf.id}`}
                            label={{
                              children: leafLabel, className: styles.childLabel,
                              title: used ? `${leafLabel} (Used by another standard contract)` : leafLabel,
                            }}
                            checked={used || selected.has(leaf.id)}
                            disabled={disabled || (used && !stale)}
                            input={used ? { "aria-describedby": usedDescriptionId } : undefined}
                            onChange={() => onChange(toggleLeaf(leaf.id, selected, classes))}
                          />
                          {/* The visible "Used" badge became the canvas orange box; the word stays for AT / tests. */}
                          {used ? <VisuallyHidden><span aria-hidden="true">Used</span></VisuallyHidden> : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {validationMessage ? <Text className={styles.error} role="alert">{validationMessage}</Text> : null}
    </section>
  );
}
