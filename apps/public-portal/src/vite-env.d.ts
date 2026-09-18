/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional. Base URL of the Rafiki agent API; defaults to http://localhost:3001. */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
