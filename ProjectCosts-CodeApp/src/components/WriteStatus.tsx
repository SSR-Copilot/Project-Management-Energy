/**
 * The "a write is running" indicator of the Cost screens: a blocking spinner for as long as the
 * write lasts (D57, restored by D59).
 *
 * D57 first replaced the canvas `cmp_*_PopUpLoading` pop-up (`cmp_PopUp_Loading`: a 10 % scrim, a
 * white card, a spinner and `InformationText`) with a quiet line of text. In use that left the
 * screen looking idle while a save was still running, so a user could click again or click
 * anywhere. D59 restores the canvas behaviour: while `label` is set the shared blocking
 * `LoadingOverlay` (spinner + the SAME verbatim `InformationText`) covers the screen, and it goes
 * away when the write has finished and the screen's refresh is done. The per-screen write guard
 * (`writeCommandsDisabled`, `domain/writeGuard.ts`) stays as the second line of defence.
 *
 * `LoadingOverlay` is the same component the PM and Admin screens use; this wrapper only decides
 * WHEN to show it and keeps the screen's `<screen>-write-status` test id on it.
 */
import { makeStyles } from "@fluentui/react-components";
import { LoadingOverlay } from "./LoadingOverlay";

const useStyles = makeStyles({
  // Idle: the live region stays mounted, but draws nothing.
  idle: {
    position: "absolute", width: "1px", height: "1px", overflow: "hidden",
    clipPath: "inset(50%)", whiteSpace: "nowrap",
  },
});

interface WriteStatusProps {
  /** The canvas `InformationText` for the write in flight; no overlay without one. */
  label: string | null | undefined;
  /** `<screen>-write-status`. */
  testId: string;
}

export function WriteStatus({ label, testId }: WriteStatusProps) {
  const styles = useStyles();
  const text = label || "";
  if (text) return <LoadingOverlay mode="blocking" label={text} testId={testId} />;
  // An empty, always-present live region for the idle state (screen readers like a region that
  // already exists before it gets content).
  return <span className={styles.idle} role="status" aria-live="polite" data-testid={testId} />;
}
