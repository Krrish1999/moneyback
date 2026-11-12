/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base address of apps/api, e.g. http://localhost:8787. Empty = use the in-memory mock. */
  readonly VITE_API_URL?: string;
  /** Google OAuth web client id (public). Must match GOOGLE_CLIENT_ID in apps/api. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
