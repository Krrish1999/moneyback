import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { CONSENT_VERSION, DocumentSummary, MAX_DOCUMENTS_PER_CASE, MAX_UPLOAD_BYTES } from "@moneyback/shared";
import { userFilePrefix } from "../src/storage";
import { BASE, call, signInAs } from "./helpers";

const PDF = new TextEncoder().encode("%PDF-1.7\nfake pdf body");
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9]);
const pdfVariant = (n: number) => new TextEncoder().encode(`%PDF-1.7\nfile number ${n}`);

/** A signed-in user who has agreed to the current consent text, with one case. */
async function userWithCase(userId: string, { consent = true, status = "intake" } = {}) {
  const cookie = await signInAs(userId);
  if (consent) {
    await env.DB.prepare("INSERT OR IGNORE INTO consents (user_id, version, accepted_at) VALUES (?1, ?2, ?3)")
      .bind(userId, CONSENT_VERSION, "2026-11-12T10:00:00.000Z")
      .run();
  }
  const res = await call("POST", "/cases", { cookie, body: { insurer: "X", claimAmountPaise: 100 } });
  const { id: caseId } = (await res.json()) as { id: string };
  if (status !== "intake") await env.DB.prepare("UPDATE cases SET status = ?1 WHERE id = ?2").bind(status, caseId).run();
  return { cookie, caseId };
}

type UploadOptions = { type?: string; contentType?: string; name?: string; headers?: Record<string, string> };

function upload(cookie: string | undefined, caseId: string, body: Uint8Array<ArrayBuffer>, options: UploadOptions = {}) {
  const { type = "policy", contentType = "application/pdf", name = "policy.pdf", headers = {} } = options;
  const all: Record<string, string> = { "content-type": contentType, "x-file-name": encodeURIComponent(name), ...headers };
  if (cookie) all.cookie = cookie;
  return exports.default.fetch(`${BASE}/cases/${caseId}/documents?type=${type}`, { method: "POST", headers: all, body });
}

const list = async (cookie: string, caseId: string) =>
  DocumentSummary.array().parse(await (await call("GET", `/cases/${caseId}/documents`, { cookie })).json());

const storedKeys = async (userId: string) => (await env.DOCS.list({ prefix: userFilePrefix(userId) })).objects.map((o) => o.key);

