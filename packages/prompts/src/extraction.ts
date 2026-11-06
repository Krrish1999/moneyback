import { z } from "zod";
import { Paise } from "@moneyback/shared";

/**
 * Output schema for document extraction (W1-06).
 *
 * The model reads a user's claim documents (policy, rejection letter, discharge summary, bills) and returns
 * `ExtractedClaimFacts`. Conventions:
 * - Every scalar fact is wrapped in `ExtractedField`: `{ value, confidence, source_document }`.
 *   `value` is `null` when the fact is not in the documents (the model must not guess).
 * - Money is integer paise (Rs 1,234.50 -> 123450). Dates are ISO calendar dates `YYYY-MM-DD`.
 * - `source_document` is the document id exactly as given to the model in the prompt (e.g. "doc_2"),
 *   or `null` when the value is null.
 * - List facts (rejection reasons, clauses) are arrays; an empty array means none were found.
 * - Objects are strict: unknown keys are rejected (an output that grew extra keys may have obeyed an injected instruction).
 */

/** Normalised reason an insurer gave for rejecting or cutting a claim. Keep small; add codes only with an eval run. */
export const RejectionReasonCode = z.enum([
  "pre_existing_disease",
  "waiting_period",
  "non_disclosure",
  "not_medically_necessary",
  "documents_missing",
  "late_intimation",
  "policy_exclusion",
  "room_rent_cap_proportionate_deduction",
  "consumables_not_payable",
  "other",
]);
export type RejectionReasonCode = z.infer<typeof RejectionReasonCode>;

export const PolicyType = z.enum(["individual", "family_floater", "group"]);
export type PolicyType = z.infer<typeof PolicyType>;

export const ClaimType = z.enum(["cashless", "reimbursement"]);
export type ClaimType = z.infer<typeof ClaimType>;

/** Model's confidence that the value is correct, 0 (none) to 1 (certain). */
export const Confidence = z.number().min(0).max(1);

/** Id of the input document a fact came from, as labelled in the prompt. */
export const SourceDocumentId = z.string().min(1).nullable();

/** ISO calendar date, e.g. "2026-03-14". */
export const IsoDate = z.iso.date();

/** Wrap a value schema as an extracted fact with confidence and provenance. */
export function extractedField<T extends z.ZodType>(value: T) {
  return z.strictObject({
    value: value.nullable(),
    confidence: Confidence,
    source_document: SourceDocumentId,
  });
}

export const RejectionReason = z.strictObject({
  /** The insurer's words, copied verbatim from the document. */
  quote: z.string().min(1),
  code: RejectionReasonCode,
  /** Paise disallowed for this reason, if the document itemises it. */
  amount_disallowed: Paise.nullable(),
  confidence: Confidence,
  source_document: SourceDocumentId,
});
export type RejectionReason = z.infer<typeof RejectionReason>;

export const PolicyClauseCited = z.strictObject({
  /** Clause reference as written, e.g. "Clause 4.1(b)" or "Exclusion Code Excl01". */
  clause: z.string().min(1),
  /** Clause wording or heading if the document quotes it, verbatim; otherwise null. */
  text: z.string().nullable(),
  confidence: Confidence,
  source_document: SourceDocumentId,
});
export type PolicyClauseCited = z.infer<typeof PolicyClauseCited>;

export const ExtractedClaimFacts = z.strictObject({
  insurer_name: extractedField(z.string().min(1)),
  policy_number: extractedField(z.string().min(1)),
  policy_type: extractedField(PolicyType),
  sum_insured: extractedField(Paise),
  policy_start_date: extractedField(IsoDate),
  claim_number: extractedField(z.string().min(1)),
  claim_type: extractedField(ClaimType),
  hospital_name: extractedField(z.string().min(1)),
  admission_date: extractedField(IsoDate),
  discharge_date: extractedField(IsoDate),
  /** Diagnosis as written in the documents, not paraphrased. */
  diagnosis: extractedField(z.string().min(1)),
  amount_claimed: extractedField(Paise),
  amount_paid: extractedField(Paise),
  amount_disallowed: extractedField(Paise),
  rejection_letter_date: extractedField(IsoDate),
  rejection_reasons: z.array(RejectionReason),
  policy_clauses_cited: z.array(PolicyClauseCited),
});
export type ExtractedClaimFacts = z.infer<typeof ExtractedClaimFacts>;

/** Names of the scalar fields (useful for per-field eval scoring). */
export const EXTRACTED_SCALAR_FIELDS = [
  "insurer_name",
  "policy_number",
  "policy_type",
  "sum_insured",
  "policy_start_date",
  "claim_number",
  "claim_type",
  "hospital_name",
  "admission_date",
  "discharge_date",
  "diagnosis",
  "amount_claimed",
  "amount_paid",
  "amount_disallowed",
  "rejection_letter_date",
] as const satisfies readonly (keyof ExtractedClaimFacts)[];
export type ExtractedScalarField = (typeof EXTRACTED_SCALAR_FIELDS)[number];
