/**
 * The replacement for `App.OnError`.
 *
 * The canvas `App.OnError` captured the error into `gblReportError` and then did nothing:
 * its `Notify(...)` call is commented out, and the panel meant to file the report has its
 * flow call commented out too (`docs/01-BUGS-FOUND.md` B-1). So an error was silently
 * swallowed app-wide. Here the capture still happens — the report panel needs it — but the
 * user is also told.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button, MessageBar, MessageBarActions, MessageBarBody, MessageBarTitle } from "@fluentui/react-components";
import { trace } from "@/platform/telemetry";

interface Props {
  children: ReactNode;
  /** Rendered in place of the crashed subtree. Defaults to a MessageBar with a reload. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    trace("critical", error.message, { stack: error.stack, componentStack: info.componentStack });
  }

  private reset = () => this.setState({});

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <MessageBar intent="error">
        <MessageBarBody>
          <MessageBarTitle>Something went wrong on this screen</MessageBarTitle>
          {error.message}
        </MessageBarBody>
        <MessageBarActions>
          <Button appearance="transparent" onClick={this.reset}>Try again</Button>
        </MessageBarActions>
      </MessageBar>
    );
  }
}
