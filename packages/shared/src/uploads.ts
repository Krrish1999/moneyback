import { z } from "zod";
import { DocumentRecord } from "./records";

/** Largest file a user may upload. Phone photos and scanned PDFs of claim papers fit well inside this. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Most documents one case may hold. */
export const MAX_DOCUMENTS_PER_CASE = 20;

/** File types we accept. The API checks the file's first bytes, not just the type the browser claims. */
export const UPLOAD_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export const UploadMimeType = z.enum(UPLOAD_MIME_TYPES);
export type UploadMimeType = z.infer<typeof UploadMimeType>;

const startsWith = (bytes: Uint8Array, signature: readonly number[]) =>
  bytes.length >= signature.length && signature.every((byte, i) => bytes[i] === byte);

/** The file type shown by the file's first bytes, or null when it is not one we accept. */
export function sniffUploadMimeType(bytes: Uint8Array): UploadMimeType | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  return null;
}

/**
 * Makes a user-supplied file name safe to store and show: no folders, no control characters, at most 120
 * characters. The name is untrusted text and is only ever displayed, never used as a path.
 */
export function cleanFileName(raw: string): string {
  const base = raw.split(/[/\\]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120).trim();
  return cleaned === "" || cleaned === "." || cleaned === ".." ? "document" : cleaned;
}

/** A stored document as the API returns it. The storage key stays on the server. */
export const DocumentSummary = DocumentRecord.omit({ r2Key: true });
export type DocumentSummary = z.infer<typeof DocumentSummary>;
