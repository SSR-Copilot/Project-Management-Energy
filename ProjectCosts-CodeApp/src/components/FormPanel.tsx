/**
 * The right-docked overlay panel every screen opens its forms in (canvas `canvas-panel` chrome).
 *
 * Gate fit (CONVENTIONS rule 16): the ✕ carries `data-testid` (`closeTestId`, default
 * `panel-close`) and `aria-label` (`closeLabel`, default "Close panel").
 *
 * Every prop below `onDismiss` is OPTIONAL and, left out, gives the plain panel this component always was
 * (✕ / Escape / backdrop call `onDismiss()` at once). The Application Settings screens use them for the
 * save lock, the discard guard and the message / footer slots:
 *   - `width`: a preset or a number of px (540 Milestones, 650, …), always capped at 100vw.
 *     `"full"` is Contracts' `min(960px, 100vw)`; `"wide"` keeps its `min(960px, 50vw)`.
 *   - `busy`: a save is in flight — Escape, backdrop and ✕ do nothing, ✕ is disabled.
 *   - `busyLabel`: as `busy`, plus the blocking spinner INSIDE the drawer surface (the pattern
 *     Costs and Contracts use), so it always sits above the panel.
 *   - `dirty`: Escape, backdrop, ✕ — and a footer Cancel wired to `requestClose` — ask
 *     "Discard changes?" before `onDismiss`. `discardText` overrides the wording.
 *   - `footer` may be a function receiving `{ requestClose, busy }`, so a Cancel button goes
 *     through the same guard; components inside the panel can call `useFormPanel()` instead.
 *   - `open && dirty` also registers the browser's reload / tab-close prompt (`useBeforeUnload`,
 *     one shared listener).
 *   - `actions`: sugar for a `PanelButtons look="brand"` footer when `footer` is not given.
 *   - `messages`: a `PanelMessages` block as the first child of the body.
 *   - `closePrompt` / `promptRequest` / `onPromptCancel`: a per-reason close prompt
 *     (Contracts' discard / incomplete-links / scope-change prompt).
 *   - `coverLabel`: a blocking cover inside the drawer that does NOT lock dismissal.
 *   - `ariaLabel`: the drawer's accessible name (defaults to `title`).
 *   - `panelClassName`: extra class on the drawer surface, for screen-scoped chrome overrides.
 */
