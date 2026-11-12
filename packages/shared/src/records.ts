import { z } from "zod";
import { CaseCategory, CaseStatus, DocumentType, FeeKind, Forum, Paise, Verdict } from "./case";

/**
 * Zod schemas for the stored records (the API's D1 rows, in camelCase).
 * Money is integer paise; timestamps are ISO-8601 UTC strings; ids are opaque strings (UUIDs today).
 */

export const Id = z.string().min(1).max(64);
export const IsoDateTime = z.iso.datetime(); // UTC, e.g. 2026-11-06T10:00:00.000Z
export const IsoDate = z.iso.date(); // calendar date, e.g. 2026-11-06

const Timestamps = {
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
};

export const UserRecord = z.object({
  id: Id,
  phone: z.string().nullable(),
  email: z.email().nullable(),
  name: z.string().nullable(),
  ...Timestamps,
});
export type UserRecord = z.infer<typeof UserRecord>;

export const CaseRecord = z.object({
  id: Id,
  userId: Id,
  category: CaseCategory,
  insurer: z.string().trim().min(1).max(200),
  claimAmountPaise: Paise,
  status: CaseStatus,
  verdict: Verdict.nullable(),
  /** Next legal deadline (calendar date, India) from the deadline engine; null until computed. */
  nextDeadline: IsoDate.nullable(),
  amountRecoveredPaise: Paise,
  ...Timestamps,
});
export type CaseRecord = z.infer<typeof CaseRecord>;

/** Largest claim the product accepts: Rs 10 crore, in paise. Web and API share this cap. */
export const MAX_CLAIM_AMOUNT_PAISE = 10_00_00_000_00;

/**
 * Body of `POST /cases`. The owner is never part of the body: the API takes it from the session.
 * Unknown keys (including a client-sent `userId` or `status`) are dropped.
 */
export const CreateCaseInput = z.object({
  category: CaseCategory.default("health_insurance"),
  insurer: z.string().trim().min(1).max(200),
  claimAmountPaise: Paise.max(MAX_CLAIM_AMOUNT_PAISE),
});
export type CreateCaseInput = z.infer<typeof CreateCaseInput>;

export const DocumentRecord = z.object({
  id: Id,
  caseId: Id,
  type: DocumentType,
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.number().int().nonnegative(),
  /** Hex SHA-256 of the file, for dedupe (B-02). */
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  /** Object key in the R2 DOCS bucket. */
  r2Key: z.string().min(1),
  createdAt: IsoDateTime,
});
export type DocumentRecord = z.infer<typeof DocumentRecord>;

export const LetterStatus = z.enum(["draft", "approved", "sent"]);
export type LetterStatus = z.infer<typeof LetterStatus>;

export const LetterRecord = z.object({
  id: Id,
  caseId: Id,
  forum: Forum,
  status: LetterStatus,
  subject: z.string().max(500),
  body: z.string(),
  /** Rendered PDF in R2, once generated (B-08). */
  pdfR2Key: z.string().nullable(),
  sentAt: IsoDateTime.nullable(),
  ...Timestamps,
});
export type LetterRecord = z.infer<typeof LetterRecord>;

export const EventType = z.enum([
  "case_created",
  "status_changed",
  "document_uploaded",
  "letter_drafted",
  "letter_approved",
  "letter_sent",
  "reply_received",
  "payment",
  "note",
]);
export type EventType = z.infer<typeof EventType>;

export const EventActor = z.enum(["user", "agent", "admin", "system"]);
export type EventActor = z.infer<typeof EventActor>;

/** Append-only case timeline entry. `data` is event-specific JSON. */
export const EventRecord = z.object({
  id: Id,
  caseId: Id,
  type: EventType,
  actor: EventActor,
  data: z.record(z.string(), z.unknown()),
  createdAt: IsoDateTime,
});
export type EventRecord = z.infer<typeof EventRecord>;

export const PaymentStatus = z.enum(["created", "authorized", "captured", "failed", "refunded"]);
export type PaymentStatus = z.infer<typeof PaymentStatus>;

export const PaymentRecord = z.object({
  id: Id,
  caseId: Id,
  kind: FeeKind,
  amountPaise: Paise,
  razorpayId: z.string().nullable(),
  /** UPI AutoPay mandate id (success fee, B-12). */
  mandateId: z.string().nullable(),
  status: PaymentStatus,
  ...Timestamps,
});
export type PaymentRecord = z.infer<typeof PaymentRecord>;
