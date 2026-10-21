/**
 * The banner a not-yet-connected screen shows above its content (see `data/notConnected.ts`).
 *
 * Not a canvas control: it states this app's migration status, like the "…is not available
 * yet" empty states. It names the tables the screen still needs, so connecting it later is a
 * matter of registering exactly those with `pac code add-data-source`.
 */
import { MessageBar, MessageBarBody, MessageBarTitle } from "@fluentui/react-components";

export interface NotConnectedNoticeProps {
  /** Entity sets the screen reads or writes — the screen's `TABLES` from its `hooks.ts`. */
  tables: readonly string[];
}

export function NotConnectedNotice({ tables }: NotConnectedNoticeProps) {
  return (
    <MessageBar intent="warning" data-testid="not-connected-notice">
      <MessageBarBody>
        <MessageBarTitle>Not connected to Dataverse yet</MessageBarTitle>
        This screen is not connected to its data yet, so nothing is shown and nothing can be saved.
        {tables.length > 0 ? ` Tables to connect: ${tables.join(", ")}.` : null}
      </MessageBarBody>
    </MessageBar>
  );
}
