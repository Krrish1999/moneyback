import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { CaseRecord } from "@moneyback/shared";

const BASE = "http://local";

function post(body: unknown) {
  return exports.default.fetch(`${BASE}/cases`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const valid = { userId: "user-1", insurer: "Example General Insurance", claimAmountPaise: 1_25_000_00 };

describe("POST /cases", () => {
  it("creates a case in intake status and stores it in D1", async () => {
    const res = await post(valid);
    expect(res.status).toBe(201);
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

    const row = await env.DB.prepare("SELECT status, claim_amount_paise FROM cases WHERE id = ?")
      .bind(body.id)
      .first();
    expect(row).toEqual({ status: "intake", claim_amount_paise: 1_25_000_00 });

    const event = await env.DB.prepare("SELECT type, actor FROM events WHERE case_id = ?").bind(body.id).first();
    expect(event).toEqual({ type: "case_created", actor: "user" });
  });

  it("reuses an existing user for a second case", async () => {
    expect((await post({ ...valid, userId: "user-2" })).status).toBe(201);
    expect((await post({ ...valid, userId: "user-2" })).status).toBe(201);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM cases WHERE user_id = 'user-2'").first("n");
    expect(n).toBe(2);
  });

  it("ignores a client-supplied status", async () => {
    const res = await post({ ...valid, status: "won" });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ status: "intake" });
  });

  it.each([
    ["missing userId", { insurer: "X", claimAmountPaise: 100 }],
    ["missing insurer", { userId: "u", claimAmountPaise: 100 }],
    ["blank insurer", { userId: "u", insurer: "   ", claimAmountPaise: 100 }],
    ["fractional paise", { userId: "u", insurer: "X", claimAmountPaise: 100.5 }],
    ["negative paise", { userId: "u", insurer: "X", claimAmountPaise: -1 }],
    ["amount as string", { userId: "u", insurer: "X", claimAmountPaise: "100" }],
    ["unknown category", { userId: "u", insurer: "X", claimAmountPaise: 100, category: "motor" }],
    ["array body", [1, 2]],
  ])("rejects %s with 400", async (_name, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_input" });
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await post("{not json");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_json" });
  });
});

describe("GET /cases/:id", () => {
  it("returns a created case", async () => {
    const created = (await (await post(valid)).json()) as CaseRecord;
    const res = await exports.default.fetch(`${BASE}/cases/${created.id}`);
    expect(res.status).toBe(200);
    expect(CaseRecord.parse(await res.json())).toEqual(created);
  });

  it("returns 404 for an unknown id", async () => {
    const res = await exports.default.fetch(`${BASE}/cases/${crypto.randomUUID()}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("returns 400 for an over-long id", async () => {
    const res = await exports.default.fetch(`${BASE}/cases/${"x".repeat(65)}`);
    expect(res.status).toBe(400);
  });
});
