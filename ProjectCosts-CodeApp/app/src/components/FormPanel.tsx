import { Button, Drawer, DrawerBody, DrawerHeader, DrawerHeaderTitle } from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";
import type { ReactNode } from "react";

export interface FormPanelProps {
  open: boolean; title: string; width?: "wide" | "narrow" | "cost" | "period" | "comments";
  children: ReactNode; footer?: ReactNode; onDismiss: () => void;
}
export function FormPanel({ open, title, width = "wide", children, footer, onDismiss }: FormPanelProps) {
  return <Drawer type="overlay" position="end" open={open}
    className={`canvas-panel canvas-panel-${width}`}
    onOpenChange={(_, data) => { if (!data.open) onDismiss(); }}
    // `comments` is 600 because the canvas comments panel is `Width: =Min(600, Parent.Width)`
    // (`CapexScreenCode.txt:8041`); its Type/Year/Month row is a fixed 250+100+100 and does not
    // fit the 450 of `narrow`.
    style={{ width: width === "wide" ? "min(960px, 50vw)" : width === "cost" ? 750 : width === "period" ? 660 : width === "comments" ? 600 : 450, maxWidth: "100vw" }}>
    <DrawerHeader className="canvas-panel-header">
      <DrawerHeaderTitle action={<Button appearance="transparent" aria-label="Close panel" icon={<DismissRegular />} onClick={onDismiss} />}>
        {title}
      </DrawerHeaderTitle>
    </DrawerHeader>
    <DrawerBody className="canvas-panel-body">{children}</DrawerBody>
    {footer ? <div className="canvas-panel-footer">{footer}</div> : null}
  </Drawer>;
}
