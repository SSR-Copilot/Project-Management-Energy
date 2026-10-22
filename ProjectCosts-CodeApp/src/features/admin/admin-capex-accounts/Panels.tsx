/**
 * The three right panels of `Admin CAPEX Accounts` (CA:942-2332): New/Edit Account
 * (`con_Account_RightPanel_NewEditAccount`), New/Edit Subaccount
 * (`con_Account_RightPanel_NewEditSubaccount`) and Reorder (`con_Account_RightPanel_Ordering`).
 * Each panel owns its form state; the screen remounts it (`key`) on every open so it is always
 * seeded fresh and Cancel discards. `data-testid`s are the canvas control names; the field labels
 * and panel titles are the canvas captions, verbatim (cited at each use).
 *
 * DIVERGENCE: the canvas hides a panel BEFORE its write runs and shows nothing on failure. Here a
 * panel stays open while saving and on failure, and shows the error inline. With unsaved input,
 * Cancel / ✕ / Escape ask "Discard changes?" first (NEW).
 *
 * Shared chrome: `FormPanel busy` blocks Escape / backdrop / ✕ / Cancel while a write
 * runs; `FormPanel dirty` asks "Discard changes?" before dropping unsaved input, with the
 * footer Cancel going through the same `requestClose`; the reorder panel is the shared
 * `ReorderPanel` (its list is `ReorderItems`).
 *
 * The footer is the shared `PanelButtons look="brand"` via `FormPanel actions` with `gap: 20` (canvas
 * `Save.X = Cancel.X - Self.Width - 20`, CAX:1440 / CAX:2302); the error bar is `PanelMessages`;
 * Category / Main Account / the Edit subaccount number are `ReadOnlyField`; name "touched"
 * is `useTouched` + `shownError`; dirty is `isDirty`. The reorder panel is the shared
 * `ReorderPanel` with `footerGap={20}` (CAX:2302).
 */
import { useState } from "react";
import { Text, makeStyles, tokens } from "@fluentui/react-components";
import {
  FormPanel, PanelMessages, ReadOnlyField, ReorderPanel as SharedReorderPanel, TextField,
} from "@/components";
import { useTouched, shownError } from "@/features/shared/useTouched";
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
  /** Mode frozen by the screen when the panel opened — never derived from `account`. */
  isNew: boolean;
  /** The edited row's snapshot (Edit); undefined for New. */
  account: CapexNode | undefined;
  category: CapexNode | undefined;
  saving: boolean;
  duplicate: boolean;
  error: string | undefined;
  /** Save disabled regardless of the form (e.g. the edited row no longer exists). */
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
    // `lbl_Account_RightPanel_NewEditAccount_BodyHeader.Text: If(IsBlank(locSelectedAccount), "New Account", "Edit Account")` — verbatim.
    <FormPanel
      open={open} width="narrow" title={isNew ? "New Account" : "Edit Account"} onDismiss={onCancel}
      busy={saving} dirty={dirty}
      closeTestId="ico_Account_RightPanel_NewEditAccount_BodyHeaderCancel"
      actions={{
        canSave: valid, saving, onSave: () => onSave({ number, name }), gap: FOOTER_GAP,
        saveTestId: "pcf_Account_RightPanel_NewEditAccount_BodyButtons_Save",
        cancelTestId: "pcf_Account_RightPanel_NewEditAccount_BodyButtons_Cancel",
      }}
    >
      <div className={styles.form}>
        <PanelMessages error={error} />
        {/*
          * `drp_Account_RightPanel_NewEditAccount_BodyContent_Category` — `DisplayMode: Disabled`
          * always, defaulted to the selected tab (CA:1074-1083), so it is shown read-only.
          * Captions: `lbl_…_Category.Text` "Category", `lbl_…_Number.Text` "Number",
          * `lbl_…_Name.Text` "Name" — verbatim.
          */}
        <ReadOnlyField
          skin="plain" label="Category" value={category?.name ?? ""} required
          testId="drp_Account_RightPanel_NewEditAccount_BodyContent_Category"
        />
        {/* `txt_…_Number.DisplayMode: If(IsBlank(locSelectedAccount), Edit, Disabled)` (CA:1186-1191). */}
        <TextField skin="plain"
          label="Number" required value={number} disabled={!isNew}
          onChange={setNumber} error={numberMessage}
          testId="txt_Account_RightPanel_NewEditAccount_BodyContent_Number"
        />
        <TextField skin="plain"
          label="Name" required value={name} maxLength={NAME_MAX_LENGTH}
          onChange={(v) => { setName(v); touched.touch("name"); }} error={nameMessage}
          testId="txt_Account_RightPanel_NewEditAccount_BodyContent_Name"
        />
      </div>
    </FormPanel>
  );
}

/* ════════════════════════════════════════════════════════════ subaccount ══ */

