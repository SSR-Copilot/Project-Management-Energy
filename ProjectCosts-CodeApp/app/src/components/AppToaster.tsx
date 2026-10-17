/**
 * The app's one toast region, mounted once by `AppShell`.
 *
 * Screens never render their own `<Toaster>`; they call `useNotify()` (./useNotify.tsx), which
 * dispatches into this one by id. Top-right, under the header, newest on top; hovering or leaving
 * the window pauses the timers so a message is not lost while the user is elsewhere.
 */
import { Toaster } from "@fluentui/react-components";

export const APP_TOASTER_ID = "app-toaster";

/** More than this and the oldest are queued, so a burst of saves cannot cover the page. */
const MAX_VISIBLE = 4;

export function AppToaster() {
  return (
    <Toaster
      toasterId={APP_TOASTER_ID}
      position="top-end"
      pauseOnHover
      pauseOnWindowBlur
      limit={MAX_VISIBLE}
    />
  );
}
