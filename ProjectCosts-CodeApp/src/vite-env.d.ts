/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Overrides the connection-host URL `localPlayUrl` (`app/deepLinks.ts`) assumes for a local
   * `pac code run` session. Only needed when that host isn't on the documented default port.
   */
  readonly VITE_LOCAL_CONNECTION_URL?: string;
}
