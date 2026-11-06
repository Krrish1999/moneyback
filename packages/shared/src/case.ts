import { z } from "zod";

/** Version 1 handles one category. New categories ship behind feature flags. */
export const CaseCategory = z.enum(["health_insurance"]);
export type CaseCategory = z.infer<typeof CaseCategory>;

/** Case lifecycle. See team/DECISIONS.md D-003 for the allowed transitions. */
export const CaseStatus = z.enum([
  "intake", // chatting, collecting facts
  "analysing", // documents being read and assessed
  "review", // waiting for admin (human) review
  "draft", // complaint drafted, waiting for user approval + filing fee
  "sent", // complaint sent to the insurer
  "waiting", // waiting for a reply within the forum's time limit
  "escalated", // filed with Bima Bharosa or the ombudsman
  "won",
  "lost",
  "closed", // closed without filing (weak case or user withdrew)
]);
export type CaseStatus = z.infer<typeof CaseStatus>;

export const Verdict = z.enum(["strong", "possible", "weak"]);
export type Verdict = z.infer<typeof Verdict>;

export const Forum = z.enum(["insurer_gro", "bima_bharosa", "insurance_ombudsman"]);
export type Forum = z.infer<typeof Forum>;

export const DocumentType = z.enum([
  "policy",
  "rejection_letter",
  "discharge_summary",
  "bill",
  "other",
]);
export type DocumentType = z.infer<typeof DocumentType>;

/** Money is always stored as integer paise to avoid floating point errors. */
export const Paise = z.number().int().nonnegative();

export const FeeKind = z.enum(["filing", "escalation", "success"]);
export type FeeKind = z.infer<typeof FeeKind>;

/** Prices from the market research doc. Change only via a founder decision. */
export const PRICES_PAISE = {
  filing: 299_00,
  escalation: 499_00,
} as const;
export const SUCCESS_FEE_RATE = 0.1;
