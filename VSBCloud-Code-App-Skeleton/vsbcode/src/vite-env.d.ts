/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DATA_MODE?: "power" | "mock";
  readonly VITE_DATAVERSE_URL?: string;
  /**
   * Mock mode only. Comma-separated VSB role names to run the session as, overriding the
   * default five-role demo set, so a locked screen can actually be demonstrated. Ignored
   * when `VITE_DATA_MODE=power`, where roles come from Dataverse.
   */
  readonly VITE_MOCK_ROLES?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
