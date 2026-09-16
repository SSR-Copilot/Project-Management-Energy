/**
 * FormPanel — the right-hand editing surface every add/edit in both apps opens.
 *
 * This is the canvas `con_*_RightPanel_*_Form` pattern, which the apps repeat verbatim for
 * every record editor except Add Project. Reproduced from
 * `Project General Data Screen.pa.yaml` (the Shareholding Entities panel), which is the
 * clearest instance:
 *
 *   - a full-surface scrim, `Fill: RGBA(0, 0, 0, 0.3)`, content justified to the End
 *   - the panel itself `Min(gblAppSizes.RightPanel.MinWidth, Parent.Width)` wide
 *   - a 48px header filled `gblAppTheme.palette.themePrimary` with white Semibold title text
 *     at `PaddingLeft: 20`, and a `ChromeClose` far-item on the right
 *   - a white body
 *   - a 45px white footer, buttons `LayoutJustifyContent.End`, Save (`CheckMark`) then Cancel
 *
 * Every one of the 18 screens that renders an add/edit editor already goes through this
 * component, so the styling lives here once rather than in each of them.
 *
 * Responsive: below md it becomes a full-width sheet. The canvas had no small-screen layout,
 * so `Min(450, Parent.Width)` is the closest thing it expressed and this follows it.
 */
import type { ReactNode } from "react";
import {
  Drawer, DrawerBody, DrawerFooter,
  Button, makeStyles, tokens,
} from "@fluentui/react-components";
import { DismissRegular, CheckmarkRegular } from "@fluentui/react-icons";
import { palette, sizes, space, media } from "@/theme/tokens";

const useStyles = makeStyles({
  drawer: {
    minWidth: `${sizes.rightPanel.minWidth}px`,
    width: "min(560px, 100vw)",
    [media.belowMd]: { width: "100vw", minWidth: 0 },
  },
  /**
   * Replaces `DrawerHeader`/`DrawerHeaderTitle`: those carry their own neutral padding, and
   * the canvas header is a flush 48px brand bar. Longhands only — `makeStyles` bans the
   * shorthand.
   */
  header: {
    display: "flex", alignItems: "center", gap: space.s,
    minHeight: "48px",
    paddingLeft: "20px", paddingRight: "8px",
    backgroundColor: palette.themePrimary,
    flex: "none",
  },
  title: {
    flex: 1, minWidth: 0,
    color: palette.white,
    fontSize: "16px", fontWeight: 600,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
  // The close glyph sits on the brand fill, so it needs the inverted foreground.
  close: {
    color: palette.white,
    ":hover": { color: palette.white, backgroundColor: "rgba(255, 255, 255, 0.16)" },
    ":hover:active": { color: palette.white, backgroundColor: "rgba(255, 255, 255, 0.24)" },
  },
  body: {
    display: "flex", flexDirection: "column", gap: space.l,
    paddingTop: `${sizes.rightPanel.top}px`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  footer: {
    display: "flex", gap: space.s, justifyContent: "flex-end", flexWrap: "wrap",
    minHeight: "45px", alignItems: "center",
    backgroundColor: tokens.colorNeutralBackground1,
  },
  error: {
    color: tokens.colorPaletteRedForeground1, fontSize: "12px",
    display: "flex", flexDirection: "column", gap: "2px",
  },
});

export interface FormPanelProps {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  onSave?: () => void;
  saveLabel?: string;
  saveDisabled?: boolean;
  busy?: boolean;
  /** Validation messages — mirrors the canvas error-label stacks. */
  errors?: string[];
  extraActions?: ReactNode;
}

export function FormPanel({
  open, title, children, onClose, onSave, saveLabel = "Save",
  saveDisabled, busy, errors = [], extraActions,
}: FormPanelProps) {
  const s = useStyles();
  return (
    <Drawer
      // Always `overlay`, never `inline`: the canvas panel is drawn over a 30% scrim on every
      // width, and an inline drawer neither dims nor traps focus.
      type="overlay"
      position="end"
      open={open}
      onOpenChange={(_, d) => { if (!d.open) onClose(); }}
      className={s.drawer}
    >
      <div className={s.header}>
        <span className={s.title} title={title}>{title}</span>
        <Button
          appearance="subtle"
          className={s.close}
          icon={<DismissRegular />}
          aria-label="Close"
          onClick={onClose}
        />
      </div>

      <DrawerBody className={s.body}>
        {children}
        {errors.length > 0 && (
          <div className={s.error} role="alert">
            {errors.map((e, i) => <span key={i}>{e}</span>)}
          </div>
        )}
      </DrawerBody>

      <DrawerFooter className={s.footer}>
        {extraActions}
        {/* Save first, then Cancel — the canvas button order, and the order the panel
            screenshots show. */}
        {onSave && (
          <Button
            appearance="primary"
            icon={<CheckmarkRegular />}
            onClick={onSave}
            disabled={saveDisabled || busy || errors.length > 0}
          >
            {busy ? "Saving…" : saveLabel}
          </Button>
        )}
        <Button
          appearance="secondary"
          icon={<DismissRegular />}
          onClick={onClose}
          disabled={busy}
        >
          Cancel
        </Button>
      </DrawerFooter>
    </Drawer>
  );
}
