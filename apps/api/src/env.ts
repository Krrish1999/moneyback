export type Env = {
  DB: D1Database;
  DOCS: R2Bucket;
  APP_ENV: string;
  /** Google OAuth web client id (public, not a secret). Empty means sign-in is switched off. */
  GOOGLE_CLIENT_ID: string;
  /** Comma-separated origins of the web app that may call this API with cookies. */
  ALLOWED_ORIGINS: string;
};

/** Per-request values set by middleware. */
export type Variables = {
  /** Set by `requireSession`. The only source of the acting user's id. */
  userId: string;
};

export type AppEnv = { Bindings: Env; Variables: Variables };

export function allowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}
