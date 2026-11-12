import { env } from "cloudflare:workers";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../src/index";
import { bytesToBase64Url, utf8 } from "../src/auth/crypto";
import { clearGoogleKeyCache, GOOGLE_JWKS_URL } from "../src/auth/google";
import { LIMITS } from "../src/rate-limit";
import { BASE, call } from "./helpers";

// A throwaway RSA key pair stands in for Google's signing key. No network calls leave the test.
const CLIENT_ID = "test-client-id.apps.googleusercontent.com";
const KID = "test-key-1";
let signingKey: CryptoKey;
let otherKey: CryptoKey;
let jwks: { keys: unknown[] };

const RSA = { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" };

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey(RSA, true, ["sign", "verify"])) as CryptoKeyPair;
  const other = (await crypto.subtle.generateKey(RSA, true, ["sign", "verify"])) as CryptoKeyPair;
  signingKey = pair.privateKey;
  otherKey = other.privateKey;
  const jwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
  jwks = { keys: [{ kty: "RSA", n: jwk.n, e: jwk.e, kid: KID, alg: "RS256", use: "sig" }] };
});

beforeEach(() => {
  clearGoogleKeyCache();
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === GOOGLE_JWKS_URL) return Response.json(jwks);
    throw new Error(`unexpected outbound fetch in test: ${url}`);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const part = (value: unknown) => bytesToBase64Url(utf8(JSON.stringify(value)));

async function idToken(claims: Record<string, unknown> = {}, { key = signingKey, kid = KID, alg = "RS256" } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const body = {
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    sub: "google-sub-1",
    email: "Asha@Example.com",
    email_verified: true,
    iat: now,
    exp: now + 3600,
    ...claims,
  };
  const signed = `${part({ alg, kid, typ: "JWT" })}.${part(body)}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, utf8(signed));
  return `${signed}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

const signIn = (credential: string, headers?: Record<string, string>) =>
  call("POST", "/auth/google", { body: { credential }, headers });

const cookieFrom = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

describe("POST /auth/google", () => {
  it("creates the user, starts a session and sets a locked-down cookie", async () => {
    const res = await signIn(await idToken());
    expect(res.status).toBe(200);
    const user = (await res.json()) as { id: string; email: string };
    expect(user.email).toBe("asha@example.com");

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/^mb_session=/);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");

    // The stored session id is a hash, not the cookie token.
    const token = cookieFrom(res).split("=")[1];
    const stored = await env.DB.prepare("SELECT id FROM sessions WHERE user_id = ?").bind(user.id).first<{ id: string }>();
    expect(stored?.id).toMatch(/^[0-9a-f]{64}$/);
    expect(stored?.id).not.toBe(token);

    const me = await call("GET", "/auth/me", { cookie: cookieFrom(res) });
    expect(me.status).toBe(200);
    expect(await me.json()).toEqual(user);
  });

  it("signs the same Google account into the same user", async () => {
    const first = (await (await signIn(await idToken({ sub: "google-sub-repeat", email: "repeat@example.com" }))).json()) as { id: string };
    const second = (await (await signIn(await idToken({ sub: "google-sub-repeat", email: "repeat@example.com" }))).json()) as { id: string };
    expect(second.id).toBe(first.id);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE google_sub = 'google-sub-repeat'").first("n");
    expect(n).toBe(1);
  });

  it("does not merge a second Google account that claims an existing email", async () => {
    expect((await signIn(await idToken({ sub: "google-sub-x", email: "shared@example.com" }))).status).toBe(200);
    const res = await signIn(await idToken({ sub: "google-sub-y", email: "shared@example.com" }));
    expect(res.status).toBe(409);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it.each([
    ["wrong audience", () => idToken({ aud: "someone-elses-client-id" })],
    ["wrong issuer", () => idToken({ iss: "https://evil.example" })],
    ["expired", () => idToken({ exp: Math.floor(Date.now() / 1000) - 3600 })],
    ["unverified email", () => idToken({ email_verified: false })],
    ["missing email", () => idToken({ email: undefined })],
    ["signed by another key", () => idToken({}, { key: otherKey })],
    ["unknown key id", () => idToken({}, { kid: "no-such-key" })],
    ["alg none", async () => `${part({ alg: "none", kid: KID })}.${part({ sub: "x" })}.`],
    ["tampered payload", async () => {
      const [h, , s] = (await idToken()).split(".");
      return `${h}.${part({ iss: "https://accounts.google.com", aud: CLIENT_ID, sub: "attacker", email: "a@b.co", email_verified: true, exp: 9999999999 })}.${s}`;
    }],
    ["not a token", async () => "hello"],
  ])("rejects a token that is %s", async (_name, make) => {
    const res = await signIn(await make());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_credential" });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("rejects a missing credential with 400", async () => {
    expect((await call("POST", "/auth/google", { body: {} })).status).toBe(400);
  });

  it("answers 503 when Google's keys cannot be fetched", async () => {
    vi.mocked(globalThis.fetch).mockImplementation(async () => new Response("down", { status: 500 }));
    const res = await signIn(await idToken({ sub: "google-sub-down", email: "down@example.com" }));
    expect(res.status).toBe(503);
  });

  it("is switched off (503) when no Google client id is configured", async () => {
    const req = new Request(`${BASE}/auth/google`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ credential: await idToken() }),
    });
    const res = await app.fetch(req, { ...env, GOOGLE_CLIENT_ID: "" });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "auth_not_configured" });
  });

  it("limits sign-in attempts per IP", async () => {
    const ip = { "cf-connecting-ip": "198.51.100.9" };
    for (let i = 0; i < LIMITS.signInPerIp.limit; i++) {
      expect((await signIn("hello", ip)).status).toBe(401);
    }
    expect((await signIn("hello", ip)).status).toBe(429);
  });
});

describe("session lifecycle", () => {
  it("GET /auth/me is 401 without a session", async () => {
    expect((await call("GET", "/auth/me")).status).toBe(401);
  });

  it("logout ends the session on the server, not only in the browser", async () => {
    const res = await signIn(await idToken({ sub: "google-sub-logout", email: "logout@example.com" }));
    const cookie = cookieFrom(res);
    expect((await call("GET", "/auth/me", { cookie })).status).toBe(200);

    const out = await call("POST", "/auth/logout", { cookie });
    expect(out.status).toBe(200);
    expect(out.headers.get("set-cookie")).toMatch(/^mb_session=;/);

    // Replaying the old cookie no longer works.
    expect((await call("GET", "/auth/me", { cookie })).status).toBe(401);
    expect((await call("POST", "/cases", { cookie, body: { insurer: "X", claimAmountPaise: 100 } })).status).toBe(401);
  });
});
