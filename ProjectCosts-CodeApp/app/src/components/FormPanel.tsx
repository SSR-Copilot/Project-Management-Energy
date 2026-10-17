/**
 * The right-docked overlay panel every editor uses (canvas `canvas-panel` chrome).
 *
 * M8 extensions (all optional; without them the panel behaves exactly as before):
 *   - `width`: a preset or a number of px (540 Milestones, 650, …), always capped at 100vw.
 *     `"full"` is Contracts' `min(960px, 100vw)`; `"wide"` keeps its `min(960px, 50vw)`.
 *   - `busy`: a save is in flight — Escape, backdrop and ✕ do nothing, ✕ is disabled.
 *   - `busyLabel`: as `busy`, plus the blocking spinner INSIDE the drawer surface (the pattern
 *     Costs and Contracts use), so it always sits above the panel.
 *   - `dirty` (M7): Escape, backdrop, ✕ — and a footer Cancel wired to `requestClose` — ask
 *     "Discard changes?" before `onDismiss`. `discardText` overrides the wording.
 *   - `footer` may be a function receiving `{ requestClose, busy }`, so a Cancel button goes
 *     through the same guard; components inside the panel can call `useFormPanel()` instead.
 *   - `open && dirty` also registers the browser's reload / tab-close prompt (`useBeforeUnload`,
 *     shared single listener — parity round 1 G-1).
 *
 * Reusable-components Wave A (E1, all optional, defaults = the behaviour above):
 *   - `actions` (E1a): sugar for a `PanelFooter` footer when `footer` is not given.
 *   - `messages` (E1b): a `PanelMessages` block as the first child of the body.
 *   - `closePrompt` / `promptRequest` / `onPromptCancel` (E1c): a per-reason close prompt
 *     (Contracts' discard / incomplete-links / scope-change prompt).
 *   - `coverLabel` (E1d): a blocking cover inside the drawer that does NOT lock dismissal.
 *   - `ariaLabel` (E1e): the drawer's accessible name (defaults to `title`).
 *   - `PANEL_RADIO_ROW` (E8): opt-in class that lays a panel `RadioGroup` out horizontally.
 */
