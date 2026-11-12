import { env, exports } from "cloudflare:workers";
import { createSession, SESSION_COOKIE } from "../src/auth/session";

export const BASE = "http://local";

/** Creates a user and a live session directly in D1. Returns the Cookie header value for that user. */
export async function signInAs(userId: string): Promise<string> {
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT OR IGNORE INTO users (id, created_at, updated_at) VALUES (?1, ?2, ?2)")
    .bind(userId, now)
    .run();
  return `${SESSION_COOKIE}=${await createSession(env.DB, userId)}`;
}

type CallOptions = { cookie?: string; body?: unknown; headers?: Record<string, string> };

export function call(method: string, path: string, { cookie, body, headers = {} }: CallOptions = {}) {
  const all: Record<string, string> = { ...headers };
  if (cookie) all.cookie = cookie;
  if (body !== undefined) all["content-type"] = "application/json";
  return exports.default.fetch(`${BASE}${path}`, {
    method,
    headers: all,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}