import { Button, Drawer, DrawerBody, DrawerHeader, DrawerHeaderTitle } from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";
import { useCallback, useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import { useBeforeUnload, useDiscardGuard } from "./discardGuard";
import type { CloseReason, DiscardText } from "./discardText";
import { FormPanelContext, formPanelWidth, type FormPanelApi, type FormPanelWidth } from "./formPanelContext";
import { HINTS } from "./hints";
import { LoadingOverlay } from "./LoadingOverlay";
import { PanelMessages, type PanelMessagesProps } from "./PanelMessages";
import { PanelButtons, type PanelButtonsProps } from "./CanvasFields";

/** The props of `actions`: `PanelButtons` with `canSave` (Save enabled) in place of `disabled`. */
export type FormPanelActions = Omit<PanelButtonsProps, "onCancel" | "look" | "disabled"> & { canSave: boolean };

export interface FormPanelProps {
  open: boolean; title: string; width?: FormPanelWidth;
  children: ReactNode;
  footer?: ReactNode | ((api: FormPanelApi) => ReactNode);
  /** Closes the panel. Receives the close reason with `closePrompt`; existing `() => void` callers ignore it. */
  onDismiss: (reason?: CloseReason) => void;
  /** The canvas close icon's name (e.g. `ico_Add_Edit_AdminContracts_Close`); default `panel-close`. */
  closeTestId?: string;
  /** The canvas close icon's `AccessibleLabel`; default "Close panel". */
  closeLabel?: string;
  /** The canvas close icon's hover `Tooltip`; default "Cancel" (`HINTS.cancel`: 33 canvas ✕ icons say it). */
  closeTooltip?: string;
  /** Blocks every dismissal while true (a save is running). */
  busy?: boolean;
  /** Implies `busy`; shows the blocking spinner with this text inside the panel. */
  busyLabel?: string;
  /** Unsaved input: dismissal asks "Discard changes?" first. */
  dirty?: boolean;
  discardText?: Partial<DiscardText>;
  /**
   * Renders `<PanelButtons look="brand" disabled={!canSave} {...rest}/>` when `footer` is not given; Cancel goes
   * through the panel guard.
   */
  actions?: FormPanelActions;
  /** Renders `<PanelMessages/>` as the first child of the body. */
  messages?: PanelMessagesProps;
  /**
   * Choose the prompt per close reason; `null` closes without asking. When given it
   * replaces `dirty` for prompting (`dirty` still drives `beforeunload`).
   */
  closePrompt?: (reason: CloseReason) => Partial<DiscardText> | null;
  /** When this becomes a defined value (and the panel is not busy), that reason's close is requested. */
  promptRequest?: CloseReason;
  /** The prompt was answered "keep editing". */
  onPromptCancel?: (reason: CloseReason) => void;
  /** A blocking cover inside the drawer that leaves ✕ and Escape working ("Loading contract..."). */
  coverLabel?: string;
  /** The drawer's accessible name; defaults to `title`. */
  ariaLabel?: string;
  /** Extra class on the drawer surface, for screen-scoped chrome overrides (Contracts). Default none. */
  panelClassName?: string;
  /**
   * Opt-in (PM Revenues): a click outside the panel does NOT close it — the canvas panel closes
   * only through its ✕ or Cancel. Escape still closes. Off by default (the backdrop dismisses).
   */
  keepOpenOnOutsideClick?: boolean;
}

export function FormPanel({
  open, title, width = "wide", children, footer, onDismiss, closeTestId, closeLabel, closeTooltip,
  busy = false, busyLabel, dirty = false, discardText, actions, messages, closePrompt, promptRequest, onPromptCancel,
  coverLabel, ariaLabel, panelClassName, keepOpenOnOutsideClick = false,
}: FormPanelProps) {
  const locked = busy || busyLabel !== undefined;
  // Without `closePrompt`, `onDismiss` is called with no argument.
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
  /* reload / tab close with unsaved input prompts on every screen that passes `dirty`. */
  useBeforeUnload(open && dirty);
  const { requestClose } = guard;
  usePromptRequest(open, promptRequest, locked, guard.confirming, requestClose);
  const api = useMemo<FormPanelApi>(() => ({ requestClose, busy: locked }), [requestClose, locked]);
  const style: CSSProperties = { width: formPanelWidth(width), maxWidth: "100vw" };
  const footerNode = typeof footer === "function"
    ? footer(api)
    : footer ?? (actions ? <ActionButtons {...actions} /> : null);

  return (
    <FormPanelContext.Provider value={api}>
      <Drawer type="overlay" position="end" open={open}
        className={`canvas-panel canvas-panel-${typeof width === "number" ? "custom" : width}${panelClassName ? ` ${panelClassName}` : ""}`}
        onOpenChange={(_, data) => {
          if (data.open) return;
          if (keepOpenOnOutsideClick && data.type === "backdropClick") return;
          requestClose("dismiss");
        }}
        {...(ariaLabel !== undefined ? { "aria-label": ariaLabel, "aria-labelledby": undefined } : {})}
        style={style}>
        <DrawerHeader className="canvas-panel-header">
          <DrawerHeaderTitle action={
            <Button appearance="transparent" aria-label={closeLabel ?? "Close panel"} title={closeTooltip ?? HINTS.cancel}
              data-testid={closeTestId ?? "panel-close"} icon={<DismissRegular />}
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

function ActionButtons({ canSave, ...rest }: FormPanelActions) {
  return <PanelButtons look="brand" disabled={!canSave} {...rest} />;
}

/**
 * Request a close for `reason` each time `promptRequest` turns into a new defined value.
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
