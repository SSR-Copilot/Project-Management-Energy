/**
 * Replaces `cmp_PopUp_Confirmation`, `_2`, `_New` (Cost) and `cmp_PopUp_Information` —
 * four canvas popups collapse into one component with an intent.
 *
 * NOTE: `cmp_PopUp_Confirmation_2` ships in both apps with an EMPTY button container, so
 * it renders a dialog the user cannot dismiss. That defect is not reproduced.
 */
import {
  Dialog, DialogSurface, DialogTitle, DialogBody, DialogContent, DialogActions,
  Button, makeStyles, tokens,
} from "@fluentui/react-components";
import type { ReactNode } from "react";
import { space } from "@/theme/tokens";

const useStyles = makeStyles({
  surface: { maxWidth: "min(520px, calc(100vw - 32px))" },
  danger: { borderTop: `3px solid ${tokens.colorPaletteRedBorderActive}` },
  content: { display: "flex", flexDirection: "column", gap: space.s },
});

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  intent?: "default" | "danger" | "info";
  busy?: boolean;
  onConfirm?: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open, title, children, confirmLabel = "Confirm", cancelLabel = "Cancel",
  intent = "default", busy = false, onConfirm, onCancel,
}: ConfirmDialogProps) {
  const s = useStyles();
  return (
    <Dialog open={open} onOpenChange={(_, d) => { if (!d.open) onCancel(); }} modalType="alert">
      <DialogSurface className={`${s.surface} ${intent === "danger" ? s.danger : ""}`}>
        <DialogBody>
          <DialogTitle>{title}</DialogTitle>
          <DialogContent className={s.content}>{children}</DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onCancel} disabled={busy}>
              {intent === "info" ? "Close" : cancelLabel}
            </Button>
            {intent !== "info" && onConfirm && (
              <Button
                appearance="primary"
                onClick={onConfirm}
                disabled={busy}
                style={intent === "danger" ? { backgroundColor: tokens.colorPaletteRedBackground3 } : undefined}
              >
                {confirmLabel}
              </Button>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
