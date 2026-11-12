import {
  CaseRecord,
  CaseStatus,
  cleanFileName,
  CONSENT_VERSION,
  CreateCaseInput,
  DocumentSummary,
  MAX_DOCUMENTS_PER_CASE,
  MAX_UPLOAD_BYTES,
  UploadMimeType,
  type ConsentRecord,
} from "@moneyback/shared";
import { ApiError, type MoneyBackApi, type SessionUser } from "./types";

/** Id of a sample case that is always present in the mock, so the timeline can be seen with a deadline. */
export const DEMO_CASE_ID = "demo";

/** Owner of every case in the mock. The real API takes the owner from the signed-in session. */
const MOCK_USER = { id: "demo-user", email: "demo@example.com" };

type MockOptions = {
  /** Simulated network delay in ms. Default 0. */
  latencyMs?: number;
  now?: () => Date;
  /** Start signed in as the demo user (default), so the demo works without Google. */
  signedIn?: boolean;
  /** The demo user has already agreed to the current consent text (default), so the demo flow is not interrupted. */
  consented?: boolean;
};

/**
 * In-memory implementation of MoneyBackApi with the same behaviour as apps/api.
 * Data is lost on page reload. Case calls need a signed-in user, like the real API.
 */
export function createMockApi({
  latencyMs = 0,
  now = () => new Date(),
  signedIn = true,
  consented = true,
}: MockOptions = {}): MoneyBackApi {
  const cases = new Map<string, CaseRecord>();
  cases.set(DEMO_CASE_ID, demoCase(now()));
  let consent: ConsentRecord | null = consented ? { version: CONSENT_VERSION, acceptedAt: now().toISOString() } : null;
  const asUser = (): SessionUser => ({ ...MOCK_USER, consentVersion: consent?.version ?? null });
  let user: SessionUser | null = signedIn ? asUser() : null;

  const delay = () => (latencyMs > 0 ? new Promise((r) => setTimeout(r, latencyMs)) : Promise.resolve());
  const requireUser = () => {
    if (!user) throw new ApiError(401, "unauthenticated");
    return user;
  };
  const documents: DocumentSummary[] = [];
  let nextDocument = 0;
  const requireCase = (caseId: string) => {
    requireUser();
    const found = cases.get(caseId);
    if (!found) throw new ApiError(404, "not_found");
    return found;
  };

  return {
    async getMe() {
      await delay();
      return user ? { ...user } : null;
    },

    async signInWithGoogle(credential) {
      await delay();
      if (!credential) throw new ApiError(401, "invalid_credential");
      user = asUser();
      return { ...user };
    },

    async signOut() {
      await delay();
      user = null;
    },

    async acceptConsent(version) {
      await delay();
      requireUser();
      if (version !== CONSENT_VERSION) throw new ApiError(409, "consent_version_outdated");
      consent ??= { version, acceptedAt: now().toISOString() };
      user = asUser();
      return { ...consent };
    },

    async deleteAccount() {
      await delay();
      requireUser();
      cases.clear();
      documents.length = 0;
      consent = null;
      user = null;
    },

    async createCase(body) {
      await delay();
      const owner = requireUser();
      const parsed = CreateCaseInput.safeParse(body);
      if (!parsed.success) throw new ApiError(400, "invalid_input");
      const at = now().toISOString();
      const record = CaseRecord.parse({
        id: crypto.randomUUID(),
        userId: owner.id,
        category: parsed.data.category,
        insurer: parsed.data.insurer,
        claimAmountPaise: parsed.data.claimAmountPaise,
        status: CaseStatus.enum.intake,
        verdict: null,
        nextDeadline: null,
        amountRecoveredPaise: 0,
        createdAt: at,
        updatedAt: at,
      });
      cases.set(record.id, record);
      return structuredClone(record);
    },

    async getCase(id) {
      await delay();
      requireUser();
      const found = cases.get(id);
      if (!found) throw new ApiError(404, "not_found");
      return structuredClone(found);
    },

    async listDocuments(caseId) {
      await delay();
      requireCase(caseId);
      return structuredClone(documents.filter((d) => d.caseId === caseId));
    },

    async uploadDocument(caseId, type, file) {
      await delay();
      const found = requireCase(caseId);
      if (!consent) throw new ApiError(403, "consent_required");
      if (found.status === "won" || found.status === "lost" || found.status === "closed") throw new ApiError(409, "case_finished");
      const mimeType = UploadMimeType.safeParse(file.type);
      if (!mimeType.success) throw new ApiError(415, "unsupported_file_type");
      if (file.size === 0) throw new ApiError(400, "empty_file");
      if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(413, "file_too_large");
      const mine = documents.filter((d) => d.caseId === caseId);
      // The mock cannot hash the bytes cheaply; same name and size stands in for "same file".
      const fileName = cleanFileName(file.name);
      const duplicate = mine.find((d) => d.fileName === fileName && d.sizeBytes === file.size);
      if (duplicate) return structuredClone(duplicate);
      if (mine.length >= MAX_DOCUMENTS_PER_CASE) throw new ApiError(409, "too_many_documents");
      nextDocument += 1;
      const record = DocumentSummary.parse({
        id: crypto.randomUUID(),
        caseId,
        type,
        fileName,
        mimeType: mimeType.data,
        sizeBytes: file.size,
        sha256: nextDocument.toString(16).padStart(64, "0"),
        createdAt: now().toISOString(),
      });
      documents.push(record);
      return structuredClone(record);
    },

    async deleteDocument(caseId, documentId) {
      await delay();
      const found = requireCase(caseId);
      const index = documents.findIndex((d) => d.caseId === caseId && d.id === documentId);
      if (index < 0) throw new ApiError(404, "not_found");
      if (found.status !== "intake") throw new ApiError(409, "case_locked");
      documents.splice(index, 1);
    },
  };
}

/** Sample data only. The deadline here is made up; real deadlines come from the deadline engine (D-004). */
function demoCase(now: Date): CaseRecord {
  const days = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString();
  return CaseRecord.parse({
    id: DEMO_CASE_ID,
    userId: MOCK_USER.id,
    category: "health_insurance",
    insurer: "Sample Health Insurance Co.",
    claimAmountPaise: 85_000_00,
    status: "waiting",
    verdict: "possible",
    nextDeadline: days(12).slice(0, 10),
    amountRecoveredPaise: 0,
    createdAt: days(-20),
    updatedAt: days(-18),
  });
}
