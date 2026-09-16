/**
 * Replaces `cmp_ReportErrorRightPanel` (PM 18 controls / 326 loc, Cost 18 / 350).
 *
 * SOURCE DEFECT: in both apps the `ReportDevOpsBug.Run(...)` call is commented out, so the
 * panel collects a report and sends nothing. Here it actually calls the flow wrapper.
 * The payload keeps `gblReportError`'s shape: User, ErrorScreen, ErrorSource,
 * ErrorMessage, Timestamp.
 */
import { useState } from "react";
import {
  Field, Textarea, Text, makeStyles, tokens, MessageBar, MessageBarBody,
} from "@fluentui/react-components";
import { useLocation } from "react-router-dom";
import { useAppStore } from "@/store/appStore";
import { FormPanel } from "./FormPanel";
import { reportDevOpsBug } from "@/flows/flowClient";
import { space } from "@/theme/tokens";

const useStyles = makeStyles({
  detail: {
    fontFamily: "ui-monospace, 'Cascadia Mono', Consolas, monospace",
    fontSize: "11px", whiteSpace: "pre-wrap", wordBreak: "break-word",
    backgroundColor: tokens.colorNeutralBackground3,
    padding: space.s, borderRadius: "4px", maxHeight: "180px", overflow: "auto",
  },
});

export function ReportErrorPanel() {
  const s = useStyles();
  const loc = useLocation();
  const open = useAppStore((st) => st.ui.reportPanelOpen);
  const close = useAppStore((st) => st.closeReportPanel);
  const lastError = useAppStore((st) => st.ui.lastError);
  const setLastError = useAppStore((st) => st.setLastError);
  const user = useAppStore((st) => st.session.user);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const technical = {
    user: user?.mail ?? "",
    errorScreen: lastError?.errorScreen ?? loc.pathname,
    errorSource: lastError?.errorSource ?? "",
    errorMessage: lastError?.errorMessage ?? "",
    timestamp: lastError?.timestamp ?? new Date().toISOString(),
  };

  const send = async () => {
    setBusy(true);
    try {
      await reportDevOpsBug({ ...technical, description });
      setSent(true);
      setLastError(null);
      setDescription("");
      setTimeout(() => { setSent(false); close(); }, 1400);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormPanel
      open={open}
      title="Report a problem"
      onClose={close}
      onSave={send}
      saveLabel="Send report"
      saveDisabled={description.trim().length < 5}
      busy={busy}
    >
      {sent && (
        <MessageBar intent="success">
          <MessageBarBody>Thank you — the report has been sent.</MessageBarBody>
        </MessageBar>
      )}
      <Text size={200}>
        Describe what you were doing when the problem happened. Technical details are attached
        automatically, so there is no need to repeat them.
      </Text>
      <Field label="What happened?" required>
        <Textarea
          value={description}
          onChange={(_, d) => setDescription(d.value)}
          rows={5}
          placeholder="I clicked Save on the Generators screen and the capacity did not update…"
        />
      </Field>
      <Field label="Attached technical details">
        <div className={s.detail}>{JSON.stringify(technical, null, 2)}</div>
      </Field>
    </FormPanel>
  );
}
