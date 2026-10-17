/**
 * Modules H (New/Edit Account), I (New/Edit Subaccount) and J (Reorder) — the three right
 * panels of `Admin CAPEX Accounts` (CA:942-2332). Each panel owns its form state; the screen
 * remounts it (`key`) on every open so it is always seeded fresh (AC-8.1) and Cancel discards.
 *
 * Unlike the canvas, a panel stays open while saving and on failure, and shows the error
 * inline (03-behaviour/05 "Event-order notes" 1; D-ERR-1).
 *
 * Shared chrome (batch 2b): `FormPanel busy` blocks Escape / backdrop / ✕ / Cancel while a write
 * runs (gap G3 / B2); `FormPanel dirty` asks "Discard changes?" before dropping unsaved input
 * (M7), with the footer Cancel going through the same `requestClose`; the reorder list is the
 * shared `ReorderList` (M12).
 *
 * Reusable components (Wave B): the footer is the shared `PanelFooter` via `FormPanel actions`
 * with `gap: 20` (canvas `Save.X = Cancel.X - Self.Width - 20`, CAX:1440 / CAX:2302); the error
 * bar is `PanelMessages`; Category / Main Account / the Edit subaccount number are
 * `ReadOnlyField`; name "touched" is `useTouched` + `shownError`; dirty is `isDirty`.
 * Wave C: the reorder panel is the shared `ReorderPanel` with `footerGap={20}` (CAX:2302).
 */
import { useState } from "react";
import { Text, makeStyles, tokens } from "@fluentui/react-components";
import {
  FormPanel, PanelMessages, ReadOnlyField, ReorderPanel as SharedReorderPanel, TextField,
} from "@/components";
import { useTouched, shownError } from "@/app/useTouched";
import { isDirty } from "@/domain/form";
import { palette } from "@/theme/tokens";
import {
  MSG, NAME_MAX_LENGTH, accountLabel, accountNumberError, canSaveAccount, canSaveSubaccount,
  nameError, subaccountSuffixError, type CapexNode,
} from "./rules";

const useStyles = makeStyles({
  form: { display: "flex", flexDirection: "column", rowGap: "16px", paddingTop: "20px" },
  hint: { color: palette.Grayscale10, fontWeight: tokens.fontWeightRegular },
});

/** CAPEX's footer: canvas button gap 20 (CAX:1440, CAX:2302). */
const FOOTER_GAP = 20;

/* ═══════════════════════════════════════════════════════════════ account ══ */

export interface AccountPanelProps {
  open: boolean;
  /** Mode frozen by the screen when the panel opened (gap G4) — never derived from `account`. */
  isNew: boolean;
  /** The edited row's snapshot (Edit); undefined for New. */
  account: CapexNode | undefined;
  category: CapexNode | undefined;
  saving: boolean;
  duplicate: boolean;
  error: string | undefined;
  /** Save disabled regardless of the form (e.g. the edited row no longer exists, G4). */
  blocked?: boolean;
  onSave: (form: { number: string; name: string }) => void;
  onCancel: () => void;
}

export function AccountPanel({
  open, isNew, account, category, saving, duplicate, error, blocked = false, onSave, onCancel,
}: AccountPanelProps) {
  const styles = useStyles();
  const [number, setNumber] = useState(account?.number ?? "");
  const [name, setName] = useState(account?.name ?? "");
  const touched = useTouched<"name">();

  const numberMessage = accountNumberError(number, isNew) ?? (duplicate ? MSG.accountExists : undefined);
  const nameMessage = shownError(nameError(name), touched.isTouched("name"));
  const valid = !blocked && canSaveAccount({ categoryId: category?.id, number, name }, isNew);
  const dirty = isDirty({ number, name }, { number: account?.number ?? "", name: account?.name ?? "" });

  return (
    <FormPanel
      open={open} width="narrow" title={isNew ? "New Account" : "Edit Account"} onDismiss={onCancel}
      busy={saving} dirty={dirty}
      actions={{ canSave: valid, saving, onSave: () => onSave({ number, name }), gap: FOOTER_GAP }}
    >
      <div className={styles.form}>
        <PanelMessages error={error} />
        <ReadOnlyField label="Category" value={category?.name ?? ""} required />
        <TextField
          label="Number" required value={number} disabled={!isNew}
          onChange={setNumber} error={numberMessage} testId="account-number"
        />
        <TextField
          label="Name" required value={name} maxLength={NAME_MAX_LENGTH}
          onChange={(v) => { setName(v); touched.touch("name"); }} error={nameMessage} testId="account-name"
        />
      </div>
    </FormPanel>
  );
}

