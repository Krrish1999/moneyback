import type { Context } from "hono";
import type { AppEnv } from "./env";
import { sha256Hex } from "./auth/crypto";

/**
 * Fixed-window rate limiting backed by D1 (table `rate_limits`).
 * One atomic upsert per check, so concurrent requests cannot slip past the limit.
 */

export type Limit = { limit: number; windowSeconds: number };

export const LIMITS = {
  createCasePerUser: { limit: 10, windowSeconds: 60 * 60 },
  createCasePerIp: { limit: 30, windowSeconds: 60 * 60 },
  signInPerIp: { limit: 20, windowSeconds: 10 * 60 },
  uploadPerUser: { limit: 60, windowSeconds: 60 * 60 },
} as const satisfies Record<string, Limit>;

/** Counts one request against `key`. Returns false when the key is over its limit for this window. */
export async function allow(d1: D1Database, key: string, { limit, windowSeconds }: Limit, nowMs = Date.now()): Promise<boolean> {
  const nowSeconds = Math.floor(nowMs / 1000);
  const windowStart = nowSeconds - (nowSeconds % windowSeconds);
  const row = await d1
    .prepare(
      "INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1) " +
        "ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1 RETURNING count",
    )
    .bind(key, windowStart)
    .first<{ count: number }>();
  const count = row?.count ?? Number.POSITIVE_INFINITY; // no row back means something is wrong: fail closed
  if (count === 1) {
    // First hit of a new window: clear this key's older windows so the table stays small.
    await d1.prepare("DELETE FROM rate_limits WHERE key = ?1 AND window_start < ?2").bind(key, windowStart).run();
  }
  return count <= limit;
}

/**
 * Rate-limit key for the caller's IP, hashed so raw IPs are not stored.
 * Cloudflare always sets CF-Connecting-IP in production; without it (local tests) there is no IP limit.
 */
export async function ipKey(c: Context<AppEnv>, scope: string): Promise<string | null> {
  const ip = c.req.header("cf-connecting-ip");
  if (!ip) return null;
  return `${scope}:ip:${(await sha256Hex(ip)).slice(0, 32)}`;
}

export function tooManyRequests(c: Context<AppEnv>, { windowSeconds }: Limit) {
  c.header("Retry-After", String(windowSeconds));
  return c.json({ error: "rate_limited" }, 429);
}
