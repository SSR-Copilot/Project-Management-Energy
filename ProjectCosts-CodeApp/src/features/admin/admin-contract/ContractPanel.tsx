/**
 * The New / Edit contract panel (`con_AdminContracrt_RightPanel_NewEditContract`, ACS:1815-4039).
 * The shared `FormPanel` with the `full` preset: right-docked overlay, at most 960 px wide. The
 * form (`con_Add_Edit_AdminContracts_Right_Panel_BodyContent_Left`) and the DevCo Cost Form
 * (`…_BodyContent_Right`) sit side by side when the panel is wide enough and stack below ~900 px.
 * The ✕ is `ico_Add_Edit_AdminContracts_Close`; Save / Cancel are `ico_AdminContracts_Save` /
 * `ico_AdminContracts_Cancel`.
 *
 * Canvas parity (20 Nov 2026, D23):
 *  - the five text inputs carry the UNCONDITIONAL standard-assumption pair (`FontColor: themePrimary`,
 *    `FontItalic: true`; ACS:2027, 2401, 2547, 2780, 2993) through the shared style (CONVENTIONS rule 20);
 *  - captions are `gblAppStyles.Label`: black, 11 pt (14.67 px) Semibold; the required `*` is the
 *    `lbl_…_Aestrik` label — `palette.Error`, Semibold, a 10-wide box hung LEFT of the caption
 *    (`X: =lbl_….X - Self.Width`, ACS:2067-2098, 3693);
 *  - the error labels (`lbl_…_ErrorMessage`, ACS:1975, 2276, 2561, 2651) are `palette.Error`, Semibold,
 *    `ExtraExtraSmall` (8 pt = 10.67 px), no icon, and `Visible` only for a NON-blank invalid value: a
 *    blank field only greys Save (`visibleFieldError`);
 *  - the live canvas's "Months" placeholder on the month box, no "%" / currency inside the margin boxes (ACS:2543,
 *    2776), no caption and no `*` on `rad_AddEdit_AdminContracts_RightPanel_MarginType` (ACS:2897) —
 *    it keeps its accessible name only;
 *  - the fixed-value caption's currency is the canvas Poland → "PLN" / else "EUR" rule
 *    (`panelFixedValueCurrency`, ACS:2506), passed in as `currency`;
 *  - a Margin / Margin Type change resets both inputs to "0" (`withMargin` / `withMarginType`,
 *    ACS:2872-2930).
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
 * DIVERGENCE: the Margin / Margin Type radio messages ("Select whether…", "Select a margin type.")
 * have no canvas equivalent (`MSG`); the canvas only greys Save.
 *
 * Hard-coded colour with no theme token: `#f4f4f4` (the canvas input fill on the sign Select).
 */
