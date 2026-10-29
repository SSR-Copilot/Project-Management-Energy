/**
 * The non-animated, non-blocking "a write is running" line (D57, PROPOSED).
 *
 * DIVERGENCE (D57): the Cost screens replaced the canvas `cmp_*_PopUpLoading` spinner pop-up
 * (`cmp_PopUp_Loading`: a 10 % scrim, a white card, a spinner and `InformationText`) with this one
 * line of text. It shows the SAME verbatim `InformationText` the canvas raised (each caller passes
 * its own `MSG` constant), but no spinner, no scrim and no card, so nothing on the screen is
 * covered. Blocking a second write is the caller's job: each screen disables its write-starting
 * commands through a pure rule in its `rules.ts` while the write is pending.
 *
 * `LoadingOverlay` is unchanged and still used by the PM and Admin screens.
 */
import { Text, makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import { palette, space } from "@/theme/tokens";

const useStyles = makeStyles({
  root: {
    display: "block",
    paddingTop: space.xs, paddingBottom: space.xs,
    color: palette.neutralSecondary,
    fontSize: "14px",
    fontWeight: tokens.fontWeightSemibold,
    whiteSpace: "pre-line",
  },
  // Idle: the region stays mounted but draws no box.
  empty: { paddingTop: 0, paddingBottom: 0 },
});

interface WriteStatusProps {
  /** The canvas `InformationText` for the write in flight; the line is empty without one. */
  label: string | null | undefined;
  /** `<screen>-write-status`. */
  testId: string;
}

/**
 * The `role="status"` element is ALWAYS mounted and only its text changes: screen readers often
 * ignore a live region that is inserted together with its content.
 */
export function WriteStatus({ label, testId }: WriteStatusProps) {
  const styles = useStyles();
  const text = label || "";
  return (
    <Text
      as="span"
      className={mergeClasses(styles.root, !text && styles.empty)}
      role="status"
      aria-live="polite"
      data-testid={testId}
    >
      {text}
    </Text>
  );
}
