import { z } from "zod";
import { CaseRecord, ConsentRecord, DocumentSummary } from "@moneyback/shared";
import { ApiError, SessionUser, type MoneyBackApi } from "./types";

const ErrorBody = z.object({ error: z.string() });

/**
 * The real client for apps/api. The session lives in an HttpOnly cookie, so every call sends
 * credentials and nothing here ever reads or stores a token. Every response is validated before use.
 */
export function createHttpApi(baseUrl: string, fetchImpl: typeof fetch = (...args) => fetch(...args)): MoneyBackApi {
  const root = baseUrl.replace(/\/+$/, "");

  function request(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<Response> {
    return send(method, path, body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  }

  async function send(
    method: "GET" | "POST" | "DELETE",
    path: string,
    extra: { headers?: Record<string, string>; body?: BodyInit },
  ): Promise<Response> {
    let res: Response;
    try {
      res = await fetchImpl(`${root}${path}`, { method, credentials: "include", cache: "no-store", ...extra });
    } catch {
      throw new ApiError(0, "network_error");
    }
    if (!res.ok) {
      const parsed = ErrorBody.safeParse(await res.json().catch(() => null));
      throw new ApiError(res.status, parsed.success ? parsed.data.error : "unknown_error");
    }
    return res;
  }

  async function parse<T>(schema: z.ZodType<T>, res: Response): Promise<T> {
    const parsed = schema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw new ApiError(res.status, "bad_response");
    return parsed.data;
  }

  return {
    async getMe() {
      try {
        return await parse(SessionUser, await request("GET", "/auth/me"));
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    async signInWithGoogle(credential) {
      return parse(SessionUser, await request("POST", "/auth/google", { credential }));
    },
    async signOut() {
      await request("POST", "/auth/logout", {});
    },
    async acceptConsent(version) {
      return parse(ConsentRecord, await request("POST", "/account/consent", { version }));
    },
    async deleteAccount() {
      await request("DELETE", "/account");
    },
    async createCase(body) {
      return parse(CaseRecord, await request("POST", "/cases", body));
    },
    async getCase(id) {
      return parse(CaseRecord, await request("GET", `/cases/${encodeURIComponent(id)}`));
    },
    async listDocuments(caseId) {
      return parse(DocumentSummary.array(), await request("GET", `/cases/${encodeURIComponent(caseId)}/documents`));
    },
    async uploadDocument(caseId, type, file) {
      const path = `/cases/${encodeURIComponent(caseId)}/documents?type=${encodeURIComponent(type)}`;
      // The file name goes in a header, not the address, so it stays out of URLs and logs.
      const headers = { "content-type": file.type, "x-file-name": encodeURIComponent(file.name) };
      return parse(DocumentSummary, await send("POST", path, { headers, body: file }));
    },
    async deleteDocument(caseId, documentId) {
      await request("DELETE", `/cases/${encodeURIComponent(caseId)}/documents/${encodeURIComponent(documentId)}`);
    },
  };
}
