/**
 * C13 — the one-line "nothing here" text inside a card, table or panel (not a page EmptyState).
 *
 * Each caller keeps its current look through props: CAPEX Accounts `tone="canvasGrey"`
 * `padding={4}`; Check List Settings `padding={8}`; Costs `padding={12}` `size={13}`;
 * Milestones the defaults.
 */
import type { ReactNode } from "react";
import { Text, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { palette } from "@/theme/tokens";

const useStyles = makeStyles({
  neutral: { color: tokens.colorNeutralForeground3 },
  canvasGrey: { color: palette.Grayscale10 },
  p4: { paddingTop: "4px", paddingBottom: "4px" },
  p8: { paddingTop: "8px", paddingBottom: "8px" },
  p12: { paddingTop: "12px", paddingBottom: "12px" },
  s12: { fontSize: "12px" },
  s13: { fontSize: "13px" },
  s14: { fontSize: "14px" },
});

export interface InlineEmptyProps {
  children: ReactNode;
  /** `neutral` = colorNeutralForeground3 (default); `canvasGrey` = palette.Grayscale10. */
  tone?: "neutral" | "canvasGrey";
  /** Vertical padding in px; none by default. */
  padding?: 4 | 8 | 12;
  /** Font size in px; Fluent's Text default when omitted. */
  size?: 12 | 13 | 14;
  className?: string;
  testId?: string;
}

export function InlineEmpty({ children, tone = "neutral", padding, size, className, testId }: InlineEmptyProps) {
  const styles = useStyles();
  return (
    <Text
      role="status"
      data-testid={testId}
      className={mergeClasses(
        tone === "canvasGrey" ? styles.canvasGrey : styles.neutral,
        padding === 4 && styles.p4, padding === 8 && styles.p8, padding === 12 && styles.p12,
        size === 12 && styles.s12, size === 13 && styles.s13, size === 14 && styles.s14,
        className,
      )}
    >
      {children}
    </Text>
  );
}
