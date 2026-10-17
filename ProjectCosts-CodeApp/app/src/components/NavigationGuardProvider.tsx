/**
 * Holds the screens' unsaved-changes blockers and asks before an in-app navigation drops them
 * (M7). Mounted once by `AppShell`. See `app/navigationGuardContext.ts` for what is and is not
 * covered (browser Back / Forward cannot be blocked without a data router).
 */
import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  LEAVE_TEXT, NavigationGuardContext, type DiscardText, type NavigationGuardApi,
} from "@/app/navigationGuardContext";
import { ConfirmDialog } from "./ConfirmDialog";

interface Pending { proceed: () => void; text: DiscardText }

export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  // A ref, not state: registering a blocker must not re-render the whole shell.
  const blockers = useRef(new Map<string, { text?: Partial<DiscardText> }>());
  const [pending, setPending] = useState<Pending | null>(null);

  const api = useMemo<NavigationGuardApi>(() => ({
    setBlocker(id, blocker) {
      if (blocker) blockers.current.set(id, blocker);
      else blockers.current.delete(id);
    },
    isBlocking: () => blockers.current.size > 0,
    guard(proceed) {
      if (blockers.current.size === 0) { proceed(); return; }
      // The most recently registered blocker's wording wins.
      const last = [...blockers.current.values()].pop();
      setPending({ proceed, text: { ...LEAVE_TEXT, ...last?.text } });
    },
  }), []);

  return (
    <NavigationGuardContext.Provider value={api}>
      {children}
      <ConfirmDialog
        open={pending !== null}
        title={pending?.text.title ?? LEAVE_TEXT.title}
        description={pending?.text.description ?? LEAVE_TEXT.description}
        confirmText={pending?.text.confirmText ?? LEAVE_TEXT.confirmText}
        cancelText={pending?.text.cancelText ?? LEAVE_TEXT.cancelText}
        destructive={pending?.text.destructive === true}
        confirmIcon={pending?.text.confirmIcon ?? "dismiss"}
        onConfirm={() => {
          const proceed = pending?.proceed;
          setPending(null);
          proceed?.();
        }}
        onCancel={() => setPending(null)}
      />
    </NavigationGuardContext.Provider>
  );
}
