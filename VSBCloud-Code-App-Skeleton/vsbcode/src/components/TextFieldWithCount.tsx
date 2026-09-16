/**
 * TextFieldWithCount — NEW component. The text input the General screen uses everywhere.
 *
 * Three details come straight from the guide's screenshots and none of them are Fluent
 * defaults:
 *
 *  1. **A character counter sits at the top right of the field**, not under it, and it counts
 *     from zero on an empty field: `0/55`, `8/55`. 55 is `gblAppConstants.DefaultMaxLength`.
 *  2. **The required marker is a red asterisk before the label**, and it is present on the
 *     label whether or not the field is currently invalid.
 *  3. **Validation is eager.** p10 shows "Project short name should have at least 3 letters."
 *     under an untouched, empty field on a form that has only just opened — the canvas arms
 *     validation at screen entry rather than on blur. Pass `message` unconditionally and let
 *     the caller decide; this component never invents a message of its own.
 *
 * `maxLength` is enforced on input as well as displayed, because the canvas `TextInput`
 * carries `MaxLength` and silently refuses the 56th character.
 */
import { useId } from "react";
import { makeStyles, tokens, Input, Text, Textarea } from "@fluentui/react-components";
import { space, semantic } from "@/theme/tokens";

export interface TextFieldWithCountProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  maxLength?: number;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Red text under the field. Rendered whenever present — the caller owns the timing. */
  message?: string | null;
  /** Grey helper text under the field, shown only when there is no `message`. */
  hint?: string;
  multiline?: boolean;
  /** Hide the counter on fields the canvas leaves uncounted (e.g. read-only system ids). */
  showCount?: boolean;
}

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: space.xxs, minWidth: 0 },
  labelRow: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.s,
    minWidth: 0,
  },
  label: {
    fontSize: "12px",
    fontWeight: 600,
    color: tokens.colorNeutralForeground1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
  },
  star: { color: semantic.errorText, marginRight: "3px" },
  count: {
    fontSize: "11px",
    color: tokens.colorNeutralForeground3,
    fontVariantNumeric: "tabular-nums",
    flex: "none",
  },
  message: { fontSize: "11px", color: semantic.errorText },
  hint: { fontSize: "11px", color: tokens.colorNeutralForeground3 },
});

export function TextFieldWithCount({
  label,
  value,
  onChange,
  maxLength = 55,
  required = false,
  disabled = false,
  placeholder,
  message,
  hint,
  multiline = false,
  showCount = true,
}: TextFieldWithCountProps) {
  const s = useStyles();
  const id = useId();
  const msgId = `${id}-msg`;

  return (
    <div className={s.root}>
      <div className={s.labelRow}>
        <label className={s.label} htmlFor={id}>
          {required && (
            <span className={s.star} aria-hidden="true">
              *
            </span>
          )}
          {label}
        </label>
        {showCount && (
          <span className={s.count} aria-hidden="true">
            {value.length}/{maxLength}
          </span>
        )}
      </div>

      {multiline ? (
        <Textarea
          id={id}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          maxLength={maxLength}
          required={required}
          resize="vertical"
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? msgId : undefined}
          onChange={(_, d) => onChange(d.value.slice(0, maxLength))}
        />
      ) : (
        <Input
          id={id}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          maxLength={maxLength}
          required={required}
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? msgId : undefined}
          onChange={(_, d) => onChange(d.value.slice(0, maxLength))}
        />
      )}

      {message ? (
        <Text id={msgId} className={s.message} role="alert">
          {message}
        </Text>
      ) : hint ? (
        <Text className={s.hint}>{hint}</Text>
      ) : null}
    </div>
  );
}
