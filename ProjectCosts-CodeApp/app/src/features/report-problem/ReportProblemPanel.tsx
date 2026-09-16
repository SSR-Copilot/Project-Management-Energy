/**
 * Replaces `cmp_ReportErrorRightPanel` (18 controls, instanced on all five Cost screens).
 *
 * SOURCE DEFECT (B-1) — the canvas Save button files NOTHING. Its whole body is commented
 * out:
 *
 *   OnChange: =/*
 *     If(IsError(ReportDevOpsBug.Run(title, description, "1632")), Notify("Error: …"),
 *        Notify("… successfully reported"))
 *   *\/
 *   Set(gblReportError, Blank());
 *   Set(gblShowReportProblemPanel, false);
 *
 * The panel closes, the user believes a bug was filed, and nothing reaches DevOps. The
 * flow `ReportDevOpsBug` DOES exist in the solution — it is the only flow the Cost app
 * references at all — so re-enabling it is a decision, not a build.
 *
 * Until that decision is made this panel does the honest thing: it shows the captured
 * technical detail and lets the user copy it, rather than pretending to submit. The
 * `onSubmit` seam is where the flow call goes.
 */
import { useMemo, useState } from "react";
import {
  Button, MessageBar, MessageBarBody, MessageBarTitle, Text, makeStyles, tokens,
} from "@fluentui/react-components";
import { CopyRegular } from "@fluentui/react-icons";
import { FormPanel, TextAreaField, TextField } from "@/components";
import { useSession } from "@/app/SessionContext";
import { lastError, traces } from "@/platform/telemetry";
import { space } from "@/theme/tokens";

const useStyles = makeStyles({
  detail: {
    whiteSpace: "pre-wrap",
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    padding: space.s,
    maxHeight: "220px",
    overflow: "auto",
  },
});

const TITLE_MAX = 255;
const DESCRIPTION_MAX = 2000;

export function ReportProblemPanel({
  open, onDismiss,
}: { open: boolean; onDismiss: () => void }) {
  const styles = useStyles();
  const { session, project, envVars } = useSession();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [copied, setCopied] = useState(false);

  /**
   * The technical detail `App.OnError` used to stash in `gblReportError`:
   * user, screen, error source, error message, timestamp — plus the trace buffer, which the
   * canvas app had no equivalent of.
   */
  const detail = useMemo(() => {
    const err = lastError();
    return [
      `User:        ${session?.userPrincipalName ?? "unknown"}`,
      `Screen:      ${window.location.pathname}`,
      `Project:     ${project?.projectName ?? "-"} (${project?.projectId ?? "-"})`,
      `App version: ${envVars.vsb_AppVersion ?? "-"} (${envVars.vsb_EnvironmentName ?? "-"})`,
      `Environment: ${session?.environmentId ?? "-"}`,
      `Timestamp:   ${new Date().toISOString()}`,
      "",
      err ? `Last error:  [${err.severity}] ${err.message}` : "Last error:  none captured",
      "",
      "Recent trace:",
      ...traces().slice(-15).map((t) => `  ${t.at} [${t.severity}] ${t.message}`),
    ].join("\n");
  }, [session, project, envVars]);

  const canSubmit = title.trim() !== "" && description.trim() !== "";

  return (
    <FormPanel
      open={open}
      title="Report a problem"
      width="narrow"
      onDismiss={onDismiss}
      footer={
        <>
          <Button appearance="secondary" onClick={onDismiss}>Cancel</Button>
          <Button
            appearance="primary"
            icon={<CopyRegular />}
            disabled={!canSubmit}
            onClick={async () => {
              await navigator.clipboard?.writeText(
                `${title}\n\n${description}\n\n---\n${detail}`,
              );
              setCopied(true);
            }}
          >
            Copy report
          </Button>
        </>
      }
    >
      <MessageBar intent="warning">
        <MessageBarBody>
          <MessageBarTitle>This does not file a ticket yet</MessageBarTitle>
          The canvas app&apos;s Save button had its <code>ReportDevOpsBug</code> flow call
          commented out, so nothing was ever submitted. Re-enabling it is an open decision.
          For now, copy the report and send it to the team.
        </MessageBarBody>
      </MessageBar>

      <TextField
        label="Title"
        required
        value={title}
        maxLength={TITLE_MAX}
        onChange={setTitle}
        testId="report-title"
      />
      <TextAreaField
        label="Description"
        required
        rows={6}
        value={description}
        maxLength={DESCRIPTION_MAX}
        onChange={setDescription}
        testId="report-description"
      />

      <div>
        <Text weight="semibold">Technical details (included automatically)</Text>
        <div className={styles.detail}>{detail}</div>
      </div>

      {copied ? (
        <MessageBar intent="success">
          <MessageBarBody>Report copied to the clipboard.</MessageBarBody>
        </MessageBar>
      ) : null}
    </FormPanel>
  );
}
