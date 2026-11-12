import { describe, expect, it } from "vitest";
import {
  CaseRecord,
  CreateCaseInput,
  DocumentRecord,
  EventRecord,
  LetterRecord,
  MAX_CLAIM_AMOUNT_PAISE,
  PaymentRecord,
} from "../src";

const T = "2026-11-06T10:00:00.000Z";

const validCase = {
  id: "c1",
  userId: "u1",
  category: "health_insurance",
  insurer: "Example General Insurance",
  claimAmountPaise: 150_000_00,
  status: "intake",
  verdict: null,
  nextDeadline: null,
  amountRecoveredPaise: 0,
  createdAt: T,
  updatedAt: T,
};

const validDocument = {
  id: "d1",
  caseId: "c1",
  type: "rejection_letter",
  fileName: "rejection.pdf",
  mimeType: "application/pdf",
  sizeBytes: 1024,
  sha256: "a".repeat(64),
  r2Key: "cases/c1/d1.pdf",
  createdAt: T,
};

const validLetter = {
  id: "l1",
  caseId: "c1",
  forum: "insurer_gro",
  status: "draft",
  subject: "Complaint",
  body: "…",
  pdfR2Key: null,
  sentAt: null,
  createdAt: T,
  updatedAt: T,
};

const validEvent = { id: "e1", caseId: "c1", type: "case_created", actor: "user", data: {}, createdAt: T };

const validPayment = {
  id: "p1",
  caseId: "c1",
  kind: "filing",
  amountPaise: 299_00,
  razorpayId: null,
  mandateId: null,
  status: "created",
  createdAt: T,
  updatedAt: T,
};

type Row = [name: string, schema: { safeParse(v: unknown): { success: boolean } }, value: unknown, ok: boolean];

const rows: Row[] = [
  ["case valid", CaseRecord, validCase, true],
  ["case with verdict + deadline", CaseRecord, { ...validCase, verdict: "strong", nextDeadline: "2027-01-01" }, true],
  ["case fractional paise", CaseRecord, { ...validCase, claimAmountPaise: 10.5 }, false],
  ["case negative paise", CaseRecord, { ...validCase, amountRecoveredPaise: -1 }, false],
  ["case unknown status", CaseRecord, { ...validCase, status: "pending" }, false],
  ["case empty insurer", CaseRecord, { ...validCase, insurer: "  " }, false],
  ["case non-ISO timestamp", CaseRecord, { ...validCase, createdAt: "06/11/2026" }, false],
  ["case deadline with time", CaseRecord, { ...validCase, nextDeadline: T }, false],
  ["document valid", DocumentRecord, validDocument, true],
  ["document bad sha", DocumentRecord, { ...validDocument, sha256: "xyz" }, false],
  ["document bad type", DocumentRecord, { ...validDocument, type: "selfie" }, false],
  ["letter valid", LetterRecord, validLetter, true],
  ["letter sent", LetterRecord, { ...validLetter, status: "sent", sentAt: T }, true],
  ["letter bad forum", LetterRecord, { ...validLetter, forum: "high_court" }, false],
  ["event valid", EventRecord, validEvent, true],
  ["event with data", EventRecord, { ...validEvent, type: "status_changed", data: { from: "intake" } }, true],
  ["event bad actor", EventRecord, { ...validEvent, actor: "insurer" }, false],
  ["payment valid", PaymentRecord, validPayment, true],
  ["payment success with mandate", PaymentRecord, { ...validPayment, kind: "success", mandateId: "m1" }, true],
  ["payment bad kind", PaymentRecord, { ...validPayment, kind: "tip" }, false],
  ["payment bad status", PaymentRecord, { ...validPayment, status: "pending" }, false],
  ["create input valid", CreateCaseInput, { insurer: "X", claimAmountPaise: 100 }, true],
  ["create input at the cap", CreateCaseInput, { insurer: "X", claimAmountPaise: MAX_CLAIM_AMOUNT_PAISE }, true],
  ["create input over the cap", CreateCaseInput, { insurer: "X", claimAmountPaise: MAX_CLAIM_AMOUNT_PAISE + 1 }, false],
  ["create input rupees as float", CreateCaseInput, { insurer: "X", claimAmountPaise: 99.9 }, false],
  ["create input bad category", CreateCaseInput, { insurer: "X", claimAmountPaise: 1, category: "car" }, false],
];

describe("record schemas", () => {
  it.each(rows)("%s", (_name, schema, value, ok) => {
    expect(schema.safeParse(value).success).toBe(ok);
  });

  it("CreateCaseInput defaults category and trims insurer", () => {
    expect(CreateCaseInput.parse({ insurer: "  X  ", claimAmountPaise: 1 })).toEqual({
      insurer: "X",
      claimAmountPaise: 1,
      category: "health_insurance",
    });
  });

  it("CreateCaseInput drops a client-sent userId and status", () => {
    const parsed = CreateCaseInput.parse({ userId: "someone-else", status: "won", insurer: "X", claimAmountPaise: 1 });
    expect(parsed).not.toHaveProperty("userId");
    expect(parsed).not.toHaveProperty("status");
  });
});
