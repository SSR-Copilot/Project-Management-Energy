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
}

export function WriteFeedback({ progress, error, success, testIdPrefix }: WriteFeedbackProps) {
  return (
    <>
      {progress ? <LoadingOverlay mode="blocking" label={progress} /> : null}
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
