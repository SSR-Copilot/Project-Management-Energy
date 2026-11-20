/**
 * Project Generators Screen — `PanelHost`, the mount point of a lazily loaded panel (D143, item 8b; the chunks themselves are
 * declared in `panelLoader.ts`).
 */
import { Suspense, useState, type ReactNode } from "react";
import { LoadingOverlay } from "@/components";

/**
 * Mounts `children` (a lazily loaded panel) from the first time `open` is true, and keeps it mounted afterwards. Until then
 * nothing renders, as the closed `FormPanel` rendered nothing.
 */
export function PanelHost({ open, children }: { open: boolean; children: ReactNode }) {
  const [seen, setSeen] = useState(open);
  if (open && !seen) setSeen(true);
  if (!open && !seen) return null;
  return (
    <Suspense
      fallback={open ? <LoadingOverlay mode="blocking" portal testId="generators-panel-loading" accessibleName="generators-panel-loading" /> : null}
    >
      {children}
    </Suspense>
  );
}
