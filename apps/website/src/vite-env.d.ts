/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional. URL of the public chat portal; derived from the browser host when unset. */
  readonly VITE_PUBLIC_PORTAL_URL?: string;
  /** Optional. URL of the media room (Press workspace); derived from the browser host when unset. */
  readonly VITE_MEDIA_PORTAL_URL?: string;
  /** Optional. URL of the control centre (Staff/Admin workspace); derived from the host when unset. */
  readonly VITE_CONTROL_CENTRE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
