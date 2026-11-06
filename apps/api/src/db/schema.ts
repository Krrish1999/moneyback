import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { CaseCategory, CaseStatus, DocumentType, FeeKind, Forum, Verdict } from "@moneyback/shared";
import { EventActor, EventType, LetterStatus, PaymentStatus } from "@moneyback/shared";

/**
 * D1 schema. Column names are snake_case; Drizzle maps them to the camelCase fields of the
 * record schemas in @moneyback/shared. Money: integer paise. Timestamps: ISO-8601 UTC text.
 * Enum columns are TEXT; values are validated by Zod at the API boundary.
 * After changing this file: `pnpm --filter @moneyback/api db:generate` to write a new migration.
 */

/** Zod enum values as the non-empty tuple Drizzle wants (column type becomes the enum's union). */
const values = <T extends string>(e: { options: readonly T[] }) => e.options as [T, ...T[]];

const timestamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  phone: text("phone").unique(),
  email: text("email").unique(),
  name: text("name"),
  ...timestamps,
});

export const cases = sqliteTable(
  "cases",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    category: text("category", { enum: values(CaseCategory) }).notNull(),
    insurer: text("insurer").notNull(),
    claimAmountPaise: integer("claim_amount_paise").notNull(),
    status: text("status", { enum: values(CaseStatus) }).notNull(),
    verdict: text("verdict", { enum: values(Verdict) }),
    /** YYYY-MM-DD (India calendar date) from the deadline engine. */
    nextDeadline: text("next_deadline"),
    amountRecoveredPaise: integer("amount_recovered_paise").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("cases_user_id_idx").on(t.userId), index("cases_next_deadline_idx").on(t.nextDeadline)],
);

export const documents = sqliteTable(
  "documents",
  {
    id: text("id").primaryKey(),
    caseId: text("case_id")
      .notNull()
      .references(() => cases.id),
    type: text("type", { enum: values(DocumentType) }).notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    r2Key: text("r2_key").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("documents_case_id_idx").on(t.caseId)],
);

export const letters = sqliteTable(
  "letters",
  {
    id: text("id").primaryKey(),
    caseId: text("case_id")
      .notNull()
      .references(() => cases.id),
    forum: text("forum", { enum: values(Forum) }).notNull(),
    status: text("status", { enum: values(LetterStatus) }).notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    pdfR2Key: text("pdf_r2_key"),
    sentAt: text("sent_at"),
    ...timestamps,
  },
  (t) => [index("letters_case_id_idx").on(t.caseId)],
);

export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    caseId: text("case_id")
      .notNull()
      .references(() => cases.id),
    type: text("type", { enum: values(EventType) }).notNull(),
    actor: text("actor", { enum: values(EventActor) }).notNull(),
    data: text("data", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("events_case_id_idx").on(t.caseId, t.createdAt)],
);

export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    caseId: text("case_id")
      .notNull()
      .references(() => cases.id),
    kind: text("kind", { enum: values(FeeKind) }).notNull(),
    amountPaise: integer("amount_paise").notNull(),
    razorpayId: text("razorpay_id").unique(),
    mandateId: text("mandate_id"),
    status: text("status", { enum: values(PaymentStatus) }).notNull(),
    ...timestamps,
  },
  (t) => [index("payments_case_id_idx").on(t.caseId)],
);
