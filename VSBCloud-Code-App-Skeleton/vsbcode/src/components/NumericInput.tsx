/**
 * NumericInput / PercentageInput — replace `fn_Numeric`, `fn_Numeric_With_Separtors`
 * (PM), `fn_Numeric` and `fn_Percentage` (Cost), which between them are instantiated on
 * 16 screens.
 *
 * The validation is delegated to src/domain/numeric.ts so the same rules the unit tests
 * cover are the ones the UI enforces. Locale behaviour matches the canvas apps: the
 * decimal separator follows the language root.
 */
import { useId, useState, useEffect } from "react";
import { Field, Input, makeStyles, tokens } from "@fluentui/react-components";
import {
  isDecimalWithPlaces, inRange, parseNumber, formatWithSeparators, isBlank,
} from "@/domain/numeric";

const useStyles = makeStyles({
  input: { fontVariantNumeric: "tabular-nums" },
  hint: { color: tokens.colorNeutralForeground3, fontSize: "11px" },
});

export interface NumericInputProps {
  label: string;
  value: string;
  onChange: (raw: string) => void;
  /** Decimal places allowed — maps to IsOneDecimal / IsTwoDecimal / IsThreeDecimal / IsSixDecimal. */
  places?: 0 | 1 | 2 | 3 | 6;
  min?: number;
  max?: number;
  unit?: string;
  required?: boolean;
  disabled?: boolean;
  language?: string;
  /** Custom message; otherwise one is generated from the constraints. */
  rangeMessage?: string;
  /** Show the grouped value under the field while editing. */
  showGrouped?: boolean;
  onValidityChange?: (valid: boolean) => void;
}

export function NumericInput({
  label, value, onChange, places = 2, min, max, unit, required, disabled,
  language = "en-US", rangeMessage, showGrouped, onValidityChange,
}: NumericInputProps) {
  const s = useStyles();
  const id = useId();
  const [touched, setTouched] = useState(false);

  const blank = isBlank(value);
  const shapeOk = blank ? !required : places === 0
    ? /^[+-]?\d+$/.test(value)
    : isDecimalWithPlaces(value, places as 1 | 2 | 3 | 6, language);
  const rangeOk =
    blank || min === undefined || max === undefined ? true : inRange(value, min, max, language);
  const valid = shapeOk && rangeOk;

  useEffect(() => { onValidityChange?.(valid); }, [valid, onValidityChange]);

  const message = !touched
    ? undefined
    : blank && required
      ? `${label} is required.`
      : !shapeOk
        ? places === 0
          ? "Enter a whole number."
          : `Enter a number with at most ${places} decimal place${places === 1 ? "" : "s"}.`
        : !rangeOk
          ? rangeMessage ?? `${label} must be between ${min} and ${max}.`
          : undefined;

  const n = parseNumber(value, language);

  return (
    <Field
      label={unit ? `${label} (${unit})` : label}
      required={required}
      validationState={message ? "error" : "none"}
      validationMessage={message}
      hint={showGrouped && !Number.isNaN(n)
        ? <span className={s.hint}>{formatWithSeparators(n, language, places)}</span>
        : undefined}
    >
      <Input
        id={id}
        className={s.input}
        value={value}
        disabled={disabled}
        inputMode={places === 0 ? "numeric" : "decimal"}
        onBlur={() => setTouched(true)}
        onChange={(_, d) => onChange(d.value)}
        contentAfter={unit ? <span aria-hidden>{unit}</span> : undefined}
      />
    </Field>
  );
}

/** 0..100, one decimal — the shape every percentage field on the screens uses. */
export function PercentageInput(
  props: Omit<NumericInputProps, "places" | "min" | "max" | "unit"> &
    { places?: 1 | 2; min?: number; max?: number },
) {
  return (
    <NumericInput
      {...props}
      places={props.places ?? 2}
      min={props.min ?? 0}
      max={props.max ?? 100}
      unit="%"
    />
  );
}

/** Currency, two decimals, grouped display — CAPEX/OPEX amount fields. */
export function CurrencyInput(props: Omit<NumericInputProps, "places" | "showGrouped">) {
  return <NumericInput {...props} places={2} showGrouped unit={props.unit ?? "EUR"} />;
}
