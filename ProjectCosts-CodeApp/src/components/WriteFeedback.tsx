/**
 * What the user sees around a write (`data/usePlanWrite.ts`): a blocking progress overlay with the
 * canvas text while it runs, then an error or success message.
 *
 * The admin canvas screens set these texts but had no pop-up to show them (a SOURCE DEFECT on
 * Default Checklists and CAPEX Accounts), so a failed save was silent there.
 */
import { MessageBar, MessageBarBody, MessageBarTitle } from "@fluentui/react-components";
import { LoadingOverlay } from "./LoadingOverlay";

export interface WriteFeedbackProps {
  progress: string | null;
  error: string | null;
  success: string | null;
  /** `<prefix>-write-error` / `<prefix>-write-success`. */
  testIdPrefix: string;
  /**
   * Opt-in: draw the blocking spinner through a Fluent `Portal`, so it covers an open side panel. A Fluent drawer lives in a
   * portal mount node at `z-index: 1000000`, so a spinner drawn in the page (`z-index: 1000`) sits UNDER the panel, which then
   * stays clickable. The canvas pop-up is the last control of the screen, full screen and above every panel (Checklist
   * `cmp_PopUp_GateProcess_Saving_LoadingDialog_1`). Off by default, so every existing caller renders exactly where it did.
   */
  portal?: boolean;
}

export function WriteFeedback({ progress, error, success, testIdPrefix, portal = false }: WriteFeedbackProps) {
  return (
    <>
      {progress ? <LoadingOverlay mode="blocking" label={progress} portal={portal} /> : null}
      {error ? (
        <MessageBar intent="error" data-testid={`${testIdPrefix}-write-error`}>
          <MessageBarBody>
            <MessageBarTitle>Could not complete that</MessageBarTitle>
            {error}
          </MessageBarBody>
        </MessageBar>
      ) : null}
      {success && !error ? (
        <MessageBar intent="success" data-testid={`${testIdPrefix}-write-success`}>
          <MessageBarBody>{success}</MessageBarBody>
        </MessageBar>
      ) : null}
    </>
  );
}
