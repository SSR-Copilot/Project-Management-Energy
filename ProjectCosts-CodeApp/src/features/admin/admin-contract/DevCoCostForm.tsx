/**
 * The DevCo Cost Form (`con_Add_Edit_AdminContracts_Right_Panel_BodyContent_DeCostsvCo`,
 * ACS:3016-3765): the Level-1 CAPEX roots (`gal_Add_Edit_AdminContracts_Right_Panel_DevCoCostForm`)
 * as a single-open accordion (`btn_Add_Edit_AdminContract_Right_Panel_DevCoCostForm_Transparent`,
 * chevrons `ico_Add_Edit_AdminContracts_DevCoCosts_Down` / `_Up`), each with a tri-state
 * checkbox (`img_Parent_TriState_Checkbox`), and its Level-3 descendants
 * (`gal_Contracts_RightPanel_NewEdit_Costs`) as checkbox rows
 * (`chb_Contracts_RightPanel_NewEdit_CostssRow`) labelled `<number> <name>`
 * (`lbl_Contracts_RightPanel_NewEdit_CostssRow_Name`). Accounts another contract of the selection
 * owns are checked, disabled and marked "Used". Level-2 accounts are not rows (canvas parity).
 * Every row `data-testid` is the canvas name plus the account id.
 *
 * DIVERGENCE: the canvas tri-state is an SVG image (`img_Parent_TriState_Checkbox`) under a
 * transparent overlay button (`btn_Parent_TriState_Overlay`); here it is one native tri-state
 * checkbox. Its accessible name "Select all accounts in <root>" has no canvas equivalent (the
 * image has no caption or AccessibleLabel).
 * DIVERGENCE: an account another contract claimed while this panel was open, but that is still
 * selected here (`isStaleSelection`), can be unchecked; the canvas rows are fixed at open.
 * DIVERGENCE: "No sub-accounts", "Loading accounts…", the Retry bar and the
 * `validationMessage` line have no canvas equivalent.
 *
 * Hard-coded colours with no theme token: `#323130` (the canvas label colour) and
 * `rgba(238, 148, 12, 0.125)` (the USED box fill, `rec_Contracts_RightPanel_NewEdit_CostssRow_Used`).
 */
import { useId, useState } from "react";
import {
  Button, Checkbox, Spinner, Text, makeStyles, mergeClasses, tokens,
} from "@fluentui/react-components";
import { ChevronDownRegular, ChevronUpRegular, SubtractRegular } from "@fluentui/react-icons";
import { NoticeBar, VisuallyHidden } from "@/components";
import { palette } from "@/theme/tokens";
import {
  CARD_TEXT, isStaleSelection, rootState, toggleLeaf, toggleRoot,
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
    <section
      className={styles.root} aria-label={CARD_TEXT.devCoCostForm}
      data-testid="con_Add_Edit_AdminContracts_Right_Panel_BodyContent_DeCostsvCo"
    >
      <Text className={styles.label} data-testid="lbl_Add_Edit_AdminContracts_DevCoCostForm">
        {CARD_TEXT.devCoCostForm}<span className={styles.required} aria-hidden="true">*</span>
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
        <ul className={styles.list} data-testid="gal_Add_Edit_AdminContracts_Right_Panel_DevCoCostForm">
          {roots.map((root) => {
            const open = openRoot === root.id;
            const state = rootState(root, selected, classes);
            const childrenId = `devco-root-${root.id}`;
            const label = `${root.number} ${root.name}`;
            return (
              <li key={root.id} data-testid={`con_Add_Edit_AdminContracts_Right_Panel_DevCoCostForm_Card-${root.id}`}>
                <div className={mergeClasses(styles.rootRow, open && styles.rootRowOpen)}>
                  {/* `lbl_Add_Edit_AdminContracts_Right_Panel_DevCoCostForm_Card_Category` under its transparent button. */}
                  <Button
                    appearance="transparent" className={styles.rootToggle}
                    aria-expanded={open} aria-controls={childrenId}
                    aria-label={label} data-testid={`btn_Add_Edit_AdminContract_Right_Panel_DevCoCostForm_Transparent-${root.id}`}
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
                    value={root.id} aria-label={`Select all accounts in ${label}`} data-testid={`img_Parent_TriState_Checkbox-${root.id}`}
                    onChange={() => onChange(toggleRoot(root, selected, classes))}
                  />
                  {/* The canvas swaps two icons by `Visible`; the id follows the one showing. */}
                  <Button
                    appearance="transparent" size="small" className={styles.chevron}
                    icon={open ? <ChevronUpRegular /> : <ChevronDownRegular />}
                    aria-label={`${open ? "Collapse" : "Expand"} ${label}`}
                    data-testid={`ico_Add_Edit_AdminContracts_DevCoCosts_${open ? "Up" : "Down"}-${root.id}`}
                    aria-expanded={open} aria-controls={childrenId}
                    onClick={() => setOpenRoot(open ? undefined : root.id)}
                  />
                </div>
                {open ? (
                  <ul id={childrenId} className={styles.children} data-testid={`gal_Contracts_RightPanel_NewEdit_Costs-${root.id}`}>
                    {root.children.length === 0 ? (
                      <li className={styles.empty}>No sub-accounts</li>
                    ) : root.children.map((leaf) => {
                      const cls = classes.get(leaf.id);
                      const used = cls?.used === true;
                      // Used elsewhere but still selected here — may be unchecked, never re-checked.
                      const stale = isStaleSelection(leaf.id, selected, classes);
                      const leafLabel = `${leaf.number} ${leaf.name}`;
                      return (
                        <li key={leaf.id} className={styles.childRow} data-testid={`con_Contracts_RightPanel_NewEdit_CostssRow-${leaf.id}`}>
                          <Checkbox
                            className={mergeClasses(styles.childBox, used && styles.childUsed)}
                            labelPosition="before" value={leaf.id} aria-label={leafLabel} data-testid={`chb_Contracts_RightPanel_NewEdit_CostssRow-${leaf.id}`}
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