import {
  Button, Drawer, DrawerBody, DrawerHeader, DrawerHeaderTitle, MessageBar, MessageBarBody, MessageBarTitle,
  makeStyles,
} from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";
import { useCallback, useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import { useBeforeUnload, useDiscardGuard } from "@/app/unsavedChanges";
import type { CloseReason, DiscardText } from "@/app/navigationGuardContext";
import { FormPanelContext, formPanelWidth, type FormPanelApi, type FormPanelWidth } from "./formPanelContext";
import { LoadingOverlay } from "./LoadingOverlay";
import { PanelFooter, type PanelFooterProps } from "./PanelFooter";

/**
 * E8: add to a `RadioGroup` inside a panel to lay it out as a row (`canvas.css`
 * `.canvas-panel .fui-RadioGroup.canvas-radio-row`). Panel radio groups stay vertical otherwise.
 */
export const PANEL_RADIO_ROW = "canvas-radio-row";

export interface FormPanelProps {
  open: boolean; title: string; width?: FormPanelWidth;
  children: ReactNode;
  footer?: ReactNode | ((api: FormPanelApi) => ReactNode);
  /** Closes the panel. Receives the close reason (E1c); existing `() => void` callers ignore it. */
  onDismiss: (reason?: CloseReason) => void;
  /** Blocks every dismissal while true (a save is running). */
  busy?: boolean;
  /** Implies `busy`; shows the blocking spinner with this text inside the panel. */
  busyLabel?: string;
  /** Unsaved input: dismissal asks "Discard changes?" first. */
  dirty?: boolean;
  discardText?: Partial<DiscardText>;
  /** E1a: renders `<PanelFooter {...actions}/>` when `footer` is not given. */
  actions?: Omit<PanelFooterProps, "onCancel">;
  /** E1b: renders `<PanelMessages/>` as the first child of the body. */
  messages?: PanelMessagesProps;
  /**
   * E1c: choose the prompt per close reason; `null` closes without asking. When given it
   * replaces `dirty` for prompting (`dirty` still drives `beforeunload`).
   */
  closePrompt?: (reason: CloseReason) => Partial<DiscardText> | null;
  /** E1c: when this becomes a defined value (and the panel is not busy), that reason's close is requested. */
  promptRequest?: CloseReason;
  /** E1c: the prompt was answered "keep editing". */
  onPromptCancel?: (reason: CloseReason) => void;
  /** E1d: a blocking cover inside the drawer that leaves ✕ and Escape working ("Loading contract..."). */
  coverLabel?: string;
  /** E1e: the drawer's accessible name; defaults to `title`. */
  ariaLabel?: string;
}

export function FormPanel({
  open, title, width = "wide", children, footer, onDismiss, busy = false, busyLabel, dirty = false, discardText,
  actions, messages, closePrompt, promptRequest, onPromptCancel, coverLabel, ariaLabel,
}: FormPanelProps) {
  const locked = busy || busyLabel !== undefined;
  // Without `closePrompt`, `onDismiss` is called with no argument, exactly as before E1c.
  const onDiscard = useCallback(
    (reason: CloseReason) => (closePrompt ? onDismiss(reason) : onDismiss()),
    [closePrompt, onDismiss],
  );
  const guard = useDiscardGuard({
    dirty, onDiscard, disabled: locked,
    ...(discardText ? { text: discardText } : {}),
    ...(closePrompt ? { prompt: closePrompt } : {}),
    ...(onPromptCancel ? { onPromptCancel } : {}),
  });
  /* G-1: reload / tab close with unsaved input prompts on every screen that passes `dirty`. */
  useBeforeUnload(open && dirty);
  const { requestClose } = guard;
  usePromptRequest(open, promptRequest, locked, guard.confirming, requestClose);
  const api = useMemo<FormPanelApi>(() => ({ requestClose, busy: locked }), [requestClose, locked]);
  const style: CSSProperties = { width: formPanelWidth(width), maxWidth: "100vw" };
  const footerNode = typeof footer === "function"
    ? footer(api)
    : footer ?? (actions ? <PanelFooter {...actions} /> : null);

  return (
    <FormPanelContext.Provider value={api}>
      <Drawer type="overlay" position="end" open={open}
        className={`canvas-panel canvas-panel-${typeof width === "number" ? "custom" : width}`}
        onOpenChange={(_, data) => { if (!data.open) requestClose("dismiss"); }}
        {...(ariaLabel !== undefined ? { "aria-label": ariaLabel, "aria-labelledby": undefined } : {})}
        style={style}>
        <DrawerHeader className="canvas-panel-header">
          <DrawerHeaderTitle action={
            <Button appearance="transparent" aria-label="Close panel" icon={<DismissRegular />}
              disabled={locked} onClick={() => requestClose("dismiss")} />
          }>
            {title}
          </DrawerHeaderTitle>
        </DrawerHeader>
        <DrawerBody className="canvas-panel-body">
          {messages ? <PanelMessages {...messages} /> : null}
          {children}
        </DrawerBody>
        {footerNode ? <div className="canvas-panel-footer">{footerNode}</div> : null}
        {busyLabel !== undefined
          ? <LoadingOverlay mode="blocking" label={busyLabel} />
          : coverLabel !== undefined ? <LoadingOverlay mode="blocking" label={coverLabel} /> : null}
      </Drawer>
      {guard.dialog}
    </FormPanelContext.Provider>
  );
}

/**
 * E1c: request a close for `reason` each time `promptRequest` turns into a new defined value.
 * While the panel is busy the request waits (Contracts never prompts during a save), and it is
 * not repeated for the same value until the caller clears it.
 */
function usePromptRequest(
  open: boolean, reason: CloseReason | undefined, locked: boolean, confirming: boolean,
  requestClose: FormPanelApi["requestClose"],
) {
  const handled = useRef<CloseReason | undefined>(undefined);
  useEffect(() => {
    if (reason === undefined || !open) { handled.current = undefined; return; }
    if (locked || confirming || handled.current === reason) return;
    handled.current = reason;
    requestClose(reason);
  }, [open, reason, locked, confirming, requestClose]);
}

/* ═══════════════════════════════════════════════════════════════ PanelMessages (E1b) ══ */

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
