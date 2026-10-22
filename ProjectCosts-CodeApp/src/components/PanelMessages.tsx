/** The error bar and notices at the top of a `FormPanel` body (`FormPanel messages`), also usable on its own. */
import { MessageBar, MessageBarBody, MessageBarTitle, makeStyles } from "@fluentui/react-components";

const useMessageStyles = makeStyles({
  stack: { display: "flex", flexDirection: "column", rowGap: "12px", marginBottom: "12px" },
});

export interface PanelNotice {
  intent: "warning" | "info" | "error"; text: string; title?: string;
  /** `role="alert"` (Check List Settings announces its stale warning assertively). */
  alert?: boolean;
}

export interface PanelMessagesProps {
  /** The save error: first, `role="alert"`. */
  error?: string | null;
  /** Project Gates: "Not saved". */
  errorTitle?: string;
  /** Rendered after the error, in order. */
  notices?: readonly PanelNotice[];
}

/** The error bar and notices at the top of a panel body (12 px apart, 12 px below). */
export function PanelMessages({ error, errorTitle, notices = [] }: PanelMessagesProps) {
  const styles = useMessageStyles();
  if (!error && notices.length === 0) return null;
  return (
    <div className={styles.stack}>
      {error ? (
        <MessageBar intent="error" role="alert">
          <MessageBarBody>
            {errorTitle ? <MessageBarTitle>{errorTitle}</MessageBarTitle> : null}
            {error}
          </MessageBarBody>
        </MessageBar>
      ) : null}
      {notices.map((n, i) => (
        <MessageBar key={`${i}-${n.text}`} intent={n.intent} {...(n.alert ? { role: "alert" } : {})}>
          <MessageBarBody>
            {n.title ? <MessageBarTitle>{n.title}</MessageBarTitle> : null}
            {n.text}
          </MessageBarBody>
        </MessageBar>
      ))}
    </div>
  );
}
