/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional. URL of the public chat portal; derived from the browser host when unset. */
  readonly VITE_PUBLIC_PORTAL_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
