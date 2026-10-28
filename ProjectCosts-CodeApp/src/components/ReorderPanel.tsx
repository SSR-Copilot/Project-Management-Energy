/**
 * The "reorder these items" side panel CAPEX Accounts (`Panels.tsx:203-239`) and Check
 * List Settings (`ReorderDrawer.tsx`) each built around the shared `ReorderItems`.
 *
 * It owns the WORKING order: `items` is the order at open (the screen remounts the panel with a
 * `key` on every open, as both do today), moves apply `moveItem`, and `dirty` is
 * `orderChanged(initial, working)`, so Cancel / ✕ / Escape ask "Discard changes?" after a move.
 * Save hands the new order back. Chrome: `FormPanel width="narrow" busy dirty` + the shared
 * `PanelButtons look="brand"`. The body is the screens' own: 20 px top padding, then the error and warning
 * bars, the hint and the list, `bodyGap` apart.
 *
 *   | prop        | CAPEX Accounts                     | Check List Settings                    |
 *   |-------------|------------------------------------|----------------------------------------|
 *   | canSave     | () => true (CA:2245)               | (changed) => changed && !stale         |
 *   | bodyGap     | 16                                 | 12 (+ `bodyPaddingBottom={20}`)        |
 *   | savingLabel | —                                  | "Saving…"                              |
 *   | footerGap   | 20 (CAX:2302)                      | — (10)                                 |
 *   | listProps   | inline labels, draggable, no period | showPosition, describedby, emptyText  |
 *
 * Wave C: `footerGap` (optional, default 10 = the shared footer) is passed to `PanelButtons gap`;
 * CAPEX Accounts' canvas reorder footer places Save 20 px left of Cancel
 * (`Admin CAPEX Accounts.pa.yaml` CAX:2302 `X: =…Cancel.X-Self.Width-20`).
 */
import { useState, type ReactNode } from "react";
import { MessageBar, MessageBarBody, Text, makeStyles, mergeClasses } from "@fluentui/react-components";
import { moveItem, orderChanged } from "@/domain/reorder";
import { FormPanel } from "./FormPanel";
import { PanelButtons } from "./CanvasFields";
import { ReorderItems, type ReorderItemsProps } from "./ReorderItems";

const useStyles = makeStyles({
  body: { display: "flex", flexDirection: "column", paddingTop: "20px" },
  gap12: { rowGap: "12px" },
  gap16: { rowGap: "16px" },
  bottom20: { paddingBottom: "20px" },
});

export interface ReorderPanelProps<T> {
  open: boolean;
  title: string;
  /** The order when the panel opened (a snapshot; later changes are ignored until remount). */
  items: readonly T[];
  getId: (t: T) => string;
  getLabel: (t: T) => string;
  /** The `<ol>`'s accessible name. */
  listAriaLabel: string;
  /** The help text above the list. */
  hint: ReactNode;
  /** Hint text class (CAPEX greys it). */
  hintClassName?: string;
  saving: boolean;
  error?: string | null;
  /** A warning bar under the error (Check List Settings' stale-list message), `role="alert"`. */
  warning?: string | null;
  /** Save enabled state from "the order changed"; default `(changed) => changed`. */
  canSave?: (changed: boolean) => boolean;
  onSave: (ordered: T[]) => void;
  onCancel: () => void;
  savingLabel?: string;
  bodyGap?: 12 | 16;
  bodyPaddingBottom?: 0 | 20;
  /** Space between Save and Cancel (`PanelButtons gap`); default 10. CAPEX Accounts: 20 (CAX:2302). */
  footerGap?: 10 | 20;
  /** `data-testid` of the footer Save / Cancel buttons (`PanelButtons`); kebab defaults. */
  saveTestId?: string;
  cancelTestId?: string;
  /** The Save button's hover hint (`PanelButtons saveTooltip`). */
  saveTooltip?: string;
  /** Passed through to `ReorderItems` (`showPosition`, `draggable`, `buttonLabels`, …). */
  listProps?: Partial<Omit<ReorderItemsProps<T>, "items" | "getId" | "getLabel" | "onMove" | "ariaLabel">>;
  /** The working order changed (CL keeps its own `changed` flag in step). */
  onOrderChange?: (ordered: T[]) => void;
}

export function ReorderPanel<T>({
  open, title, items, getId, getLabel, listAriaLabel, hint, hintClassName, saving, error, warning,
  canSave = (changed) => changed, onSave, onCancel, savingLabel, bodyGap = 16, bodyPaddingBottom = 0, footerGap, listProps,
  onOrderChange, saveTestId = "reorder-save", cancelTestId = "reorder-cancel", saveTooltip,
}: ReorderPanelProps<T>) {
  const styles = useStyles();
  const [initial] = useState<readonly T[]>(() => [...items]);
  const [working, setWorking] = useState<T[]>(() => [...items]);
  const ids = (list: readonly T[]) => list.map((t) => ({ id: getId(t) }));
  const changed = orderChanged(ids(initial), ids(working));

  return (
    <FormPanel
      open={open} width="narrow" title={title} onDismiss={onCancel}
      busy={saving} dirty={changed}
      footer={(
        <PanelButtons
          look="brand" disabled={!canSave(changed)} saving={saving} onSave={() => onSave(working)}
          saveTestId={saveTestId} cancelTestId={cancelTestId}
          {...(saveTooltip ? { saveTooltip } : {})}
          {...(savingLabel ? { savingLabel } : {})}
          {...(footerGap !== undefined ? { gap: footerGap } : {})}
        />
      )}
    >
      <div className={mergeClasses(
        styles.body, bodyGap === 12 ? styles.gap12 : styles.gap16, bodyPaddingBottom === 20 && styles.bottom20,
      )}>
        {error ? (
          <MessageBar intent="error" role="alert"><MessageBarBody>{error}</MessageBarBody></MessageBar>
        ) : null}
        {warning ? (
          <MessageBar intent="warning" role="alert"><MessageBarBody>{warning}</MessageBarBody></MessageBar>
        ) : null}
        <Text className={hintClassName}>{hint}</Text>
        <ReorderItems
          items={working}
          getId={getId}
          getLabel={getLabel}
          ariaLabel={listAriaLabel}
          disabled={saving}
          {...listProps}
          onMove={(from, to) => {
            const next = moveItem(working, from, to);
            setWorking(next);
            onOrderChange?.(next);
          }}
        />
      </div>
    </FormPanel>
  );
}
