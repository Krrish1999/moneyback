import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { CaseRecord, MAX_CLAIM_AMOUNT_PAISE } from "@moneyback/shared";
import { LIMITS } from "../src/rate-limit";
import { call, signInAs } from "./helpers";

const valid = { insurer: "Example General Insurance", claimAmountPaise: 1_25_000_00 };

const post = (cookie: string | undefined, body: unknown, headers?: Record<string, string>) =>
  call("POST", "/cases", { cookie, body, headers });

describe("POST /cases", () => {
  it("rejects a request with no session", async () => {
    const res = await post(undefined, valid);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthenticated" });
  });

  it("rejects an unknown session token", async () => {
    expect((await post("mb_session=not-a-real-token", valid)).status).toBe(401);
  });

  it("rejects an expired session", async () => {
    const cookie = await signInAs("user-expired");
    await env.DB.prepare("UPDATE sessions SET expires_at = '2020-01-01T00:00:00.000Z' WHERE user_id = 'user-expired'").run();
    expect((await post(cookie, valid)).status).toBe(401);
  });

  it("creates a case in intake status for the signed-in user", async () => {
    const res = await post(await signInAs("user-1"), valid);
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = CaseRecord.parse(await res.json());
    expect(body).toMatchObject({
      userId: "user-1",
      category: "health_insurance",
      insurer: "Example General Insurance",
      claimAmountPaise: 1_25_000_00,
      status: "intake",
      verdict: null,
      nextDeadline: null,
      amountRecoveredPaise: 0,
    });

    const row = await env.DB.prepare("SELECT status, claim_amount_paise FROM cases WHERE id = ?").bind(body.id).first();
    expect(row).toEqual({ status: "intake", claim_amount_paise: 1_25_000_00 });

    const event = await env.DB.prepare("SELECT type, actor FROM events WHERE case_id = ?").bind(body.id).first();
    expect(event).toEqual({ type: "case_created", actor: "user" });
  });

  it("ignores a userId in the body and never creates that user", async () => {
    const res = await post(await signInAs("user-honest"), { ...valid, userId: "user-victim" });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ userId: "user-honest" });
    const victim = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE id = 'user-victim'").first("n");
    expect(victim).toBe(0);
  });

  it("ignores a client-supplied status", async () => {
    const res = await post(await signInAs("user-status"), { ...valid, status: "won" });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ status: "intake" });
  });

  it.each([
    ["missing insurer", { claimAmountPaise: 100 }],
    ["blank insurer", { insurer: "   ", claimAmountPaise: 100 }],
    ["fractional paise", { insurer: "X", claimAmountPaise: 100.5 }],
    ["negative paise", { insurer: "X", claimAmountPaise: -1 }],
    ["amount as string", { insurer: "X", claimAmountPaise: "100" }],
    ["amount over the cap", { insurer: "X", claimAmountPaise: MAX_CLAIM_AMOUNT_PAISE + 1 }],
    ["unknown category", { insurer: "X", claimAmountPaise: 100, category: "motor" }],
    ["array body", [1, 2]],
  ])("rejects %s with 400", async (name, body) => {
    const res = await post(await signInAs(`user-invalid-${name}`), body);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_input" });
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await post(await signInAs("user-badjson"), "{not json");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_json" });
  });

  it("rejects a body over 16 KB with 413", async () => {
    const res = await post(await signInAs("user-big"), { ...valid, padding: "x".repeat(20_000) });
    expect(res.status).toBe(413);
  });

  it("rejects a POST from an origin that is not the web app", async () => {
    const res = await post(await signInAs("user-csrf"), valid, { origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden_origin" });
  });

  it("accepts a POST from the web app's origin and answers CORS with credentials", async () => {
    const res = await post(await signInAs("user-cors"), valid, { origin: "http://localhost:5173" });
    expect(res.status).toBe(201);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("limits how many cases one user can create per hour", async () => {
    const cookie = await signInAs("user-flood");
    for (let i = 0; i < LIMITS.createCasePerUser.limit; i++) {
      expect((await post(cookie, valid)).status).toBe(201);
    }
    const blocked = await post(cookie, valid);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe(String(LIMITS.createCasePerUser.windowSeconds));
    // Another user is not affected.
    expect((await post(await signInAs("user-calm"), valid)).status).toBe(201);
  });

  it("limits how many cases one IP can create per hour, across users", async () => {
    const ip = { "cf-connecting-ip": "203.0.113.7" };
    for (let i = 0; i < LIMITS.createCasePerIp.limit; i++) {
      expect((await post(await signInAs(`user-ip-${i}`), valid, ip)).status).toBe(201);
    }
    expect((await post(await signInAs("user-ip-last"), valid, ip)).status).toBe(429);
    const stored = await env.DB.prepare("SELECT COUNT(*) AS n FROM rate_limits WHERE key LIKE '%203.0.113.7%'").first("n");
    expect(stored).toBe(0); // the raw IP is never stored
  });
});

describe("GET /cases/:id", () => {
  it("returns the owner's case", async () => {
    const cookie = await signInAs("user-owner");
    const created = (await (await post(cookie, valid)).json()) as CaseRecord;
    const res = await call("GET", `/cases/${created.id}`, { cookie });
    expect(res.status).toBe(200);
    expect(CaseRecord.parse(await res.json())).toEqual(created);
  });

  it("returns 404 to a different user, and 401 with no session", async () => {
    const created = (await (await post(await signInAs("user-a"), valid)).json()) as CaseRecord;
    const other = await call("GET", `/cases/${created.id}`, { cookie: await signInAs("user-b") });
    expect(other.status).toBe(404);
    expect(await other.json()).toEqual({ error: "not_found" });
    expect((await call("GET", `/cases/${created.id}`)).status).toBe(401);
  });

  it("returns 404 for an unknown id", async () => {
    const res = await call("GET", `/cases/${crypto.randomUUID()}`, { cookie: await signInAs("user-unknown") });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("returns 400 for an over-long id", async () => {
    const res = await call("GET", `/cases/${"x".repeat(65)}`, { cookie: await signInAs("user-long") });
    expect(res.status).toBe(400);
  });
});
