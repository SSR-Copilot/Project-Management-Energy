/**
 * The New / Edit contract panel (`con_AdminContracrt_RightPanel_NewEditContract`, ACS:1815-4039).
 * The shared `FormPanel` with the `full` preset: right-docked overlay, at most 960 px wide. The
 * form (`con_Add_Edit_AdminContracts_Right_Panel_BodyContent_Left`) and the DevCo Cost Form
 * (`…_BodyContent_Right`) sit side by side when the panel is wide enough and stack below ~900 px.
 * The ✕ is `ico_Add_Edit_AdminContracts_Close`; Save / Cancel are `ico_AdminContracts_Save` /
 * `ico_AdminContracts_Cancel`.
 *
 * DIVERGENCE: the canvas gave each column a 560 px minimum inside a 960 px panel and clipped the
 * DevCo column; here the columns shrink and stack.
 * DIVERGENCE: `ico_AdminContracts_Save.OnChange` hides the panel FIRST
 * (`locIsVisibleBoPStandardAssumptionContract: false`) and then writes. Here the panel never closes
 * before a save succeeds (the Screen decides): a failed save keeps the input for a retry.
 * DIVERGENCE: the canvas ✕ and Cancel close at once. Here the close prompt (discard / incomplete
 * links / scope change) runs through `FormPanel`'s `closePrompt` / `promptRequest` /
 * `onPromptCancel`: Escape, backdrop, ✕ and the footer Cancel all ask it. While saving,
 * `FormPanel busy` ignores Escape / backdrop and disables ✕ and both footer buttons;
 * "Loading contract..." (no canvas text) is a `coverLabel`, so the panel stays dismissable while it
 * shows.
 *
 * Hard-coded colour with no theme token: `#f4f4f4` (the canvas input fill on the sign Select).
 */
import { useId, type ReactNode } from "react";
import { Field, Input, Radio, RadioGroup, Select, Textarea, makeStyles, tokens } from "@fluentui/react-components";
import { FormPanel, TextField, type CloseReason, type DiscardText } from "@/components";
import { shownError, useTouched } from "@/features/shared/useTouched";
import { media } from "@/theme/tokens";
import {
  CARD_TEXT as T, CLOSING_REF_OPTIONS, COMMENT_MAX, DESCRIPTION_MAX, MARGIN_CHOICES, MARGIN_TYPE, MARGIN_TYPE_LABEL,
  MONTH_SIGNS, MSG, commentCounter, marginValueHeading, withMargin, withMarginType,
  type ContractForm, type FormErrors,
} from "./rules";

/**
 * Canvas parity of the panel chrome. Everything that fights a GLOBAL `canvas.css` rule is
 * scoped here (descendant selectors on the form, or on the drawer via `panelClassName`); the
 * doubled class raises specificity above the global `.canvas-panel …` rules without `!important`.
 */
const useStyles = makeStyles({
  /** ~400 px form column (inputs 360) | ~560 px tree column (rows 520) at wide widths (ACS:1952, 3057). */
  columns: {
    display: "grid", gridTemplateColumns: "minmax(0, 360px) minmax(0, 1fr)", columnGap: "40px", rowGap: "20px",
    [media.belowMd]: { gridTemplateColumns: "minmax(0, 1fr)" },
    /* Canvas labels are semibold (ACS:2053); `canvas.css:107` forces 400 for every panel. */
    "& .fui-Field.fui-Field > label": { fontWeight: tokens.fontWeightSemibold },
    "& .fui-Radio__label": { fontWeight: tokens.fontWeightSemibold },
    /* `canvas.css:106` greys Input/Dropdown/Textarea but not the Select. */
    "& .fui-Select.fui-Select": { backgroundColor: "#f4f4f4", borderTopWidth: "0", borderRightWidth: "0", borderBottomWidth: "0", borderLeftWidth: "0", borderRadius: "3px" },
    "& .fui-Select__select.fui-Select__select": {
      backgroundColor: "#f4f4f4", borderRadius: "3px",
      borderTopWidth: "0", borderRightWidth: "0", borderBottomWidth: "0", borderLeftWidth: "0",
    },
  },
  column: { display: "flex", flexDirection: "column", gap: "14px", minWidth: "0" },
  monthRow: { display: "flex", gap: "20px", alignItems: "flex-start" },
  sign: { width: "100px", flexShrink: 0 },
  months: { width: "160px", flexShrink: 1, minWidth: "0" },
  /** The Comment label row: caption left, `n/50` right (ACS:3005-3015). */
  commentLabel: {
    display: "flex", justifyContent: "space-between", alignItems: "baseline",
    width: "100%", maxWidth: "none", justifySelf: "stretch",
  },
  counter: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightRegular },
  commentBox: { minHeight: "60px" },
  /** Drawer chrome for this panel only: a 46 px title bar with a 16 px title (ACS:1853, 1875) and a 60 px footer (ACS:3771). */
  panel: {
    "& .canvas-panel-header.canvas-panel-header": { height: "46px" },
    "& .canvas-panel-header.canvas-panel-header h2": { fontSize: "16px", lineHeight: "24px" },
    "& .canvas-panel-footer.canvas-panel-footer": { height: "60px" },
  },
});

