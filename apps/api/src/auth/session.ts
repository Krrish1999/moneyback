import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { and, eq, gt, lt } from "drizzle-orm";
import type { AppEnv } from "../env";
import { getDb, schema } from "../db/client";
import { bytesToBase64Url, sha256Hex } from "./crypto";

export const SESSION_COOKIE = "mb_session";
export const SESSION_TTL_DAYS = 30;
const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60;

/** Creates a session row and returns the secret token for the cookie. Only the token's hash is stored. */
export async function createSession(d1: D1Database, userId: string, now = new Date()): Promise<string> {
  const token = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const db = getDb(d1);
  await db.batch([
    db.insert(schema.sessions).values({
      id: await sha256Hex(token),
      userId,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString(),
    }),
    // Housekeeping: drop this user's expired sessions.
    db
      .delete(schema.sessions)
      .where(and(eq(schema.sessions.userId, userId), lt(schema.sessions.expiresAt, now.toISOString()))),
  ]);
  return token;
}

export function setSessionCookie(c: Context<AppEnv>, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

/** Returns the signed-in user's id, or null. */
export async function sessionUserId(c: Context<AppEnv>): Promise<string | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token || token.length > 200) return null;
  const row = await getDb(c.env.DB).query.sessions.findFirst({
    where: and(eq(schema.sessions.id, await sha256Hex(token)), gt(schema.sessions.expiresAt, new Date().toISOString())),
  });
  return row?.userId ?? null;
}

export async function destroySession(c: Context<AppEnv>): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token && token.length <= 200) {
    await getDb(c.env.DB)
      .delete(schema.sessions)
      .where(eq(schema.sessions.id, await sha256Hex(token)));
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true });
}

/** Rejects the request with 401 unless it carries a live session. Sets `userId` for the route. */
export const requireSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const userId = await sessionUserId(c);
  if (!userId) return c.json({ error: "unauthenticated" }, 401);
  c.set("userId", userId);
  await next();
};