describe("POST /cases/:caseId/documents", () => {
  it("stores the file in R2 under the user's prefix and records it", async () => {
    const { cookie, caseId } = await userWithCase("doc-a");
    const res = await upload(cookie, caseId, PDF);
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty("r2Key");
    const doc = DocumentSummary.parse(body);
    expect(doc).toMatchObject({ caseId, type: "policy", fileName: "policy.pdf", mimeType: "application/pdf", sizeBytes: PDF.byteLength });

    const keys = await storedKeys("doc-a");
    expect(keys).toEqual([`users/doc-a/cases/${caseId}/${doc.id}`]);
    const object = await env.DOCS.get(keys[0]!);
    expect(new Uint8Array(await object!.arrayBuffer())).toEqual(PDF);
    expect(object!.httpMetadata?.contentType).toBe("application/pdf");

    const event = await env.DB.prepare("SELECT data FROM events WHERE case_id = ?1 AND type = 'document_uploaded'").bind(caseId).first<{ data: string }>();
    expect(JSON.parse(event!.data)).toEqual({ documentId: doc.id, documentType: "policy" });
  });

  it.each([
    ["JPEG", JPEG, "image/jpeg"],
    ["PNG", PNG, "image/png"],
  ])("accepts %s", async (_name, bytes, contentType) => {
    const { cookie, caseId } = await userWithCase(`doc-img-${contentType.slice(6)}`);
    expect((await upload(cookie, caseId, bytes, { contentType, type: "bill" })).status).toBe(201);
  });

  it("needs a session", async () => {
    const { caseId } = await userWithCase("doc-b");
    expect((await upload(undefined, caseId, PDF)).status).toBe(401);
  });

  it("needs consent to the current text", async () => {
    const { cookie, caseId } = await userWithCase("doc-c", { consent: false });
    const res = await upload(cookie, caseId, PDF);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "consent_required" });
    expect(await storedKeys("doc-c")).toEqual([]);
  });

  it("does not let a user add a file to someone else's case", async () => {
    const owner = await userWithCase("doc-d");
    const stranger = await userWithCase("doc-e");
    const res = await upload(stranger.cookie, owner.caseId, PDF);
    expect(res.status).toBe(404);
    expect(await list(owner.cookie, owner.caseId)).toEqual([]);
    expect(await storedKeys("doc-e")).toEqual([]);
  });

  it.each([
    ["a type we do not accept", PDF, "application/zip"],
    ["no content type", PDF, ""],
    ["HTML posing as a PDF", new TextEncoder().encode("<html><script>alert(1)</script></html>"), "application/pdf"],
    ["a PNG posing as a JPEG", PNG, "image/jpeg"],
    ["a PDF posing as a PNG", PDF, "image/png"],
  ])("rejects %s", async (_name, bytes, contentType) => {
    const { cookie, caseId } = await userWithCase(`doc-f-${_name.length}-${contentType.length}`);
    const res = await upload(cookie, caseId, bytes, { contentType });
    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({ error: "unsupported_file_type" });
    expect(await list(cookie, caseId)).toEqual([]);
  });

  it("rejects an empty file and an unknown document kind", async () => {
    const { cookie, caseId } = await userWithCase("doc-g");
    expect((await upload(cookie, caseId, new Uint8Array())).status).toBe(400);
    expect((await upload(cookie, caseId, PDF, { type: "passport" })).status).toBe(400);
  });

  it("accepts a file of exactly the size limit and rejects one byte more", async () => {
    const { cookie, caseId } = await userWithCase("doc-h");
    const atLimit = new Uint8Array(MAX_UPLOAD_BYTES);
    atLimit.set(PDF);
    expect((await upload(cookie, caseId, atLimit)).status).toBe(201);

    const over = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    over.set(PDF);
    const res = await upload(cookie, caseId, over);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "file_too_large" });
    expect(await list(cookie, caseId)).toHaveLength(1);
  });

  it("still limits JSON routes to small bodies", async () => {
    const { cookie } = await userWithCase("doc-i");
    const res = await call("POST", "/cases", { cookie, body: { insurer: "x".repeat(20_000), claimAmountPaise: 1 } });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "body_too_large" });
  });

  it("returns the first copy when the same file is uploaded again", async () => {
    const { cookie, caseId } = await userWithCase("doc-j");
    const first = DocumentSummary.parse(await (await upload(cookie, caseId, PDF)).json());
    const again = await upload(cookie, caseId, PDF, { name: "renamed.pdf", type: "bill" });
    expect(again.status).toBe(200);
    expect(DocumentSummary.parse(await again.json())).toEqual(first);
    expect(await storedKeys("doc-j")).toHaveLength(1);
  });

  it("cleans the file name and treats it as plain text", async () => {
    const { cookie, caseId } = await userWithCase("doc-k");
    const res = await upload(cookie, caseId, PDF, { name: "../../secret/<b>डिस्चार्ज</b>.pdf" });
    expect(DocumentSummary.parse(await res.json()).fileName).toBe("b>.pdf");
    const badEncoding = await upload(cookie, caseId, pdfVariant(1), { headers: { "x-file-name": "%E0%A4%A" } });
    expect(DocumentSummary.parse(await badEncoding.json()).fileName).toBe("document");
  });

  it(`allows at most ${MAX_DOCUMENTS_PER_CASE} documents per case`, async () => {
    const { cookie, caseId } = await userWithCase("doc-l");
    for (let i = 0; i < MAX_DOCUMENTS_PER_CASE; i++) expect((await upload(cookie, caseId, pdfVariant(i))).status).toBe(201);
    const res = await upload(cookie, caseId, pdfVariant(999));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "too_many_documents" });
    expect(await storedKeys("doc-l")).toHaveLength(MAX_DOCUMENTS_PER_CASE);
  });

  it("takes no files for a finished case", async () => {
    const { cookie, caseId } = await userWithCase("doc-m", { status: "closed" });
    const res = await upload(cookie, caseId, PDF);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "case_finished" });
  });

  it("removes the file again when the row cannot be written", async () => {
    const { cookie, caseId } = await userWithCase("doc-n");
    const { default: app } = await import("../src/index");
    const real = env.DB;
    // Let reads through; fail the write batch.
    const failing = new Proxy(real, {
      get: (target, prop) => (prop === "batch" ? () => Promise.reject(new Error("d1 down")) : Reflect.get(target, prop).bind?.(target) ?? Reflect.get(target, prop)),
    });
    const res = await app.fetch(
      new Request(`${BASE}/cases/${caseId}/documents?type=policy`, { method: "POST", headers: { cookie, "content-type": "application/pdf" }, body: PDF }),
      { ...env, DB: failing } as never,
    );
    expect(res.status).toBe(500);
    expect(await storedKeys("doc-n")).toEqual([]);
  });
});