type Touchable = "description" | "month" | "marginPercentage" | "marginFixed";

export interface ContractPanelProps {
  open: boolean;
  title: string;
  form: ContractForm;
  onFormChange: (next: ContractForm) => void;
  errors: FormErrors;
  currency: string;
  saveEnabled: boolean;
  /** A save is in flight: "Please wait, saving..." and every dismissal locked. */
  saving: boolean;
  /** The edit panel waits for the fresh row: "Loading contract..." (dismissal still allowed). */
  loading?: boolean;
  onSave: () => void;
  /** Unsaved input OR incomplete links — drives `beforeunload` (the prompt itself is `closePrompt`). */
  dirty: boolean;
  /** The prompt for a close reason; `null` closes at once. */
  closePrompt: (reason: CloseReason) => Partial<DiscardText> | null;
  /** `"scope"` while the URL no longer names the panel's country / technology. */
  promptRequest?: CloseReason;
  /** "Keep editing" on the prompt. */
  onPromptCancel: (reason: CloseReason) => void;
  /** Closes the panel (after the prompt, when one was asked). */
  onDismiss: () => void;
  /** The DevCo Cost Form, built by the Screen. */
  devCoForm: ReactNode;
  /** The last save failure, kept visible in the panel next to the retained input. */
  errorText?: string;
}

