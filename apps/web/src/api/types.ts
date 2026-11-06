import { z } from "zod";
import type { CaseRecord, CreateCaseInput } from "@moneyback/shared";

/**
 * The surface the screens use. Same shapes as apps/api (W1-03):
 *   POST /cases      body CreateCaseInput → 201 CaseRecord
 *   GET  /cases/:id  → 200 CaseRecord | 404 {error:"not_found"}
 * The real HTTP client will implement this interface and `CaseRecord.parse` every response.
 */
export interface MoneyBackApi {
  createCase(input: CreateCaseBody): Promise<CaseRecord>;
  /** Rejects with ApiError(404) when the case does not exist. */
  getCase(id: string): Promise<CaseRecord>;
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

/**
 * TODO(B-01): remove. `CreateCaseInput` requires a userId until sign-in exists; the API creates a placeholder user.
 */
export const DEV_USER_ID = "dev-web-user";
