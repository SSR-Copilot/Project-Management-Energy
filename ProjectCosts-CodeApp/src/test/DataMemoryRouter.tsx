/**
 * Test-only: a MEMORY data router around arbitrary children — the drop-in for `<MemoryRouter>`
 * now that the app runs on a data router (`app/Providers.tsx`) and screens use `useBlocker`
 * (`components/UnsavedChangesGuard.tsx`), which throws outside one.
 *
 * Mirrors the app: one splat route whose element is the children, so descendant `<Routes>`
 * (`AppRoutes`) resolve exactly as they do under `createHashRouter`. The children travel through
 * context, so a `rerender` with new children updates them without rebuilding the router.
 */
import { createContext, useContext, useState, type ReactNode } from "react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

const Children = createContext<ReactNode>(null);

function Slot() {
  return <>{useContext(Children)}</>;
}

export function DataMemoryRouter({ initialEntries = ["/"], children }: {
  initialEntries?: string[];
  children: ReactNode;
}) {
  const [router] = useState(() => createMemoryRouter([{ path: "*", element: <Slot /> }], { initialEntries }));
  return (
    <Children.Provider value={children}>
      <RouterProvider router={router} />
    </Children.Provider>
  );
}