export function ContractPanel({
  open, title, form, onFormChange, errors, currency, saveEnabled, saving, loading = false, onSave,
  dirty, closePrompt, promptRequest, onPromptCancel, onDismiss, devCoForm, errorText,
}: ContractPanelProps) {
  const styles = useStyles();
  const counterId = useId();
  const { isTouched, touch } = useTouched<Touchable>();

  /**
   * Blank errors wait until the field was touched; format and range errors show at once (canvas).
   * DIVERGENCE: the canvas never shows a blank error (its error labels need a non-blank value).
   */
  const shown = (field: Touchable, error: string | undefined) => shownError(error, isTouched(field), MSG.inputBlank);

  const set = (patch: Partial<ContractForm>) => onFormChange({ ...form, ...patch });

  return (
    <FormPanel
      open={open}
      title={title}
      width="full"
      busy={saving}
      busyLabel={saving ? T.saving : undefined}
      coverLabel={loading ? "Loading contract..." : undefined}
      dirty={dirty}
      closePrompt={closePrompt}
      {...(promptRequest !== undefined ? { promptRequest } : {})}
      onPromptCancel={onPromptCancel}
      onDismiss={onDismiss}
      closeTestId="ico_Add_Edit_AdminContracts_Close"
      panelClassName={styles.panel}
      actions={{
        onSave, canSave: saveEnabled, saving, gap: 20,
        saveTestId: "ico_AdminContracts_Save", cancelTestId: "ico_AdminContracts_Cancel",
      }}
      messages={{ error: errorText ?? null }}
    >
      <div className={styles.columns}>
        <div className={styles.column}>
          <TextField skin="plain"
            label={T.description} required ariaLabel={null} testId="txt_Add_Edit_AdminContracts_Description"
            value={form.description} maxLength={DESCRIPTION_MAX} counter="none"
            error={shown("description", errors.description)}
            onChange={(description) => set({ description })}
            onBlur={() => touch("description")}
          />

          <Field label={T.closingDateReference} required validationMessage={errors.closingRef}>
            <RadioGroup
              data-testid="rad_Contracts_RightPanel_NewEdit_CostsUntilClosingDate"
              value={form.closingRef === null ? "" : String(form.closingRef)}
              onChange={(_, d) => set({ closingRef: Number(d.value) })}
            >
              {CLOSING_REF_OPTIONS.map((o) => <Radio key={o.value} value={String(o.value)} label={o.label} aria-label={o.label} data-testid={`rad_Contracts_RightPanel_NewEdit_CostsUntilClosingDate-${o.value}`} />)}
            </RadioGroup>
          </Field>

          {/*
            The sign and the number share the canvas caption "Month Difference" (CONVENTIONS rule 16:
            no canvas AccessibleLabel, so the visible caption).
            DIVERGENCE: the "Months" placeholder has no canvas equivalent
            (`txt_Add_Edit_AdminContracts_MonthDifference_Month` sets none).
          */}
          <Field label={T.monthDifference} required validationMessage={shown("month", errors.month)}>
            <div className={styles.monthRow}>
              <Select
                className={styles.sign} aria-label={T.monthDifference} data-testid="drp_Add_Edit_AdminContracts_MonthDifference_AddSub"
                value={form.monthSign}
                onChange={(_, d) => set({ monthSign: d.value === "-" ? "-" : "+" })}
              >
                {MONTH_SIGNS.map((sign) => <option key={sign} value={sign}>{sign}</option>)}
              </Select>
              <Input
                className={styles.months} aria-label={T.monthDifference} data-testid="txt_Add_Edit_AdminContracts_MonthDifference_Month" placeholder="Months"
                inputMode="numeric" value={form.monthText}
                onChange={(_, d) => set({ monthText: d.value })}
                onBlur={() => touch("month")}
              />
            </div>
          </Field>

          <Field label={T.margin} required validationMessage={errors.margin}>
            <RadioGroup
              data-testid="rad_Add_Edit_AdminContracts_RightPanel_NewEdit_Margin"
              value={form.margin === null ? "" : form.margin ? "yes" : "no"}
              onChange={(_, d) => onFormChange(withMargin(form, d.value === "yes"))}
            >
              {MARGIN_CHOICES.map((o) => (
                <Radio key={o.value} value={o.value} label={o.label} aria-label={o.label} data-testid={`rad_Add_Edit_AdminContracts_RightPanel_NewEdit_Margin-${o.value}`} />
              ))}
            </RadioGroup>
          </Field>

          {form.margin ? (
            <Field label={T.marginType} required validationMessage={errors.marginType}>
              <RadioGroup
                data-testid="rad_AddEdit_AdminContracts_RightPanel_MarginType"
                value={form.marginType === null ? "" : String(form.marginType)}
                onChange={(_, d) => onFormChange(withMarginType(form, Number(d.value)))}
              >
                {[MARGIN_TYPE.Percentage, MARGIN_TYPE.FixedValue].map((type) => (
                  <Radio
                    key={type} value={String(type)} label={MARGIN_TYPE_LABEL[type]} aria-label={MARGIN_TYPE_LABEL[type]}
                    data-testid={`rad_AddEdit_AdminContracts_RightPanel_MarginType-${type}`}
                  />
                ))}
              </RadioGroup>
            </Field>
          ) : null}

          {/* `txt_Add_Edit_AdminContracts_MarginPercentage.MaxLength` / `…_MarginFixedValue.MaxLength` = 130. */}
          {form.margin && form.marginType === MARGIN_TYPE.Percentage ? (
            <TextField skin="plain"
              label={T.marginPercentage} required ariaLabel={null} testId="txt_Add_Edit_AdminContracts_MarginPercentage"
              value={form.marginPercentageText} maxLength={130} counter="none" inputMode="decimal" contentAfter="%"
              error={shown("marginPercentage", errors.marginPercentage)}
              onChange={(marginPercentageText) => set({ marginPercentageText })}
              onBlur={() => touch("marginPercentage")}
            />
          ) : null}

          {form.margin && form.marginType === MARGIN_TYPE.FixedValue ? (
            <TextField skin="plain"
              label={marginValueHeading(MARGIN_TYPE.FixedValue, currency)} required ariaLabel={null} testId="txt_Add_Edit_AdminContracts_MarginFixedValue"
              value={form.marginFixedText} maxLength={130} counter="none" inputMode="decimal" contentAfter={currency}
              error={shown("marginFixed", errors.marginFixed)}
              onChange={(marginFixedText) => set({ marginFixedText })}
              onBlur={() => touch("marginFixed")}
            />
          ) : null}

          {/*
            Counter `lbl_Contracts_RightPanel_NewEdit_PaymentTarget_Note_Details_1`,
            "{Len(Trim(v))}/50", right-aligned in the label row (ACS:3005-3015). The counter is
            aria-hidden inside the label (the textbox name stays "Comment") and is the textbox's
            description instead. No `rows` attribute: the browser default (2), with a 60 px
            minimum height as the canvas box.
          */}
          <Field
            label={{
              className: styles.commentLabel,
              children: (
                <>
                  <span>{T.comment}</span>
                  <span
                    id={counterId} className={styles.counter} aria-hidden="true"
                    data-testid="lbl_Contracts_RightPanel_NewEdit_PaymentTarget_Note_Details_1"
                  >
                    {commentCounter(form.comment)}
                  </span>
                </>
              ),
            }}
          >
            <Textarea
              value={form.comment} maxLength={COMMENT_MAX} resize="vertical"
              aria-label={T.comment} data-testid="txt_Add_Edit_AdminContracts_Comments"
              textarea={{ className: styles.commentBox }}
              aria-describedby={counterId}
              onChange={(_, d) => set({ comment: d.value })}
            />
          </Field>
        </div>

        <div className={styles.column}>{devCoForm}</div>
      </div>
    </FormPanel>
  );
}
