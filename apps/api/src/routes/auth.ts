import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { AppEnv } from "../env";
import { getDb, schema } from "../db/client";
import { verifyGoogleIdToken } from "../auth/google";
import { currentConsentVersion } from "../consent";
import { createSession, destroySession, requireSession, setSessionCookie } from "../auth/session";
import { allow, ipKey, LIMITS, tooManyRequests } from "../rate-limit";

export const authRoutes = new Hono<AppEnv>();

const GoogleSignInInput = z.object({ credential: z.string().min(1).max(4096) });

/**
 * Sign in with a Google ID token (from Google Identity Services in the web app).
 * Body: { credential }. Creates the user on first sign-in, starts a session and sets the session cookie.
 */
authRoutes.post("/google", async (c) => {
  if (!c.env.GOOGLE_CLIENT_ID) return c.json({ error: "auth_not_configured" }, 503);

  const key = await ipKey(c, "signin");
  if (key && !(await allow(c.env.DB, key, LIMITS.signInPerIp))) return tooManyRequests(c, LIMITS.signInPerIp);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }
  const parsed = GoogleSignInInput.safeParse(body);
  if (!parsed.success) return c.json({ error: "invalid_input", issues: parsed.error.issues }, 400);

  const result = await verifyGoogleIdToken(parsed.data.credential, c.env.GOOGLE_CLIENT_ID, Date.now());
  if (!result.ok) {
    if (result.reason === "keys_unavailable") return c.json({ error: "auth_unavailable" }, 503);
    return c.json({ error: "invalid_credential" }, 401);
  }
  const { sub, email } = result.identity;

  const db = getDb(c.env.DB);
  const now = new Date().toISOString();
  let user = await db.query.users.findFirst({ where: eq(schema.users.googleSub, sub) });
  if (!user) {
    try {
      await db
        .insert(schema.users)
        .values({ id: crypto.randomUUID(), googleSub: sub, email, createdAt: now, updatedAt: now })
        .onConflictDoNothing({ target: schema.users.googleSub });
    } catch {
      // The email already belongs to a different account. Do not merge accounts silently.
      return c.json({ error: "account_conflict" }, 409);
    }
    user = await db.query.users.findFirst({ where: eq(schema.users.googleSub, sub) });
    if (!user) return c.json({ error: "internal_error" }, 500);
  }

  setSessionCookie(c, await createSession(c.env.DB, user.id));
  return c.json({ id: user.id, email: user.email, consentVersion: await currentConsentVersion(c.env.DB, user.id) });
});

/** The signed-in user. 401 when there is no live session. */
authRoutes.get("/me", requireSession, async (c) => {
  const user = await getDb(c.env.DB).query.users.findFirst({ where: eq(schema.users.id, c.get("userId")) });
  if (!user) return c.json({ error: "unauthenticated" }, 401);
  return c.json({ id: user.id, email: user.email, consentVersion: await currentConsentVersion(c.env.DB, user.id) });
});

/** Ends the session and clears the cookie. Safe to call when signed out. */
authRoutes.post("/logout", async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});
