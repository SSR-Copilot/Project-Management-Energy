/**
 * ErrorBoundary — NEW. The canvas `App.OnError` only recorded the error into
 * `gblReportError`; the screen kept whatever broken state it had. A boundary stops the
 * cascade and offers a recovery.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button, MessageBar, MessageBarBody, MessageBarTitle } from "@fluentui/react-components";
import { toAppError, toReportError } from "@/platform/errors";
import { trace } from "@/platform/telemetry";
import { useAppStore } from "@/store/appStore";

interface Props { children: ReactNode; screenName?: string }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const ae = toAppError(error, this.props.screenName);
    const store = useAppStore.getState();
    store.setLastError(
      toReportError(ae, store.session.user?.mail ?? "", this.props.screenName ?? "unknown"),
    );
    trace("critical", ae.message, { component: info.componentStack?.slice(0, 400) });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const ae = toAppError(this.state.error, this.props.screenName);
    return (
      <MessageBar intent="error" style={{ margin: 20 }}>
        <MessageBarBody>
          <MessageBarTitle>This screen could not be displayed</MessageBarTitle>
          {ae.userMessage}
        </MessageBarBody>
        <Button appearance="primary" size="small" onClick={() => this.setState({ error: null })}>
          Try again
        </Button>
        <Button
          appearance="secondary" size="small"
          onClick={() => useAppStore.getState().openReportPanel()}
        >
          Report it
        </Button>
      </MessageBar>
    );
  }
}
