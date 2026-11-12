import { z } from "zod";

/**
 * Version of the consent and privacy text the user agrees to before uploading documents.
 * Change it whenever that text changes in any language: everyone is then asked to agree again.
 *
 * DRAFT: the text is a placeholder until the founder approves it (FOUNDER_INBOX F-010).
 * The first approved text must get a new version that does not start with "draft".
 */
export const CONSENT_VERSION = "draft-2026-11-12";

/** Body of `POST /account/consent`. */
export const AcceptConsentInput = z.object({ version: z.string().min(1).max(64) });
export type AcceptConsentInput = z.infer<typeof AcceptConsentInput>;

/** A recorded consent: which text version the user agreed to, and when (ISO-8601 UTC). */
export const ConsentRecord = z.object({ version: z.string().min(1).max(64), acceptedAt: z.string().min(1) });
export type ConsentRecord = z.infer<typeof ConsentRecord>;