/* ════════════════════════════════════════════════════════════ subaccount ══ */

export interface SubaccountPanelProps {
  open: boolean;
  /** Mode frozen by the screen when the panel opened (gap G4). */
  isNew: boolean;
  parent: CapexNode | undefined;
  /** The edited row's snapshot (Edit); undefined for New. */
  subaccount: CapexNode | undefined;
  saving: boolean;
  duplicate: boolean;
  error: string | undefined;
  /** Save disabled regardless of the form (G4). */
  blocked?: boolean;
  onSave: (form: { suffix: string; name: string }) => void;
  onCancel: () => void;
}

export function SubaccountPanel({
  open, isNew, parent, subaccount, saving, duplicate, error, blocked = false, onSave, onCancel,
}: SubaccountPanelProps) {
  const styles = useStyles();
  const [suffix, setSuffix] = useState("");
  const [name, setName] = useState(subaccount?.name ?? "");
  const touched = useTouched<"name">();

  const suffixMessage = subaccountSuffixError(suffix, isNew) ?? (duplicate ? MSG.subaccountExists : undefined);
  const nameMessage = shownError(nameError(name), touched.isTouched("name"));
  const valid = !blocked && Boolean(parent) && canSaveSubaccount({ suffix, name }, isNew);
  const prefix = `${parent?.number ?? ""}_`;
  const dirty = isDirty({ suffix, name }, { suffix: "", name: subaccount?.name ?? "" });

  return (
    <FormPanel
      open={open} width="narrow" title={isNew ? "New Subaccount" : "Edit Subaccount"} onDismiss={onCancel}
      busy={saving} dirty={dirty}
      actions={{ canSave: valid, saving, onSave: () => onSave({ suffix, name }), gap: FOOTER_GAP }}
    >
      <div className={styles.form}>
        <PanelMessages error={error} />
        <ReadOnlyField label="Main Account" value={parent?.name ?? ""} required />
        {isNew ? (
          <TextField
            label="Subaccount Number" required value={suffix} onChange={setSuffix}
            error={suffixMessage} contentBefore={<Text>{prefix}</Text>} testId="subaccount-number"
          />
        ) : (
          // Edit: the full number, read-only (no validation applies to it).
          <ReadOnlyField label="Subaccount Number" value={subaccount?.number ?? ""} required />
        )}
        <TextField
          label="Subaccount Name" required value={name} maxLength={NAME_MAX_LENGTH}
          onChange={(v) => { setName(v); touched.touch("name"); }} error={nameMessage} testId="subaccount-name"
        />
      </div>
    </FormPanel>
  );
}

/* ═══════════════════════════════════════════════════════════════ reorder ══ */

export interface ReorderPanelProps {
  open: boolean;
  subaccounts: boolean;
  /** Current siblings in current order (seeded on every open, AC-8.1). */
  items: readonly CapexNode[];
  saving: boolean;
  error: string | undefined;
  onSave: (itemsInNewOrder: CapexNode[]) => void;
  onCancel: () => void;
}

/** Save is always enabled, as the canvas (CA:2245-2246); an unchanged list writes nothing. */
const ALWAYS_SAVE = () => true;

/**
 * Wave C: the shared C12 `ReorderPanel` with `footerGap={20}` (canvas CAX:2302) and
 * `bodyGap={16}`. AC-8.4 (G11 / B10): focus follows the moved item and each move is announced;
 * D-REORDER-UX: number + name, so equal names are distinguishable.
 */
export function ReorderPanel({ open, subaccounts, items, saving, error, onSave, onCancel }: ReorderPanelProps) {
  const styles = useStyles();
  return (
    <SharedReorderPanel<CapexNode>
      open={open}
      title={subaccounts ? "Subaccounts order" : "'Capex Accounts' order"}
      items={items}
      getId={(n) => n.id}
      getLabel={accountLabel}
      listAriaLabel={subaccounts ? "Subaccounts in order" : "Accounts in order"}
      hint="To reorder drag and drop listed items, or use the move up / move down buttons."
      hintClassName={styles.hint}
      saving={saving}
      error={error ?? null}
      canSave={ALWAYS_SAVE}
      onSave={onSave}
      onCancel={onCancel}
      bodyGap={16}
      footerGap={FOOTER_GAP}
      listProps={{
        buttonLabels: "inline",
        draggable: true,
        announcePeriod: false,
        itemTestId: (n) => `reorder-item-${n.number}`,
      }}
    />
  );
}
