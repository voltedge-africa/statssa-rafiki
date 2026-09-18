/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional. URL of the public website; derived from the browser host when unset. */
  readonly VITE_WEBSITE_URL?: string;
  /** Optional. URL of the public chat portal; derived from the browser host when unset. */
  readonly VITE_PUBLIC_PORTAL_URL?: string;
  /** Optional. URL of the Staff/Admin control centre; derived from the browser host when unset. */
  readonly VITE_CONTROL_CENTRE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
