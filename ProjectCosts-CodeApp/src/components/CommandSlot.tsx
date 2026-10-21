/**
 * Lets a screen put its command bar in the HEADER band.
 *
 * In the canvas app the command bar is a child of
 * `con_Main_Project_Overview_Header_SuitBar`, i.e. it sits on the same line as the VSB logo
 * and the user pill — not in the page body. The commands themselves belong to the screen
 * (only the screen knows what is selected), so the screen renders them and portals them into
 * the header's slot.
 *
 * A portal rather than a context carrying a `ReactNode`: passing elements up through context
 * makes the provider re-render on every keystroke in the child, and the ordering of those
 * renders is what produces "cannot update a component while rendering a different component".
 * A portal keeps ownership and render order where they belong.
 */
import {
  createContext, useContext, useEffect, useState, type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const SlotCtx = createContext<HTMLElement | null>(null);

/** Rendered by the shell. Gives the slot element to any descendant that wants it. */
export function CommandSlotProvider({
  element, children,
}: { element: HTMLElement | null; children: ReactNode }) {
  return <SlotCtx.Provider value={element}>{children}</SlotCtx.Provider>;
}

/**
 * Renders `children` into the header slot.
 *
 * Falls back to rendering in place when there is no slot — a screen must never lose its
 * command bar because the chrome changed shape (a test harness, or a future full-screen
 * route).
 */
export function CommandSlot({ children }: { children: ReactNode }) {
  const element = useContext(SlotCtx);
  // The slot element is set by the shell's ref callback, which runs after the first paint,
  // so the first render has nothing to portal into.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(Boolean(element)), [element]);

  if (!element || !ready) return <>{children}</>;
  return createPortal(children, element);
}
