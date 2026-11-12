import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { userFilePrefix } from "../src/storage";
import { call, signInAs } from "./helpers";

const NOW = "2026-11-12T10:00:00.000Z";
const TABLES = ["cases", "documents", "letters", "events", "payments"] as const;

/** Gives a user one case with a document, a letter with a PDF, an event, a payment, and files in R2. */
async function seed(userId: string) {
  const caseId = `${userId}-case`;
  const docKey = `${userFilePrefix(userId)}${caseId}/policy.pdf`;
  const pdfKey = `${userFilePrefix(userId)}${caseId}/letter.pdf`;
  const strayKey = `${userFilePrefix(userId)}upload-with-no-row.jpg`;
  const legacyKey = `legacy/${userId}-old.pdf`; // outside the prefix: found only through its database row

  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO cases (id, user_id, category, insurer, claim_amount_paise, status, amount_recovered_paise, created_at, updated_at) " +
        "VALUES (?1, ?2, 'health_insurance', 'X', 100, 'intake', 0, ?3, ?3)",
    ).bind(caseId, userId, NOW),
    env.DB.prepare(
      "INSERT INTO documents (id, case_id, type, file_name, mime_type, size_bytes, sha256, r2_key, created_at) " +
        "VALUES (?1, ?2, 'policy', 'policy.pdf', 'application/pdf', 3, 'abc', ?3, ?4)",
    ).bind(`${userId}-doc`, caseId, docKey, NOW),
    env.DB.prepare(
      "INSERT INTO documents (id, case_id, type, file_name, mime_type, size_bytes, sha256, r2_key, created_at) " +
        "VALUES (?1, ?2, 'bill', 'old.pdf', 'application/pdf', 3, 'def', ?3, ?4)",
    ).bind(`${userId}-doc-legacy`, caseId, legacyKey, NOW),
    env.DB.prepare(
      "INSERT INTO letters (id, case_id, forum, status, subject, body, pdf_r2_key, created_at, updated_at) " +
        "VALUES (?1, ?2, 'insurer_gro', 'draft', 's', 'b', ?3, ?4, ?4)",
    ).bind(`${userId}-letter`, caseId, pdfKey, NOW),
    env.DB.prepare(
      "INSERT INTO events (id, case_id, type, actor, data, created_at) VALUES (?1, ?2, 'case_created', 'user', '{}', ?3)",
    ).bind(`${userId}-event`, caseId, NOW),
    env.DB.prepare(
      "INSERT INTO payments (id, case_id, kind, amount_paise, status, created_at, updated_at) " +
        "VALUES (?1, ?2, 'filing', 100, 'created', ?3, ?3)",
    ).bind(`${userId}-payment`, caseId, NOW),
    env.DB.prepare("INSERT INTO rate_limits (key, window_start, count) VALUES (?1, 0, 3)").bind(`cases:user:${userId}`),
  ]);
  const keys = [docKey, pdfKey, strayKey, legacyKey];
  await Promise.all(keys.map((key) => env.DOCS.put(key, "pdf")));
  return { caseId, keys };
}

async function rowsFor(userId: string) {
  const caseId = `${userId}-case`;
  const counts: Record<string, number> = {};
  for (const table of TABLES) {
    const column = table === "cases" ? "id" : "case_id";
    const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?1`).bind(caseId).first<{ n: number }>();
    counts[table] = row?.n ?? -1;
  }
  const one = async (sql: string, value: string) => (await env.DB.prepare(sql).bind(value).first<{ n: number }>())?.n ?? -1;
  counts.users = await one("SELECT COUNT(*) AS n FROM users WHERE id = ?1", userId);
  counts.sessions = await one("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?1", userId);
  counts.rate_limits = await one("SELECT COUNT(*) AS n FROM rate_limits WHERE key = ?1", `cases:user:${userId}`);
  return counts;
}

const filesLeft = async (keys: string[]) => (await Promise.all(keys.map((key) => env.DOCS.head(key)))).filter(Boolean).length;

describe("DELETE /account", () => {
  it("needs a session", async () => {
    const res = await call("DELETE", "/account");
    expect(res.status).toBe(401);
  });

  it("removes every row and file of the signed-in user, and nothing of anyone else", async () => {
    const cookie = await signInAs("del-a");
    await signInAs("del-a"); // a second device
    const otherCookie = await signInAs("del-b");
    const mine = await seed("del-a");
    const theirs = await seed("del-b");

    const res = await call("DELETE", "/account", { cookie });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("set-cookie")).toMatch(/^mb_session=;/);

    expect(await rowsFor("del-a")).toEqual({
      cases: 0, documents: 0, letters: 0, events: 0, payments: 0, users: 0, sessions: 0, rate_limits: 0,
    });
    expect(await filesLeft(mine.keys)).toBe(0);

    expect(await rowsFor("del-b")).toEqual({
      cases: 1, documents: 2, letters: 1, events: 1, payments: 1, users: 1, sessions: 1, rate_limits: 1,
    });
    expect(await filesLeft(theirs.keys)).toBe(theirs.keys.length);
    expect((await call("GET", `/cases/${theirs.caseId}`, { cookie: otherCookie })).status).toBe(200);
  });

  it("signs the user out everywhere", async () => {
    const cookie = await signInAs("del-c");
    const secondDevice = await signInAs("del-c");
    expect((await call("DELETE", "/account", { cookie })).status).toBe(200);
    expect((await call("GET", "/auth/me", { cookie })).status).toBe(401);
    expect((await call("GET", "/auth/me", { cookie: secondDevice })).status).toBe(401);
  });

  it("works for a user with no cases or files", async () => {
    const cookie = await signInAs("del-d");
    expect((await call("DELETE", "/account", { cookie })).status).toBe(200);
    expect((await rowsFor("del-d")).users).toBe(0);
  });

  it("keeps the rows when files cannot be deleted, so the user can try again", async () => {
    const cookie = await signInAs("del-e");
    await seed("del-e");
    const broken = { ...env, DOCS: { list: () => Promise.reject(new Error("r2 down")) } };
    const { default: app } = await import("../src/index");
    const res = await app.fetch(new Request("http://local/account", { method: "DELETE", headers: { cookie } }), broken as never);
    expect(res.status).toBe(500);
    expect(await rowsFor("del-e")).toMatchObject({ cases: 1, documents: 2, users: 1, sessions: 1 });
  });

  it("refuses a cross-site request", async () => {
    const cookie = await signInAs("del-f");
    const res = await call("DELETE", "/account", { cookie, headers: { origin: "https://evil.example" } });
    expect(res.status).toBe(403);
    expect((await rowsFor("del-f")).users).toBe(1);
  });
});