import { useId, type ReactNode } from "react";
import { Field, Input, Radio, RadioGroup, Select, Textarea, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { FormPanel, TextField, useStandardValueClass, type CloseReason, type DiscardText } from "@/components";
import { media, palette } from "@/theme/tokens";
import {
  CARD_TEXT as T, CLOSING_REF_OPTIONS, COMMENT_MAX, DESCRIPTION_MAX, MARGIN_CHOICES, MARGIN_TYPE, MARGIN_TYPE_LABEL,
  MONTH_SIGNS, commentCounter, marginValueHeading, panelInputIsStandard, visibleFieldError, withMargin, withMarginType,
  type ContractForm, type FormErrors,
} from "./rules";

/** `gblAppSizes.Font.Medium` (11 pt) and `ExtraExtraSmall` (8 pt) at 96/72 px per point. */
const CAPTION_PX = "14.6667px";
const ERROR_PX = "10.6667px";

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
    /*
     * Captions `lbl_Add_Edit_AdminContracts_*` = `gblAppStyles.Label` (black) at `Size: Medium`, Semibold
     * (ACS:2053-2058); `canvas.css:107` forces 400 for every panel. `position: relative` anchors the `*`.
     */
    "& .fui-Field.fui-Field > label": {
      position: "relative", color: palette.black, fontSize: CAPTION_PX, fontWeight: tokens.fontWeightSemibold,
    },
    "& .fui-Radio__label": { fontWeight: tokens.fontWeightSemibold },
    /*
     * `lbl_…_Aestrik` (ACS:2067-2098, 3693): a classic Label `Text: "*"`, `Color: palette.Error`,
     * `FontWeight: Semibold`, `Width: 10`, `X: =caption.X - Self.Width` — hung 10 px LEFT of the caption,
     * out of the caption's flow. Not the shared `useCanvasRequiredMark` (that is the PM `lbl_…_Requered`:
     * akzent5, regular weight, a 15 px box), so the look is transcribed here.
     */
    "& .fui-Field .fui-Field__label .fui-Label__required": {
      position: "absolute", left: "-10px", top: "0", width: "10px",
      marginLeft: "0", paddingLeft: "0", paddingRight: "0",
      color: palette.Error, fontWeight: tokens.fontWeightSemibold, fontSize: CAPTION_PX,
    },
    /* `lbl_…_ErrorMessage` (ACS:1975, 2276, 2561, 2651): `palette.Error`, Semibold, `ExtraExtraSmall` (8 pt). */
    "& .fui-Field__validationMessage": {
      color: palette.Error, fontWeight: tokens.fontWeightSemibold, fontSize: ERROR_PX,
    },
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

export interface ContractPanelProps {
  open: boolean;
  title: string;
  form: ContractForm;
  onFormChange: (next: ContractForm) => void;
  errors: FormErrors;
  /** The fixed-value CAPTION's currency — `panelFixedValueCurrency` ("PLN" / "EUR"), not the card's ISO code. */
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
  const standardClass = useStandardValueClass();
  const counterId = useId();

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
          {/* `lbl_Add_Edit_AdminContracts_Description_ErrorMessage.Text` is commented out (ACS:2000-2017): no message ever. */}
          <TextField skin="plain"
            label={T.description} required ariaLabel={null} testId="txt_Add_Edit_AdminContracts_Description"
            value={form.description} maxLength={DESCRIPTION_MAX} counter="none" validationIcon={null}
            standard={panelInputIsStandard("description")}
            error={visibleFieldError(errors.description)}
            onChange={(description) => set({ description })}
          />

          <Field label={T.closingDateReference} required validationMessage={errors.closingRef} validationMessageIcon={null}>
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
            no canvas AccessibleLabel, so the visible caption). Placeholder "Months": the LIVE canvas
            `txt_Add_Edit_AdminContracts_MonthDifference_Month` shows it as grey hint text (user screenshot,
            21 Nov 2026); the extracted YAML (1.21.709, ACS:2398) predates it and sets none, as with the
            tab-strip sort (D154).
          */}
          <Field label={T.monthDifference} required validationMessage={visibleFieldError(errors.month)} validationMessageIcon={null}>
            <div className={styles.monthRow}>
              <Select
                className={styles.sign} aria-label={T.monthDifference} data-testid="drp_Add_Edit_AdminContracts_MonthDifference_AddSub"
                value={form.monthSign}
                onChange={(_, d) => set({ monthSign: d.value === "-" ? "-" : "+" })}
              >
                {MONTH_SIGNS.map((sign) => <option key={sign} value={sign}>{sign}</option>)}
              </Select>
              <Input
                className={mergeClasses(styles.months, standardClass(panelInputIsStandard("month")))}
                aria-label={T.monthDifference} data-testid="txt_Add_Edit_AdminContracts_MonthDifference_Month"
                placeholder="Months"
                inputMode="numeric" value={form.monthText}
                onChange={(_, d) => set({ monthText: d.value })}
              />
            </div>
          </Field>

          <Field label={T.margin} required validationMessage={errors.margin} validationMessageIcon={null}>
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

          {/* `rad_AddEdit_AdminContracts_RightPanel_MarginType` (ACS:2897): no caption label and no `*`; the name is accessible only. */}
          {form.margin ? (
            <Field validationMessage={errors.marginType} validationMessageIcon={null}>
              <RadioGroup
                aria-label={T.marginType}
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

          {/* `txt_Add_Edit_AdminContracts_MarginPercentage.MaxLength` / `…_MarginFixedValue.MaxLength` = 130; no suffix inside the box. */}
          {form.margin && form.marginType === MARGIN_TYPE.Percentage ? (
            <TextField skin="plain"
              label={T.marginPercentage} required ariaLabel={null} testId="txt_Add_Edit_AdminContracts_MarginPercentage"
              value={form.marginPercentageText} maxLength={130} counter="none" inputMode="decimal" validationIcon={null}
              standard={panelInputIsStandard("marginPercentage")}
              error={visibleFieldError(errors.marginPercentage)}
              onChange={(marginPercentageText) => set({ marginPercentageText })}
            />
          ) : null}

          {form.margin && form.marginType === MARGIN_TYPE.FixedValue ? (
            <TextField skin="plain"
              label={marginValueHeading(MARGIN_TYPE.FixedValue, currency)} required ariaLabel={null} testId="txt_Add_Edit_AdminContracts_MarginFixedValue"
              value={form.marginFixedText} maxLength={130} counter="none" inputMode="decimal" validationIcon={null}
              standard={panelInputIsStandard("marginFixed")}
              error={visibleFieldError(errors.marginFixed)}
              onChange={(marginFixedText) => set({ marginFixedText })}
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
              className={standardClass(panelInputIsStandard("comment"))}
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
