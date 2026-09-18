/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional. URL of the public website; derived from the browser host when unset. */
  readonly VITE_WEBSITE_URL?: string;
  /** Optional. URL of the media room (Press workspace); derived from the browser host when unset. */
  readonly VITE_MEDIA_PORTAL_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
