import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { CONSENT_VERSION, ConsentRecord } from "@moneyback/shared";
import { requireSession } from "../src/auth/session";
import { requireConsent } from "../src/consent";
import type { AppEnv } from "../src/env";
import { call, signInAs } from "./helpers";

const accept = (cookie: string | undefined, body: unknown = { version: CONSENT_VERSION }) =>
  call("POST", "/account/consent", { cookie, body });
const me = async (cookie: string) => (await (await call("GET", "/auth/me", { cookie })).json()) as { consentVersion: string | null };

describe("POST /account/consent", () => {
  it("needs a session", async () => {
    expect((await accept(undefined)).status).toBe(401);
  });

  it("records the current version, and /auth/me then reports it", async () => {
    const cookie = await signInAs("consent-a");
    expect((await me(cookie)).consentVersion).toBeNull();

    const res = await accept(cookie);
    expect(res.status).toBe(200);
    const record = ConsentRecord.parse(await res.json());
    expect(record.version).toBe(CONSENT_VERSION);
    expect(Number.isNaN(Date.parse(record.acceptedAt))).toBe(false);

    expect((await me(cookie)).consentVersion).toBe(CONSENT_VERSION);
  });

  it("keeps the first time stamp when the user agrees twice", async () => {
    const cookie = await signInAs("consent-b");
    const first = ConsentRecord.parse(await (await accept(cookie)).json());
    const second = ConsentRecord.parse(await (await accept(cookie)).json());
    expect(second).toEqual(first);
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM consents WHERE user_id = 'consent-b'").first<{ n: number }>();
    expect(count?.n).toBe(1);
  });

  it("refuses a version that is not the current one", async () => {
    const cookie = await signInAs("consent-c");
    const res = await accept(cookie, { version: "old-version" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "consent_version_outdated" });
    expect((await me(cookie)).consentVersion).toBeNull();
  });

  it.each([[{}], [{ version: "" }], [{ version: 3 }], ["not json"]])("rejects body %j", async (body) => {
    expect((await accept(await signInAs("consent-d"), body)).status).toBe(400);
  });

  it("does not count consent to an older version", async () => {
    const cookie = await signInAs("consent-e");
    await env.DB.prepare("INSERT INTO consents (user_id, version, accepted_at) VALUES ('consent-e', 'older', '2026-01-01T00:00:00.000Z')").run();
    expect((await me(cookie)).consentVersion).toBeNull();
  });

  it("one user's consent does not count for another", async () => {
    await accept(await signInAs("consent-f"));
    expect((await me(await signInAs("consent-g"))).consentVersion).toBeNull();
  });

  it("is removed when the user deletes their data", async () => {
    const cookie = await signInAs("consent-h");
    await accept(cookie);
    expect((await call("DELETE", "/account", { cookie })).status).toBe(200);
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM consents WHERE user_id = 'consent-h'").first<{ n: number }>();
    expect(count?.n).toBe(0);
  });
});

describe("requireConsent", () => {
  const app = new Hono<AppEnv>().get("/guarded", requireSession, requireConsent, (c) => c.json({ ok: true }));
  const guarded = (cookie: string) => app.fetch(new Request("http://local/guarded", { headers: { cookie } }), env);

  it("blocks a user who has not agreed, and lets them through once they have", async () => {
    const cookie = await signInAs("consent-i");
    const blocked = await guarded(cookie);
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toEqual({ error: "consent_required" });

    await accept(cookie);
    expect((await guarded(cookie)).status).toBe(200);
  });
});
