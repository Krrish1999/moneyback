import { z } from "zod";
import type { CaseRecord, ConsentRecord, CreateCaseInput, DocumentSummary, DocumentType } from "@moneyback/shared";

/** The signed-in user, as `GET /auth/me` and `POST /auth/google` return it. */
export const SessionUser = z.object({
  id: z.string().min(1),
  email: z.string().nullable(),
  /** The current consent version if the user has agreed to it, otherwise null. */
  consentVersion: z.string().nullable(),
});
export type SessionUser = z.infer<typeof SessionUser>;

/**
 * The surface the screens use. Same shapes as apps/api:
 *   POST /auth/google  body { credential } → 200 SessionUser (sets the session cookie)
 *   GET  /auth/me      → 200 SessionUser | 401
 *   POST /auth/logout  → 200
 *   POST /account/consent  body { version } → 200 ConsentRecord | 409 {error:"consent_version_outdated"}
 *   DELETE /account    → 200 (deletes the user and all their data)
 *   POST /cases        body CreateCaseInput → 201 CaseRecord
 *   GET  /cases/:id    → 200 CaseRecord | 404 {error:"not_found"}
 * `http.ts` is the real client; `mock.ts` is an in-memory stand-in for demos and tests.
 */
export interface MoneyBackApi {
  /** The signed-in user, or null when nobody is signed in. */
  getMe(): Promise<SessionUser | null>;
  /** Exchanges a Google ID token for a session. */
  signInWithGoogle(credential: string): Promise<SessionUser>;
  signOut(): Promise<void>;
  /** Records that the signed-in user agrees to this version of the consent text. */
  acceptConsent(version: string): Promise<ConsentRecord>;
  /** Deletes the signed-in user and everything stored about them. Cannot be undone. */
  deleteAccount(): Promise<void>;
  createCase(input: CreateCaseBody): Promise<CaseRecord>;
  /** Rejects with ApiError(404) when the case does not exist. */
  getCase(id: string): Promise<CaseRecord>;
  /** GET /cases/:id/documents — the case's stored documents, oldest first. */
  listDocuments(caseId: string): Promise<DocumentSummary[]>;
  /**
   * POST /cases/:id/documents?type=… with the file as the body. Rejects with ApiError:
   * 413 file_too_large · 415 unsupported_file_type · 400 empty_file · 409 too_many_documents | case_finished ·
   * 403 consent_required.
   */
  uploadDocument(caseId: string, type: DocumentType, file: File): Promise<DocumentSummary>;
  /** DELETE /cases/:id/documents/:documentId. Rejects with ApiError(409, "case_locked") after intake. */
  deleteDocument(caseId: string, documentId: string): Promise<void>;
}

/** Request body as sent (category has a server-side default, so it is optional here). */
export type CreateCaseBody = z.input<typeof CreateCaseInput>;

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * TEMPORARY, web-only. The intake form collects these but `CreateCaseInput` does not accept them yet.
 * Requested from backend-engineer (team/handoffs/frontend-engineer.md): add them to CreateCaseInput/CaseRecord
 * and move ClaimType into @moneyback/shared. Until then they are kept in memory on the device only.
 */
export const ClaimType = z.enum(["cashless", "reimbursement"]);
export type ClaimType = z.infer<typeof ClaimType>;

export type IntakeExtras = {
  claimType: ClaimType;
  /** YYYY-MM-DD; maps to the deadline engine's `claimDecisionAt`. */
  rejectionDate: string;
  /** Free text from the user. Untrusted input. */
  insurerStatement: string;
};