export interface SubaccountPanelProps {
  open: boolean;
  /** Mode frozen by the screen when the panel opened. */
  isNew: boolean;
  parent: CapexNode | undefined;
  /** The edited row's snapshot (Edit); undefined for New. */
  subaccount: CapexNode | undefined;
  saving: boolean;
  duplicate: boolean;
  error: string | undefined;
  /** Save disabled regardless of the form. */
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
    // `lbl_Account_RightPanel_NewEditSubaccount_BodyHeader.Text: If(IsBlank(locSelectedCapexSubaccount), "New Subaccount", "Edit Subaccount")` — verbatim.
    <FormPanel
      open={open} width="narrow" title={isNew ? "New Subaccount" : "Edit Subaccount"} onDismiss={onCancel}
      busy={saving} dirty={dirty}
      closeTestId="ico_Account_RightPanel_NewEditSubaccount_BodyHeaderCancel"
      actions={{
        canSave: valid, saving, onSave: () => onSave({ suffix, name }), gap: FOOTER_GAP,
        saveTestId: "pcf_Account_RightPanel_NewEditSubaccount_BodyButtons_Save",
        cancelTestId: "pcf_Account_RightPanel_NewEditSubaccount_BodyButtons_Cancel",
      }}
    >
      <div className={styles.form}>
        <PanelMessages error={error} />
        {/*
          * Captions: `lbl_…_AccountMain.Text` "Main Account", `lbl_…_Number.Text` "Subaccount
          * Number", `lbl_…_Name.Text` "Subaccount Name" — verbatim. The Main Account box
          * (`txt_…_AccountName`) is `DisplayMode: Disabled` (CA:1611), so it is shown read-only.
          */}
        <ReadOnlyField
          skin="plain" label="Main Account" value={parent?.name ?? ""} required
          testId="txt_Account_RightPanel_NewEditSubaccount_BodyContent_AccountName"
        />
        {isNew ? (
          <TextField skin="plain"
            label="Subaccount Number" required value={suffix} onChange={setSuffix}
            error={suffixMessage}
            // `lbl_…_AccountNumberAsPrefix.Text: locSelectedAccount.Number & "_"`, visible for a NEW subaccount only.
            contentBefore={<Text data-testid="lbl_Account_RightPanel_NewEditSubaccount_BodyContent_AccountNumberAsPrefix">{prefix}</Text>}
            testId="txt_Account_RightPanel_NewEditSubaccount_BodyContent_Number"
          />
        ) : (
          // Edit: the full number, read-only (no validation applies to it). Same canvas control,
          // which the canvas disables in edit mode.
          <ReadOnlyField
            skin="plain" label="Subaccount Number" value={subaccount?.number ?? ""} required
            testId="txt_Account_RightPanel_NewEditSubaccount_BodyContent_Number"
          />
        )}
        <TextField skin="plain"
          label="Subaccount Name" required value={name} maxLength={NAME_MAX_LENGTH}
          onChange={(v) => { setName(v); touched.touch("name"); }} error={nameMessage}
          testId="txt_Account_RightPanel_NewEditSubaccount_BodyContent_Name"
        />
      </div>
    </FormPanel>
  );
}

/* ═══════════════════════════════════════════════════════════════ reorder ══ */

export interface ReorderPanelProps {
  open: boolean;
  subaccounts: boolean;
  /** Current siblings in current order (seeded on every open). */
  items: readonly CapexNode[];
  saving: boolean;
  error: string | undefined;
  onSave: (itemsInNewOrder: CapexNode[]) => void;
  onCancel: () => void;
}

/**
 * Save is always enabled, as the canvas (`pcf_Account_RightPanel_Ordering_BodyButtons_Save
 * .DisplayMode: =DisplayMode.Edit`, CA:2245-2246); an unchanged list writes nothing.
 */
const ALWAYS_SAVE = () => true;

/**
 * DIVERGENCE: `lbl_Account_RightPanel_Ordering_BodyContent.Text` is "To reorder drag and drop
 * listed items" (CA:2119-2149). This panel also has Move up / Move down buttons, so the hint
 * names them too.
 */
const REORDER_HINT = "To reorder drag and drop listed items, or use the move up / move down buttons.";

/**
 * The shared `ReorderPanel` with `footerGap={20}` (canvas CAX:2302) and `bodyGap={16}`. Focus
 * follows the moved item and each move is announced.
 *
 * DIVERGENCE: each row shows "<number> - <name>", so equal names are distinguishable; the canvas
 * PowerDragDrop template is the name only (`ItemTemplate: "<p><b>{{vsb_name}}</b></p>"`, CA:2165).
 *
 * The ✕ (`ico_Account_RightPanel_Ordering_BodyHeaderCancel`) and the list
 * (`pcf_Account_RightPanel_Ordering_BodyContent_Accounts` / `…_Subaccounts`) carry no canvas id:
 * the shared `ReorderPanel` has no prop for them yet.
 */
export function ReorderPanel({ open, subaccounts, items, saving, error, onSave, onCancel }: ReorderPanelProps) {
  const styles = useStyles();
  return (
    <SharedReorderPanel<CapexNode>
      open={open}
      // `lbl_Account_RightPanel_Ordering_BodyHeader.Text: If(locIfOrderingSubaccounts, "Subaccounts order", "'Capex Accounts' order")` — verbatim.
      title={subaccounts ? "Subaccounts order" : "'Capex Accounts' order"}
      items={items}
      getId={(n) => n.id}
      getLabel={accountLabel}
      // NEW — no canvas equivalent: the list's accessible name.
      listAriaLabel={subaccounts ? "Subaccounts in order" : "Accounts in order"}
      hint={REORDER_HINT}
      hintClassName={styles.hint}
      saving={saving}
      error={error ?? null}
      canSave={ALWAYS_SAVE}
      onSave={onSave}
      onCancel={onCancel}
      bodyGap={16}
      footerGap={FOOTER_GAP}
      saveTestId="pcf_Account_RightPanel_Ordering_BodyButtons_Save"
      cancelTestId="pcf_Account_RightPanel_Ordering_BodyButtons_Cancel"
      listProps={{
        buttonLabels: "inline",
        draggable: true,
        announcePeriod: false,
        itemTestId: (n) => `reorder-item-${n.number}`,
      }}
    />
  );
}
