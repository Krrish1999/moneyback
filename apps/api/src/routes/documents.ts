import { Hono } from "hono";
import type { Context } from "hono";
import { and, asc, count, eq } from "drizzle-orm";
import {
  cleanFileName,
  DocumentSummary,
  DocumentType,
  Id,
  MAX_DOCUMENTS_PER_CASE,
  MAX_UPLOAD_BYTES,
  sniffUploadMimeType,
  UploadMimeType,
  type CaseStatus,
} from "@moneyback/shared";
import type { AppEnv } from "../env";
import { getDb, schema } from "../db/client";
import { requireSession } from "../auth/session";
import { requireConsent } from "../consent";
import { allow, LIMITS, tooManyRequests } from "../rate-limit";
import { userFilePrefix } from "../storage";

/**
 * Documents of one case. Mounted at /cases/:caseId/documents.
 * Files go through this Worker into R2 (no public or signed bucket URLs), so every byte is checked here:
 * who is asking, consent, size, and the real file type. File contents are untrusted input and are only stored.
 */
export const documentsRoutes = new Hono<AppEnv>();

documentsRoutes.use("*", requireSession);

/** Cases that are over take no more documents. */
const FINISHED: ReadonlySet<CaseStatus> = new Set<CaseStatus>(["won", "lost", "closed"]);

/** The signed-in user's case, or null. Someone else's case looks exactly like a missing one. */
async function ownCase(c: Context<AppEnv>) {
  const caseId = Id.safeParse(c.req.param("caseId"));
  if (!caseId.success) return null;
  const row = await getDb(c.env.DB).query.cases.findFirst({
    where: and(eq(schema.cases.id, caseId.data), eq(schema.cases.userId, c.get("userId"))),
  });
  return row ?? null;
}

async function sha256HexOfBytes(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The file name comes URL-encoded in a header, so it never appears in an address or a log line. */
function fileNameFrom(c: Context<AppEnv>): string {
  const raw = c.req.header("x-file-name") ?? "";
  try {
    return cleanFileName(decodeURIComponent(raw));
  } catch {
    return cleanFileName("");
  }
}

/** List the documents of one of the signed-in user's cases, oldest first. */
documentsRoutes.get("/", async (c) => {
  const owned = await ownCase(c);
  if (!owned) return c.json({ error: "not_found" }, 404);
  const rows = await getDb(c.env.DB)
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.caseId, owned.id))
    .orderBy(asc(schema.documents.createdAt), asc(schema.documents.id));
  return c.json(rows.map((row) => DocumentSummary.parse(row)));
});

/**
 * Upload one file. The body is the file itself; `Content-Type` is its type; `?type=` is the kind of
 * document (policy, bill, …); `X-File-Name` is the URL-encoded file name.
 * 201 + DocumentSummary. Uploading the same file to the same case again returns the first copy (200).
 */
documentsRoutes.post("/", requireConsent, async (c) => {
  const userId = c.get("userId");
  if (!(await allow(c.env.DB, `upload:user:${userId}`, LIMITS.uploadPerUser))) return tooManyRequests(c, LIMITS.uploadPerUser);

  const owned = await ownCase(c);
  if (!owned) return c.json({ error: "not_found" }, 404);
  if (FINISHED.has(owned.status)) return c.json({ error: "case_finished" }, 409);

  const type = DocumentType.safeParse(c.req.query("type"));
  if (!type.success) return c.json({ error: "invalid_input", issues: type.error.issues }, 400);

  const declared = UploadMimeType.safeParse((c.req.header("content-type") ?? "").split(";")[0]?.trim().toLowerCase());
  if (!declared.success) return c.json({ error: "unsupported_file_type" }, 415);

  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (bytes.byteLength === 0) return c.json({ error: "empty_file" }, 400);
  if (bytes.byteLength > MAX_UPLOAD_BYTES) return c.json({ error: "file_too_large" }, 413);
  // The first bytes must agree with the claimed type, so an HTML page or a program cannot pose as a PDF.
  if (sniffUploadMimeType(bytes) !== declared.data) return c.json({ error: "unsupported_file_type" }, 415);

  const db = getDb(c.env.DB);
  const sha256 = await sha256HexOfBytes(bytes);
  const duplicate = await db.query.documents.findFirst({
    where: and(eq(schema.documents.caseId, owned.id), eq(schema.documents.sha256, sha256)),
  });
  if (duplicate) return c.json(DocumentSummary.parse(duplicate), 200);

  const [total] = await db.select({ n: count() }).from(schema.documents).where(eq(schema.documents.caseId, owned.id));
  if ((total?.n ?? 0) >= MAX_DOCUMENTS_PER_CASE) return c.json({ error: "too_many_documents" }, 409);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const record = {
    id,
    caseId: owned.id,
    type: type.data,
    fileName: fileNameFrom(c),
    mimeType: declared.data,
    sizeBytes: bytes.byteLength,
    sha256,
    r2Key: `${userFilePrefix(userId)}cases/${owned.id}/${id}`,
    createdAt: now,
  };

  await c.env.DOCS.put(record.r2Key, bytes, { httpMetadata: { contentType: record.mimeType } });
  try {
    await db.batch([
      db.insert(schema.documents).values(record),
      db.insert(schema.events).values({
        id: crypto.randomUUID(),
        caseId: owned.id,
        type: "document_uploaded",
        actor: "user",
        // No file name here: the timeline may be shown to staff, and names can be personal.
        data: { documentId: id, documentType: record.type },
        createdAt: now,
      }),
    ]);
  } catch (err) {
    await c.env.DOCS.delete(record.r2Key); // do not leave a file that no row points to
    throw err;
  }

  return c.json(DocumentSummary.parse(record), 201);
});

/** Remove a document while the case is still being filled in. Later, the file is part of the case record. */
documentsRoutes.delete("/:documentId", async (c) => {
  const owned = await ownCase(c);
  const documentId = Id.safeParse(c.req.param("documentId"));
  if (!owned || !documentId.success) return c.json({ error: "not_found" }, 404);

  const db = getDb(c.env.DB);
  const doc = await db.query.documents.findFirst({
    where: and(eq(schema.documents.id, documentId.data), eq(schema.documents.caseId, owned.id)),
  });
  if (!doc) return c.json({ error: "not_found" }, 404);
  if (owned.status !== "intake") return c.json({ error: "case_locked" }, 409);

  await c.env.DOCS.delete(doc.r2Key);
  await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));
  return c.json({ ok: true });
});
