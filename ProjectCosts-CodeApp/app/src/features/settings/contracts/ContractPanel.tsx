/**
 * M7 — the New / Edit contract panel (ACS:1815-4039). The shared `FormPanel` with the `full`
 * preset: right-docked overlay, at most 960 px wide (FR-9). The form (M7b) and the DevCo Cost
 * Form (M7c) sit side by side when the panel is wide enough and stack below ~900 px — the canvas
 * gave each column a 560 px minimum inside a 960 px panel and clipped the DevCo column
 * (03-responsive-layout §2).
 *
 * The panel never closes before a save succeeds (D-03); the Screen decides when to close it. The
 * three-way close prompt (discard / incomplete links / scope change) runs through `FormPanel`'s
 * `closePrompt` / `promptRequest` / `onPromptCancel` (reusable components E1c): Escape, backdrop,
 * ✕ and the footer Cancel all ask it. While saving, `FormPanel busy` ignores Escape / backdrop
 * and disables ✕ and both footer buttons; "Loading contract..." is a `coverLabel`, so the panel
 * stays dismissable while it shows (as before).
 */
import type { ReactNode } from "react";
import { Field, Input, Radio, RadioGroup, Select, makeStyles } from "@fluentui/react-components";
import { FormPanel, PANEL_RADIO_ROW, TextAreaField, TextField } from "@/components";
import type { CloseReason, DiscardText } from "@/app/navigationGuardContext";
import { shownError, useTouched } from "@/app/useTouched";
import { media } from "@/theme/tokens";
import {
  CLOSING_REF_OPTIONS, COMMENT_MAX, DESCRIPTION_MAX, MARGIN_TYPE, MSG,
  marginValueHeading, withMargin, withMarginType,
  type ContractForm, type FormErrors,
} from "./rules";

