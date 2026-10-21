import { Button, Drawer, DrawerBody, DrawerHeader, DrawerHeaderTitle } from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";
import type { ReactNode } from "react";

export interface FormPanelProps {
  open: boolean; title: string; width?: "wide" | "narrow" | "cost" | "period" | "comments" | "twoColumn" | "fieldsAndSide" | "threeColumn";
  children: ReactNode; footer?: ReactNode; onDismiss: () => void;
  /** The canvas close icon's name (e.g. `ico_Add_Edit_AdminContracts_Close`); default `panel-close`. */
  closeTestId?: string;
  /** The canvas close icon's `AccessibleLabel`; default "Close panel". */
  closeLabel?: string;
}
export function FormPanel({ open, title, width = "wide", children, footer, onDismiss, closeTestId, closeLabel }: FormPanelProps) {
  return <Drawer type="overlay" position="end" open={open}
    className={`canvas-panel canvas-panel-${width}`}
    onOpenChange={(_, data) => { if (!data.open) onDismiss(); }}
    // `comments` is 600 because the canvas comments panel is `Width: =Min(600, Parent.Width)`
    // (`CapexScreenCode.txt:8041`); its Type/Year/Month row is a fixed 250+100+100 and does not
    // fit the 450 of `narrow`. `twoColumn` (860) is the PM Revenues contract panel as the product
    // owner's live-canvas screenshot shows it (two independently scrolling columns, 20 Oct 2026).
    // `fieldsAndSide` (680) is the canvas 640-wide Production panel with one side column (fields 280 +
    // 360) plus the 2 × 20 body padding.
    // `threeColumn` (1040) is the canvas 1000-wide Production panel (fields 280 + Seasonality 360 +
    // Negative Prices 360) plus the 2 × 20 body padding; `maxWidth` keeps it on screen when zoomed.
    style={{ width: width === "wide" ? "min(960px, 50vw)" : width === "cost" ? 750 : width === "period" ? 660 : width === "comments" ? 600 : width === "twoColumn" ? 860 : width === "fieldsAndSide" ? 680 : width === "threeColumn" ? 1040 : 450, maxWidth: "100vw" }}>
    <DrawerHeader className="canvas-panel-header">
      <DrawerHeaderTitle action={<Button appearance="transparent" aria-label={closeLabel ?? "Close panel"} data-testid={closeTestId ?? "panel-close"} icon={<DismissRegular />} onClick={onDismiss} />}>
        {title}
      </DrawerHeaderTitle>
    </DrawerHeader>
    <DrawerBody className="canvas-panel-body">{children}</DrawerBody>
    {footer ? <div className="canvas-panel-footer">{footer}</div> : null}
  </Drawer>;
}
