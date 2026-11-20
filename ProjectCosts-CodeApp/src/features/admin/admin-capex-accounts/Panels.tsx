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
 * the Category box is the shared `ChoiceField` (the canvas `DropDown@0.0.45`, always disabled);
 * Main Account / the Edit subaccount number are `ReadOnlyField`; dirty is `isDirty`. The reorder
 * panel is the shared `ReorderPanel` with `footerGap={20}` (CAX:2302).
 *
 * The field cluster as the canvas draws it (20 Nov 2026 parity pass): Semibold captions
 * (`Text@0.0.51` `Weight: Semibold`), the red `*` hanging LEFT of the caption, the error labels
 * 8 pt Semibold in `palette.Error` with no icon and no red box, and no `{Len}/55` counter under
 * Name (the canvas sets `MaxLength: =55` but shows no counter).
 */
import { useState } from "react";
import { Text, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import {
  ChoiceField, FormPanel, PanelMessages, ReadOnlyField, ReorderPanel as SharedReorderPanel, TextField,
  useNoInvalidOutline,
} from "@/components";
import { isDirty } from "@/domain/form";
import { palette } from "@/theme/tokens";
import {
  MSG, NAME_MAX_LENGTH, accountNumberError, canSaveAccount, canSaveSubaccount,
  subaccountSuffixError, visibleNameError, type CapexNode,
} from "./rules";

/** `gblAppSizes.Font` points → px (Power Apps renders 96/72 px per point). */
const pt = (size: number) => `${(size * 4) / 3}px`;

const useStyles = makeStyles({
  /*
   * `con_Account_RightPanel_NewEditAccount_BodyContent` (CA:1040-1056): `PaddingTop: =20`, no `LayoutGap`;
   * the shared `.canvas-panel-body` padding of 20 px IS that top padding, so none is added here (the earlier
   * extra 20 px + 16 px gaps left the form starting 40 px down with wide gaps, user screenshot 21 Nov 2026).
   * Each field is a `Height: =70` container: the caption `Height: =22` and the input at `caption.Y + 22 + 5`
   * (CA:1061, 1081, 1114), so a field block is 70 px with a 5 px caption-to-input gap.
   */
  form: {
    display: "flex", flexDirection: "column", rowGap: "0",
    "& .fui-Field": { minHeight: "70px", rowGap: "0", alignContent: "start" },
    // `lbl_…_Category` / `_Number` / `_Name` (and the subaccount captions): `Weight: Semibold`, 22 px high.
    "& .fui-Field__label": {
      display: "inline-flex", alignItems: "baseline", fontWeight: tokens.fontWeightSemibold,
      minHeight: "22px", paddingBottom: "5px", boxSizing: "content-box",
    },
    /*
     * `lbl_…_Asterisk`: a `Label@2.5.1` "*", `Color: palette.Error`, `FontWeight: Semibold`,
     * `Size: Medium` (11 pt), 10 px wide at `X: =caption.X - Self.Width` (the subaccount panel's
     * X 10 with the caption at 20) — so it hangs in the margin left of the caption.
     */
    "& .fui-Field .fui-Field__label .fui-Label__required": {
      order: -1, boxSizing: "border-box", width: "10px", marginLeft: "-10px",
      paddingLeft: 0, paddingRight: 0,
      color: palette.Error, fontWeight: tokens.fontWeightSemibold, fontSize: pt(11),
    },
  },
  /**
   * `lbl_…_ErrorMessageNotNumbers` / `_ErrorMessageNumberExists`: `Size: ExtraExtraSmall` (8 pt),
   * `FontWeight: Semibold`, `Color: palette.Error`, `PaddingTop: =3`.
   */
  error: { fontSize: pt(8), fontWeight: tokens.fontWeightSemibold, color: palette.Error, paddingTop: "3px" },
  /** `lbl_…_AccountNumberAsPrefix`: `Size: =10`, `Color: gblAppStyles.Label.Color` (black). */
  prefix: { fontSize: pt(10), color: palette.black },
  /**
   * `lbl_Account_RightPanel_Ordering_BodyContent` (CA:2119-2149): `Color: Grayscale10`,
   * `FontWeight: Lighter`, `Size: Medium` (11 pt).
   */
  hint: { color: palette.Grayscale10, fontWeight: 300, fontSize: pt(11) },
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
  const noInvalidOutline = useNoInvalidOutline();
  const [number, setNumber] = useState(account?.number ?? "");
  const [name, setName] = useState(account?.name ?? "");

  const numberMessage = accountNumberError(number, isNew) ?? (duplicate ? MSG.accountExists : undefined);
  const nameMessage = visibleNameError(name);
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
      <div className={mergeClasses(styles.form, noInvalidOutline.root)}>
        <PanelMessages error={error} />
        {/*
          * `drp_Account_RightPanel_NewEditAccount_BodyContent_Category` — a `DropDown@0.0.45`,
          * `DisplayMode: Disabled` always, `DefaultSelectedItems` the selected tab (CA:1074-1083):
          * a disabled dropdown showing the category. It never opens, so its one option is the tab.
          * Captions: `lbl_…_Category.Text` "Category", `lbl_…_Number.Text` "Number",
          * `lbl_…_Name.Text` "Name" — verbatim, in the canvas order Category, Number, Name.
          */}
        <ChoiceField
          label="Category" required disabled
          value={category?.id ?? null}
          options={category ? [{ value: category.id, label: category.name }] : []}
          testId="drp_Account_RightPanel_NewEditAccount_BodyContent_Category"
        />
        {/* `txt_…_Number.DisplayMode: If(IsBlank(locSelectedAccount), Edit, Disabled)` (CA:1186-1191). */}
        <TextField skin="plain"
          label="Number" required value={number} disabled={!isNew}
          onChange={setNumber} error={numberMessage}
          errorClassName={styles.error} validationIcon={null}
          testId="txt_Account_RightPanel_NewEditAccount_BodyContent_Number"
        />
        {/* `txt_…_Name.MaxLength: =55` (CA:1341), no counter. */}
        <TextField skin="plain"
          label="Name" required value={name} maxLength={NAME_MAX_LENGTH} counter={false}
          onChange={setName} error={nameMessage}
          errorClassName={styles.error} validationIcon={null}
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
  const noInvalidOutline = useNoInvalidOutline();
  const [suffix, setSuffix] = useState("");
  const [name, setName] = useState(subaccount?.name ?? "");

  const suffixMessage = subaccountSuffixError(suffix, isNew) ?? (duplicate ? MSG.subaccountExists : undefined);
  const nameMessage = visibleNameError(name);
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
      <div className={mergeClasses(styles.form, noInvalidOutline.root)}>
        <PanelMessages error={error} />
        {/*
          * Captions: `lbl_…_AccountMain.Text` "Main Account", `lbl_…_Number.Text` "Subaccount
          * Number", `lbl_…_Name.Text` "Subaccount Name" — verbatim, in the canvas order. The Main
          * Account box (`txt_…_AccountName`, `Value: locSelectedAccount.Name`) is
          * `DisplayMode: Disabled` (CA:1611), so it is shown disabled.
          */}
        <ReadOnlyField
          skin="plain" label="Main Account" value={parent?.name ?? ""} required
          testId="txt_Account_RightPanel_NewEditSubaccount_BodyContent_AccountName"
        />
        {isNew ? (
          <TextField skin="plain"
            label="Subaccount Number" required value={suffix} onChange={setSuffix}
            error={suffixMessage} errorClassName={styles.error} validationIcon={null}
            // `lbl_…_AccountNumberAsPrefix.Text: locSelectedAccount.Number & "_"`, visible for a NEW subaccount only.
            contentBefore={(
              <Text className={styles.prefix} data-testid="lbl_Account_RightPanel_NewEditSubaccount_BodyContent_AccountNumberAsPrefix">
                {prefix}
              </Text>
            )}
            testId="txt_Account_RightPanel_NewEditSubaccount_BodyContent_Number"
          />
        ) : (
          // Edit: the full number, disabled (no validation applies to it). Same canvas control,
          // which the canvas disables in edit mode (CA:1758-1766).
          <ReadOnlyField
            skin="plain" label="Subaccount Number" value={subaccount?.number ?? ""} required
            testId="txt_Account_RightPanel_NewEditSubaccount_BodyContent_Number"
          />
        )}
        {/* `txt_…_Name.MaxLength: =55` (CA:1885), no counter. */}
        <TextField skin="plain"
          label="Subaccount Name" required value={name} maxLength={NAME_MAX_LENGTH} counter={false}
          onChange={setName} error={nameMessage}
          errorClassName={styles.error} validationIcon={null}
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
 * `lbl_Account_RightPanel_Ordering_BodyContent.Text` (CA:2145) — verbatim. The port had added
 * ", or use the move up / move down buttons." (a divergence proposed in D149, not approved);
 * restored on 20 Nov 2026. The Move up / Move down buttons stay for the keyboard.
 */
const REORDER_HINT = "To reorder drag and drop listed items";

/**
 * The PowerDragDrop item text: `ItemTemplate: ="<p><b>{{vsb_name}}</b></p>"` (CA:2165, CA:2204),
 * the name only (D19: "lists the category's accounts by name"). The port had shown
 * "<number> - <name>", an unrecorded divergence; restored on 20 Nov 2026.
 */
const reorderLabel = (n: CapexNode) => n.name;

/**
 * The shared `ReorderPanel` with `footerGap={20}` (canvas CAX:2302) and `bodyGap={16}`. Rows drag
 * and drop as the canvas `pdd_CustomControl.PowerDragDrop`; focus follows a keyboard move and each
 * move is announced.
 *
 * The list carries its canvas name (`pcf_Account_RightPanel_Ordering_BodyContent_Accounts` / `…_Subaccounts`);
 * rows are the template's 15 px bold names with no line between them (`ItemFontSize: =15`, `BorderWidth: =0`,
 * the shared `ReorderItems` look). The ✕ (`ico_Account_RightPanel_Ordering_BodyHeaderCancel`) keeps its existing
 * `panel-close` id (rule 16: never change an existing value).
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
      getLabel={reorderLabel}
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
        listTestId: subaccounts
          ? "pcf_Account_RightPanel_Ordering_BodyContent_Subaccounts"
          : "pcf_Account_RightPanel_Ordering_BodyContent_Accounts",
        buttonLabels: "inline",
        draggable: true,
        announcePeriod: false,
        itemTestId: (n) => `reorder-item-${n.number}`,
      }}
    />
  );
}
