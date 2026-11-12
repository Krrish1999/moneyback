import { z } from "zod";
import { base64UrlToBytes, utf8 } from "./crypto";

/**
 * Verifies a Google Sign-In ID token (a JWT signed with RS256) against Google's published keys.
 * The token is untrusted input until every check here passes.
 */

export const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const MAX_TOKEN_LENGTH = 4096;
const CLOCK_SKEW_SECONDS = 60;
const JWKS_CACHE_MS = 60 * 60 * 1000;

const Header = z.object({ alg: z.literal("RS256"), kid: z.string().min(1).max(200) });

const Claims = z.object({
  iss: z.string(),
  aud: z.string(),
  sub: z.string().min(1).max(255),
  exp: z.number(),
  iat: z.number().optional(),
  nbf: z.number().optional(),
  email: z.email().max(320),
  email_verified: z.union([z.boolean(), z.enum(["true", "false"])]),
});

const Jwk = z.looseObject({ kid: z.string(), kty: z.literal("RSA"), n: z.string(), e: z.string() });
const Jwks = z.object({ keys: z.array(z.unknown()) });

export type GoogleIdentity = { sub: string; email: string };
export type VerifyResult = { ok: true; identity: GoogleIdentity } | { ok: false; reason: string };

let cache: { keys: Map<string, CryptoKey>; fetchedAt: number } | null = null;

/** Test hook: forget cached Google keys. */
export function clearGoogleKeyCache(): void {
  cache = null;
}

async function loadKeys(nowMs: number): Promise<Map<string, CryptoKey>> {
  const res = await fetch(GOOGLE_JWKS_URL);
  if (!res.ok) throw new Error(`jwks_http_${res.status}`);
  const body = Jwks.parse(await res.json());
  const keys = new Map<string, CryptoKey>();
  for (const raw of body.keys) {
    const jwk = Jwk.safeParse(raw);
    if (!jwk.success) continue;
    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: "RSA", n: jwk.data.n, e: jwk.data.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    keys.set(jwk.data.kid, key);
  }
  cache = { keys, fetchedAt: nowMs };
  return keys;
}

async function keyFor(kid: string, nowMs: number): Promise<CryptoKey | undefined> {
  if (cache && nowMs - cache.fetchedAt < JWKS_CACHE_MS) {
    const hit = cache.keys.get(kid);
    if (hit) return hit;
  }
  // Unknown key id or stale cache: Google rotates keys, so fetch once more before rejecting.
  return (await loadKeys(nowMs)).get(kid);
}

function decodeJson(part: string): unknown {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(part)));
}

export async function verifyGoogleIdToken(token: string, clientId: string, nowMs: number): Promise<VerifyResult> {
  if (!clientId) return { ok: false, reason: "not_configured" };
  if (token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: "too_long" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];

  let header: z.infer<typeof Header>;
  let claims: z.infer<typeof Claims>;
  let signature: Uint8Array<ArrayBuffer>;
  try {
    const h = Header.safeParse(decodeJson(headerPart));
    const p = Claims.safeParse(decodeJson(payloadPart));
    if (!h.success) return { ok: false, reason: "bad_header" };
    if (!p.success) return { ok: false, reason: "bad_claims" };
    header = h.data;
    claims = p.data;
    signature = base64UrlToBytes(signaturePart);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  // Check the signature before trusting any claim.
  let key: CryptoKey | undefined;
  try {
    key = await keyFor(header.kid, nowMs);
  } catch {
    return { ok: false, reason: "keys_unavailable" };
  }
  if (!key) return { ok: false, reason: "unknown_key" };
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, utf8(`${headerPart}.${payloadPart}`));
  if (!valid) return { ok: false, reason: "bad_signature" };

  const nowSeconds = Math.floor(nowMs / 1000);
  if (!ISSUERS.has(claims.iss)) return { ok: false, reason: "bad_issuer" };
  if (claims.aud !== clientId) return { ok: false, reason: "bad_audience" };
  if (claims.exp + CLOCK_SKEW_SECONDS < nowSeconds) return { ok: false, reason: "expired" };
  if (claims.nbf !== undefined && claims.nbf - CLOCK_SKEW_SECONDS > nowSeconds) return { ok: false, reason: "not_yet_valid" };
  if (claims.email_verified !== true && claims.email_verified !== "true") return { ok: false, reason: "email_unverified" };

  return { ok: true, identity: { sub: claims.sub, email: claims.email.toLowerCase() } };
}