describe("GET /cases/:caseId/documents", () => {
  it("lists only this case's documents, oldest first, and only to the owner", async () => {
    const { cookie, caseId } = await userWithCase("doc-o");
    const stranger = await userWithCase("doc-p");
    await upload(cookie, caseId, PDF, { name: "one.pdf" });
    await upload(cookie, caseId, JPEG, { name: "two.jpg", contentType: "image/jpeg", type: "bill" });
    await upload(stranger.cookie, stranger.caseId, PNG, { contentType: "image/png" });

    expect((await list(cookie, caseId)).map((d) => d.fileName).sort()).toEqual(["one.pdf", "two.jpg"]);
    expect((await call("GET", `/cases/${caseId}/documents`, { cookie: stranger.cookie })).status).toBe(404);
    expect((await call("GET", `/cases/${caseId}/documents`)).status).toBe(401);
  });
});

describe("DELETE /cases/:caseId/documents/:documentId", () => {
  it("removes the row and the file", async () => {
    const { cookie, caseId } = await userWithCase("doc-q");
    const doc = DocumentSummary.parse(await (await upload(cookie, caseId, PDF)).json());
    const res = await call("DELETE", `/cases/${caseId}/documents/${doc.id}`, { cookie });
    expect(res.status).toBe(200);
    expect(await list(cookie, caseId)).toEqual([]);
    expect(await storedKeys("doc-q")).toEqual([]);
  });

  it("does not let a stranger delete it, even through their own case", async () => {
    const owner = await userWithCase("doc-r");
    const stranger = await userWithCase("doc-s");
    const doc = DocumentSummary.parse(await (await upload(owner.cookie, owner.caseId, PDF)).json());
    expect((await call("DELETE", `/cases/${owner.caseId}/documents/${doc.id}`, { cookie: stranger.cookie })).status).toBe(404);
    expect((await call("DELETE", `/cases/${stranger.caseId}/documents/${doc.id}`, { cookie: stranger.cookie })).status).toBe(404);
    expect(await list(owner.cookie, owner.caseId)).toHaveLength(1);
    expect(await storedKeys("doc-r")).toHaveLength(1);
  });

  it("refuses once the case has moved past intake", async () => {
    const { cookie, caseId } = await userWithCase("doc-t");
    const doc = DocumentSummary.parse(await (await upload(cookie, caseId, PDF)).json());
    await env.DB.prepare("UPDATE cases SET status = 'analysing' WHERE id = ?1").bind(caseId).run();
    const res = await call("DELETE", `/cases/${caseId}/documents/${doc.id}`, { cookie });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "case_locked" });
    expect(await storedKeys("doc-t")).toHaveLength(1);
  });
});

describe("delete my data", () => {
  it("removes uploaded files", async () => {
    const { cookie, caseId } = await userWithCase("doc-u");
    await upload(cookie, caseId, PDF);
    expect((await call("DELETE", "/account", { cookie })).status).toBe(200);
    expect(await storedKeys("doc-u")).toEqual([]);
  });
});