const useStyles = makeStyles({
  columns: {
    display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", columnGap: "28px", rowGap: "20px",
    [media.belowMd]: { gridTemplateColumns: "minmax(0, 1fr)" },
  },
  column: { display: "flex", flexDirection: "column", gap: "14px", minWidth: "0" },
  monthRow: { display: "flex", gap: "8px", alignItems: "flex-start" },
  sign: { width: "72px", flexShrink: 0 },
  months: { flexGrow: 1, minWidth: "0" },
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
  /** `"scope"` while the URL no longer names the panel's country / technology (B-2). */
  promptRequest?: CloseReason;
  /** "Keep editing" on the prompt. */
  onPromptCancel: (reason: CloseReason) => void;
  /** Closes the panel (after the prompt, when one was asked). */
  onDismiss: () => void;
  /** The DevCo Cost Form, built by the Screen. */
  devCoForm: ReactNode;
  /** The last save failure, kept visible in the panel next to the retained input (D-03). */
  errorText?: string;
}

export function ContractPanel({
  open, title, form, onFormChange, errors, currency, saveEnabled, saving, loading = false, onSave,
  dirty, closePrompt, promptRequest, onPromptCancel, onDismiss, devCoForm, errorText,
}: ContractPanelProps) {
  const styles = useStyles();
  const { isTouched, touch } = useTouched<Touchable>();

  /** Blank errors wait until the field was touched; format and range errors show at once (canvas). */
  const shown = (field: Touchable, error: string | undefined) => shownError(error, isTouched(field), MSG.inputBlank);

  const set = (patch: Partial<ContractForm>) => onFormChange({ ...form, ...patch });

  return (
    <FormPanel
      open={open}
      title={title}
      width="full"
      busy={saving}
      busyLabel={saving ? "Please wait, saving..." : undefined}
      coverLabel={loading ? "Loading contract..." : undefined}
      dirty={dirty}
      closePrompt={closePrompt}
      {...(promptRequest !== undefined ? { promptRequest } : {})}
      onPromptCancel={onPromptCancel}
      onDismiss={onDismiss}
      actions={{ onSave, canSave: saveEnabled, saving }}
      messages={{ error: errorText ?? null }}
    >
      <div className={styles.columns}>
        <div className={styles.column}>
          <TextField
            label="Description" required ariaLabel={null}
            value={form.description} maxLength={DESCRIPTION_MAX} counter="none"
            error={shown("description", errors.description)}
            onChange={(description) => set({ description })}
            onBlur={() => touch("description")}
          />

          <Field label="Closing Date Reference" required validationMessage={errors.closingRef}>
            <RadioGroup
              layout="horizontal" className={PANEL_RADIO_ROW}
              value={form.closingRef === null ? "" : String(form.closingRef)}
              onChange={(_, d) => set({ closingRef: Number(d.value) })}
            >
              {CLOSING_REF_OPTIONS.map((o) => <Radio key={o.value} value={String(o.value)} label={o.label} />)}
            </RadioGroup>
          </Field>

          <Field label="Month Difference" required validationMessage={shown("month", errors.month)}>
            <div className={styles.monthRow}>
              <Select
                className={styles.sign} aria-label="Month difference sign"
                value={form.monthSign}
                onChange={(_, d) => set({ monthSign: d.value === "-" ? "-" : "+" })}
              >
                <option value="+">+</option>
                <option value="-">-</option>
              </Select>
              <Input
                className={styles.months} aria-label="Months" placeholder="Months"
                inputMode="numeric" value={form.monthText}
                onChange={(_, d) => set({ monthText: d.value })}
                onBlur={() => touch("month")}
              />
            </div>
          </Field>

          <Field label="Margin" required validationMessage={errors.margin}>
            <RadioGroup
              layout="horizontal" className={PANEL_RADIO_ROW}
              value={form.margin === null ? "" : form.margin ? "yes" : "no"}
              onChange={(_, d) => onFormChange(withMargin(form, d.value === "yes"))}
            >
              <Radio value="yes" label="Yes" />
              <Radio value="no" label="No" />
            </RadioGroup>
          </Field>

          {form.margin ? (
            <Field label="Margin Type" required validationMessage={errors.marginType}>
              <RadioGroup
                layout="horizontal" className={PANEL_RADIO_ROW}
                value={form.marginType === null ? "" : String(form.marginType)}
                onChange={(_, d) => onFormChange(withMarginType(form, Number(d.value)))}
              >
                <Radio value={String(MARGIN_TYPE.Percentage)} label="Percentage" />
                <Radio value={String(MARGIN_TYPE.FixedValue)} label="Fixed Value" />
              </RadioGroup>
            </Field>
          ) : null}

          {form.margin && form.marginType === MARGIN_TYPE.Percentage ? (
            <TextField
              label="Margin [%]" required ariaLabel={null}
              value={form.marginPercentageText} maxLength={130} counter="none" inputMode="decimal" contentAfter="%"
              error={shown("marginPercentage", errors.marginPercentage)}
              onChange={(marginPercentageText) => set({ marginPercentageText })}
              onBlur={() => touch("marginPercentage")}
            />
          ) : null}

          {form.margin && form.marginType === MARGIN_TYPE.FixedValue ? (
            <TextField
              label={marginValueHeading(MARGIN_TYPE.FixedValue, currency)} required ariaLabel={null}
              value={form.marginFixedText} maxLength={130} counter="none" inputMode="decimal" contentAfter={currency}
              error={shown("marginFixed", errors.marginFixed)}
              onChange={(marginFixedText) => set({ marginFixedText })}
              onBlur={() => touch("marginFixed")}
            />
          ) : null}

          {/*
            Counter "{Len(Trim(v))}/50" in the hint (ACS:3011; parity round 1 Gap 4, round 2 NG-2).
            `rows="auto"` (Wave C): no `rows` attribute, the browser default (2) the local Textarea had.
          */}
          <TextAreaField
            label="Comment" ariaLabel={null} rows="auto"
            value={form.comment} maxLength={COMMENT_MAX} counter="hint" countMode="powerFxTrim" resize="vertical"
            onChange={(comment) => set({ comment })}
          />
        </div>

        <div className={styles.column}>{devCoForm}</div>
      </div>
    </FormPanel>
  );
}
