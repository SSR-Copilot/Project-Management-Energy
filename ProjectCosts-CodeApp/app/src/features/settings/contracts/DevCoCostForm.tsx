/**
 * M7c — the DevCo Cost Form (ACS:3016-3765): Level-1 CAPEX roots as a single-open accordion,
 * each with a native tri-state checkbox (replaces the canvas SVG + overlay button), and its
 * Level-3 descendants as checkbox rows `<number> <name>` (FR-14). Accounts another contract of
 * the selection owns are checked, disabled and marked "Used" (FR-15). Level-2 accounts are not
 * rows (D-15, parity).
 */
import { useId, useState } from "react";
import {
  Badge, Button, Checkbox, Spinner, Text, makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import { ChevronDownRegular, ChevronUpRegular } from "@fluentui/react-icons";
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
  children: { listStyleType: "none", margin: "0", paddingLeft: "24px", paddingRight: "0", paddingBottom: "8px" },
  childRow: { display: "flex", alignItems: "center", gap: "6px", minHeight: "32px" },
  childUsed: { color: palette.Warning },
  usedBadge: { flexShrink: 0 },
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
                    onClick={() => setOpenRoot(open ? undefined : root.id)}
                  >
                    {label}
                  </Button>
                  <Checkbox
                    checked={state.checked}
                    disabled={disabled || state.disabled}
                    aria-label={`Select all accounts in ${label}`}
                    onChange={() => onChange(toggleRoot(root, selected, classes))}
                  />
                  <Button
                    appearance="transparent" size="small"
                    icon={open ? <ChevronUpRegular /> : <ChevronDownRegular />}
                    aria-label={`${open ? "Collapse" : "Expand"} ${label}`}
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
                      // B-1: used elsewhere but still selected here — may be unchecked, never re-checked.
                      const stale = isStaleSelection(leaf.id, selected, classes);
                      const leafLabel = `${leaf.number} ${leaf.name}`;
                      return (
                        <li key={leaf.id} className={styles.childRow}>
                          <Checkbox
                            className={used ? styles.childUsed : undefined}
                            label={leafLabel}
                            checked={used || selected.has(leaf.id)}
                            disabled={disabled || (used && !stale)}
                            input={used ? { "aria-describedby": usedDescriptionId } : undefined}
                            onChange={() => onChange(toggleLeaf(leaf.id, selected, classes))}
                          />
                          {used ? (
                            <Badge
                              className={styles.usedBadge} appearance="tint" color="warning" size="small"
                              title="Used by another standard contract" aria-hidden="true"
                            >
                              Used
                            </Badge>
                          ) : null}
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
