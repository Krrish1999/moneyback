/**
 * Build-time settings (see apps/web/.env.example). Neither value is a secret: both ship to every browser.
 * With no API address the app runs on the in-memory mock, which is what the demo and the tests use.
 */
export const API_URL: string = import.meta.env.VITE_API_URL ?? "";
export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
